<script lang="ts">
  export let label: string;
  export let value: string;
  export let definition: string;
  export let updatedLabel: string;
</script>

<article class="metric-card" aria-label={`${label}: ${value}`}>
  <h3>{label}</h3>
  <p class="metric-value">{value}</p>
  <p class="metric-definition">{definition}</p>
  <p class="metric-updated">{updatedLabel}</p>
</article>

<style>
  .metric-card {
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    gap: var(--app-space-1-px);
    min-width: 0;
    padding: var(--app-space-3-px);
    border: 1px solid color-mix(in srgb, var(--app-text-color) 14%, transparent);
    border-radius: var(--app-border-radius-lg);
    background: var(--app-secondary-surface-color, var(--app-background-color));
    box-shadow: var(--app-shadow-soft);
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    color: color-mix(in srgb, var(--app-text-color) 72%, transparent);
    font-size: calc(var(--app-font-size-base) * 0.82);
    font-weight: var(--app-font-weight-bold);
    letter-spacing: var(--app-label-letter-spacing);
    line-height: var(--app-line-height-tight);
    text-transform: var(--app-label-text-transform);
  }

  .metric-value {
    color: var(--app-page-header-text-color);
    font-size: clamp(1.65rem, 4vw, 2.4rem);
    font-weight: var(--app-font-weight-bold);
    line-height: 1.1;
  }

  .metric-definition {
    color: var(--app-text-color);
    font-size: calc(var(--app-font-size-base) * 0.86);
    line-height: 1.45;
  }

  .metric-updated {
    padding-top: var(--app-space-2-px);
    border-top: 1px solid color-mix(in srgb, var(--app-text-color) 9%, transparent);
    color: var(--app-secondary-text-color);
    font-size: calc(var(--app-font-size-base) * 0.72);
  }
</style>
