<script>
  /**
   * TestCardWrapper - Minimal wrapper for testing PerformanceArea + TrialContent
   * Replicates CardScreen structure without XState machine
   */
  import PerformanceArea from './PerformanceArea.svelte';
  import TrialContent from './TrialContent.svelte';
  import VideoSessionMode from './VideoSessionMode.svelte';

  // Performance props
  export let showTimeoutBar = true;
  export let totalTimeDisplay = '0.0';
  export let percentCorrect = 'N/A';
  export let cardsSeen = 0;
  export let totalCards = 0;
  export let currentTrial = 1;
  export let timeoutMode = 'none';
  export let timeoutProgress = 0;
  export let remainingTime = 0;

  // TrialContent props (pass-through)
  export let layoutMode = 'top';
  export let displayVisible = true;
  export let isForceCorrecting = false;
  export let display = {};
  export let showQuestionNumber = false;
  export let questionNumber = 0;
  export let inputMode = 'text';
  export let inputEnabled = true;
  export let userAnswer = '';
  export let feedbackUserAnswer = '';
  export let showSubmitButton = true;
  export let inputPlaceholder = 'Type your answer...';
  export let showButtons = true;
  export let buttonList = [];
  export let buttonColumns = 2;
  export let displayConfirmButton = false;
  export let confirmEnabled = false;
  export let selectedChoiceIndex = null;
  export let srStatus = 'idle';
  export let srAttempt = 0;
  export let srMaxAttempts = 3;
  export let srError = '';
  export let srTranscript = '';
  export let feedbackVisible = false;
  export let isCorrect = false;
  export let isTimeout = false;
  export let correctAnswer = '';
  export let correctAnswerImageSrc = '';
  export let correctMessage = 'Correct!';
  export let incorrectMessage = 'Incorrect';
  export let feedbackMessage = '';
  export let forceCorrectPrompt = 'Please type the correct answer to continue';
  export let correctColor = 'var(--success-color)';
  export let incorrectColor = 'var(--alert-color)';
  export let displayCorrectFeedback = true;
  export let displayIncorrectFeedback = true;
  export let displayUserAnswerInFeedback = 'onIncorrect';
  export let displayUserAnswerInCorrectFeedback = false;
  export let displayUserAnswerInIncorrectFeedback = false;
  export let singleLineFeedback = false;
  export let onlyShowSimpleFeedback = false;
  export let isVideoSession = false;
  export let videoUrl = '';
  export let cardFontSizeStyle = '';
</script>

<div class="card-screen" class:video-mode={isVideoSession} style={cardFontSizeStyle}>
  {#if isVideoSession}
    <VideoSessionMode
      videoUrl={videoUrl}
      showOverlay={displayVisible || feedbackVisible}
    >
      <PerformanceArea
        {showTimeoutBar}
        {totalTimeDisplay}
        {percentCorrect}
        {cardsSeen}
        {totalCards}
        {currentTrial}
        {timeoutMode}
        {timeoutProgress}
        {remainingTime}
      />

      <TrialContent
        {layoutMode}
        {displayVisible}
        {isForceCorrecting}
        {display}
        {showQuestionNumber}
        {questionNumber}
        {inputMode}
        {inputEnabled}
        {userAnswer}
        {feedbackUserAnswer}
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
        {feedbackVisible}
        {isCorrect}
        {isTimeout}
        {correctAnswer}
        {correctAnswerImageSrc}
        {correctMessage}
        {incorrectMessage}
        {feedbackMessage}
        {forceCorrectPrompt}
        {correctColor}
        {incorrectColor}
        {displayCorrectFeedback}
        {displayIncorrectFeedback}
        {displayUserAnswerInFeedback}
        {displayUserAnswerInCorrectFeedback}
        {displayUserAnswerInIncorrectFeedback}
        {singleLineFeedback}
        {onlyShowSimpleFeedback}
      />
    </VideoSessionMode>
  {:else}
    <PerformanceArea
      {showTimeoutBar}
      {totalTimeDisplay}
      {percentCorrect}
      {cardsSeen}
      {totalCards}
      {currentTrial}
      {timeoutMode}
      {timeoutProgress}
      {remainingTime}
    />

    <TrialContent
      {layoutMode}
      {displayVisible}
      {isForceCorrecting}
      {display}
      {showQuestionNumber}
      {questionNumber}
      {inputMode}
      {inputEnabled}
      {userAnswer}
      {feedbackUserAnswer}
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
      {feedbackVisible}
      {isCorrect}
      {isTimeout}
      {correctAnswer}
      {correctAnswerImageSrc}
      {correctMessage}
      {incorrectMessage}
      {feedbackMessage}
      {forceCorrectPrompt}
      {correctColor}
      {incorrectColor}
      {displayCorrectFeedback}
      {displayIncorrectFeedback}
      {displayUserAnswerInFeedback}
      {displayUserAnswerInCorrectFeedback}
      {displayUserAnswerInIncorrectFeedback}
      {singleLineFeedback}
      {onlyShowSimpleFeedback}
    />
  {/if}
</div>

<style>
  .card-screen {
    /* Match CardScreen.svelte layout */
    --card-spacing-xs: 0.25rem;
    --card-spacing-sm: 0.5rem;
    --card-spacing-md: 0.75rem;
    --card-spacing-lg: 1rem;

    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 500px;
    overflow: hidden;
    background-color: var(--background-color, #fff);
    font-family: var(--font-family, sans-serif);
    font-size: var(--font-size-base, 16px);
  }

  .card-screen.video-mode {
    background-color: var(--text-color);
  }
</style>
