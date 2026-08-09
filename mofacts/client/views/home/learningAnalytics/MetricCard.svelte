<script lang="ts">
  export let label: string;
  export let value: string;
</script>

<article class="metric-card" aria-label={`${label}: ${value}`}>
  <h3>{label}</h3>
  <p class="metric-value">{value}</p>
</article>

<style>
  .metric-card {
    display: grid;
    grid-template-rows: auto 1fr;
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
    /* Keep headline values below the shared desktop page-header scale. */
    font-size: calc(var(--app-font-size-base) * 1.25);
    font-weight: var(--app-font-weight-bold);
    line-height: 1.1;
  }

</style>
