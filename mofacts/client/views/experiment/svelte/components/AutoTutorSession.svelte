<script>
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import 'deep-chat';
  import { createAutoTutorRuntime } from '../services/autoTutorClient';
  import { clientConsole } from '../../../../lib/clientLogger';

  const dispatch = createEventDispatcher();
  const MOBILE_LAYOUT_QUERY = '(max-width: 768px)';

  let chatElement;
  let runtime = null;
  let errorMessage = '';
  let progress = 0;
  let progressCounts = {
    coveredExpectations: 0,
    requiredExpectations: 0,
    neededExpectations: 0,
    activeMisconceptions: 0,
    totalMisconceptions: 0,
    maxActiveMisconceptions: 0,
  };
  let turnCount = 0;
  let costUsd = 0;
  let completed = false;
  let mastered = false;
  let endReason = 'in_progress';
  let stoppedByCost = false;
  let questionPrompt = '';
  let unitName = 'AutoTutor';
  let isMobileLayout = false;

  function toDeepChatHistory(dialogue) {
    return dialogue.map((message) => ({
      role: message.role === 'student' ? 'user' : 'ai',
      text: message.text,
    }));
  }

  function refreshRuntimeState() {
    if (!runtime) {
      return;
    }
    const state = runtime.getState();
    progress = runtime.getProgress();
    progressCounts = runtime.getProgressCounts();
    turnCount = state.turnCount;
    costUsd = state.costUsd;
    completed = state.completed;
    mastered = state.mastered;
    endReason = state.endReason;
    stoppedByCost = state.stoppedByCost;
    updateChatInputState();
  }

  function updateChatInputState() {
    if (!chatElement) {
      return;
    }
    const disabled = completed || !!errorMessage;
    chatElement.setPlaceholderText?.(disabled ? 'Conversation complete' : 'Type your answer...');
    chatElement.disableSubmitButton?.(disabled);
    const textInput = chatElement.shadowRoot?.querySelector('#text-input');
    if (textInput) {
      textInput.contentEditable = disabled ? 'false' : 'true';
      textInput.classList.toggle('text-input-disabled', disabled);
      textInput.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }
  }

  function extractStudentText(body) {
    if (typeof body === 'string' && body.trim()) {
      return body.trim();
    }
    if (typeof body?.text === 'string' && body.text.trim()) {
      return body.text.trim();
    }
    if (typeof body?.message?.text === 'string' && body.message.text.trim()) {
      return body.message.text.trim();
    }
    if (Array.isArray(body?.messages)) {
      for (let i = body.messages.length - 1; i >= 0; i -= 1) {
        const message = body.messages[i];
        const role = message?.role || message?.sender;
        const text = message?.text || message?.content;
        if ((role === 'user' || role === 'human' || !role) && typeof text === 'string' && text.trim()) {
          return text.trim();
        }
      }
    }
    throw new Error('Deep Chat request body did not contain a student text message');
  }

  function handleContinue() {
    if (!completed) {
      return;
    }
    dispatch('complete', {
      stoppedByCost,
      mastered,
      endReason,
      turnCount,
      costUsd,
      progress,
    });
  }

  function barWidth(value, total) {
    if (!Number.isFinite(total) || total <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, (value / total) * 100));
  }

  function thresholdMarker(value, total) {
    if (!Number.isFinite(total) || total <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, (value / total) * 100));
  }

  function applyDeepChatHostLayout() {
    if (!chatElement) {
      return;
    }
    chatElement.style.setProperty('display', 'block');
    chatElement.style.setProperty('width', '100%');
    chatElement.style.setProperty('height', '100%');
    chatElement.style.setProperty('min-width', '0');
    chatElement.style.setProperty('min-height', '0');
    chatElement.style.setProperty('box-sizing', 'border-box');
  }

  function applyDeepChatIntroMessage() {
    if (!chatElement) {
      return;
    }
    chatElement.introMessage = {
      text: isMobileLayout && questionPrompt
        ? `${questionPrompt}\n\nTell me what you think. A short answer is fine.`
        : 'Tell me what you think. A short answer is fine.',
    };
  }

  function configureDeepChatVisuals() {
    applyDeepChatHostLayout();
    applyDeepChatIntroMessage();
    chatElement.textInput = {
      placeholder: { text: 'Type your answer...' },
      styles: {
        container: {
          backgroundColor: 'var(--card-background-color)',
          border: '1px solid var(--secondary-color)',
          borderRadius: '6px',
          boxShadow: 'none',
          width: 'calc(100% - 1.5rem)',
          maxHeight: '7rem',
        },
        text: {
          color: 'var(--text-color)',
          minHeight: '1.5rem',
        },
      },
    };
    chatElement.inputAreaStyle = {
      backgroundColor: 'var(--background-color)',
      borderTop: '1px solid var(--secondary-color)',
    };
    chatElement.displayLoadingBubble = true;
    chatElement.submitButtonStyles = {
      submit: {
        container: {
          default: {
            backgroundColor: 'var(--main-button-color)',
            borderRadius: '6px',
          },
        },
        svg: {
          default: {
            color: 'var(--main-button-text-color)',
          },
        },
      },
    };
    chatElement.messageStyles = {
      default: {
        user: {
          bubble: {
            backgroundColor: 'var(--main-button-color)',
            color: 'var(--main-button-text-color)',
            borderRadius: '8px',
          },
        },
        ai: {
          bubble: {
            backgroundColor: 'var(--card-background-color)',
            color: 'var(--text-color)',
            border: '1px solid var(--secondary-color)',
            borderRadius: '8px',
          },
        },
      },
    };
    chatElement.chatStyle = {
      width: '100%',
      height: '100%',
      border: '1px solid var(--secondary-color)',
      borderRadius: '8px',
      backgroundColor: 'var(--background-color)',
    };
  }

  function configureDeepChatRuntime() {
    applyDeepChatIntroMessage();
    chatElement.connect = {
      handler: async (body, signals) => {
        try {
          if (!runtime) {
            throw new Error('AutoTutor runtime is not ready');
          }
          const studentText = extractStudentText(body);
          const result = await runtime.submitStudentAnswer(studentText);
          await signals.onResponse({ text: result.message });
          refreshRuntimeState();
        } catch (error) {
          errorMessage = error?.message || String(error);
          updateChatInputState();
          clientConsole(1, '[AutoTutor] Chat turn failed', error);
          await signals.onResponse({
            text: 'This AutoTutor session hit a configuration or service error. Please contact the lesson author.',
          });
        }
      },
    };

    chatElement.history = toDeepChatHistory(runtime.getDialogue());
    updateChatInputState();
    chatElement.onRender?.();
  }

  onMount(() => {
    const mobileLayoutQuery = window.matchMedia(MOBILE_LAYOUT_QUERY);
    isMobileLayout = mobileLayoutQuery.matches;
    const handleLayoutChange = (event) => {
      isMobileLayout = event.matches;
      applyDeepChatIntroMessage();
      chatElement?.onRender?.();
    };
    mobileLayoutQuery.addEventListener('change', handleLayoutChange);

    async function initializeAutoTutor() {
      try {
        configureDeepChatVisuals();
        runtime = await createAutoTutorRuntime();
        questionPrompt = runtime.config.prompt;
        unitName = runtime.config.unitName;
        refreshRuntimeState();
        configureDeepChatRuntime();
        await tick();
        applyDeepChatHostLayout();
      } catch (error) {
        errorMessage = error?.message || String(error);
        updateChatInputState();
        clientConsole(1, '[AutoTutor] Runtime initialization failed', error);
      }
    }

    initializeAutoTutor();

    return () => {
      mobileLayoutQuery.removeEventListener('change', handleLayoutChange);
    };
  });
</script>

<section class="auto-tutor-session" aria-label={unitName}>
  <header class="auto-tutor-header">
    <div class="auto-tutor-question">
      <h1>{questionPrompt}</h1>
    </div>
    <div class="auto-tutor-progress" aria-label="AutoTutor progress">
      <div class="auto-tutor-meter-row">
        <div class="auto-tutor-meter-copy">
          <span>Expectations</span>
          <strong>{progressCounts.coveredExpectations}/{progressCounts.requiredExpectations}</strong>
        </div>
        <div
          class="auto-tutor-progress-track auto-tutor-progress-track-ideas"
          role="meter"
          aria-label="Covered ideas"
          aria-valuemin="0"
          aria-valuemax={progressCounts.requiredExpectations}
          aria-valuenow={progressCounts.coveredExpectations}
        >
          <div
            class="auto-tutor-progress-fill"
            style={`width: ${barWidth(progressCounts.coveredExpectations, progressCounts.requiredExpectations)}%;`}
          ></div>
          <div
            class="auto-tutor-progress-marker"
            style={`left: ${thresholdMarker(progressCounts.neededExpectations, progressCounts.requiredExpectations)}%;`}
            aria-hidden="true"
          ></div>
        </div>
      </div>
      <div class="auto-tutor-meter-row">
        <div class="auto-tutor-meter-copy">
          <span>Misconceptions</span>
          <strong>{progressCounts.activeMisconceptions}/{progressCounts.totalMisconceptions}</strong>
        </div>
        <div
          class="auto-tutor-progress-track auto-tutor-progress-track-misconceptions"
          role="meter"
          aria-label="Active misconceptions"
          aria-valuemin="0"
          aria-valuemax={progressCounts.totalMisconceptions}
          aria-valuenow={progressCounts.activeMisconceptions}
        >
          <div
            class="auto-tutor-progress-fill auto-tutor-progress-fill-misconceptions"
            style={`width: ${barWidth(progressCounts.activeMisconceptions, progressCounts.totalMisconceptions)}%;`}
          ></div>
          <div
            class="auto-tutor-progress-marker"
            style={`left: ${thresholdMarker(progressCounts.maxActiveMisconceptions, progressCounts.totalMisconceptions)}%;`}
            aria-hidden="true"
          ></div>
        </div>
      </div>
      <div class="auto-tutor-turns">
        {turnCount === 1 ? '1 turn' : `${turnCount} turns`}
      </div>
    </div>
  </header>

  {#if errorMessage}
    <div class="auto-tutor-error" role="alert">
      {errorMessage}
    </div>
  {/if}

  {#if completed}
    <div class="auto-tutor-complete" role="status">
      {#if mastered}
        Nice work. Review the conversation, then continue.
      {:else if stoppedByCost}
        Cost cap reached. Review the conversation, then continue.
      {:else if endReason === 'max_turns'}
        Turn limit reached. Review the conversation, then continue.
      {:else}
        Session ended. Review the conversation, then continue.
      {/if}
    </div>
  {/if}

  <div class="auto-tutor-chat" class:auto-tutor-chat-disabled={!!errorMessage || completed}>
    <div class="auto-tutor-mobile-progress" aria-label="AutoTutor progress">
      <div class="auto-tutor-meter-row">
        <div class="auto-tutor-meter-copy">
          <span>Expectations</span>
          <strong>{progressCounts.coveredExpectations}/{progressCounts.requiredExpectations}</strong>
        </div>
        <div class="auto-tutor-progress-track auto-tutor-progress-track-ideas">
          <div
            class="auto-tutor-progress-fill"
            style={`width: ${barWidth(progressCounts.coveredExpectations, progressCounts.requiredExpectations)}%;`}
          ></div>
        </div>
      </div>
      <div class="auto-tutor-meter-row">
        <div class="auto-tutor-meter-copy">
          <span>Misconceptions</span>
          <strong>{progressCounts.activeMisconceptions}/{progressCounts.totalMisconceptions}</strong>
        </div>
        <div class="auto-tutor-progress-track auto-tutor-progress-track-misconceptions">
          <div
            class="auto-tutor-progress-fill auto-tutor-progress-fill-misconceptions"
            style={`width: ${barWidth(progressCounts.activeMisconceptions, progressCounts.totalMisconceptions)}%;`}
          ></div>
        </div>
      </div>
      <div class="auto-tutor-turns">
        {turnCount === 1 ? '1 turn' : `${turnCount} turns`}
      </div>
    </div>
    <deep-chat
      bind:this={chatElement}
      style="display: block; width: 100%; height: 100%; min-width: 0; min-height: 0; box-sizing: border-box;"
    ></deep-chat>
  </div>

  <div class="auto-tutor-continue-bar" aria-label="AutoTutor continue controls">
    <div class="auto-tutor-footer-label" aria-hidden="true">AutoTutor</div>
    <button
      type="button"
      class="auto-tutor-continue-button"
      disabled={!completed}
      on:click={handleContinue}
    >
      Continue
    </button>
  </div>
</section>

<style>
  .auto-tutor-session {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    height: 100%;
    max-height: 100%;
    min-height: 0;
    width: 100%;
    padding: clamp(12px, 2vw, 24px);
    gap: 12px;
    background: var(--background-color);
    color: var(--text-color);
    box-sizing: border-box;
    overflow: hidden;
    position: relative;
  }

  .auto-tutor-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, 320px);
    gap: 16px;
    align-items: center;
    flex: 0 0 auto;
  }

  .auto-tutor-question {
    min-width: 0;
  }

  .auto-tutor-question h1 {
    margin: 0;
    font-size: 1.25rem;
    line-height: 1.35;
    font-weight: 700;
    letter-spacing: 0;
  }

  .auto-tutor-progress {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .auto-tutor-meter-row {
    display: grid;
    grid-template-columns: minmax(6.5rem, 8.5rem) minmax(0, 1fr);
    gap: 8px;
    align-items: center;
  }

  .auto-tutor-meter-copy {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    min-width: 0;
    color: var(--text-color);
    font-size: 0.78rem;
    font-weight: 600;
  }

  .auto-tutor-meter-copy span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .auto-tutor-meter-copy strong {
    flex: 0 0 auto;
    font-size: 0.82rem;
  }

  .auto-tutor-progress-track {
    position: relative;
    width: 100%;
    height: 10px;
    border: 1px solid var(--secondary-color);
    border-radius: 6px;
    background: var(--card-background-color);
    box-sizing: border-box;
  }

  .auto-tutor-progress-fill {
    position: absolute;
    inset: 0 auto 0 0;
    height: 100%;
    min-width: 0;
    background: var(--main-button-color);
    border-radius: 5px;
    transition: width 160ms ease;
  }

  .auto-tutor-progress-fill-misconceptions {
    background: var(--warning-color, var(--accent-color));
  }

  .auto-tutor-progress-marker {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 2px;
    border-radius: 999px;
    background: var(--text-color);
    opacity: 0.65;
    transform: translateX(-1px);
  }

  .auto-tutor-turns {
    color: var(--secondary-text-color);
    font-size: 0.78rem;
  }

  .auto-tutor-error,
  .auto-tutor-complete {
    flex: 0 0 auto;
    padding: 10px 12px;
    border: 1px solid var(--secondary-color);
    border-radius: 6px;
    background: var(--card-background-color);
    font-weight: 600;
  }

  .auto-tutor-error {
    color: var(--alert-color);
  }

  .auto-tutor-chat {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }

  .auto-tutor-chat-disabled {
    opacity: 0.72;
  }

  .auto-tutor-chat :global(deep-chat) {
    display: block;
    width: 100% !important;
    height: 100% !important;
    min-width: 0 !important;
    min-height: 0 !important;
    box-sizing: border-box;
  }

  .auto-tutor-mobile-progress {
    display: none;
  }

  .auto-tutor-continue-bar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 0;
    padding: 0.35rem 0.75rem;
    border-top: 1px solid var(--secondary-color);
    background: var(--stimuli-box-color);
    box-sizing: border-box;
  }

  .auto-tutor-footer-label {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    min-height: var(--button-height);
    color: var(--navbar-text-color, var(--text-color));
    font-family: var(--heading-font-family, var(--font-family));
    font-size: calc(1.25rem * 0.8);
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .auto-tutor-continue-button {
    min-width: 8rem;
    min-height: var(--button-height);
    padding: 0 1rem;
    border: 1px solid var(--main-button-color);
    border-radius: var(--border-radius-md, 6px);
    background: var(--main-button-color);
    color: var(--main-button-text-color);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .auto-tutor-continue-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .auto-tutor-continue-button:not(:disabled):hover,
  .auto-tutor-continue-button:not(:disabled):focus-visible {
    filter: brightness(0.95);
  }

  @media (max-width: 768px) {
    .auto-tutor-session {
      padding: 10px;
      gap: 8px;
    }

    .auto-tutor-header {
      display: none;
    }

    .auto-tutor-mobile-progress {
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 2;
      display: flex;
      flex-direction: column;
      width: min(58vw, 220px);
      gap: 4px;
      padding: 0.35rem 0.45rem;
      border: 1px solid var(--secondary-color);
      border-radius: var(--border-radius-sm);
      background: color-mix(in srgb, var(--background-color) 88%, transparent);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
      backdrop-filter: blur(3px);
      pointer-events: none;
    }

    .auto-tutor-mobile-progress .auto-tutor-meter-row {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
    }

    .auto-tutor-mobile-progress .auto-tutor-meter-copy {
      font-size: 0.68rem;
      line-height: 1;
    }

    .auto-tutor-mobile-progress .auto-tutor-meter-copy strong {
      font-size: 0.72rem;
    }

    .auto-tutor-turns {
      font-size: 0.75rem;
      line-height: 1.1;
      text-align: center;
    }

    .auto-tutor-progress-track {
      height: 7px;
    }

    .auto-tutor-error,
    .auto-tutor-complete {
      padding: 8px 10px;
      font-size: 0.9rem;
    }

    .auto-tutor-continue-bar {
      padding: 0.3rem 0.4rem;
    }

    .auto-tutor-continue-button {
      width: auto;
      min-width: 7rem;
      min-height: var(--button-height);
    }
  }
</style>
