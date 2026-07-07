<script>
  import { createEventDispatcher } from 'svelte';
  import { getActiveUiLocale } from '../../../../lib/interfaceLocaleState';
  import { translatePlatformString } from '../../../../lib/interfaceI18n';

  export let canContinue = true;
  export let continueButtonText = '';
  export let continuing = false;
  export let message = '';

  const dispatch = createEventDispatcher();

  function platformText(key) {
    return translatePlatformString(getActiveUiLocale(), key);
  }

  function handleContinue(event) {
    dispatch('continue', event);
  }
</script>

<div class="fixed-footer" role="contentinfo">
  <div class="fixed-footer__message">{message}</div>
  <div class="fixed-footer__controls">
    <button
      type="button"
      class="btn btn-primary fixed-footer__button"
      on:click={handleContinue}
      disabled={continuing || !canContinue}
      aria-busy={continuing}
    >
      {continueButtonText || platformText('common.continue')}
    </button>
  </div>
</div>

<style>
  .fixed-footer {
    flex-shrink: 0;
    height: 30px;
    background: var(--learning-card-surface-color);
    border-top: 1px solid var(--app-secondary-surface-color);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--app-space-3-px);
  }

  .fixed-footer__message {
    color: var(--app-secondary-text-color);
    font-size: calc(var(--app-font-size-base) * 0.75);
  }

  .fixed-footer__button {
    padding: var(--app-space-1-px) var(--app-space-4-px);
    border: 1px solid var(--app-secondary-surface-color);
    font-weight: var(--app-font-weight-semibold);
    background: var(--learning-card-primary-action-surface-color);
    color: var(--learning-card-primary-action-text-color);
  }
</style>
