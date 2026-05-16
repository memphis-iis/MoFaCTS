<script>
  /**
   * ResponseArea Component
   * Renders exactly one input mode at a time (text input, SR status, or multiple choice)
   * Based on machine state/flags
   */
  import TextInput from './TextInput.svelte';
  import MultipleChoice from './MultipleChoice.svelte';
  import SRStatus from './SRStatus.svelte';

  /** @type {'text' | 'buttons' | 'sr'} Input mode */
  export let inputMode = 'text';

  /** @type {boolean} Whether input is enabled */
  export let enabled = true;

  /** @type {string} User's current answer (for text input) */
  export let userAnswer = '';

  /** @type {string} Placeholder text for text input */
  export let inputPlaceholder = 'Type your answer...';

  /** @type {boolean} Whether to show multiple choice buttons */
  export let showButtons = true;

  /** @type {Array} Button list for multiple choice */
  export let buttonList = [];

  /** @type {number} Number of columns for button grid */
  export let buttonColumns = 2;

  /** @type {'idle' | 'ready' | 'recording' | 'processing' | 'error'} SR status */
  export let srStatus = 'idle';

  /** @type {number} SR attempt number */
  export let srAttempt = 0;

  /** @type {number} Max SR attempts */
  export let srMaxAttempts = 3;

  /** @type {string} SR error message */
  export let srError = '';

  /** @type {string} SR transcript */
  export let srTranscript = '';

  /** @type {boolean} Whether in force correcting state */
  export let isForceCorrecting = false;

  /** @type {string} Prompt for force correction */
  export let forceCorrectPrompt = 'Please type the correct answer to continue';
</script>

<div class="response-area">
  {#if isForceCorrecting}
    <div class="force-correct-container">
      <p class="force-correct-hint">{forceCorrectPrompt}</p>
      <TextInput
        bind:value={userAnswer}
        enabled={enabled}
        placeholder="Type the correct answer..."
        on:submit
        on:input
        on:activity
        on:firstKeypress
      />
    </div>
  {:else if inputMode === 'text'}
    <TextInput
      bind:value={userAnswer}
      {enabled}
      placeholder={inputPlaceholder}
      on:submit
      on:input
      on:activity
      on:firstKeypress
    />
  {:else if inputMode === 'buttons'}
    <MultipleChoice
      {buttonList}
      {enabled}
      showButtons={showButtons}
      columns={buttonColumns}
      on:choice
    />
  {:else if inputMode === 'sr'}
    <SRStatus
      status={srStatus}
      attempt={srAttempt}
      maxAttempts={srMaxAttempts}
      errorMessage={srError}
      transcript={srTranscript}
    />
  {/if}

</div>

<style>
  .response-area {
    width: 100%;
    height: 100%; /* Fill interaction container completely */
    max-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .force-correct-container {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .force-correct-hint {
    color: var(--alert-color);
    font-weight: bold;
    font-size: var(--card-font-size, 24px);
    margin: 0;
  }

</style>
