<script lang="ts">
  import {
    formatInterfaceDateTime,
    formatInterfaceNumber,
  } from '../../../../common/lib/interfaceFormatting';
  import type { TargetUiLocale } from '../../../../common/lib/interfaceLocales';
  import type { ActivityDay, ActivityWeekSummary } from './learningAnalyticsViewModel';
  import type { LearningAnalyticsStrings } from './learningAnalyticsI18n';
  import { interpolateLearningAnalyticsString } from './learningAnalyticsI18n';

  export let uiLocale: TargetUiLocale;
  export let strings: LearningAnalyticsStrings;
  export let activity: ActivityDay[];
  export let weeks: ActivityWeekSummary[];
  export let totals: { activeDays: number; attempts: number; activeMinutes: number };

  function formatDate(date: string, options: Intl.DateTimeFormatOptions): string {
    return formatInterfaceDateTime(uiLocale, `${date}T12:00:00Z`, options);
  }

  function activityLevel(day: ActivityDay): 0 | 1 | 2 | 3 {
    if (day.attempts <= 0 && day.activeMinutes <= 0) return 0;
    if (day.activeMinutes < 8) return 1;
    if (day.activeMinutes < 12) return 2;
    return 3;
  }

  function dayDescription(day: ActivityDay): string {
    const date = formatDate(day.date, { dateStyle: 'full' });
    if (activityLevel(day) === 0) {
      return interpolateLearningAnalyticsString(strings.noPractice, { date });
    }
    return interpolateLearningAnalyticsString(strings.practiceDayDescription, {
      date,
      attempts: formatInterfaceNumber(uiLocale, day.attempts),
      minutes: formatInterfaceNumber(uiLocale, day.activeMinutes),
    });
  }

  $: summary = interpolateLearningAnalyticsString(strings.activitySummary, {
    days: formatInterfaceNumber(uiLocale, totals.activeDays),
    attempts: formatInterfaceNumber(uiLocale, totals.attempts),
    minutes: formatInterfaceNumber(uiLocale, totals.activeMinutes),
  });
</script>

<section class="analytics-section" aria-labelledby="activity-heading">
  <div class="section-heading">
    <div>
      <h2 id="activity-heading">{strings.latest28Days}</h2>
      <p>{strings.activityIntroduction}</p>
    </div>
  </div>

  <p class="activity-summary">{summary}</p>

  <ol class="activity-strip" aria-label={strings.latest28Days}>
    {#each activity as day}
      <li class={`activity-day activity-level-${activityLevel(day)}`} aria-label={dayDescription(day)}>
        <span aria-hidden="true"></span>
      </li>
    {/each}
  </ol>

  <ul class="activity-legend" aria-label={strings.latest28Days}>
    <li><span class="legend-swatch activity-level-0" aria-hidden="true"></span>{strings.activityLevelNone}</li>
    <li><span class="legend-swatch activity-level-1" aria-hidden="true"></span>{strings.activityLevelLow}</li>
    <li><span class="legend-swatch activity-level-2" aria-hidden="true"></span>{strings.activityLevelMedium}</li>
    <li><span class="legend-swatch activity-level-3" aria-hidden="true"></span>{strings.activityLevelHigh}</li>
  </ul>

  <details class="activity-details">
    <summary>{strings.activityTableCaption}</summary>
    <!-- The horizontally scrollable table region must remain keyboard-focusable. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="table-scroll" tabindex="0" role="region" aria-label={strings.activityTableCaption}>
      <table>
        <caption>{strings.activityTableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{strings.week.replace('{number}', '')}</th>
            <th scope="col">{strings.dateRange}</th>
            <th scope="col">{strings.practiceDays}</th>
            <th scope="col">{strings.attempts}</th>
            <th scope="col">{strings.activeMinutes}</th>
          </tr>
        </thead>
        <tbody>
          {#each weeks as week}
            <tr>
              <th scope="row">{interpolateLearningAnalyticsString(strings.week, { number: formatInterfaceNumber(uiLocale, week.weekNumber) })}</th>
              <td>{formatDate(week.startDate, { month: 'short', day: 'numeric' })}–{formatDate(week.endDate, { month: 'short', day: 'numeric' })}</td>
              <td>{formatInterfaceNumber(uiLocale, week.activeDays)}</td>
              <td>{formatInterfaceNumber(uiLocale, week.attempts)}</td>
              <td>{formatInterfaceNumber(uiLocale, week.activeMinutes)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </details>
</section>

<style>
  .analytics-section {
    padding: var(--app-space-4-px);
    border: 1px solid color-mix(in srgb, var(--app-text-color) 14%, transparent);
    border-radius: var(--app-border-radius-lg);
    background: var(--app-secondary-surface-color, var(--app-background-color));
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
  .activity-summary {
    margin-top: var(--app-space-1-px);
    color: var(--app-secondary-text-color);
    line-height: 1.45;
  }

  .activity-summary {
    color: var(--app-text-color);
    font-weight: var(--app-font-weight-semibold);
  }

  .activity-strip {
    display: grid;
    grid-template-columns: repeat(28, minmax(0, 1fr));
    gap: clamp(0.16rem, 0.5vw, 0.4rem);
    margin: var(--app-space-3-px) 0;
    padding: 0;
    list-style: none;
  }

  .activity-day span,
  .legend-swatch {
    display: block;
    aspect-ratio: 1;
    border: 1px solid color-mix(in srgb, var(--app-text-color) 24%, transparent);
    border-radius: calc(var(--app-border-radius-sm) * 0.55);
    background: color-mix(in srgb, var(--app-text-color) 5%, var(--app-background-color));
  }

  .activity-level-1,
  .activity-level-1 span {
    border-width: 2px;
    background: color-mix(in srgb, var(--app-accent-color) 26%, var(--app-background-color));
  }

  .activity-level-2,
  .activity-level-2 span {
    border-width: 2px;
    background-color: color-mix(in srgb, var(--app-accent-color) 48%, var(--app-background-color));
    background-image: repeating-linear-gradient(45deg, transparent 0 3px, color-mix(in srgb, var(--app-text-color) 18%, transparent) 3px 5px);
  }

  .activity-level-3,
  .activity-level-3 span {
    border-width: 3px;
    border-color: color-mix(in srgb, var(--app-accent-color) 75%, var(--app-text-color));
    background-color: color-mix(in srgb, var(--app-accent-color) 76%, var(--app-background-color));
    background-image: repeating-linear-gradient(135deg, transparent 0 2px, color-mix(in srgb, var(--app-background-color) 35%, transparent) 2px 4px);
  }

  .activity-legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--app-space-2-px) var(--app-space-3-px);
    margin: 0 0 var(--app-space-3-px);
    padding: 0;
    color: var(--app-secondary-text-color);
    font-size: calc(var(--app-font-size-base) * 0.76);
    list-style: none;
  }

  .activity-legend li {
    display: inline-flex;
    align-items: center;
    gap: var(--app-space-1-px);
  }

  .legend-swatch {
    width: 1rem;
    min-width: 1rem;
  }

  .table-scroll {
    margin-top: var(--app-space-2-px);
    overflow-x: auto;
    border-radius: var(--app-border-radius-sm);
  }

  .activity-details {
    border-top: 1px solid color-mix(in srgb, var(--app-text-color) 11%, transparent);
    padding-top: var(--app-space-2-px);
  }

  .activity-details summary {
    width: fit-content;
    color: var(--app-primary-action-surface-color);
    font-weight: var(--app-font-weight-semibold);
    cursor: pointer;
  }

  .activity-details summary:focus-visible {
    outline: 3px solid var(--app-accent-color);
    outline-offset: 3px;
    border-radius: var(--app-border-radius-sm);
  }

  .table-scroll:focus-visible {
    outline: 3px solid var(--app-accent-color);
    outline-offset: 2px;
  }

  table {
    width: 100%;
    min-width: 38rem;
    border-collapse: collapse;
    color: var(--app-text-color);
    font-size: calc(var(--app-font-size-base) * 0.82);
  }

  caption {
    padding: 0 0 var(--app-space-2-px);
    color: var(--app-secondary-text-color);
    font-weight: var(--app-font-weight-semibold);
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
    .analytics-section {
      padding: var(--app-space-3-px);
    }

    .activity-strip {
      grid-template-columns: repeat(14, minmax(0, 1fr));
    }
  }

  @media (max-width: 420px) {
    .activity-strip {
      grid-template-columns: repeat(7, minmax(0, 1fr));
    }
  }
</style>
