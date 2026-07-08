<script>
  import { createEventDispatcher, onDestroy } from 'svelte';
  import LearningProgressChart from './LearningProgressChart.svelte';
  import { getActiveUiLocale } from '../../../../lib/interfaceLocaleState';
  import { translatePlatformString } from '../../../../lib/interfaceI18n';

  export let snapshot = null;
  export let open = false;

  const dispatch = createEventDispatcher();

  function platformText(key, values) {
    return translatePlatformString(getActiveUiLocale(), key, values);
  }

  function setOpen(nextOpen) {
    dispatch('toggle', { open: nextOpen });
  }

  function handleToggle() {
    setOpen(!open);
  }

  function handleKeydown(event) {
    if (event.key === 'Escape' && open) {
      setOpen(false);
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeydown);
  }

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeydown);
    }
  });
</script>

<aside
  class="learning-progress-shell"
  class:learning-progress-shell-open={open}
  aria-label={platformText('learningProgress.label')}
>
  <button
    type="button"
    class="learning-progress-toggle"
    class:learning-progress-toggle-open={open}
    aria-controls="learning-progress-panel"
    aria-expanded={open}
    on:click={handleToggle}
  >
    <span class="learning-progress-toggle-icon" aria-hidden="true"></span>
    <span class="learning-progress-toggle-text">{platformText('learningProgress.progress')}</span>
  </button>

  {#if open}
    <section id="learning-progress-panel" class="learning-progress-panel">
      <header class="learning-progress-header">
        <h2>{platformText('learningProgress.progress')}</h2>
        <button
          type="button"
          class="learning-progress-close"
          aria-label={platformText('learningProgress.closePanel')}
          on:click={() => setOpen(false)}
        >
          <span aria-hidden="true">x</span>
        </button>
      </header>

      <LearningProgressChart {snapshot} showReferenceLines={true} />
    </section>
  {/if}
</aside>

<style>
  .learning-progress-shell {
    --progress-tab-width: calc(23px * var(--app-density-scale));
    --progress-panel-width: var(--learning-progress-panel-width, 136px);
    --progress-tab-anchor-y: 66.6667%;
    --progress-border-color: color-mix(in srgb, var(--app-secondary-surface-color) 70%, var(--app-text-color));
    --progress-muted-bar: color-mix(in srgb, var(--app-secondary-surface-color) 82%, var(--app-background-color));
    --progress-target-color: var(--feedback-correct-color);
    --progress-below-color: var(--app-accent-color);
    --progress-bar-density-scale: max(0.5, min(var(--app-density-scale), 2));
    --progress-bar-height: calc(3px * var(--progress-bar-density-scale));
    --progress-bar-gap: calc(2px * var(--progress-bar-density-scale));
    --progress-scrollbar-gutter: calc(10px * var(--app-density-scale));
    --progress-panel-padding-x: calc(0.45rem * var(--app-density-scale));
    --progress-panel-padding-y: calc(0.35rem * var(--app-density-scale));
    --progress-panel-gap: calc(0.25rem * var(--app-density-scale));

    position: relative;
    flex: 0 0 0;
    width: 0;
    min-width: 0;
    max-width: 0;
    height: 100%;
    display: block;
    background: transparent;
    color: var(--app-text-color);
    pointer-events: none;
    transition: flex-basis var(--app-transition-smooth) ease,
      width var(--app-transition-smooth) ease,
      max-width var(--app-transition-smooth) ease;
    z-index: 30;
  }

  .learning-progress-shell-open {
    flex-basis: var(--progress-panel-width);
    width: var(--progress-panel-width);
    max-width: var(--progress-panel-width);
    pointer-events: auto;
  }

  .learning-progress-toggle {
    position: absolute;
    top: var(--progress-tab-anchor-y);
    left: calc(-1 * var(--progress-tab-width) + 1px);
    transform: translateY(-50%);
    width: var(--progress-tab-width);
    min-width: var(--progress-tab-width);
    height: calc(104px * var(--app-density-scale));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: calc(0.32rem * var(--app-density-scale));
    border: 1px solid var(--app-secondary-surface-color);
    border-right: 0;
    border-radius: var(--app-border-radius-lg) 0 0 var(--app-border-radius-lg);
    background: var(--navigation-surface-color);
    color: var(--navigation-text-color);
    cursor: pointer;
    pointer-events: auto;
    writing-mode: vertical-rl;
    text-orientation: mixed;
    font-size: calc(var(--app-font-size-base) * 0.68);
    font-weight: var(--app-font-weight-bold);
    letter-spacing: var(--app-label-letter-spacing);
    text-transform: var(--app-label-text-transform);
    box-shadow: var(--app-shadow-soft);
  }

  .learning-progress-shell-open .learning-progress-toggle {
    left: calc(-1 * var(--progress-tab-width) + 1px);
  }

  .learning-progress-toggle:hover,
  .learning-progress-toggle:focus-visible {
    background: var(--navigation-surface-color);
    color: var(--navigation-text-color);
    outline: none;
  }

  .learning-progress-toggle:focus-visible {
    box-shadow: 0 0 0 2px var(--app-background-color), 0 0 0 4px var(--app-accent-color);
  }

  .learning-progress-toggle-icon {
    width: 0;
    height: 0;
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
    border-right: 5px solid currentColor;
    transform: rotate(0deg);
    transition: transform var(--app-transition-fast) ease;
  }

  .learning-progress-toggle-open .learning-progress-toggle-icon {
    transform: rotate(180deg);
  }

  .learning-progress-panel {
    width: var(--progress-panel-width);
    min-width: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--progress-border-color);
    border-right: 0;
    border-radius: 0;
    background: var(--learning-card-surface-color);
    box-shadow: var(--app-shadow-panel-edge);
    overflow: hidden;
  }

  .learning-progress-header {
    min-height: calc(34px * var(--app-density-scale));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--progress-panel-gap);
    padding: var(--progress-panel-padding-y) var(--progress-panel-padding-x);
    border-bottom: 1px solid var(--app-secondary-surface-color);
  }

  .learning-progress-header h2 {
    margin: var(--app-space-0);
    font-size: calc(var(--app-font-size-base) * 0.95);
    line-height: 1.1;
    font-weight: 700;
    color: var(--app-text-color);
  }

  .learning-progress-close {
    width: calc(26px * var(--app-density-scale));
    height: calc(26px * var(--app-density-scale));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: var(--app-border-radius-sm);
    background: transparent;
    color: var(--app-secondary-text-color);
    cursor: pointer;
    font-size: var(--app-font-size-base);
    line-height: 1;
  }

  .learning-progress-close:hover,
  .learning-progress-close:focus-visible {
    border-color: var(--app-secondary-surface-color);
    color: var(--app-text-color);
    outline: none;
  }

  @media (max-width: 768px) {
    .learning-progress-shell-open {
      flex-basis: var(--progress-panel-width);
      width: var(--progress-panel-width);
      max-width: var(--progress-panel-width);
    }
  }
</style>
