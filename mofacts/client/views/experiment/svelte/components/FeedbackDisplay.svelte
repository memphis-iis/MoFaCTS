<script>
  /**
   * FeedbackDisplay Component
   * Displays feedback messages as a single centered HTML block
   */
  import DOMPurify from 'dompurify';
  import { createEventDispatcher, tick } from 'svelte';
  import { buildFeedbackContent, shouldShow } from '../utils/feedbackTextBuilder';
  import { clientConsole } from '../../../../lib/clientLogger';
  import { waitForBrowserPaint } from '../utils/paintTiming';

  const dispatch = createEventDispatcher();

  /** @type {boolean} Whether feedback is visible */
  export let visible = false;

  /** @type {boolean} Whether answer was correct */
  export let isCorrect = false;

  /** @type {boolean} Whether answer timed out */
  export let isTimeout = false;

  /** @type {string} User's answer */
  export let userAnswer = '';

  /** @type {string} Correct answer */
  export let correctAnswer = '';

  /** @type {string} Correct answer image URL (button trials) */
  export let correctAnswerImageSrc = '';

  /** @type {string} Correct outcome label */
  export let correctLabelText = 'Correct.';

  /** @type {string} Incorrect outcome label */
  export let incorrectLabelText = 'Incorrect.';

  /** @type {string} Feedback message from answer evaluation */
  export let feedbackMessage = '';

  /** @type {string} Correct color (theme var) */
  export let correctColor = 'var(--success-color)';

  /** @type {string} Incorrect color (theme var) */
  export let incorrectColor = 'var(--alert-color)';

  /** @type {boolean} Whether to display correct feedback */
  export let displayCorrectFeedback = true;

  /** @type {boolean} Whether to display incorrect feedback */
  export let displayIncorrectFeedback = true;

  /** @type {'onCorrect' | 'onIncorrect' | boolean} Display user answer rules */
  export let displayUserAnswerInFeedback = 'onIncorrect';

  /** @type {'inline' | 'stacked'} Feedback segment layout */
  export let feedbackLayout = 'stacked';

  /** @type {boolean} Show the correct answer on incorrect feedback */
  export let displayCorrectAnswerInIncorrectFeedback = true;

  $: shouldDisplay = visible && (
    (isCorrect && displayCorrectFeedback) ||
    (!isCorrect && displayIncorrectFeedback)
  );

  $: feedbackColor = isCorrect ? correctColor : incorrectColor;
  $: feedbackMessageText = feedbackMessage || '';

  const ALLOWED_TAGS = ['b', 'br', 'span', 'img'];
  const ALLOWED_ATTR = ['class', 'src', 'alt'];
  const loadedImageCache = new Set();
  let imageReady = true;
  let imageLoadToken = 0;
  let pendingImageSrc = '';
  let lastBlockingAssetState = '';
  let blockingAssetSequence = 0;

  $: showUserAnswer = shouldShow(displayUserAnswerInFeedback, isCorrect);

  $: {
    clientConsole(2, '[FeedbackDisplay] userAnswer:', userAnswer, 'showUserAnswer:', showUserAnswer, 'displayUserAnswerInFeedback:', displayUserAnswerInFeedback, 'isCorrect:', isCorrect);
  }

  $: sanitizedUserAnswer = DOMPurify.sanitize(userAnswer, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  $: sanitizedCorrectAnswer = DOMPurify.sanitize(correctAnswer, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  $: sanitizedCorrectAnswerImage = DOMPurify.sanitize(correctAnswerImageSrc, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });

  $: feedbackContent = buildFeedbackContent({
    message: feedbackMessageText,
    isCorrectAnswer: isCorrect,
    isTimeoutAnswer: isTimeout,
    showUserAnswer,
    userAnswerText: sanitizedUserAnswer,
    correctAnswerText: sanitizedCorrectAnswer,
    displayCorrectAnswer: displayCorrectAnswerInIncorrectFeedback,
    correctAnswerImage: sanitizedCorrectAnswerImage,
    feedbackLayout,
    correctLabelText,
    incorrectLabelText,
  });

  $: feedbackHtml = feedbackContent.feedbackHtml;

  $: sanitizedFeedbackHtml = DOMPurify.sanitize(feedbackHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });

  $: feedbackText = feedbackContent.feedbackText.replace(/\s+/g, ' ').trim();
  $: {
    if (shouldDisplay && feedbackText) {
      dispatch('feedbackcontent', feedbackContent);
    } else if (visible && !shouldDisplay) {
      dispatch('feedbackcontent', {
        feedbackText: '',
        feedbackHtml: '',
        suppressed: true,
      });
    }
  }

  async function preloadFeedbackImage(src, token) {
    if (!src || loadedImageCache.has(src)) {
      if (token === imageLoadToken) {
        imageReady = true;
      }
      return;
    }

    imageReady = false;

    await new Promise((resolve) => {
      const img = new Image();
      img.onload = async () => {
        try {
          if (typeof img.decode === 'function') {
            await img.decode();
          }
        } catch {
          // Decode failures are non-fatal if onload has already fired.
        }
        resolve();
      };
      img.onerror = () => resolve();
      img.src = src;
    });

    if (token === imageLoadToken) {
      loadedImageCache.add(src);
      imageReady = true;
    }
  }

  $: feedbackImageSrc = shouldDisplay && !isCorrect ? String(correctAnswerImageSrc || '').trim() : '';

  $: {
    const src = feedbackImageSrc;
    if (src !== pendingImageSrc) {
      pendingImageSrc = src;
      imageLoadToken += 1;
      const token = imageLoadToken;

      if (!src) {
        imageReady = true;
      } else if (loadedImageCache.has(src)) {
        imageReady = true;
      } else {
        void preloadFeedbackImage(src, token);
      }
    }
  }

  $: {
    const blocking = Boolean(feedbackImageSrc);
    const ready = !blocking || imageReady;
    const signature = `${blocking}:${ready}:${feedbackImageSrc}`;

    if (signature !== lastBlockingAssetState) {
      lastBlockingAssetState = signature;
      blockingAssetSequence += 1;
      const sequence = blockingAssetSequence;
      const detail = {
        owner: 'feedback',
        blocking,
        ready,
        src: feedbackImageSrc,
      };

      if (blocking && ready) {
        void emitBlockingAssetStateAfterPaint(detail, signature, sequence);
      } else {
        dispatch('blockingassetstate', detail);
      }
    }
  }

  async function emitBlockingAssetStateAfterPaint(detail, signature, sequence) {
    await tick();
    await waitForBrowserPaint();

    if (sequence !== blockingAssetSequence || signature !== lastBlockingAssetState) {
      return;
    }

    dispatch('blockingassetstate', detail);
  }
</script>

{#if shouldDisplay}
  <div class="feedback-wrapper">
    <div
      class="feedback-display"
      class:correct={isCorrect}
      class:incorrect={!isCorrect}
      class:timeout={isTimeout}
      style="--feedback-color: {feedbackColor}"
    >
      {@html sanitizedFeedbackHtml}
    </div>
  </div>
{/if}

<style>
  .feedback-wrapper {
    width: 100%;
    height: 100%; /* Fill interaction container completely */
    display: flex;
    align-items: center;
    justify-content: center;
    max-height: 100%;
    min-height: 0;
    overflow: auto;
    box-sizing: border-box;
  }

  .feedback-display {
    text-align: center;
    font-size: var(--card-font-size, inherit);
    line-height: 1.4;
    width: 100%;
    max-width: 600px;
    box-sizing: border-box;
  }

  .feedback-display.correct,
  .feedback-display.incorrect,
  .feedback-display.timeout {
    color: var(--feedback-color);
  }

  :global(.feedback-label) {
    font-weight: 600;
  }

  :global(.feedback-image) {
    display: block;
    max-width: 300px;
    max-height: 240px;
    margin: 0.75rem auto 0;
    border-radius: var(--border-radius-sm);
    border: 2px solid var(--secondary-color);
    object-fit: contain;
  }

  /* Mobile responsiveness */
  @media (max-width: 768px) {
    .feedback-display {
      padding: 1rem;
    }
  }
</style>
