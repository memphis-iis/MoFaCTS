<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Session } from 'meteor/session';
  import { deliverySettingsStore } from '../../../../lib/state/deliverySettingsStore';
  import { clientConsole } from '../../../../lib/clientLogger';
  import {
    buildCalibrationResumeUrl,
    buildCalibrationReadySignal,
    buildSyntheticExternalComplete,
    capturePortalHandoffFromLocation,
    EXTERNAL_COMPLETE_CHANNEL,
    EXTERNAL_COMPLETE_STORAGE_KEY,
    extractCompletionPayload,
    isCompletionOriginAllowed,
    isExternalSessionReadyMessage,
    isFreshMatchingExternalComplete,
    isTerminalCalibrationResumeStatus,
    parseExternalCompleteSignal,
    readPendingExternalComplete,
    resolveCompletionAllowlistOrigins,
    resolveExternalUrl,
    resolveExternalSessionId,
  } from '../services/externalUrlSession';


  /**
   * External-url session runtime (issue #239 / #265 / #272 / #307).
   *
   * Checkpoint card: open psynaptix `/session` in a new tab. Continue is
   * gated until an allowlisted completion/calibration-complete message
   * arrives (#272). Completion arrives via postMessage (primary), and
   * when same-origin also via BroadcastChannel / localStorage (#307).
   * Cross-origin backup: poll GET /calibrate/resume for terminal status
   * when opener postMessage is dropped. `/session` re-posts on
   * "Return to MoFaCTS". While waiting, Continue stays hidden so the
   * lesson cannot start mid-calibration; only timeout/failure offers
   * Continue anyway.
   */

  export let engine: any = undefined;
  /** MoFaCTS fallbacks — portal psynaptixSessionId wins when present (#273). */
  export let sessionId: string | undefined = undefined;
  export let tdfId: string | undefined = undefined;
  export let attemptId: string | undefined = undefined;
  export let userId: string | undefined = undefined;
  export let onResult: ((result: unknown) => void) | undefined = undefined;
  export let onComplete: (() => void) | undefined = undefined;

  let opened = false;
  let completed = false;
  let failed = false;
  let failureReason = '';
  /** Issue #272: true after allowlisted calibration/completion message. */
  let readyToContinue = false;
  let url = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Issue #273: portal-bound id from handoff URL (sticky for this card). */
  let portalSessionId: string | undefined = undefined;
  let completeChannel: BroadcastChannel | null = null;
  let resumePollTimer: ReturnType<typeof setInterval> | undefined;
  let resumePollInFlight = false;

  $: currentUnit = Session.get('currentTdfUnit') as Record<string, unknown> | undefined;
  $: externalConfig = ((currentUnit?.externalurl ?? {}) as Record<string, unknown>) || {};
  $: settings = deliverySettingsStore.get();
  $: endpoint = settings.psynaptixEndpoint as string | undefined;
  $: completionType = String(externalConfig.completionType ?? 'external-url-complete');
  $: timeoutMs = Number(externalConfig.timeoutMs ?? 600000);
  $: mofactsUrl = typeof window !== 'undefined' ? window.location.origin : '';
  $: effectiveSessionId = resolveExternalSessionId({
    portalSessionId: portalSessionId || Session.get('psynaptixSessionId'),
    tdfId: tdfId || sessionId,
    attemptId,
    userId,
  });

  $: url = resolveExternalUrl(String(externalConfig.urlTemplate ?? ''), {
    sessionId: effectiveSessionId,
    target: (() => {
      const target = Session.get('experimentTarget');
      return typeof target === 'string' ? target : undefined;
    })(),
    token: (() => {
      const token = Session.get('portalHandoffToken');
      return typeof token === 'string' ? token : undefined;
    })(),
    mofactsUrl,
    psynaptixUrl: endpoint,
    tdfId: typeof tdfId === 'string' && tdfId.trim() ? tdfId.trim() : undefined,
  });

  $: completionAllowlistOrigins = resolveCompletionAllowlistOrigins(endpoint, url);

  function stopResumePoll() {
    if (resumePollTimer) {
      clearInterval(resumePollTimer);
      resumePollTimer = undefined;
    }
  }

  function startResumePoll() {
    stopResumePoll();
    void pollCalibrationResume();
    resumePollTimer = setInterval(() => {
      void pollCalibrationResume();
    }, 3000);
  }

  async function pollCalibrationResume() {
    if (completed || readyToContinue || resumePollInFlight) return;
    const sid = typeof effectiveSessionId === 'string' ? effectiveSessionId.trim() : '';
    const resumeUrl = buildCalibrationResumeUrl(endpoint || url, sid);
    if (!resumeUrl) return;
    resumePollInFlight = true;
    try {
      const res = await fetch(resumeUrl, { credentials: 'omit' });
      if (!res.ok) return;
      const body = (await res.json()) as { status?: unknown; sessionId?: unknown };
      if (!isTerminalCalibrationResumeStatus(body.status)) return;
      const status = String(body.status);
      clientConsole(1, '[ExternalUrlSession] calibrate/resume terminal — unlocking', {
        status,
        sessionId: sid,
      });
      applyReadySignal(buildCalibrationReadySignal(sid), 'calibrate-resume-poll');
      stopResumePoll();
    } catch (err) {
      clientConsole(2, '[ExternalUrlSession] calibrate/resume poll failed', err);
    } finally {
      resumePollInFlight = false;
    }
  }

  function openTab() {
    failed = false;
    failureReason = '';
    readyToContinue = false;
    opened = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (!completed) {
        failed = true;
        failureReason = 'The external session did not report completion in time. You can re-open the session or continue if calibration already finished.';
        stopResumePoll();
      }
    }, timeoutMs);
    startResumePoll();
  }

  function continueToLesson() {
    if (completed) return;
    completed = true;
    stopResumePoll();
    if (timer) clearTimeout(timer);
    try {
      window.localStorage?.removeItem(EXTERNAL_COMPLETE_STORAGE_KEY);
    } catch {
      /* private mode / blocked storage */
    }
    clientConsole(1, '[ExternalUrlSession] continue — advancing', {
      readyToContinue,
      failed,
      sessionId: effectiveSessionId,
    });
    engine?.completeExternalSession?.();
    onResult?.({ sessionId: effectiveSessionId, status: 'completed', completedAt: Date.now() });
    onComplete?.();
  }

  function applyReadySignal(data: unknown, source: string) {
    if (completed) return;
    if (!isExternalSessionReadyMessage(data, completionType)) return;
    const signal = parseExternalCompleteSignal(data, completionType);
    if (!isFreshMatchingExternalComplete(signal, { sessionId: effectiveSessionId })) {
      clientConsole(2, '[ExternalUrlSession] ignored ready signal (session/age mismatch)', {
        source,
        expectedSessionId: effectiveSessionId,
        gotSessionId: signal?.sessionId,
      });
      return;
    }
    readyToContinue = true;
    failed = false;
    stopResumePoll();
    const payload = extractCompletionPayload(data, completionType);
    if (payload) {
      clientConsole(1, `[ExternalUrlSession] completion via ${source} — advancing`);
      continueToLesson();
      return;
    }
    clientConsole(1, `[ExternalUrlSession] calibration ready via ${source} — Continue enabled`);
  }

  function handleMessage(event: MessageEvent) {
    if (completed) return;
    if (completionAllowlistOrigins.length === 0) {
      clientConsole(2, '[ExternalUrlSession] postMessage ignored — no completion origin allowlist', {
        eventOrigin: event.origin,
        endpoint,
        url,
      });
      return;
    }
    if (!isCompletionOriginAllowed(event.origin, completionAllowlistOrigins)) {
      clientConsole(2, '[ExternalUrlSession] postMessage ignored — origin not allowlisted', {
        eventOrigin: event.origin,
        allowlist: completionAllowlistOrigins,
      });
      return;
    }
    applyReadySignal(event.data, 'postMessage');
  }

  function handleChannelMessage(event: MessageEvent) {
    applyReadySignal(event.data, 'BroadcastChannel');
  }

  function handleStorage(event: StorageEvent) {
    if (event.key !== EXTERNAL_COMPLETE_STORAGE_KEY || event.newValue == null) return;
    const signal = readPendingExternalComplete(event.newValue, completionType, {
      sessionId: effectiveSessionId,
    });
    if (signal) applyReadySignal(signal, 'storage');
  }

  /** Issue #307: when the learner returns to this tab, re-check same-origin storage + resume. */
  function handleVisibilityOrFocus() {
    if (completed || !opened) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    let raw: string | null = null;
    try {
      raw = window.localStorage?.getItem(EXTERNAL_COMPLETE_STORAGE_KEY) ?? null;
    } catch {
      raw = null;
    }
    if (raw) {
      const signal = readPendingExternalComplete(raw, completionType, {
        sessionId: effectiveSessionId,
      });
      if (signal) applyReadySignal(signal, 'storage-on-return');
    }
    void pollCalibrationResume();
  }

  onMount(() => {
    // Prefer Session (set on /experiment route, #619); re-read location if
    // the card still has query params (direct deep-link / refresh).
    if (typeof window !== 'undefined') {
      const handoff = capturePortalHandoffFromLocation(window.location.search);
      if (handoff.psynaptixSessionId) {
        portalSessionId = handoff.psynaptixSessionId;
      } else {
        const fromSession = Session.get('psynaptixSessionId');
        if (typeof fromSession === 'string' && fromSession.trim()) {
          portalSessionId = fromSession.trim();
        }
      }
    }
    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    try {
      completeChannel = new BroadcastChannel(EXTERNAL_COMPLETE_CHANNEL);
      completeChannel.addEventListener('message', handleChannelMessage);
    } catch {
      completeChannel = null;
    }
    handleVisibilityOrFocus();
  });


  onDestroy(() => {
    window.removeEventListener('message', handleMessage);
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('focus', handleVisibilityOrFocus);
    document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    if (completeChannel) {
      completeChannel.removeEventListener('message', handleChannelMessage);
      completeChannel.close();
      completeChannel = null;
    }
    if (timer) clearTimeout(timer);
    stopResumePoll();
  });
</script>

<div class="external-url-session" role="dialog" aria-label="External session">
  <h2 class="external-url-title">External session</h2>
  {#if !completed}
    <p class="external-url-sub">Complete calibration in the other tab first. MoFaCTS will unlock Continue when that tab finishes — do not skip ahead or the lesson can start while you are still calibrating.</p>
    {#if opened && !failed && !readyToContinue}
      <p class="external-url-waiting">Waiting for calibration to finish in the other tab…</p>
    {/if}
    {#if opened && readyToContinue && !failed}
      <p class="external-url-waiting">Calibration finished. Click Continue to run the trials.</p>
      <button class="external-url-continue" type="button" on:click={continueToLesson}>Continue</button>
    {/if}
    {#if failed}
      <p class="external-url-failed" role="alert">{failureReason}</p>
      <button class="external-url-anyway" type="button" on:click={continueToLesson}>Continue anyway</button>
    {/if}
    <a class="external-url-link" href="{url}" target="_blank" rel="opener" on:click={openTab}>Open external session</a>
  {:else}
    <p class="external-url-complete">Session complete. Continuing to the next unit...</p>
  {/if}
</div>

<style>
  .external-url-session {
    max-width: 36rem;
    margin: 2rem auto;
    padding: 1.5rem;
    border: 1px solid var(--color-border, #d1d5db);
    border-radius: 0.75rem;
    text-align: center;
  }
  .external-url-title { margin: 0 0 0.5rem; font-size: 1.25rem; }
  .external-url-sub { margin: 0 0 1rem; color: #4b5563; }
  .external-url-waiting { margin: 0 0 1rem; color: #6b7280; font-style: italic; }
  .external-url-failed { margin: 0 0 1rem; color: #b91c1c; }
  .external-url-link {
    display: inline-block;
    padding: 0.6rem 1.25rem;
    background: #3b82f6;
    color: #ffffff;
    border-radius: 0.5rem;
    text-decoration: none;
    font-weight: 600;
  }
  .external-url-continue {
    display: inline-block;
    margin: 0 0.5rem 1rem;
    padding: 0.6rem 1.25rem;
    background: #16a34a;
    color: #ffffff;
    border: none;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
  }
  .external-url-anyway {
    display: block;
    margin: 0 auto 1rem;
    padding: 0;
    background: none;
    border: none;
    color: #6b7280;
    font-size: 0.875rem;
    text-decoration: underline;
    cursor: pointer;
  }
  .external-url-complete { margin: 0; color: #15803d; }
</style>
