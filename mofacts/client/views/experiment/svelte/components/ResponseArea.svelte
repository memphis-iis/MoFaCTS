<script>
  /**
   * ResponseArea Component
   * Renders exactly one input mode at a time (text input, SR status, or multiple choice)
   * Based on machine state/flags
   */
  import { createEventDispatcher } from 'svelte';
  import TextInput from './TextInput.svelte';
  import MultipleChoice from './MultipleChoice.svelte';
  import SRStatus from './SRStatus.svelte';

  const dispatch = createEventDispatcher();

  /** @type {'text' | 'buttons' | 'sr'} Input mode */
  export let inputMode = 'text';

  /** @type {boolean} Whether input is enabled */
  export let enabled = true;

  /** @type {string} User's current answer (for text input) */
  export let userAnswer = '';

  /** @type {boolean} Whether to show submit button */
  export let showSubmitButton = true;

  /** @type {string} Placeholder text for text input */
  export let inputPlaceholder = 'Type your answer...';

  /** @type {boolean} Whether to show multiple choice buttons */
  export let showButtons = true;

  /** @type {Array} Button list for multiple choice */
  export let buttonList = [];

  /** @type {number} Number of columns for button grid */
  export let buttonColumns = 2;

  /** @type {boolean} Whether confirm button mode is enabled */
  export let displayConfirmButton = false;

  /** @type {boolean} Whether confirm button should be enabled */
  export let confirmEnabled = false;

  /** @type {number|null} Selected choice index */
  export let selectedChoiceIndex = null;

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
        showSubmitButton={true}
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
      showSubmitButton={showSubmitButton}
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
      confirmMode={displayConfirmButton}
      selectedIndex={selectedChoiceIndex}
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

  {#if displayConfirmButton && (inputMode === 'text' || inputMode === 'buttons' || isForceCorrecting)}
    <button
      class="confirm-button"
      class:disabled={!enabled || !confirmEnabled}
      disabled={!enabled || !confirmEnabled}
      on:click={() => dispatch('confirm', { timestamp: Date.now() })}
    >
      Confirm
    </button>
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

  .confirm-button {
    margin-top: 0.75rem;
    padding: 0.5rem 1.25rem;
    font-size: var(--card-font-size, 24px);
    font-weight: 600;
    color: var(--main-button-text-color);
    background-color: var(--main-button-color);
    border: 2px solid color-mix(
      in srgb,
      var(--main-button-color) calc(100% - (var(--button-border-darkness) * 1%)),
      black calc(var(--button-border-darkness) * 1%)
    );
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .confirm-button:hover:not(.disabled) {
    background-color: color-mix(
      in srgb,
      var(--main-button-color) calc(100% - (var(--button-hover-darkness) * 1%)),
      black calc(var(--button-hover-darkness) * 1%)
    );
  }

  .confirm-button.disabled {
    background-color: var(--secondary-color);
    color: var(--secondary-text-color);
    cursor: not-allowed;
  }
</style>
