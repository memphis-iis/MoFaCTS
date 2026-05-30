<script>
  /**
   * TextInput Component
   * Text entry field that submits on Enter.
   */
  import { onMount, createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  /** @type {string} User's current answer */
  export let value = '';

  /** @type {boolean} Whether input is enabled */
  export let enabled = true;

  /** @type {string} Placeholder text */
  export let placeholder = 'Type your answer...';

  /** @type {boolean} Auto-focus on mount */
  export let autoFocus = true;

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
    if (event.key === 'Enter' && enabled) {
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

    const answer = typeof value === 'string' ? value.trim() : '';
    dispatch('submit', {
      answer,
      timestamp: Date.now()
    });
  }

  function handleInput() {
    dispatch('input', { value });
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
    gap: 0.5rem;
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
