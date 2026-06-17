<script>
  export let snapshot = null;
  export let showReferenceLines = true;
  export let compact = false;

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
</script>

{#if available}
  <div class="learning-progress-stats" class:learning-progress-stats-compact={compact} aria-label="Learning progress summary">
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

  <div
    class="learning-progress-chart"
    class:learning-progress-chart-compact={compact}
    class:learning-progress-chart-no-reference-lines={!showReferenceLines}
    role="img"
    aria-label={graphicLabel}
    style={`--progress-row-count: ${Math.max(rows.length, 1)}`}
  >
    {#if showReferenceLines}
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
    {/if}

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

  {#if showReferenceLines}
    <div class="learning-progress-axis" aria-hidden="true">
      <span>0%</span>
      <span>100%</span>
    </div>
  {/if}
{:else}
  <div class="learning-progress-empty" role="status">
    {snapshot?.reason || 'Progress is not ready yet.'}
  </div>
{/if}

<style>
  .learning-progress-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--progress-panel-gap);
    padding: var(--progress-panel-padding-y) var(--progress-panel-padding-x);
    border-bottom: 1px solid var(--app-secondary-surface-color);
  }

  .learning-progress-stats-compact {
    display: none;
  }

  .learning-progress-stats div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: calc(0.06rem * var(--app-density-scale));
    padding: calc(0.18rem * var(--app-density-scale)) calc(0.12rem * var(--app-density-scale));
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .learning-progress-stat-label {
    color: var(--app-secondary-text-color);
    font-size: calc(var(--app-font-size-base) * 0.52);
    font-weight: 700;
    line-height: 1;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .learning-progress-stats strong {
    color: var(--app-text-color);
    font-size: calc(var(--app-font-size-base) * 0.74);
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  .learning-progress-chart {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    margin: var(--progress-panel-padding-y) var(--progress-panel-padding-x) var(--app-space-0);
    overflow: hidden;
  }

  .learning-progress-chart-compact {
    flex: 0 0 auto;
    height: calc(
      var(--progress-row-count) * var(--progress-bar-height)
      + (var(--progress-row-count) - 1) * var(--progress-bar-gap)
    );
    min-height: var(--progress-bar-height);
    margin: 0;
  }

  .learning-progress-chart::before {
    content: "";
    position: absolute;
    inset: 0 var(--progress-scrollbar-gutter) 0 0;
    box-sizing: border-box;
    border: 1px solid var(--app-text-color);
    pointer-events: none;
    z-index: 3;
  }

  .learning-progress-chart-no-reference-lines::before {
    display: none;
  }

  .learning-progress-lines {
    position: absolute;
    inset: 0 var(--progress-scrollbar-gutter) 0 0;
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
    scrollbar-gutter: stable;
    scrollbar-width: thin;
    scrollbar-color: var(--app-secondary-surface-color) transparent;
  }

  .learning-progress-chart-compact .learning-progress-bars {
    overflow: hidden;
    scrollbar-gutter: auto;
  }

  .learning-progress-row {
    display: block;
    width: 100%;
    height: var(--progress-bar-height);
    margin-bottom: var(--progress-bar-gap);
  }

  .learning-progress-row:last-child {
    margin-bottom: 0;
  }

  .learning-progress-bar {
    display: block;
    width: var(--bar-width);
    min-width: calc(2px * var(--app-density-scale));
    height: var(--progress-bar-height);
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
    gap: var(--progress-panel-gap);
    padding: var(--progress-panel-padding-y)
      calc(var(--progress-panel-padding-x) + var(--progress-scrollbar-gutter))
      var(--progress-panel-padding-y)
      var(--progress-panel-padding-x);
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
</style>
