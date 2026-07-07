<script>
  import { getActiveUiLocale } from '../../../../lib/interfaceLocaleState';
  import { translatePlatformString } from '../../../../lib/interfaceI18n';

  /**
   * PerformanceArea Component
   * Time + Correct stats with shared timeout bar
   * Switches between question timeout and feedback countdown
   */

  /** @type {boolean} Whether to show time/correct performance stats */
  export let showPerformanceStats = true;

  /** @type {boolean} Whether to show timeout progress bar */
  export let showTimeoutBar = true;

  /** @type {boolean} Whether to show numeric timeout countdown text */
  export let showTimeoutCountdown = true;

  /** @type {string} Total time display in minutes (string from legacy format) */
  export let totalTimeDisplay = '0.0';

  /** @type {string} Percent correct (legacy format, e.g., "80.00%") */
  export let percentCorrect = '0%';

  /** @type {'question' | 'feedback' | 'none'} Timeout mode */
  export let timeoutMode = 'none';

  /** @type {number} Timeout progress (0-100) */
  export let timeoutProgress = 0;

  /** @type {number} Remaining time in seconds */
  export let remainingTime = 0;

  $: hasVisibleTimeout = (showTimeoutBar || showTimeoutCountdown) && timeoutMode !== 'none';

  function platformText(key, values) {
    return translatePlatformString(getActiveUiLocale(), key, values);
  }

</script>

<div
  class="performance-area"
  class:performance-area-stats-only={showPerformanceStats && !showTimeoutBar && !showTimeoutCountdown}
  class:performance-area-timeout-only={!showPerformanceStats && (showTimeoutBar || showTimeoutCountdown)}
>
  {#if showPerformanceStats}
    <div class="performance-stats" aria-label={platformText('performance.sessionStats')}>
      <div class="stat-item">
        <span class="stat-label" id="card-stat-time-label">{platformText('performance.time')}</span>
        <span class="stat-value" aria-labelledby="card-stat-time-label">
          {totalTimeDisplay}<span class="stat-unit">{platformText('performance.minutesAbbrev')}</span>
        </span>
      </div>

      <span class="stat-divider" aria-hidden="true"></span>

      <div class="stat-item">
        <span class="stat-label" id="card-stat-accuracy-label">{platformText('performance.correct')}</span>
        <span class="stat-value" aria-labelledby="card-stat-accuracy-label">
          {percentCorrect}
        </span>
      </div>
    </div>
  {/if}

  {#if showTimeoutBar || showTimeoutCountdown}
    <div
      class="timeout-bar-container"
      class:timeout-bar-container-placeholder={!hasVisibleTimeout}
      aria-hidden={!hasVisibleTimeout}
    >
      {#if showTimeoutCountdown}
        <div class="timeout-label">
          {#if timeoutMode === 'question'}
            {platformText('performance.timeRemaining', { seconds: remainingTime })}
          {:else if timeoutMode === 'feedback'}
            {platformText('performance.continuingIn', { seconds: remainingTime })}
          {:else}
            {platformText('performance.timeRemaining', { seconds: 0 })}
          {/if}
        </div>
      {/if}
      {#if showTimeoutBar}
        <div class="timeout-bar-wrapper">
          <div
            class="timeout-bar"
            class:warning={timeoutProgress > 50}
            class:critical={timeoutProgress > 80}
            style="--timeout-progress: {timeoutProgress}%"
          ></div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .performance-area {
    background-color: var(--app-background-color);
    padding: calc(0.375rem * var(--app-density-scale)) var(--app-space-2);
    margin-bottom: 0.5rem;
    flex-shrink: 0;
    text-align: center;
  }

  .performance-area-stats-only {
    margin-bottom: 0;
  }

  .performance-area-timeout-only {
    padding-top: var(--app-space-1);
  }

  .performance-stats {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    gap: clamp(var(--app-space-2), 1vw, calc(0.75rem * var(--app-density-scale)));
    padding: var(--app-space-0) clamp(var(--app-space-2), 2vw, calc(0.75rem * var(--app-density-scale)));
    height: var(--app-space-5-px);
    line-height: 1;
    border-radius: var(--border-radius-pill, 999px);
    background-color: var(--app-background-color);
    margin: 0 auto;
    width: fit-content;
    min-width: 220px;
  }

  .stat-item {
    display: inline-flex;
    align-items: center;
    gap: var(--app-space-1);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .stat-label {
    font-size: calc(var(--app-font-size-base) * 0.7);
    letter-spacing: var(--app-label-letter-spacing);
    text-transform: var(--app-label-text-transform);
    color: var(--app-secondary-text-color);
  }

  .stat-value {
    font-size: calc(var(--app-font-size-base) * 0.82);
    font-weight: var(--app-font-weight-bold);
    color: var(--app-primary-action-text-color);
  }

  .stat-unit {
    font-size: calc(var(--app-font-size-base) * 0.7);
    font-weight: var(--app-font-weight-medium);
    color: var(--app-secondary-text-color);
  }

  .stat-divider {
    display: inline-block;
    width: 1px;
    height: var(--app-space-4-px);
    background: var(--learning-card-performance-divider-color);
  }

  .timeout-bar-container {
    margin-top: calc(0.375rem * var(--app-density-scale));
  }

  .timeout-bar-container-placeholder {
    visibility: hidden;
  }

  .timeout-label {
    font-size: calc(var(--app-font-size-base) * 0.75);
    font-weight: var(--app-font-weight-semibold);
    color: var(--app-secondary-text-color);
    margin-bottom: calc(0.2rem * var(--app-density-scale));
    text-align: center;
  }

  .timeout-bar-wrapper {
    width: 100%;
    height: var(--app-space-2-px);
    background-color: var(--app-background-color);
    border-radius: var(--app-border-radius-sm);
    overflow: hidden;
  }

  .timeout-bar {
    height: 100%;
    width: var(--timeout-progress, 0%);
    background-color: var(--feedback-correct-color);
    transition: width var(--app-transition-fast) linear, background-color var(--app-transition-fast) ease;
  }

  .timeout-bar.warning {
    background-color: var(--app-accent-color);
  }

  .timeout-bar.critical {
    background-color: var(--feedback-error-color);
  }

  /* Mobile responsiveness */
  @media (max-width: 768px) {
    .performance-stats {
      gap: var(--app-space-2);
      min-width: 180px;
    }

    .stat-label {
      font-size: calc(var(--app-font-size-base) * 0.65);
    }

    .stat-value {
      font-size: calc(var(--app-font-size-base) * 0.75);
    }

    .timeout-label {
      font-size: calc(var(--app-font-size-base) * 0.7);
    }

    .timeout-bar-wrapper {
      height: calc(6px * var(--app-density-scale));
    }
  }
</style>
