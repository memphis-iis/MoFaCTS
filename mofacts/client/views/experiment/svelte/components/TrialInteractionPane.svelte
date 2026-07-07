<script>
  import ResponseArea from './ResponseArea.svelte';
  import FeedbackDisplay from './FeedbackDisplay.svelte';

  export let fadeElement = null;
  export let interactionVisible = false;
  export let mountedFeedbackVisible = false;
  export let mountedResponseVisible = false;

  export let inputMode = 'text';
  export let inputEnabled = true;
  export let isForceCorrecting = false;
  export let forceCorrectPrompt = 'Please type the correct answer to continue';
  export let userAnswer = '';
  export let inputPlaceholder = 'Type your answer...';
  export let inputLanguage = '';
  export let inputTextDirection = '';
  export let showButtons = true;
  export let buttonList = [];
  export let buttonColumns = 2;
  export let srStatus = 'idle';
  export let srAttempt = 0;
  export let srMaxAttempts = 3;
  export let srError = '';
  export let srTranscript = '';

  export let isCorrect = false;
  export let isTimeout = false;
  export let feedbackUserAnswer = '';
  export let correctAnswer = '';
  export let correctAnswerImageSrc = '';
  export let correctLabelText = 'Correct.';
  export let incorrectLabelText = 'Incorrect.';
  export let feedbackMessage = '';
  export let correctColor = 'var(--feedback-correct-color)';
  export let incorrectColor = 'var(--feedback-error-color)';
  export let displayCorrectFeedback = true;
  export let displayIncorrectFeedback = true;
  export let displayUserAnswerInFeedback = 'onIncorrect';
  export let feedbackLayout = 'stacked';
  export let displayCorrectAnswerInIncorrectFeedback = true;
</script>

<div
  class="interaction-fade"
  bind:this={fadeElement}
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
      {correctLabelText}
      {incorrectLabelText}
      {feedbackMessage}
      {correctColor}
      {incorrectColor}
      {displayCorrectFeedback}
      {displayIncorrectFeedback}
      {displayUserAnswerInFeedback}
      {feedbackLayout}
      {displayCorrectAnswerInIncorrectFeedback}
      on:feedbackcontent
      on:blockingassetstate
    />
  {:else if mountedResponseVisible}
    <ResponseArea
      {inputMode}
      enabled={inputEnabled}
      {isForceCorrecting}
      {forceCorrectPrompt}
      {userAnswer}
      {inputPlaceholder}
      {inputLanguage}
      {inputTextDirection}
      {showButtons}
      {buttonList}
      {buttonColumns}
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
    />
  {/if}
</div>

<style>
  .interaction-fade {
    width: 100%;
    height: 100%;
    opacity: 0;
    transition: opacity var(--app-transition-smooth) ease;
  }

  .interaction-fade.interaction-fade-visible {
    opacity: 1;
  }
</style>
