<script>
  /**
   * TextInput Component
   * Text entry field that submits on Enter.
   */
  import { onMount, createEventDispatcher } from 'svelte';
  import { shouldSubmitTextInputOnKeydown } from '../services/textInputComposition';

  const dispatch = createEventDispatcher();

  /** @type {string} User's current answer */
  export let value = '';

  /** @type {boolean} Whether input is enabled */
  export let enabled = true;

  /** @type {string} Placeholder text */
  export let placeholder = 'Type your answer...';

  /** @type {boolean} Auto-focus on mount */
  export let autoFocus = true;

  /** @type {string} Authored content language for text input, if declared */
  export let inputLanguage = '';

  /** @type {'ltr' | 'rtl' | ''} Authored content text direction */
  export let inputTextDirection = '';

  let inputElement;

  onMount(() => {
    if (autoFocus && enabled && inputElement) {
      inputElement.focus();
    }
  });

  // Re-focus when enabled changes to true
  $: if (enabled && inputElement) {
    setTimeout(() => inputElement.focus(), 0);
  }

  function handleKeydown(event) {
    if (shouldSubmitTextInputOnKeydown(event) && enabled) {
      handleSubmit();
    } else if (enabled) {
      dispatch('activity', { timestamp: Date.now() });
    }

    // Track first keypress
    if (!event.repeat) {
      dispatch('firstKeypress', { timestamp: Date.now() });
    }
  }

  function handleSubmit() {
    if (!enabled) return;

    const rawAnswer = inputElement && typeof inputElement.value === 'string'
      ? inputElement.value
      : value;
    const answer = typeof rawAnswer === 'string' ? rawAnswer.trim() : '';
    dispatch('submit', {
      answer,
      timestamp: Date.now()
    });
  }

  function handleInput() {
    const rawValue = inputElement && typeof inputElement.value === 'string'
      ? inputElement.value
      : value;
    dispatch('input', { value: rawValue });
    if (enabled) {
      dispatch('activity', { timestamp: Date.now() });
    }
  }
</script>

<div class="text-input-container">
  <input
    bind:this={inputElement}
    bind:value
    type="text"
    class="text-input"
    class:disabled={!enabled}
    {placeholder}
    lang={inputLanguage || undefined}
    dir={inputTextDirection || undefined}
    disabled={!enabled}
    on:keydown={handleKeydown}
    on:input={handleInput}
    autocomplete="off"
    spellcheck="false"
  />
</div>

<style>
  .text-input-container {
    display: flex;
    gap: var(--app-space-2);
    width: min(100%, 80vw);
    max-width: 48rem;
    align-items: center;
  }

  .text-input {
    flex: 1;
    min-width: 0;
    padding: var(--app-space-2) calc(0.75rem * var(--app-density-scale));
    font-size: var(--card-font-size);
    border: 2px solid var(--app-secondary-surface-color);
    border-radius: var(--app-border-radius-sm);
    transition: border-color var(--app-transition-fast) ease;
    background-color: var(--learning-card-surface-color);
    color: var(--app-text-color);
  }

  .text-input:focus {
    outline: none;
    border-color: var(--app-accent-color);
  }

  .text-input.disabled {
    background-color: var(--app-secondary-surface-color);
    cursor: not-allowed;
  }

  /* Mobile responsiveness */
  @media (max-width: 768px) {
    .text-input-container {
      width: 100%;
      max-width: 100%;
    }
  }
</style>
