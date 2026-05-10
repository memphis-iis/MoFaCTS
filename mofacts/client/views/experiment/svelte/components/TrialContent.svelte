<script>
  /**
   * TrialContent Component
   * Handles layout (over-under vs split) and positions stimulus/response
   * Mobile <768px always stacks
   */
  import { createEventDispatcher, tick } from 'svelte';
  import StimulusDisplay from './StimulusDisplay.svelte';
  import ResponseArea from './ResponseArea.svelte';
  import FeedbackDisplay from './FeedbackDisplay.svelte';
  import { clientConsole } from '../../../../lib/clientLogger';
  import { waitForBrowserPaint } from '../utils/paintTiming';

  const dispatch = createEventDispatcher();

  /** @type {'top' | 'left'} Layout mode (top = over-under, left = split) */
  export let layoutMode = 'top';

  /** @type {boolean} Whether display is visible */
  export let displayVisible = true;

  /** @type {boolean} Whether in force correcting state */
  export let isForceCorrecting = false;

  /** @type {Object} Current display data */
  export let display = {};

  /** @type {boolean} Whether the outer trial container is currently visible */
  export let parentVisible = true;

  /** @type {'none' | 'prestimulus' | 'question' | 'study' | 'feedback' | 'forceCorrect'} */
  export let subsetKind = 'none';

  /** @type {boolean} Show question number */
  export let showQuestionNumber = false;

  /** @type {number} Question number */
  export let questionNumber = 0;

  /** @type {'text' | 'buttons' | 'sr'} Input mode */
  export let inputMode = 'text';

  /** @type {boolean} Input enabled */
  export let inputEnabled = true;

  /** @type {string} User answer */
  export let userAnswer = '';

  /** @type {string} User answer for feedback display */
  export let feedbackUserAnswer = '';

  /** @type {boolean} Show submit button */
  export let showSubmitButton = true;

  /** @type {string} Input placeholder */
  export let inputPlaceholder = 'Type your answer...';

  /** @type {boolean} Show MC buttons */
  export let showButtons = true;

  /** @type {Array} Button list */
  export let buttonList = [];

  /** @type {number} Button columns */
  export let buttonColumns = 2;

  /** @type {boolean} Whether confirm button mode is enabled */
  export let displayConfirmButton = false;

  /** @type {boolean} Whether confirm button should be enabled */
  export let confirmEnabled = false;

  /** @type {number|null} Selected choice index */
  export let selectedChoiceIndex = null;

  /** @type {'idle' | 'ready' | 'recording' | 'processing' | 'error'} SR status */
  export let srStatus = 'idle';

  /** @type {number} SR attempt */
  export let srAttempt = 0;

  /** @type {number} Max SR attempts */
  export let srMaxAttempts = 3;

  /** @type {string} SR error */
  export let srError = '';

  /** @type {string} SR transcript */
  export let srTranscript = '';

  /** @type {boolean} Feedback visible */
  export let feedbackVisible = false;

  /** @type {boolean} Response area visible */
  export let responseVisible = false;

  /** @type {boolean} Is correct */
  export let isCorrect = false;

  /** @type {boolean} Is timeout */
  export let isTimeout = false;

  /** @type {string} Correct answer */
  export let correctAnswer = '';

  /** @type {string} Correct answer image URL */
  export let correctAnswerImageSrc = '';

  /** @type {string} Correct message */
  export let correctMessage = 'Correct!';

  /** @type {string} Incorrect message */
  export let incorrectMessage = 'Incorrect';

  /** @type {string} Feedback message from answer evaluation */
  export let feedbackMessage = '';

  /** @type {string} Force correct prompt */
  export let forceCorrectPrompt = 'Please type the correct answer to continue';

  /** @type {string} Correct color */
  export let correctColor = 'var(--success-color)';

  /** @type {string} Incorrect color */
  export let incorrectColor = 'var(--alert-color)';

  /** @type {boolean} Display correct feedback */
  export let displayCorrectFeedback = true;

  /** @type {boolean} Display incorrect feedback */
  export let displayIncorrectFeedback = true;

  /** @type {'onCorrect' | 'onIncorrect' | boolean} Display user answer rules */
  export let displayUserAnswerInFeedback = 'onIncorrect';

  /** @type {boolean} Render feedback in a single line */
  export let singleLineFeedback = false;

  /** @type {'onCorrect' | 'onIncorrect' | boolean} Show only "Correct." / "Incorrect." */
  export let onlyShowSimpleFeedback = false;

  /** @type {boolean} Show the correct answer on incorrect feedback */
  export let displayCorrectAnswerInIncorrectFeedback = false;

  /** @type {boolean} Whether audio replay is enabled */
  export let replayEnabled = true;

  $: normalizedLayoutMode = String(layoutMode || '').trim().toLowerCase();
  $: isSplitLayout = normalizedLayoutMode === 'left';
  $: isOverUnder = !isSplitLayout;
  $: isImageStimulus = Boolean(display?.imgSrc || display?.videoSrc);
  $: requestedInteractionKind = feedbackVisible ? 'feedback' : (responseVisible ? 'response' : 'none');

  let interactionFadeElement;
  let displayedInteractionKind = 'none';
  let interactionVisible = false;
  let interactionTransitionToken = 0;
  let interactionTransitionInFlight = false;

  $: mountedFeedbackVisible = displayedInteractionKind === 'feedback';
  $: mountedResponseVisible = displayedInteractionKind === 'response';

  $: if (!parentVisible) {
    interactionTransitionToken += 1;
    interactionTransitionInFlight = false;
    displayedInteractionKind = requestedInteractionKind;
    interactionVisible = requestedInteractionKind !== 'none';
  }

  $: if (
    parentVisible &&
    !interactionTransitionInFlight &&
    displayedInteractionKind === 'none' &&
    requestedInteractionKind !== 'none'
  ) {
    displayedInteractionKind = requestedInteractionKind;
    interactionVisible = true;
  }

  $: if (
    parentVisible &&
    !interactionTransitionInFlight &&
    displayedInteractionKind !== 'none' &&
    requestedInteractionKind !== 'none' &&
    displayedInteractionKind !== requestedInteractionKind &&
    displayedInteractionKind === 'response' &&
    requestedInteractionKind === 'feedback'
  ) {
    void runInteractionHandoff(requestedInteractionKind);
  }

  $: if (
    parentVisible &&
    !interactionTransitionInFlight &&
    displayedInteractionKind !== requestedInteractionKind &&
    !(displayedInteractionKind === 'response' && requestedInteractionKind === 'feedback')
  ) {
    displayedInteractionKind = requestedInteractionKind;
    interactionVisible = requestedInteractionKind !== 'none';
  }

  function getInteractionTransitionDurationMs() {
    if (!interactionFadeElement || typeof window === 'undefined') {
      return 0;
    }

    const style = getComputedStyle(interactionFadeElement);
    const durationValue = style.transitionDuration?.split(',')?.[0]?.trim() || '';
    const delayValue = style.transitionDelay?.split(',')?.[0]?.trim() || '';
    return parseCssTimeToMs(durationValue) + parseCssTimeToMs(delayValue);
  }

  function parseCssTimeToMs(value) {
    if (!value) {
      return 0;
    }
    if (value.endsWith('ms')) {
      const parsed = Number(value.slice(0, -2));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (value.endsWith('s')) {
      const parsed = Number(value.slice(0, -1));
      return Number.isFinite(parsed) ? parsed * 1000 : 0;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async function waitForTransition(durationMs) {
    if (!durationMs || durationMs <= 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, durationMs));
  }

  async function runInteractionHandoff(nextKind) {
    interactionTransitionToken += 1;
    const token = interactionTransitionToken;
    interactionTransitionInFlight = true;
    const durationMs = getInteractionTransitionDurationMs();

    clientConsole(2, '[TrialContent][InteractionTransition] fade-out:start', {
      from: displayedInteractionKind,
      to: nextKind,
      durationMs,
      subsetKind,
    });

    interactionVisible = false;
    await waitForTransition(durationMs);

    if (
      token !== interactionTransitionToken ||
      !parentVisible ||
      requestedInteractionKind !== nextKind
    ) {
      interactionTransitionInFlight = false;
      return;
    }

    displayedInteractionKind = nextKind;
    await tick();
    await waitForBrowserPaint();

    if (
      token !== interactionTransitionToken ||
      !parentVisible ||
      requestedInteractionKind !== nextKind
    ) {
      interactionTransitionInFlight = false;
      return;
    }

    clientConsole(2, '[TrialContent][InteractionTransition] feedback-fade-in:start', {
      to: nextKind,
      durationMs,
      subsetKind,
    });

    dispatch('reviewrevealstarted', {
      subsetKind,
      transitionDurationMs: durationMs,
      timestamp: Date.now(),
    });

    interactionVisible = true;
    await waitForTransition(durationMs);

    if (token === interactionTransitionToken) {
      clientConsole(2, '[TrialContent][InteractionTransition] feedback-fade-in:end', {
        to: nextKind,
        durationMs,
        subsetKind,
      });
      interactionTransitionInFlight = false;
    }
  }
</script>

<div
  class="trial-content"
  class:split={isSplitLayout}
  class:over-under={isOverUnder}
  class:image-stimulus={isImageStimulus}
  class:non-image-stimulus={!isImageStimulus}
  data-subset-kind={subsetKind}
>
  <div class="trial-main">
    <div class="stimulus-container">
      <StimulusDisplay
        {display}
        visible={displayVisible}
        {showQuestionNumber}
        {questionNumber}
        componentFlow={isSplitLayout ? 'column' : 'row'}
        {replayEnabled}
        on:replay
        on:blockingassetstate
      />
    </div>

    <div class="interaction-container">
      <div
        class="interaction-fade"
        bind:this={interactionFadeElement}
        class:interaction-fade-visible={interactionVisible}
      >
      {#if mountedFeedbackVisible}
        <FeedbackDisplay
          visible={mountedFeedbackVisible}
          {isCorrect}
          {isTimeout}
          userAnswer={feedbackUserAnswer}
          {correctAnswer}
          {correctAnswerImageSrc}
          {correctMessage}
          {incorrectMessage}
          {feedbackMessage}
          {correctColor}
          {incorrectColor}
          {displayCorrectFeedback}
          {displayIncorrectFeedback}
          {displayUserAnswerInFeedback}
          {singleLineFeedback}
          {onlyShowSimpleFeedback}
          {displayCorrectAnswerInIncorrectFeedback}
          on:blockingassetstate
        />
      {:else if mountedResponseVisible}
        <ResponseArea
          {inputMode}
          enabled={inputEnabled}
          {isForceCorrecting}
          {forceCorrectPrompt}
          {userAnswer}
          {showSubmitButton}
          {inputPlaceholder}
          {showButtons}
          {buttonList}
          {buttonColumns}
          {displayConfirmButton}
          {confirmEnabled}
          {selectedChoiceIndex}
          {srStatus}
          {srAttempt}
          {srMaxAttempts}
          {srError}
          {srTranscript}
          on:submit
          on:input
          on:activity
          on:firstKeypress
          on:choice
          on:confirm
        />
      {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .trial-content {
    display: flex;
    flex-direction: column;
    width: 100%;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    box-sizing: border-box;
  }

  .trial-main {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
  }

  /* Over-under layout (vertical stack) */
  .trial-content.over-under .trial-main {
    flex-direction: column;
  }

  .trial-content.over-under .stimulus-container,
  .trial-content.over-under .interaction-container {
    width: 100%;
  }

  .trial-content.over-under.image-stimulus .stimulus-container {
    flex: 3 0 0%;
    height: 0; /* Force height from flex only, not content */
    min-height: 0;
  }

  .trial-content.over-under.image-stimulus .interaction-container {
    flex: 1 0 0%;
    height: 0; /* Force height from flex only, not content */
    min-height: 0;
  }

  .trial-content.over-under.non-image-stimulus .stimulus-container,
  .trial-content.over-under.non-image-stimulus .interaction-container {
    flex: 1;
  }

  /* Split layout (left-right) */
  .trial-content.split .trial-main {
    flex-direction: row;
    gap: 1rem;
  }

  .trial-content.split .stimulus-container {
    flex: 1;
    min-width: 0;
    border-right: 2px solid var(--secondary-color);
  }

  .trial-content.split .interaction-container {
    flex: 1;
    min-width: 0;
  }

  .stimulus-container,
  .interaction-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
  }

  .interaction-container {
    overflow: hidden;
  }

  .interaction-fade {
    width: 100%;
    height: 100%;
    opacity: 0;
    transition: opacity var(--transition-smooth) ease;
  }

  .interaction-fade.interaction-fade-visible {
    opacity: 1;
  }

  /* For image stimuli, prevent scrolling - images must fit within bounds */
  .trial-content.image-stimulus .trial-main {
    overflow: hidden;
  }

  .trial-content.image-stimulus .stimulus-container {
    overflow: hidden;
  }

  /* Mobile: always stack vertically */
  @media (max-width: 768px) {
    .trial-main {
      flex-direction: column !important;
    }

    /* Non-image stimuli: equal 1:1 split */
    .trial-content.over-under.non-image-stimulus .stimulus-container,
    .trial-content.over-under.non-image-stimulus .interaction-container {
      flex: 1;
      min-height: 0;
    }

    /* Image stimuli: inherit 3:1 ratio from desktop rules (do NOT override) */
    /* Keep overflow: hidden for images */
    .trial-content.image-stimulus .stimulus-container {
      overflow: hidden;
    }

    .trial-content.split .stimulus-container {
      border-right: none;
      border-bottom: 2px solid var(--secondary-color);
    }

    .trial-content.split .stimulus-container,
    .trial-content.split .interaction-container {
      width: 100%;
    }
  }

  /* Tablet: collapse split if needed */
  @media (min-width: 769px) and (max-width: 992px) {
    .trial-content.split .trial-main {
      flex-direction: column;
    }

    .trial-content.split .stimulus-container {
      border-right: none;
      border-bottom: 2px solid var(--secondary-color);
      width: 100%;
    }

    .trial-content.split .interaction-container {
      width: 100%;
    }
  }

</style>
