<script lang="ts">
  import { formatInterfaceDateTime, formatInterfaceNumber, formatInterfacePercent } from '../../../../common/lib/interfaceFormatting';
  import type { TargetUiLocale } from '../../../../common/lib/interfaceLocales';
  import type { ModelProgressSnapshot } from './learningAnalyticsMockData';
  import type { LearningAnalyticsMockStrings } from './learningAnalyticsMockI18n';
  import { interpolateLearningAnalyticsMockString } from './learningAnalyticsMockI18n';
  import MetricCard from './MetricCard.svelte';

  export let uiLocale: TargetUiLocale;
  export let strings: LearningAnalyticsMockStrings;
  export let progress: ModelProgressSnapshot;
  export let updatedAtByMetric: Partial<Record<'meanProbability' | 'atTarget' | 'belowTarget', string>>;

  function updatedLabel(metric: 'meanProbability' | 'atTarget' | 'belowTarget'): string {
    const value = updatedAtByMetric[metric];
    if (!value) {
      throw new Error(`Missing freshness timestamp for ${metric}`);
    }
    return interpolateLearningAnalyticsMockString(strings.updated, {
      date: formatInterfaceDateTime(uiLocale, value, { dateStyle: 'medium', timeStyle: 'short' }),
    });
  }

  $: meanLabel = formatInterfacePercent(uiLocale, progress.meanProbability);
  $: targetLabel = formatInterfacePercent(uiLocale, progress.targetProbability);
  $: targetExplanation = interpolateLearningAnalyticsMockString(strings.targetExplanation, { target: targetLabel });
</script>

<section class="estimated-section" aria-labelledby="estimated-heading">
  <div class="section-heading">
    <h2 id="estimated-heading">{strings.estimatedLearning}</h2>
    <p>{strings.estimatedIntroduction}</p>
  </div>

  <div class="probability-visual" role="img" aria-label={`${strings.meanProbability}: ${meanLabel}. ${targetExplanation}`}>
    <div class="probability-labels" aria-hidden="true">
      <strong>{meanLabel}</strong>
      <span>{targetLabel}</span>
    </div>
    <div class="probability-track" aria-hidden="true">
      <span class="probability-fill" style={`width: ${progress.meanProbability * 100}%`}></span>
      <span class="target-marker" style={`inset-inline-start: ${progress.targetProbability * 100}%`}></span>
    </div>
    <p>{targetExplanation}</p>
  </div>

  <div class="estimate-cards">
    <MetricCard label={strings.meanProbability} value={meanLabel} definition={strings.meanProbabilityDefinition} updatedLabel={updatedLabel('meanProbability')} />
    <MetricCard label={strings.atTarget} value={formatInterfaceNumber(uiLocale, progress.atTarget)} definition={strings.atTargetDefinition} updatedLabel={updatedLabel('atTarget')} />
    <MetricCard label={strings.belowTarget} value={formatInterfaceNumber(uiLocale, progress.belowTarget)} definition={strings.belowTargetDefinition} updatedLabel={updatedLabel('belowTarget')} />
  </div>

  <table>
    <caption>{strings.estimateTableCaption}</caption>
    <thead>
      <tr><th scope="col">{strings.metric}</th><th scope="col">{strings.value}</th></tr>
    </thead>
    <tbody>
      <tr><th scope="row">{strings.meanProbability}</th><td>{meanLabel}</td></tr>
      <tr><th scope="row">{strings.atTarget}</th><td>{formatInterfaceNumber(uiLocale, progress.atTarget)}</td></tr>
      <tr><th scope="row">{strings.belowTarget}</th><td>{formatInterfaceNumber(uiLocale, progress.belowTarget)}</td></tr>
      <tr><th scope="row">{strings.target}</th><td>{targetLabel}</td></tr>
    </tbody>
  </table>
</section>

<style>
  .estimated-section {
    display: grid;
    gap: var(--app-space-3-px);
    padding: var(--app-space-4-px);
    border: 1px solid color-mix(in srgb, var(--app-accent-color) 30%, transparent);
    border-radius: var(--app-border-radius-lg);
    background: color-mix(in srgb, var(--app-accent-color) 5%, var(--app-secondary-surface-color, var(--app-background-color)));
    box-shadow: var(--app-shadow-soft);
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    color: var(--app-page-header-text-color);
    font-size: calc(var(--app-font-size-base) * 1.2);
  }

  .section-heading p,
  .probability-visual p {
    margin-top: var(--app-space-1-px);
    color: var(--app-secondary-text-color);
    line-height: 1.45;
  }

  .probability-visual {
    padding: var(--app-space-3-px);
    border: 1px solid color-mix(in srgb, var(--app-text-color) 12%, transparent);
    border-radius: var(--app-border-radius-sm);
    background: var(--app-background-color);
  }

  .probability-labels {
    display: flex;
    justify-content: space-between;
    margin-bottom: var(--app-space-1-px);
    color: var(--app-text-color);
  }

  .probability-track {
    position: relative;
    height: calc(18px * var(--app-density-scale));
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--app-text-color) 25%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--app-text-color) 8%, var(--app-background-color));
  }

  .probability-fill {
    position: absolute;
    inset: 0 auto 0 0;
    background-color: var(--app-accent-color);
    background-image: repeating-linear-gradient(135deg, transparent 0 5px, color-mix(in srgb, var(--app-background-color) 24%, transparent) 5px 8px);
  }

  :global([dir='rtl']) .probability-fill {
    inset: 0 0 0 auto;
  }

  .target-marker {
    position: absolute;
    inset-block: -3px;
    width: 4px;
    background: var(--app-text-color);
    box-shadow: 0 0 0 2px var(--app-background-color);
  }

  .estimate-cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--app-space-3-px);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    color: var(--app-text-color);
    font-size: calc(var(--app-font-size-base) * 0.82);
  }

  caption {
    padding-bottom: var(--app-space-2-px);
    color: var(--app-secondary-text-color);
    font-weight: 600;
    text-align: start;
  }

  th,
  td {
    padding: var(--app-space-2-px);
    border-bottom: 1px solid color-mix(in srgb, var(--app-text-color) 11%, transparent);
    text-align: start;
  }

  thead th {
    background: color-mix(in srgb, var(--app-accent-color) 10%, var(--app-background-color));
  }

  @media (max-width: 720px) {
    .estimated-section {
      padding: var(--app-space-3-px);
    }

    .estimate-cards {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .probability-fill,
    .target-marker {
      transition: none;
    }
  }
</style>
