<script>
  import { createEventDispatcher, onDestroy, tick } from 'svelte';
  import {
    clampH5PPreferredHeight,
    H5P_DEFAULT_PREFERRED_HEIGHT,
    validateH5PDisplayConfig,
  } from '../../../../../common/lib/h5pDisplay';
  import { clientConsole } from '../../../../lib/clientLogger';
  import {
    chooseH5PFit,
    getH5PScaleFloor,
  } from '../utils/h5pFitPolicy';
  import { waitForBrowserPaint } from '../utils/paintTiming';

  const dispatch = createEventDispatcher();
  const BOOTSTRAP_FRAME_WIDTH = 640;
  const MIN_FRAME_HEIGHT = 120;
  const FIT_VERTICAL_SAFETY_PX = 8;
  const MEASUREMENT_TIMEOUT_MS = 1500;
  const CANDIDATE_MEASUREMENT_TIMEOUT_MS = 750;

  export let config = null;

  let pendingResult = null;
  let frameElement;
  let viewportElement;
  let continueBarElement;
  let viewportResizeObserver;
  let resizeFrameId = 0;
  let measurementTimeoutId = 0;
  let currentEmbedUrl = '';

  let fitPhase = 'question';
  let fitEpoch = 0;
  let stageWidth = 0;
  let stageHeight = 0;
  let naturalWidth = null;
  let naturalHeight = null;
  let measurementWidth = null;
  let candidateWidths = [];
  let measuredCandidates = [];
  let activeCandidateIndex = 0;
  let fitResult = null;
  let resizeMessageCount = 0;
  let fitAttemptCount = 0;
  let measurementRequestId = 0;
  let activeMeasurementRequestId = null;
  let measuring = false;
  let timedOut = false;
  let lastFitLogSignature = '';
  let loggedMeasurementRequestForEpoch = false;

  $: baseUrl = typeof window !== 'undefined' && window.location?.origin
    ? `${window.location.origin}/`
    : 'https://mofacts.local/';
  $: validation = validateH5PDisplayConfig(config, baseUrl);
  $: embedUrl = validation.valid
    ? (config?.sourceType === 'self-hosted'
      ? `/h5p-content/${encodeURIComponent(String(config?.contentId || ''))}/play`
      : String(config?.embedUrl || '').trim())
    : '';
  $: isSelfHosted = config?.sourceType === 'self-hosted';
  $: preferredHeight = clampH5PPreferredHeight(config?.preferredHeight ?? H5P_DEFAULT_PREFERRED_HEIGHT);
  $: reservedControlHeight = isSelfHosted && continueBarElement ? continueBarElement.offsetHeight : 0;
  $: bootstrapFrameWidth = Math.max(1, Math.floor(stageWidth || BOOTSTRAP_FRAME_WIDTH));
  $: bootstrapFrameHeight = Math.max(
    MIN_FRAME_HEIGHT,
    Math.floor(Math.min(stageHeight || preferredHeight, preferredHeight))
  );
  $: visibleNaturalWidth = Math.max(1, fitResult?.naturalWidth ?? naturalWidth ?? measurementWidth ?? bootstrapFrameWidth);
  $: visibleNaturalHeight = Math.max(MIN_FRAME_HEIGHT, fitResult?.naturalHeight ?? naturalHeight ?? bootstrapFrameHeight);
  $: measurementFrameWidth = Math.max(1, measurementWidth ?? visibleNaturalWidth);
  $: measurementFrameHeight = Math.max(MIN_FRAME_HEIGHT, naturalHeight ?? fitResult?.naturalHeight ?? bootstrapFrameHeight);
  $: frameScale = fitResult?.scale > 0 ? fitResult.scale : 1;
  $: frameVisualWidth = Math.max(1, Math.floor(visibleNaturalWidth * frameScale));
  $: frameVisualHeight = Math.max(1, Math.floor(visibleNaturalHeight * frameScale));
  $: stageStyle = `width:${frameVisualWidth}px;height:${frameVisualHeight}px;`;
  $: surfaceStyle = `width:${visibleNaturalWidth}px;height:${visibleNaturalHeight}px;transform:scale(${frameScale});`;
  $: frameStyle = `width:${measurementFrameWidth}px;height:${measurementFrameHeight}px;`;
  $: continueReady = Boolean(pendingResult);

  $: if (embedUrl !== currentEmbedUrl) {
    currentEmbedUrl = embedUrl;
    resetH5PState('embed-url');
  }

  $: {
    const nextPhase = pendingResult ? 'feedback' : 'question';
    if (nextPhase !== fitPhase) {
      startFitEpoch(nextPhase, 'phase-change');
    }
  }

  $: syncViewportResizeObserver();

  function clearMeasurementTimeout() {
    if (measurementTimeoutId) {
      clearTimeout(measurementTimeoutId);
      measurementTimeoutId = 0;
    }
  }

  function resetH5PState(reason) {
    pendingResult = null;
    fitPhase = 'question';
    fitEpoch += 1;
    naturalWidth = null;
    naturalHeight = null;
    measurementWidth = null;
    candidateWidths = [];
    measuredCandidates = [];
    activeCandidateIndex = 0;
    fitResult = null;
    resizeMessageCount = 0;
    fitAttemptCount = 0;
    activeMeasurementRequestId = null;
    measuring = false;
    timedOut = false;
    lastFitLogSignature = '';
    loggedMeasurementRequestForEpoch = false;
    clearMeasurementTimeout();
    void requestMeasurementAfterPaint(reason);
  }

  function startFitEpoch(phase, reason) {
    const firstMeasurementWidth = Math.floor(stageWidth || frameElement?.clientWidth || 0);
    if (firstMeasurementWidth <= 0) {
      clientConsole(1, '[H5PFrame][Fit] cannot start epoch without a measured stage width', {
        phase,
        reason,
        contentId: config?.contentId,
      });
      return;
    }
    fitPhase = phase;
    fitEpoch += 1;
    naturalWidth = null;
    naturalHeight = null;
    candidateWidths = [firstMeasurementWidth];
    measuredCandidates = [];
    activeCandidateIndex = 0;
    measurementWidth = candidateWidths[0] ?? firstMeasurementWidth;
    measuring = true;
    timedOut = false;
    loggedMeasurementRequestForEpoch = false;
    clearMeasurementTimeout();
    scheduleMeasurementTimeout(fitEpoch, phase);
    void requestMeasurementAfterPaint(reason);
  }

  function scheduleMeasurementTimeout(epoch, phase) {
    clearMeasurementTimeout();
    measurementTimeoutId = setTimeout(() => {
      if (epoch !== fitEpoch || !measuring) {
        return;
      }
      timedOut = true;
      if (naturalHeight !== null && naturalWidth !== null) {
        logMeasurementIssue('timeout-after-partial-resize-sequence', {
          phase,
          epoch,
          naturalWidth,
          naturalHeight,
        });
        completeCurrentCandidate('timeout');
        return;
      }
      logMeasurementIssue('timeout-without-natural-size', {
        phase,
        epoch,
        contentId: config?.contentId,
      });
      measuring = false;
      activeMeasurementRequestId = null;
      measurementWidth = null;
      clearMeasurementTimeout();
    }, measuredCandidates.length > 0 ? CANDIDATE_MEASUREMENT_TIMEOUT_MS : MEASUREMENT_TIMEOUT_MS);
  }

  function logMeasurementIssue(reason, details = {}) {
    clientConsole(1, '[H5PFrame][Fit] measurement invariant', {
      reason,
      contentId: config?.contentId,
      phase: fitPhase,
      epoch: fitEpoch,
      stageWidth,
      stageHeight,
      candidateWidths,
      measuredCandidates,
      details,
    });
  }

  async function requestMeasurementAfterPaint(reason) {
    const epoch = fitEpoch;
    await tick();
    await waitForBrowserPaint();
    if (epoch !== fitEpoch) {
      return;
    }
    updateStageSize(`${reason}:paint`);
    if (epoch !== fitEpoch) {
      return;
    }
    if (activeMeasurementRequestId !== null) {
      return;
    }
    if (measurementWidth === null) {
      const nextMeasurementWidth = Math.floor(stageWidth || viewportElement?.clientWidth || frameElement?.clientWidth || 0);
      if (nextMeasurementWidth <= 0) {
        logMeasurementIssue('measurement-request-without-width', { reason });
        measuring = false;
        activeMeasurementRequestId = null;
        return;
      }
      candidateWidths = [nextMeasurementWidth];
      measuredCandidates = [];
      activeCandidateIndex = 0;
      measurementWidth = candidateWidths[0] ?? nextMeasurementWidth;
      measuring = true;
      await tick();
      await waitForBrowserPaint();
      if (epoch !== fitEpoch) {
        return;
      }
    }
    requestH5PMeasurement(reason);
  }

  function requestH5PMeasurement(reason) {
    if (!frameElement?.contentWindow) {
      return;
    }
    if (activeMeasurementRequestId !== null) {
      return;
    }
    if (measurementWidth === null) {
      logMeasurementIssue('measurement-request-without-width', { reason });
      measuring = false;
      activeMeasurementRequestId = null;
      return;
    }
    measurementRequestId += 1;
    activeMeasurementRequestId = measurementRequestId;
    measuring = true;
    scheduleMeasurementTimeout(fitEpoch, fitPhase);
    logMeasurementRequest(reason, activeMeasurementRequestId);
    postH5PAction('resize', {
      requestId: activeMeasurementRequestId,
      measurementWidth,
      phase: fitPhase,
      epoch: fitEpoch,
    });
  }

  function syncViewportResizeObserver() {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    if (!viewportElement) {
      return;
    }

    if (!viewportResizeObserver) {
      viewportResizeObserver = new ResizeObserver(() => {
        if (resizeFrameId) {
          cancelAnimationFrame(resizeFrameId);
        }
        resizeFrameId = requestAnimationFrame(() => {
          resizeFrameId = 0;
          updateStageSize('resize-observer');
        });
      });
      viewportResizeObserver.observe(viewportElement);
      void requestMeasurementAfterPaint('viewport-observer');
    }
  }

  function logMeasurementRequest(reason, requestId) {
    if (loggedMeasurementRequestForEpoch) {
      return;
    }

    loggedMeasurementRequestForEpoch = true;
    clientConsole(2, '[H5PFrame][Fit] request-measurement', {
      reason,
      requestId,
      phase: fitPhase,
      epoch: fitEpoch,
      stageWidth,
      stageHeight,
      measurementWidth,
      activeCandidateIndex,
      candidateWidths,
      contentId: config?.contentId,
    });
  }

  function updateStageSize(reason) {
    if (!viewportElement) {
      return;
    }
    const nextWidth = Math.floor(viewportElement.clientWidth || 0);
    const nextHeight = Math.floor(viewportElement.clientHeight || 0);
    if (nextWidth <= 0 || nextHeight <= 0) {
      return;
    }

    const widthChanged = Math.abs(nextWidth - stageWidth) > 1;
    const heightChanged = Math.abs(nextHeight - stageHeight) > 1;
    stageWidth = nextWidth;
    stageHeight = nextHeight;

    if (widthChanged || heightChanged) {
      startFitEpoch(fitPhase, reason);
    }
  }

  function postH5PAction(action, data = {}) {
    if (!frameElement?.contentWindow) {
      return;
    }
    frameElement.contentWindow.postMessage({
      ...data,
      action,
      context: 'h5p',
    }, '*');
  }

  function upsertMeasuredCandidate(candidate) {
    const existingIndex = measuredCandidates
      .findIndex((entry) => entry.measurementWidth === candidate.measurementWidth);
    if (existingIndex >= 0) {
      measuredCandidates = [
        ...measuredCandidates.slice(0, existingIndex),
        candidate,
        ...measuredCandidates.slice(existingIndex + 1),
      ];
      return;
    }
    measuredCandidates = [...measuredCandidates, candidate];
  }

  function chooseFitFromMeasurements() {
    const scaleFloor = getH5PScaleFloor(stageWidth, false);
    const availableHeight = Math.max(1, stageHeight - FIT_VERTICAL_SAFETY_PX);
    return chooseH5PFit({
      phase: fitPhase,
      availableWidth: stageWidth,
      availableHeight,
      reservedControlHeight,
      scaleFloor,
      focusAvailable: false,
      candidates: measuredCandidates,
    });
  }

  function completeFit(nextFit, source) {
    if (!nextFit || !(nextFit.scale > 0)) {
      logMeasurementIssue('invalid-fit-result', { source, fit: nextFit });
      measuring = false;
      activeMeasurementRequestId = null;
      return;
    }
    fitResult = nextFit;
    measuring = false;
    activeMeasurementRequestId = null;
    measurementWidth = null;
    naturalWidth = nextFit.naturalWidth;
    naturalHeight = nextFit.naturalHeight;
    clearMeasurementTimeout();
    fitAttemptCount += 1;

    const signature = [
      nextFit.phase,
      nextFit.mode,
      nextFit.naturalWidth,
      nextFit.naturalHeight,
      nextFit.availableWidth,
      nextFit.availableHeight,
      nextFit.scale.toFixed(3),
    ].join(':');

    if (signature !== lastFitLogSignature) {
      lastFitLogSignature = signature;
      clientConsole(2, '[H5PFrame][Fit] applied', {
        source,
        epoch: fitEpoch,
        contentId: config?.contentId,
        candidateWidths,
        measuredCandidates,
        resizeMessageCount,
        fitAttemptCount,
        timedOut,
        fit: nextFit,
      });
    }
  }

  function completeCurrentCandidate(source) {
    if (!measuring || measuredCandidates.length === 0) {
      return;
    }

    let nextFit;
    try {
      nextFit = chooseFitFromMeasurements();
    } catch (error) {
      logMeasurementIssue('fit-policy-error', {
        source,
        message: error instanceof Error ? error.message : String(error),
      });
      measuring = false;
      activeMeasurementRequestId = null;
      return;
    }
    completeFit(nextFit, source);
  }

  function recordNaturalSize(data, source, finalize = false) {
    const responseRequestId = Number(data.requestId);
    if (!measuring || responseRequestId !== activeMeasurementRequestId) {
      return;
    }

    const scrollHeight = Number(data.scrollHeight);
    if (!Number.isFinite(scrollHeight) || scrollHeight <= 0) {
      return;
    }

    const measuredWidth = Math.round(
      measurementWidth || Number(data.measurementWidth) || Number(data.clientWidth) || 0
    );
    if (measuredWidth <= 0) {
      logMeasurementIssue('resize-message-without-measurement-width', { source, data });
      return;
    }

    resizeMessageCount += 1;
    naturalWidth = measuredWidth;
    naturalHeight = scrollHeight;
    upsertMeasuredCandidate({
      measurementWidth: measuredWidth,
      naturalWidth: measuredWidth,
      naturalHeight: scrollHeight,
    });

    if (finalize) {
      completeCurrentCandidate(source);
    }
  }

  function handleH5PResizerMessage(data) {
    if (!frameElement) {
      return;
    }

    if (data.action === 'hello') {
      void requestMeasurementAfterPaint('hello');
      return;
    }

    if (data.action === 'prepareResize') {
      recordNaturalSize(data, 'prepareResize', true);
      return;
    }

    if (data.action === 'resize') {
      recordNaturalSize(data, 'resize');
    }
  }

  function handleMessage(event) {
    const data = event.data || {};
    if (data.context === 'h5p') {
      if (typeof window !== 'undefined' && event.origin !== window.location.origin) {
        return;
      }
      if (data.contentId && data.contentId !== config?.contentId) {
        return;
      }
      handleH5PResizerMessage(data);
      return;
    }

    if (typeof window !== 'undefined' && event.origin !== window.location.origin) {
      return;
    }
    if (data.type === 'mofacts:h5p-result') {
      pendingResult = data;
      startFitEpoch('feedback', 'h5p-result');
    } else if (data.type === 'mofacts:h5p-loaded') {
      dispatch('loaded', data);
      void requestMeasurementAfterPaint('h5p-loaded');
    } else if (data.type === 'mofacts:h5p-failed') {
      clientConsole(1, '[H5PFrame] H5P runtime reported a failure', data);
      dispatch('failed', data);
    } else if (data.type === 'mofacts:h5p-xapi') {
      dispatch('h5pxapi', data);
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('message', handleMessage);
  }

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', handleMessage);
    }
    if (viewportResizeObserver) {
      viewportResizeObserver.disconnect();
      viewportResizeObserver = undefined;
    }
    if (resizeFrameId) {
      cancelAnimationFrame(resizeFrameId);
      resizeFrameId = 0;
    }
    clearMeasurementTimeout();
  });

  function handleLoad() {
    postH5PAction('ready');
    void requestMeasurementAfterPaint('iframe-load');
    dispatch('loaded', { sourceType: config?.sourceType, embedUrl });
  }

  function handleError() {
    clientConsole(1, '[H5PFrame] H5P iframe failed to load', {
      embedUrl,
    });
    dispatch('failed', { embedUrl });
  }

  function handleContinue() {
    if (!pendingResult) {
      return;
    }
    dispatch('h5presult', pendingResult);
    pendingResult = null;
  }

</script>

<div class="h5p-frame-shell">
  {#if validation.valid}
    <div bind:this={viewportElement} class="h5p-frame-viewport">
      <div
        class="h5p-frame-stage"
        class:h5p-frame-stage-measuring={measuring}
        style={stageStyle}
      >
        <div class="h5p-frame-surface" style={surfaceStyle}>
          <iframe
            bind:this={frameElement}
            class="h5p-frame"
            src={embedUrl}
            title="H5P activity"
            style={frameStyle}
            loading="lazy"
            referrerpolicy="strict-origin-when-cross-origin"
            allow="fullscreen; autoplay; clipboard-read; clipboard-write"
            allowfullscreen
            scrolling="no"
            on:load={handleLoad}
            on:error={handleError}
          ></iframe>
        </div>
      </div>
    </div>
    {#if isSelfHosted}
      <div bind:this={continueBarElement} class="h5p-continue-bar" aria-hidden={!continueReady}>
        {#if continueReady}
          <button type="button" class="h5p-continue-button" on:click={handleContinue}>
            Continue
          </button>
        {/if}
      </div>
    {:else if pendingResult}
      <div bind:this={continueBarElement} class="h5p-continue-bar">
        <button type="button" class="h5p-continue-button" on:click={handleContinue}>
          Continue
        </button>
      </div>
    {/if}
  {:else}
    <div class="h5p-frame-error" role="alert">
      {validation.message || 'Invalid H5P display configuration'}
    </div>
  {/if}
</div>

<style>
  .h5p-frame-shell {
    width: 100%;
    max-width: 100%;
    height: 100%;
    min-height: 0;
    border: 0;
    border-radius: 0;
    background: var(--stimuli-box-color);
    overflow: hidden;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }

  .h5p-frame-viewport {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    overflow: hidden;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    box-sizing: border-box;
  }

  .h5p-frame-stage {
    flex: 0 0 auto;
    overflow: hidden;
    max-width: 100%;
    max-height: 100%;
  }

  .h5p-frame-surface {
    transform-origin: top left;
    overflow: hidden;
  }

  .h5p-frame {
    display: block;
    border: 0;
    min-width: 0;
    min-height: 0;
    background: var(--background-color, #fff);
    overflow: clip;
  }

  .h5p-continue-bar {
    flex: 0 0 var(--h5p-action-bar-height, 3.75rem);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-height: var(--h5p-action-bar-height, 3.75rem);
    padding: 0 0.75rem;
    border-top: 1px solid var(--secondary-color);
    background: var(--stimuli-box-color);
    box-sizing: border-box;
  }

  .h5p-continue-button {
    min-width: 8rem;
    padding: 0.625rem 1rem;
    border: 1px solid var(--accent-color);
    border-radius: var(--border-radius-md, 6px);
    background: var(--accent-color);
    color: var(--button-text-color, #fff);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .h5p-continue-button:hover,
  .h5p-continue-button:focus-visible {
    filter: brightness(0.95);
  }

  .h5p-frame-error {
    padding: 1rem;
    color: var(--alert-color);
    text-align: center;
    font-size: 0.95rem;
    line-height: 1.4;
  }
</style>
