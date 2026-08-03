<script lang="ts">
  import { formatInterfaceDateTime, formatInterfaceNumber, formatInterfacePercent } from '../../../../common/lib/interfaceFormatting';
  import type { TargetUiLocale } from '../../../../common/lib/interfaceLocales';
  import ActivityStrip from './ActivityStrip.svelte';
  import EstimatedLearningStatus from './EstimatedLearningStatus.svelte';
  import MetricCard from './MetricCard.svelte';
  import {
    DEFAULT_ANALYTICS_PERIOD,
    buildLearningAnalyticsMockViewModel,
    getDefaultMockLessonId,
    getMockLessons,
    type AnalyticsMetricKey,
    type AnalyticsPeriod,
  } from './learningAnalyticsMockData';
  import {
    getLearningAnalyticsMockStrings,
    interpolateLearningAnalyticsMockString,
  } from './learningAnalyticsMockI18n';

  export let uiLocale: TargetUiLocale;

  const lessons = getMockLessons();
  const periods: AnalyticsPeriod[] = ['7d', '30d', 'all'];
  let selectedLessonId = getDefaultMockLessonId();
  let selectedPeriod: AnalyticsPeriod = DEFAULT_ANALYTICS_PERIOD;

  $: strings = getLearningAnalyticsMockStrings(uiLocale);
  $: viewModel = buildLearningAnalyticsMockViewModel(selectedLessonId, selectedPeriod);
  $: periodLabel = selectedPeriod === '7d'
    ? strings.period7d
    : selectedPeriod === '30d'
      ? strings.period30d
      : strings.periodAll;
  $: viewAnnouncement = interpolateLearningAnalyticsMockString(strings.viewChanged, {
    lesson: viewModel.lesson.title,
    period: periodLabel,
  });
  $: whyExplanation = viewModel.lesson.measurementContract === 'retrieval-model'
    ? strings.retrievalModelExplanation
    : viewModel.lesson.measurementContract === 'retrieval'
      ? strings.retrievalExplanation
      : strings.autotutorExplanation;

  function requireUpdatedAt(metric: AnalyticsMetricKey): string {
    const value = viewModel.metrics.updatedAtByMetric[metric];
    if (!value) {
      throw new Error(`Missing freshness timestamp for ${metric}`);
    }
    return value;
  }

  function updatedLabel(metric: AnalyticsMetricKey): string {
    return interpolateLearningAnalyticsMockString(strings.updated, {
      date: formatInterfaceDateTime(uiLocale, requireUpdatedAt(metric), { dateStyle: 'medium', timeStyle: 'short' }),
    });
  }

  function recencyLabel(days: number): string {
    if (days === 1) return strings.yesterday;
    return interpolateLearningAnalyticsMockString(strings.daysAgo, {
      count: formatInterfaceNumber(uiLocale, days),
    });
  }
</script>

<div class="analytics-page">
  <h2 class="sr-only">{strings.title}</h2>

  <div class="mock-notice" role="note">
    <span class="fa fa-flask" aria-hidden="true"></span>
    <strong>{strings.mockNotice}</strong>
  </div>

  <section class="analytics-controls" aria-label={strings.title}>
    <label class="lesson-control">
      <span>{strings.lessonLabel}</span>
      <select bind:value={selectedLessonId}>
        {#each lessons as lesson}
          <option value={lesson.id}>{lesson.title}</option>
        {/each}
      </select>
    </label>

    <fieldset class="period-control">
      <legend>{strings.timePeriod}</legend>
      <div class="period-options">
        {#each periods as period}
          <label class="period-option">
            <input type="radio" name="analytics-period" value={period} bind:group={selectedPeriod} />
            <span>{period === '7d' ? strings.period7d : period === '30d' ? strings.period30d : strings.periodAll}</span>
          </label>
        {/each}
      </div>
    </fieldset>
  </section>

  <p class="sr-only" aria-live="polite">{viewAnnouncement}</p>

  <section class="metric-grid" aria-label={viewAnnouncement}>
    <MetricCard label={strings.attempts} value={formatInterfaceNumber(uiLocale, viewModel.metrics.attempts)} definition={strings.attemptsDefinition} updatedLabel={updatedLabel('attempts')} />
    {#if viewModel.accuracyRate !== undefined}
      <MetricCard label={strings.accuracy} value={formatInterfacePercent(uiLocale, viewModel.accuracyRate)} definition={strings.accuracyDefinition} updatedLabel={updatedLabel('accuracy')} />
    {/if}
    <MetricCard label={strings.uniqueItems} value={formatInterfaceNumber(uiLocale, viewModel.metrics.uniqueItems)} definition={strings.uniqueItemsDefinition} updatedLabel={updatedLabel('uniqueItems')} />
    <MetricCard label={strings.practiceDays} value={formatInterfaceNumber(uiLocale, viewModel.metrics.practiceDays)} definition={strings.practiceDaysDefinition} updatedLabel={updatedLabel('practiceDays')} />
    <MetricCard label={strings.activeMinutes} value={formatInterfaceNumber(uiLocale, viewModel.metrics.activeMinutes)} definition={strings.activeMinutesDefinition} updatedLabel={updatedLabel('activeMinutes')} />
    <MetricCard label={strings.recency} value={recencyLabel(viewModel.daysSinceLastPractice)} definition={strings.recencyDefinition} updatedLabel={updatedLabel('recency')} />
  </section>

  <ActivityStrip
    {uiLocale}
    {strings}
    activity={viewModel.lesson.activity}
    weeks={viewModel.activityWeeks}
    totals={viewModel.activityTotals}
  />

  {#if viewModel.metrics.modelProgress}
    <EstimatedLearningStatus
      {uiLocale}
      {strings}
      progress={viewModel.metrics.modelProgress}
      updatedAtByMetric={viewModel.metrics.updatedAtByMetric}
    />
  {/if}

  <aside class="metric-explanation" aria-labelledby="why-metrics-heading">
    <span class="fa fa-info-circle" aria-hidden="true"></span>
    <div>
      <h2 id="why-metrics-heading">{strings.whyMetricsDiffer}</h2>
      <p>{whyExplanation}</p>
    </div>
  </aside>
</div>

<style>
  .analytics-page {
    display: grid;
    gap: var(--app-space-4-px);
    width: min(100%, 76rem);
    margin: 0 auto;
    padding: var(--app-space-3-px) 0 var(--app-space-5-px);
    color: var(--app-text-color);
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

  .mock-notice,
  .metric-explanation {
    display: flex;
    align-items: flex-start;
    gap: var(--app-space-2-px);
    padding: var(--app-space-3-px);
    border: 2px solid color-mix(in srgb, var(--app-accent-color) 48%, var(--app-text-color));
    border-radius: var(--app-border-radius-lg);
    background: color-mix(in srgb, var(--app-accent-color) 10%, var(--app-background-color));
    color: var(--app-text-color);
  }

  .mock-notice .fa,
  .metric-explanation .fa {
    margin-top: 0.15em;
    color: var(--app-accent-color);
    font-size: 1.2em;
  }

  .analytics-controls {
    display: grid;
    grid-template-columns: minmax(15rem, 1.5fr) minmax(18rem, 1fr);
    gap: var(--app-space-4-px);
    align-items: end;
    padding: var(--app-space-4-px);
    border: 1px solid color-mix(in srgb, var(--app-text-color) 14%, transparent);
    border-radius: var(--app-border-radius-lg);
    background: var(--app-secondary-surface-color, var(--app-background-color));
    box-shadow: var(--app-shadow-soft);
  }

  .lesson-control,
  .period-control {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .lesson-control > span,
  .period-control legend {
    display: block;
    margin-bottom: var(--app-space-1-px);
    color: var(--app-page-header-text-color);
    font-size: calc(var(--app-font-size-base) * 0.82);
    font-weight: var(--app-font-weight-bold);
  }

  select {
    width: 100%;
    min-height: var(--app-text-input-height);
    padding: 0 var(--app-space-3-px);
    border: 1px solid color-mix(in srgb, var(--app-text-color) 24%, transparent);
    border-radius: var(--app-border-radius-sm);
    background: var(--app-background-color);
    color: var(--app-text-color);
    font: inherit;
  }

  select:focus-visible {
    outline: 3px solid var(--app-accent-color);
    outline-offset: 2px;
  }

  .period-options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--app-text-color) 24%, transparent);
    border-radius: var(--app-border-radius-sm);
  }

  .period-option {
    position: relative;
    min-width: 0;
    margin: 0;
  }

  .period-option input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .period-option span {
    display: grid;
    place-items: center;
    min-height: var(--app-text-input-height);
    padding: 0 var(--app-space-2-px);
    border-inline-start: 1px solid color-mix(in srgb, var(--app-text-color) 16%, transparent);
    background: var(--app-background-color);
    color: var(--app-text-color);
    font-size: calc(var(--app-font-size-base) * 0.82);
    text-align: center;
    cursor: pointer;
  }

  .period-option:first-child span {
    border-inline-start: 0;
  }

  .period-option input:checked + span {
    background: var(--app-primary-action-surface-color);
    color: var(--app-primary-action-text-color);
    font-weight: var(--app-font-weight-bold);
  }

  .period-option input:focus-visible + span {
    position: relative;
    z-index: 1;
    outline: 3px solid var(--app-accent-color);
    outline-offset: -3px;
  }

  .metric-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--app-space-3-px);
  }

  .metric-explanation {
    border-width: 1px;
    background: color-mix(in srgb, var(--app-accent-color) 5%, var(--app-background-color));
  }

  .metric-explanation h2,
  .metric-explanation p {
    margin: 0;
  }

  .metric-explanation h2 {
    color: var(--app-page-header-text-color);
    font-size: calc(var(--app-font-size-base) * 1.05);
  }

  .metric-explanation p {
    margin-top: var(--app-space-1-px);
    line-height: 1.5;
  }

  @media (max-width: 900px) {
    .analytics-controls {
      grid-template-columns: 1fr;
    }

    .metric-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 560px) {
    .analytics-page {
      gap: var(--app-space-3-px);
    }

    .analytics-controls {
      padding: var(--app-space-3-px);
    }

    .metric-grid {
      grid-template-columns: 1fr;
    }

    .period-options {
      grid-template-columns: 1fr;
    }

    .period-option span {
      border-inline-start: 0;
      border-top: 1px solid color-mix(in srgb, var(--app-text-color) 16%, transparent);
    }

    .period-option:first-child span {
      border-top: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
    }
  }
</style>
