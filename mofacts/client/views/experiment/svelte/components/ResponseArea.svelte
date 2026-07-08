<script>
  /**
   * ResponseArea Component
   * Renders exactly one input mode at a time (text input, SR status, or multiple choice)
   * Based on machine state/flags
   */
  import TextInput from './TextInput.svelte';
  import MultipleChoice from './MultipleChoice.svelte';
  import SRStatus from './SRStatus.svelte';
  import { getActiveUiLocale } from '../../../../lib/interfaceLocaleState';
  import { translatePlatformString } from '../../../../lib/interfaceI18n';

  function platformText(key, values) {
    return translatePlatformString(getActiveUiLocale(), key, values);
  }

  const DEFAULT_TEXT_PLACEHOLDERS = new Set([
    'Type your answer...',
    'Type your answer here...',
  ]);

  const DEFAULT_FORCE_CORRECT_PROMPTS = new Set([
    'Please type the correct answer to continue',
  ]);

  function resolvePromptText(value, defaultKey, knownDefaults) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text || knownDefaults.has(text)) {
      return platformText(defaultKey);
    }
    return text;
  }

  /** @type {'text' | 'buttons' | 'sr'} Input mode */
  export let inputMode = 'text';

  /** @type {boolean} Whether input is enabled */
  export let enabled = true;

  /** @type {string} User's current answer (for text input) */
  export let userAnswer = '';

  /** @type {string} Placeholder text for text input */
  export let inputPlaceholder = 'Type your answer...';

  /** @type {string} Authored content language for learner text input */
  export let inputLanguage = '';

  /** @type {'ltr' | 'rtl' | ''} Authored content text direction */
  export let inputTextDirection = '';

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

  $: resolvedInputPlaceholder = resolvePromptText(
    inputPlaceholder,
    'autoTutor.typeYourAnswer',
    DEFAULT_TEXT_PLACEHOLDERS,
  );
  $: resolvedForceCorrectPrompt = resolvePromptText(
    forceCorrectPrompt,
    'response.typeCorrectAnswer',
    DEFAULT_FORCE_CORRECT_PROMPTS,
  );
</script>

<div class="response-area">
  {#if isForceCorrecting}
    <div class="force-correct-container">
      <p class="force-correct-hint">{resolvedForceCorrectPrompt}</p>
      <TextInput
        bind:value={userAnswer}
        enabled={enabled}
        placeholder={platformText('response.typeCorrectAnswer')}
        {inputLanguage}
        {inputTextDirection}
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
      placeholder={resolvedInputPlaceholder}
      {inputLanguage}
      {inputTextDirection}
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
      saySkipOrAnswerMessage={platformText('speech.saySkipOrAnswer')}
      pleaseWaitMessage={platformText('speech.pleaseWait')}
      fallbackErrorMessage={platformText('speech.error')}
      formatAttemptMessage={(attempt, maxAttempts) => platformText('speech.attemptOfMax', { attempt, max: maxAttempts })}
      formatTranscriptMessage={(transcript) => platformText('speech.lastTranscript', { transcript })}
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
    gap: var(--app-space-2);
  }

  .force-correct-hint {
    color: var(--feedback-error-color);
    font-weight: var(--app-font-weight-bold);
    font-size: var(--card-font-size);
    margin: 0;
  }

</style>
