<script lang="ts">
  import { formatInterfaceNumber, formatInterfacePercent } from '../../../../common/lib/interfaceFormatting';
  import type { TargetUiLocale } from '../../../../common/lib/interfaceLocales';
  import {
    type ModelProgressSnapshot,
    type ProbabilityHistogramBin,
  } from './learningAnalyticsViewModel';
  import type { LearningAnalyticsStrings } from './learningAnalyticsI18n';
  import { interpolateLearningAnalyticsString } from './learningAnalyticsI18n';

  export let uiLocale: TargetUiLocale;
  export let strings: LearningAnalyticsStrings;
  export let progress: ModelProgressSnapshot;

  let showHistogram = false;

  $: meanLabel = formatInterfacePercent(uiLocale, progress.meanProbability);
  $: targetLabel = formatInterfacePercent(uiLocale, progress.targetProbability);
  $: targetExplanation = interpolateLearningAnalyticsString(strings.targetExplanation, { target: targetLabel });
  $: histogramBins = progress.histogramBins;
  $: largestBinCount = Math.max(1, ...histogramBins.map((bin) => bin.count));
  $: histogramDescription = interpolateLearningAnalyticsString(strings.histogramDescription, {
    count: formatInterfaceNumber(uiLocale, progress.modeledItemCount),
    mean: meanLabel,
  });

  function formatProbability(value: number): string {
    return formatInterfacePercent(uiLocale, value, {
      minimumFractionDigits: value * 100 % 1 === 0 ? 0 : 1,
      maximumFractionDigits: 1,
    });
  }

  function binDescription(bin: ProbabilityHistogramBin): string {
    return interpolateLearningAnalyticsString(strings.histogramBinDescription, {
      start: formatProbability(bin.start),
      end: formatProbability(bin.end),
      count: formatInterfaceNumber(uiLocale, bin.count),
    });
  }
</script>

<section class="estimated-summary" aria-labelledby="estimated-heading">
  <div class="section-header">
    <div class="section-heading">
      <h3 id="estimated-heading">{strings.estimatedLearning}</h3>
      <p>{strings.estimatedIntroduction}</p>
    </div>
    <button
      class:active={showHistogram}
      class="histogram-toggle"
      type="button"
      aria-controls="estimated-learning-visual"
      aria-pressed={showHistogram}
      aria-label={showHistogram ? strings.showMeanBar : strings.showHistogram}
      title={showHistogram ? strings.showMeanBar : strings.showHistogram}
      onclick={() => { showHistogram = !showHistogram; }}
    >
      {#if showHistogram}
        <span class="mean-bar-icon" aria-hidden="true"><span></span></span>
      {:else}
        <span class="histogram-icon" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </span>
      {/if}
    </button>
  </div>

  <div id="estimated-learning-visual">
    {#if showHistogram}
      <div class="histogram-visual" role="group" aria-label={`${histogramDescription} ${targetExplanation}`}>
        <div class="histogram-chart" aria-hidden="true">
          <ol
            class="histogram-bars"
            style={`grid-template-columns: repeat(${histogramBins.length}, minmax(0, 1fr))`}
          >
            {#each histogramBins as bin}
              <li>
                <span class:has-count={bin.count > 0} style={`height: ${bin.count / largestBinCount * 100}%`}></span>
              </li>
            {/each}
          </ol>
          <span class="histogram-mean" style={`left: ${progress.meanProbability * 100}%`}>
            <strong>{meanLabel}</strong>
          </span>
          <span class="histogram-target" style={`left: ${progress.targetProbability * 100}%`}>
            <strong>{strings.target}: {targetLabel}</strong>
          </span>
        </div>
        <div class="histogram-axis" aria-hidden="true">
          <span>{formatProbability(0)}</span>
          <span>{formatProbability(0.5)}</span>
          <span>{formatProbability(1)}</span>
        </div>
        <ul class="sr-only">
          {#each histogramBins as bin}
            <li>{binDescription(bin)}</li>
          {/each}
        </ul>
        <p>{histogramDescription}</p>
        <p>{targetExplanation}</p>
      </div>
    {:else}
      <div class="probability-visual" role="img" aria-label={`${strings.meanProbability}: ${meanLabel}. ${targetExplanation}`}>
        <div class="probability-labels" aria-hidden="true">
          <strong>{meanLabel}</strong>
          <span>{strings.target}: {targetLabel}</span>
        </div>
        <div class="probability-track" aria-hidden="true">
          <span class="probability-fill" style={`width: ${progress.meanProbability * 100}%`}></span>
          <span class="target-marker" style={`inset-inline-start: ${progress.targetProbability * 100}%`}></span>
        </div>
        <p>{targetExplanation}</p>
      </div>
    {/if}
  </div>

  <dl class="status-counts">
    <div>
      <dt>{strings.atTarget}</dt>
      <dd>{formatInterfaceNumber(uiLocale, progress.atTarget)}</dd>
    </div>
    <div>
      <dt>{strings.belowTarget}</dt>
      <dd>{formatInterfaceNumber(uiLocale, progress.belowTarget)}</dd>
    </div>
  </dl>

</section>

<style>
  .estimated-summary {
    display: grid;
    gap: var(--app-space-3-px);
    min-width: 0;
    padding: var(--app-space-3-px);
    border: 1px solid color-mix(in srgb, var(--app-accent-color) 34%, transparent);
    border-radius: var(--app-border-radius-lg);
    background: color-mix(in srgb, var(--app-accent-color) 6%, var(--app-background-color));
  }

  h3,
  p,
  dl,
  dt,
  dd {
    margin: 0;
  }

  h3 {
    color: var(--app-page-header-text-color);
    font-size: calc(var(--app-font-size-base) * 1.05);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .section-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--app-space-2-px);
  }

  .histogram-toggle {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: calc(36px * var(--app-density-scale));
    min-width: 2.25rem;
    height: calc(36px * var(--app-density-scale));
    min-height: 2.25rem;
    padding: 0.42rem;
    border: 1px solid color-mix(in srgb, var(--app-text-color) 28%, transparent);
    border-radius: var(--app-border-radius-sm);
    background: var(--app-background-color);
    color: var(--app-text-color);
    cursor: pointer;
  }

  .histogram-toggle:hover,
  .histogram-toggle.active {
    border-color: var(--app-accent-color);
    background: color-mix(in srgb, var(--app-accent-color) 12%, var(--app-background-color));
  }

  .histogram-toggle:focus-visible {
    outline: 3px solid var(--app-accent-color);
    outline-offset: 2px;
  }

  .histogram-icon {
    display: flex;
    align-items: end;
    gap: 2px;
    width: 100%;
    height: 100%;
    border-bottom: 2px solid currentColor;
  }

  .histogram-icon span {
    flex: 1;
    background: currentColor;
  }

  .histogram-icon span:nth-child(1) { height: 30%; }
  .histogram-icon span:nth-child(2) { height: 65%; }
  .histogram-icon span:nth-child(3) { height: 100%; }
  .histogram-icon span:nth-child(4) { height: 48%; }

  .mean-bar-icon {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
  }

  .mean-bar-icon span {
    display: block;
    width: 100%;
    height: 0.35rem;
    border: 1px solid currentColor;
    border-radius: 999px;
    background: currentColor;
  }

  .section-heading p,
  .probability-visual p,
  .histogram-visual p {
    margin-top: var(--app-space-1-px);
    color: var(--app-secondary-text-color);
    font-size: calc(var(--app-font-size-base) * 0.82);
    line-height: 1.45;
  }

  .probability-visual {
    min-width: 0;
  }

  .histogram-visual {
    min-width: 0;
  }

  .histogram-visual p + p {
    margin-top: 0;
  }

  .histogram-chart {
    position: relative;
    height: 9rem;
    padding-top: 1.7rem;
    border-bottom: 2px solid var(--app-text-color);
    direction: ltr;
  }

  .histogram-bars {
    display: grid;
    align-items: end;
    gap: 0;
    height: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .histogram-bars li {
    display: flex;
    align-items: end;
    height: 100%;
  }

  .histogram-bars li > span {
    display: block;
    width: 100%;
    min-height: 0;
    border-inline-start: 1px solid color-mix(in srgb, var(--app-accent-color) 72%, var(--app-text-color));
    background-color: color-mix(in srgb, var(--app-accent-color) 64%, var(--app-background-color));
    background-image: repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, var(--app-background-color) 26%, transparent) 4px 7px);
  }

  .histogram-bars li > span:not(.has-count) {
    border: 0;
    background: transparent;
  }

  .histogram-mean {
    position: absolute;
    inset-block: 1.1rem 0;
    width: 3px;
    background: var(--app-text-color);
    box-shadow: 0 0 0 2px var(--app-background-color);
    transform: translateX(-50%);
    z-index: 3;
  }

  .histogram-target {
    position: absolute;
    inset-block: 1.7rem 0;
    width: 0;
    border-inline-start: 3px dashed var(--app-accent-color);
    transform: translateX(-50%);
    z-index: 2;
  }

  .histogram-target strong {
    position: absolute;
    bottom: 0.25rem;
    left: -0.3rem;
    padding: 0.1rem 0.25rem;
    border: 1px solid var(--app-accent-color);
    border-radius: var(--app-border-radius-sm);
    background: var(--app-background-color);
    color: var(--app-page-header-text-color);
    font-size: calc(var(--app-font-size-base) * 0.7);
    white-space: nowrap;
    transform: translateX(-100%);
  }

  .histogram-mean strong {
    position: absolute;
    top: -1.1rem;
    left: 50%;
    padding: 0 0.2rem;
    background: var(--app-background-color);
    color: var(--app-page-header-text-color);
    font-size: calc(var(--app-font-size-base) * 0.75);
    white-space: nowrap;
    transform: translateX(-50%);
  }

  .histogram-axis {
    display: flex;
    justify-content: space-between;
    direction: ltr;
    color: var(--app-secondary-text-color);
    font-size: calc(var(--app-font-size-base) * 0.7);
  }

  .probability-labels {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--app-space-1-px) var(--app-space-2-px);
    margin-bottom: var(--app-space-1-px);
    color: var(--app-text-color);
  }

  .probability-labels strong {
    color: var(--app-page-header-text-color);
    font-size: calc(var(--app-font-size-base) * 1.25);
    line-height: 1;
  }

  .probability-labels span {
    align-self: end;
    font-size: calc(var(--app-font-size-base) * 0.78);
    font-weight: var(--app-font-weight-semibold);
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

  .status-counts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--app-space-2-px);
  }

  .status-counts div {
    padding: var(--app-space-2-px);
    border-inline-start: 3px solid var(--app-accent-color);
    background: var(--app-background-color);
  }

  .status-counts dt {
    color: var(--app-secondary-text-color);
    font-size: calc(var(--app-font-size-base) * 0.76);
    font-weight: var(--app-font-weight-semibold);
  }

  .status-counts dd {
    color: var(--app-page-header-text-color);
    font-size: calc(var(--app-font-size-base) * 1.25);
    font-weight: var(--app-font-weight-bold);
  }

  @media (max-width: 420px) {
    .status-counts {
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
