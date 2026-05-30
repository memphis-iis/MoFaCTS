<script>
  import { createEventDispatcher, onDestroy } from 'svelte';

  export let snapshot = null;
  export let open = false;

  const dispatch = createEventDispatcher();

  $: available = snapshot?.available === true;
  $: rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  $: stats = snapshot?.stats || {
    totalItems: 0,
    atOrAboveThreshold: 0,
    belowThreshold: 0,
    introducedItems: 0,
    unintroducedItems: 0,
  };
  $: thresholdPercent = Number.isFinite(Number(snapshot?.thresholdPercent))
    ? Number(snapshot.thresholdPercent)
    : 0;
  $: meanPercent = Number.isFinite(Number(snapshot?.meanPercent))
    ? Number(snapshot.meanPercent)
    : 0;
  $: graphicLabel = available
    ? `${stats.totalItems} learning items. ${stats.atOrAboveThreshold} at or above target. ${stats.belowThreshold} below target.`
    : (snapshot?.reason || 'Progress is not ready yet.');

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
  aria-label="Learning progress"
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
    <span class="learning-progress-toggle-text">Progress</span>
  </button>

  {#if open}
    <section id="learning-progress-panel" class="learning-progress-panel">
      <header class="learning-progress-header">
        <h2>Progress</h2>
        <button
          type="button"
          class="learning-progress-close"
          aria-label="Close progress panel"
          on:click={() => setOpen(false)}
        >
          <span aria-hidden="true">x</span>
        </button>
      </header>

      {#if available}
        <div class="learning-progress-stats" aria-label="Learning progress summary">
          <div>
            <span class="learning-progress-stat-label">At target</span>
            <strong>{stats.atOrAboveThreshold}</strong>
          </div>
          <div>
            <span class="learning-progress-stat-label">Below</span>
            <strong>{stats.belowThreshold}</strong>
          </div>
          <div>
            <span class="learning-progress-stat-label">Mean</span>
            <strong>{meanPercent.toFixed(0)}%</strong>
          </div>
        </div>

        <div class="learning-progress-chart" role="img" aria-label={graphicLabel}>
          <div class="learning-progress-lines" aria-hidden="true">
            <span
              class="learning-progress-line learning-progress-line-target"
              style="--line-left: {thresholdPercent}%"
            >
              <span>Target {thresholdPercent.toFixed(0)}%</span>
            </span>
            <span
              class="learning-progress-line learning-progress-line-mean"
              style="--line-left: {meanPercent}%"
            >
              <span>Mean {meanPercent.toFixed(0)}%</span>
            </span>
          </div>

          <div class="learning-progress-bars" aria-hidden="true">
            {#each rows as row (row.id)}
              <span
                class="learning-progress-row"
                class:learning-progress-row-target={row.band === 'at-or-above-threshold'}
                class:learning-progress-row-unintroduced={!row.introduced}
              >
                <span
                  class="learning-progress-bar"
                  style="--bar-width: {Math.max(row.percent, 0.5)}%"
                ></span>
              </span>
            {/each}
          </div>
        </div>

        <div class="learning-progress-axis" aria-hidden="true">
          <span>0%</span>
          <span>100%</span>
        </div>
      {:else}
        <div class="learning-progress-empty" role="status">
          {snapshot?.reason || 'Progress is not ready yet.'}
        </div>
      {/if}
    </section>
  {/if}
</aside>

<style>
  .learning-progress-shell {
    --progress-tab-width: calc(23px * var(--app-density-scale));
    --progress-panel-width: var(--learning-progress-panel-width, 224px);
    --progress-tab-anchor-y: 66.6667%;
    --progress-border-color: color-mix(in srgb, var(--app-secondary-surface-color) 70%, var(--app-text-color));
    --progress-muted-bar: color-mix(in srgb, var(--app-secondary-surface-color) 82%, var(--app-background-color));
    --progress-target-color: var(--feedback-correct-color);
    --progress-below-color: var(--app-accent-color);

    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    flex: 0 0 0;
    width: 0;
    min-width: 0;
    max-width: 0;
    height: 100vh;
    display: block;
    background: transparent;
    color: var(--app-text-color);
    pointer-events: none;
    transition: flex-basis var(--app-transition-smooth) ease,
      width var(--app-transition-smooth) ease,
      max-width var(--app-transition-smooth) ease;
    z-index: 9500;
  }

  .learning-progress-shell-open {
    flex-basis: min(var(--progress-panel-width), 40vw);
    width: min(var(--progress-panel-width), 40vw);
    min-width: min(var(--progress-panel-width), 40vw);
    max-width: min(var(--progress-panel-width), 40vw);
    pointer-events: auto;
  }

  .learning-progress-toggle {
    position: absolute;
    top: var(--progress-tab-anchor-y);
    right: 0;
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
    right: auto;
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
    width: 100%;
    min-width: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--progress-border-color);
    background: var(--learning-card-surface-color);
    box-shadow: var(--app-shadow-panel-edge);
    overflow: hidden;
  }

  .learning-progress-header {
    min-height: calc(42px * var(--app-density-scale));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--app-space-3);
    padding: var(--app-space-2) calc(0.65rem * var(--app-density-scale)) calc(0.45rem * var(--app-density-scale)) var(--app-space-3);
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

  .learning-progress-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: calc(0.4rem * var(--app-density-scale));
    padding: var(--app-space-2) calc(0.7rem * var(--app-density-scale));
    border-bottom: 1px solid var(--app-secondary-surface-color);
  }

  .learning-progress-stats div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: calc(0.1rem * var(--app-density-scale));
    padding: calc(0.35rem * var(--app-density-scale)) calc(0.4rem * var(--app-density-scale));
    border: 1px solid var(--app-secondary-surface-color);
    border-radius: var(--app-border-radius-sm);
    background: var(--navigation-surface-color);
  }

  .learning-progress-stat-label {
    color: var(--app-secondary-text-color);
    font-size: calc(var(--app-font-size-base) * 0.62);
    font-weight: 700;
    line-height: 1;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .learning-progress-stats strong {
    color: var(--app-text-color);
    font-size: calc(var(--app-font-size-base) * 0.82);
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  .learning-progress-chart {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    margin: calc(0.55rem * var(--app-density-scale)) calc(0.7rem * var(--app-density-scale)) var(--app-space-0);
    overflow: hidden;
  }

  .learning-progress-lines {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
  }

  .learning-progress-line {
    position: absolute;
    top: 0;
    bottom: 0;
    left: clamp(0%, var(--line-left), 100%);
    width: 1px;
    transform: translateX(-0.5px);
  }

  .learning-progress-line-target {
    background: var(--progress-target-color);
  }

  .learning-progress-line-mean {
    border-left: 1px dashed var(--app-text-color);
    opacity: 0.8;
  }

  .learning-progress-line span {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    writing-mode: vertical-lr;
    padding: var(--app-space-1) calc(0.18rem * var(--app-density-scale));
    border: 1px solid currentColor;
    border-radius: var(--app-border-radius-sm);
    background: var(--learning-card-surface-color);
    color: var(--app-text-color);
    font-size: calc(var(--app-font-size-base) * 0.62);
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
  }

  .learning-progress-line-target span {
    color: var(--progress-target-color);
  }

  .learning-progress-bars {
    position: absolute;
    inset: 0;
    z-index: 1;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--app-secondary-surface-color) transparent;
  }

  .learning-progress-row {
    display: block;
    width: 100%;
    height: calc(3px * var(--app-density-scale));
    margin-bottom: calc(2px * var(--app-density-scale));
  }

  .learning-progress-bar {
    display: block;
    width: var(--bar-width);
    min-width: calc(2px * var(--app-density-scale));
    height: calc(3px * var(--app-density-scale));
    border-radius: calc(2px * var(--app-density-scale));
    background: var(--progress-below-color);
  }

  .learning-progress-row-target .learning-progress-bar {
    background: var(--progress-target-color);
  }

  .learning-progress-row-unintroduced .learning-progress-bar {
    opacity: 0.62;
  }

  .learning-progress-axis {
    display: flex;
    justify-content: space-between;
    gap: var(--app-space-2);
    padding: calc(0.4rem * var(--app-density-scale)) calc(0.7rem * var(--app-density-scale)) calc(0.55rem * var(--app-density-scale));
    border-top: 1px solid var(--app-secondary-surface-color);
    color: var(--app-secondary-text-color);
    font-size: calc(var(--app-font-size-base) * 0.62);
    font-variant-numeric: tabular-nums;
  }

  .learning-progress-empty {
    padding: calc(0.8rem * var(--app-density-scale));
    color: var(--app-secondary-text-color);
    font-size: calc(var(--app-font-size-base) * 0.8);
    line-height: 1.35;
  }

  @media (max-width: 768px) {
    .learning-progress-shell {
      height: auto;
    }

    .learning-progress-shell-open {
      left: 0;
      width: 100%;
      max-width: none;
      min-width: 0;
      flex-basis: 100%;
    }

    .learning-progress-shell-open .learning-progress-toggle {
      display: none;
    }

    .learning-progress-panel {
      max-width: none;
    }
  }
</style>
