<script>
  /**
   * PerformanceArea Component
   * Time + Correct stats with shared timeout bar
   * Switches between question timeout and feedback countdown
   */

  /** @type {boolean} Whether to show timeout bar */
  export let showTimeoutBar = true;

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

</script>

<div class="performance-area">
  <div class="performance-stats">
    <div class="stat-item">
      <span class="stat-label" id="card-stat-time-label">Time</span>
      <span class="stat-value" aria-labelledby="card-stat-time-label">
        {totalTimeDisplay}<span class="stat-unit">min</span>
      </span>
    </div>

    <span class="stat-divider" aria-hidden="true"></span>

    <div class="stat-item">
      <span class="stat-label" id="card-stat-accuracy-label">Correct</span>
      <span class="stat-value" aria-labelledby="card-stat-accuracy-label">
        {percentCorrect}
      </span>
    </div>
  </div>

  {#if showTimeoutBar && timeoutMode !== 'none'}
    <div class="timeout-bar-container">
      <div class="timeout-label">
        {#if timeoutMode === 'question'}
          Time remaining: {remainingTime}s
        {:else if timeoutMode === 'feedback'}
          Continuing in: {remainingTime}s
        {/if}
      </div>
      <div class="timeout-bar-wrapper">
        <div
          class="timeout-bar"
          class:warning={timeoutProgress > 50}
          class:critical={timeoutProgress > 80}
          style="--timeout-progress: {timeoutProgress}%"
        ></div>
      </div>
    </div>
  {/if}
</div>

<style>
  .performance-area {
    background-color: var(--card-background-color);
    border-bottom: 1px solid var(--secondary-color);
    padding: 0.375rem 0.5rem;
    margin-bottom: 0.5rem;
    flex-shrink: 0;
    text-align: center;
  }

  .performance-stats {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    gap: clamp(0.5rem, 1vw, 0.75rem);
    padding: 0 clamp(0.5rem, 2vw, 0.75rem);
    height: 24px;
    line-height: 1;
    border-radius: var(--border-radius-pill, 999px);
    background-color: var(--neutral-color, #ffffff);
    margin: 0 auto;
    width: fit-content;
    min-width: 220px;
  }

  .stat-item {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .stat-label {
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--secondary-text-color);
  }

  .stat-value {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-color);
  }

  .stat-unit {
    font-size: 0.7rem;
    font-weight: 500;
    color: var(--secondary-text-color);
  }

  .stat-divider {
    display: inline-block;
    width: 1px;
    height: 16px;
    background: var(--performance-divider-color);
  }

  .timeout-bar-container {
    margin-top: 0.375rem;
  }

  .timeout-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--secondary-text-color);
    margin-bottom: 0.2rem;
    text-align: center;
  }

  .timeout-bar-wrapper {
    width: 100%;
    height: 8px;
    background-color: var(--secondary-color);
    border-radius: var(--border-radius-sm);
    overflow: hidden;
  }

  .timeout-bar {
    height: 100%;
    width: var(--timeout-progress, 0%);
    background-color: var(--success-color);
    transition: width var(--transition-fast) linear, background-color var(--transition-fast) ease;
  }

  .timeout-bar.warning {
    background-color: var(--accent-color);
  }

  .timeout-bar.critical {
    background-color: var(--alert-color);
  }

  /* Mobile responsiveness */
  @media (max-width: 768px) {
    .performance-stats {
      gap: 0.5rem;
      min-width: 180px;
    }

    .stat-label {
      font-size: 0.65rem;
    }

    .stat-value {
      font-size: 0.75rem;
    }

    .timeout-label {
      font-size: 0.7rem;
    }

    .timeout-bar-wrapper {
      height: 6px;
    }
  }
</style>
