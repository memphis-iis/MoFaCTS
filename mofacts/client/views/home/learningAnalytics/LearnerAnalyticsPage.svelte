<script lang="ts">
  import { onMount } from 'svelte';
  import { formatInterfaceDateTime, formatInterfaceNumber, formatInterfacePercent } from '../../../../common/lib/interfaceFormatting';
  import type { TargetUiLocale } from '../../../../common/lib/interfaceLocales';
  import type {
    LearnerAnalyticsOverview,
    LearnerAnalyticsPeriod,
    LearnerAnalyticsLaunchDescriptor,
    LearnerLessonAnalyticsSnapshot,
    RefreshLearnerLessonAnalyticsRequest,
  } from '../../../../common/learnerAnalytics.contracts';
  import ActivityStrip from './ActivityStrip.svelte';
  import EstimatedLearningStatus from './EstimatedLearningStatus.svelte';
  import MetricCard from './MetricCard.svelte';
  import {
    buildLearningAnalyticsViewModel,
    type HeadlineAnalyticsFactor,
  } from './learningAnalyticsViewModel';
  import {
    getLearningAnalyticsStrings,
    interpolateLearningAnalyticsString,
  } from './learningAnalyticsI18n';

  type MetricDetailRow = {
    id: string;
    label: string;
    value: string;
    definition: string;
  };

  export let uiLocale: TargetUiLocale;
  export let loadOverview: () => Promise<LearnerAnalyticsOverview>;
  export let refreshLesson: (request: RefreshLearnerLessonAnalyticsRequest) => Promise<LearnerLessonAnalyticsSnapshot>;
  export let continuePractice: (launch: LearnerAnalyticsLaunchDescriptor) => Promise<void>;

  const periods: LearnerAnalyticsPeriod[] = ['7d', '30d', 'all'];
  let lessons: LearnerAnalyticsOverview['lessons'] = [];
  let selectedLessonId = '';
  let selectedPeriod: LearnerAnalyticsPeriod = '30d';
  let snapshot: LearnerLessonAnalyticsSnapshot | null = null;
  let loading = true;
  let refreshing = false;
  let errorMessage = '';
  let requestSequence = 0;

  $: strings = getLearningAnalyticsStrings(uiLocale);
  $: viewModel = snapshot ? buildLearningAnalyticsViewModel(snapshot, selectedPeriod) : null;
  $: metricCardFactors = (viewModel?.headlineFactors || []).filter(
    (factor): factor is Exclude<HeadlineAnalyticsFactor, 'estimatedLearning'> => factor !== 'estimatedLearning'
  );
  $: periodLabel = selectedPeriod === '7d'
    ? strings.period7d
    : selectedPeriod === '30d'
      ? strings.period30d
      : strings.periodAll;
  $: viewAnnouncement = viewModel ? interpolateLearningAnalyticsString(strings.viewChanged, {
    lesson: viewModel.lesson.title,
    period: periodLabel,
  }) : '';
  $: whyExplanation = snapshot?.availability.modelProgress
    ? strings.retrievalModelExplanation
    : snapshot?.availability.accuracy
      ? strings.retrievalExplanation
      : strings.autotutorExplanation;
  $: activitySummary = viewModel ? interpolateLearningAnalyticsString(strings.activitySummary, {
    days: formatInterfaceNumber(uiLocale, viewModel.activityTotals.activeDays),
    attempts: formatInterfaceNumber(uiLocale, viewModel.activityTotals.attempts),
    minutes: formatInterfaceNumber(uiLocale, viewModel.activityTotals.activeMinutes),
  }) : '';
  $: detailRows = viewModel ? buildDetailRows() : [];

  onMount(async () => {
    try {
      const overview = await loadOverview();
      lessons = overview.lessons;
      selectedLessonId = overview.defaultLessonId || overview.lessons[0]?.rootTdfId || '';
      if (selectedLessonId) await loadSelectedLesson();
    } catch (_error) {
      errorMessage = strings.loadError;
    } finally {
      loading = false;
    }
  });

  async function loadSelectedLesson(): Promise<void> {
    const sequence = ++requestSequence;
    refreshing = true;
    errorMessage = '';
    try {
      const next = await refreshLesson({
        rootTdfId: selectedLessonId,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (sequence === requestSequence) snapshot = next;
    } catch (_error) {
      if (sequence === requestSequence) errorMessage = strings.loadError;
    } finally {
      if (sequence === requestSequence) refreshing = false;
    }
  }

  function recencyLabel(value: string | null): string {
    if (!value) return strings.noPracticeYet;
    return formatInterfaceDateTime(uiLocale, value, { dateStyle: 'medium' });
  }

  async function handleContinuePractice(): Promise<void> {
    if (!snapshot) return;
    try {
      await continuePractice(snapshot.lesson.launch);
    } catch (_error) {
      errorMessage = strings.continueError;
    }
  }

  function handleLessonChange(): void {
    snapshot = null;
    void loadSelectedLesson();
  }

  function buildDetailRows(): MetricDetailRow[] {
    if (!viewModel || !snapshot) return [];
    const rows: MetricDetailRow[] = [
      {
        id: 'attempts',
        label: strings.attempts,
        value: formatInterfaceNumber(uiLocale, viewModel.metrics.attempts),
        definition: strings.attemptsDefinition,
      },
      {
        id: 'recency',
        label: strings.recency,
        value: recencyLabel(snapshot.lastPracticedAt),
        definition: strings.recencyDefinition,
      },
    ];

    if (viewModel.accuracyRate !== undefined) {
      rows.push({
        id: 'accuracy',
        label: strings.accuracy,
        value: formatInterfacePercent(uiLocale, viewModel.accuracyRate),
        definition: strings.accuracyDefinition,
      });
    }

    rows.push(
      {
        id: 'uniqueItems',
        label: strings.uniqueItems,
        value: formatInterfaceNumber(uiLocale, viewModel.metrics.uniqueItems),
        definition: strings.uniqueItemsDefinition,
      },
      {
        id: 'activeMinutes',
        label: strings.activeMinutes,
        value: formatInterfaceNumber(uiLocale, viewModel.metrics.activeMinutes),
        definition: strings.activeMinutesDefinition,
      },
      {
        id: 'practiceDays',
        label: strings.practiceDays,
        value: formatInterfaceNumber(uiLocale, viewModel.metrics.practiceDays),
        definition: strings.practiceDaysDefinition,
      },
    );

    const progress = viewModel.metrics.modelProgress;
    if (progress) {
      const targetLabel = formatInterfacePercent(uiLocale, progress.targetProbability);
      rows.push(
        {
          id: 'meanProbability',
          label: strings.meanProbability,
          value: formatInterfacePercent(uiLocale, progress.meanProbability),
          definition: strings.meanProbabilityDefinition,
        },
        {
          id: 'atTarget',
          label: strings.atTarget,
          value: formatInterfaceNumber(uiLocale, progress.atTarget),
          definition: strings.atTargetDefinition,
        },
        {
          id: 'belowTarget',
          label: strings.belowTarget,
          value: formatInterfaceNumber(uiLocale, progress.belowTarget),
          definition: strings.belowTargetDefinition,
        },
        {
          id: 'target',
          label: strings.target,
          value: targetLabel,
          definition: interpolateLearningAnalyticsString(strings.targetExplanation, { target: targetLabel }),
        },
      );
    }

    rows.push({
      id: 'activity',
      label: strings.latest28Days,
      value: activitySummary,
      definition: strings.activityIntroduction,
    });

    return rows;
  }
</script>

<div class="analytics-page">
  <h2 class="sr-only">{strings.title}</h2>
  {#if loading}
    <p class="page-state" role="status">{strings.loading}</p>
  {:else if lessons.length === 0}
    <p class="page-state">{strings.noLessons}</p>
  {:else}
  <section class="analytics-controls" aria-label={strings.title}>
    <label class="lesson-control">
      <span>{strings.lessonLabel}</span>
      <select bind:value={selectedLessonId} onchange={handleLessonChange} disabled={refreshing}>
        {#each lessons as lesson}
          <option value={lesson.rootTdfId}>{lesson.title}</option>
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
    <div class="freshness-control">
      {#if snapshot}
        <span>{strings.dataUpdated}: {formatInterfaceDateTime(uiLocale, snapshot.calculatedAt, { dateStyle: 'medium', timeStyle: 'short' })}</span>
      {/if}
      <button type="button" onclick={loadSelectedLesson} disabled={refreshing}>
        <span class="fa fa-refresh" class:fa-spin={refreshing} aria-hidden="true"></span>
        {strings.refresh}
      </button>
    </div>
  </section>

  {#if errorMessage}<p class="page-error" role="alert">{errorMessage}</p>{/if}
  <p class="sr-only" aria-live="polite">{viewAnnouncement}</p>

  {#if viewModel && snapshot}
  <section class:has-model={Boolean(viewModel.metrics.modelProgress)} class="primary-card" aria-labelledby="selected-lesson-heading">
    <div class="lesson-summary">
      <p class="period-context">{periodLabel}</p>
      <h2 id="selected-lesson-heading">{viewModel.lesson.title}</h2>

      <dl class="secondary-metrics">
        <div>
          <dt>{strings.attempts}</dt>
          <dd>{formatInterfaceNumber(uiLocale, viewModel.metrics.attempts)}</dd>
        </div>
        <div>
          <dt>{strings.recency}</dt>
          <dd>{recencyLabel(snapshot.lastPracticedAt)}</dd>
        </div>
      </dl>

      <button class="continue-button" type="button" onclick={handleContinuePractice}>
        <span class="fa fa-play" aria-hidden="true"></span>
        {strings.continuePractice}
      </button>
    </div>

    {#if viewModel.metrics.modelProgress}
      <EstimatedLearningStatus
        {uiLocale}
        {strings}
        progress={viewModel.metrics.modelProgress}
      />
    {/if}
  </section>

  <section class="metric-grid" aria-label={viewAnnouncement}>
    {#each metricCardFactors as factor}
      {#if factor === 'accuracy' && viewModel.accuracyRate !== undefined}
        <MetricCard label={strings.accuracy} value={formatInterfacePercent(uiLocale, viewModel.accuracyRate)} />
      {:else if factor === 'uniqueItems'}
        <MetricCard label={strings.uniqueItems} value={formatInterfaceNumber(uiLocale, viewModel.metrics.uniqueItems)} />
      {:else if factor === 'activeMinutes'}
        <MetricCard label={strings.activeMinutes} value={formatInterfaceNumber(uiLocale, viewModel.metrics.activeMinutes)} />
      {:else if factor === 'practiceDays'}
        <MetricCard label={strings.practiceDays} value={formatInterfaceNumber(uiLocale, viewModel.metrics.practiceDays)} />
      {/if}
    {/each}
  </section>

  <ActivityStrip
    {uiLocale}
    {strings}
    activity={snapshot.latest28Days}
    weeks={viewModel.activityWeeks}
    totals={viewModel.activityTotals}
  />

  <details class="metric-details">
    <summary>{strings.metricDetails}</summary>
    <div class="details-content">
      <!-- The horizontally scrollable table region must remain keyboard-focusable. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="details-table-scroll" tabindex="0" role="region" aria-label={strings.metricDetails}>
        <table>
          <caption>{strings.metricDetails}</caption>
          <thead>
            <tr>
              <th scope="col">{strings.metric}</th>
              <th scope="col">{strings.value}</th>
              <th scope="col">{strings.details}</th>
            </tr>
          </thead>
          <tbody>
            {#each detailRows as row}
              <tr>
                <th scope="row">{row.label}</th>
                <td>{row.value}</td>
                <td>
                  <span>{row.definition}</span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <aside class="metric-explanation" aria-labelledby="why-metrics-heading">
        <span class="fa fa-info-circle" aria-hidden="true"></span>
        <div>
          <h2 id="why-metrics-heading">{strings.whyMetricsDiffer}</h2>
          <p>{whyExplanation}</p>
        </div>
      </aside>
    </div>
  </details>
  {/if}
  {/if}
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

  .metric-explanation .fa {
    margin-top: 0.15em;
    color: var(--app-accent-color);
    font-size: 1.2em;
  }

  .analytics-controls {
    display: grid;
    grid-template-columns: minmax(15rem, 1.5fr) minmax(18rem, 1fr) auto;
    gap: var(--app-space-3-px) var(--app-space-4-px);
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

  select:focus-visible,
  .freshness-control button:focus-visible,
  .continue-button:focus-visible,
  .metric-details summary:focus-visible,
  .details-table-scroll:focus-visible {
    outline: 3px solid var(--app-accent-color);
    outline-offset: 3px;
  }

  .page-state,
  .page-error {
    margin: 0;
    padding: var(--app-space-4-px);
    border-radius: var(--app-border-radius-lg);
    background: var(--app-secondary-surface-color, var(--app-background-color));
  }

  .page-error {
    border: 1px solid var(--app-error-color, #a12622);
  }

  .freshness-control {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--app-space-1-px);
    color: var(--app-secondary-text-color);
    font-size: calc(var(--app-font-size-base) * 0.78);
  }

  .freshness-control button {
    min-height: var(--app-text-input-height);
    padding: 0 var(--app-space-3-px);
    border: 1px solid color-mix(in srgb, var(--app-text-color) 24%, transparent);
    border-radius: var(--app-border-radius-sm);
    background: var(--app-background-color);
    color: var(--app-text-color);
    font: inherit;
    font-weight: var(--app-font-weight-bold);
    cursor: pointer;
  }

  button:disabled,
  select:disabled {
    cursor: wait;
    opacity: 0.65;
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

  .primary-card {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--app-space-4-px);
    padding: var(--app-space-4-px);
    border: 1px solid color-mix(in srgb, var(--app-accent-color) 34%, transparent);
    border-radius: var(--app-border-radius-lg);
    background: var(--app-secondary-surface-color, var(--app-background-color));
    box-shadow: var(--app-shadow-soft);
  }

  .primary-card.has-model {
    grid-template-columns: minmax(15rem, 0.82fr) minmax(21rem, 1.18fr);
  }

  .lesson-summary {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
  }

  .period-context,
  .lesson-summary h2 {
    margin: 0;
  }

  .period-context {
    color: var(--app-secondary-text-color);
    font-size: calc(var(--app-font-size-base) * 0.78);
    font-weight: var(--app-font-weight-semibold);
  }

  .lesson-summary h2 {
    margin-top: var(--app-space-1-px);
    color: var(--app-page-header-text-color);
    /* Lesson names are section headings, not page headings. */
    font-size: calc(var(--app-font-size-base) * 1.25);
    line-height: 1.2;
  }

  .secondary-metrics {
    display: flex;
    flex-wrap: wrap;
    gap: var(--app-space-3-px) var(--app-space-5-px);
    margin: var(--app-space-3-px) 0;
  }

  .secondary-metrics div {
    display: grid;
    gap: 0.1rem;
  }

  .secondary-metrics dt {
    color: var(--app-secondary-text-color);
    font-size: calc(var(--app-font-size-base) * 0.74);
    font-weight: var(--app-font-weight-semibold);
  }

  .secondary-metrics dd {
    margin: 0;
    color: var(--app-page-header-text-color);
    font-size: calc(var(--app-font-size-base) * 1.05);
    font-weight: var(--app-font-weight-bold);
  }

  .continue-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--app-space-2-px);
    min-height: var(--app-text-input-height);
    padding: 0 var(--app-space-4-px);
    border: 1px solid color-mix(in srgb, var(--app-primary-action-surface-color) 70%, var(--app-text-color));
    border-radius: var(--app-border-radius-sm);
    background: var(--app-primary-action-surface-color);
    color: var(--app-primary-action-text-color);
    font: inherit;
    font-weight: var(--app-font-weight-bold);
    cursor: pointer;
  }

  .continue-button:hover {
    filter: brightness(1.06);
  }

  .metric-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--app-space-3-px);
  }

  .metric-details {
    border: 1px solid color-mix(in srgb, var(--app-text-color) 14%, transparent);
    border-radius: var(--app-border-radius-lg);
    background: var(--app-secondary-surface-color, var(--app-background-color));
    box-shadow: var(--app-shadow-soft);
  }

  .metric-details > summary {
    padding: var(--app-space-3-px) var(--app-space-4-px);
    color: var(--app-page-header-text-color);
    font-weight: var(--app-font-weight-bold);
    cursor: pointer;
  }

  .details-content {
    display: grid;
    gap: var(--app-space-3-px);
    padding: 0 var(--app-space-4-px) var(--app-space-4-px);
  }

  .details-table-scroll {
    overflow-x: auto;
    border-radius: var(--app-border-radius-sm);
  }

  table {
    width: 100%;
    min-width: 44rem;
    border-collapse: collapse;
    color: var(--app-text-color);
    font-size: calc(var(--app-font-size-base) * 0.82);
  }

  caption {
    padding-bottom: var(--app-space-2-px);
    color: var(--app-secondary-text-color);
    font-weight: var(--app-font-weight-semibold);
    text-align: start;
  }

  th,
  td {
    padding: var(--app-space-2-px);
    border-bottom: 1px solid color-mix(in srgb, var(--app-text-color) 11%, transparent);
    text-align: start;
    vertical-align: top;
  }

  thead th {
    background: color-mix(in srgb, var(--app-accent-color) 10%, var(--app-background-color));
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
    .analytics-controls,
    .primary-card.has-model {
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

    .analytics-controls,
    .primary-card {
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

    .continue-button {
      width: 100%;
    }

    .details-content {
      padding-inline: var(--app-space-3-px);
      padding-bottom: var(--app-space-3-px);
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
