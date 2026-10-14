<script>
  import { getActiveUiLocale } from '../../../../lib/interfaceLocaleState';
  import { translatePlatformString } from '../../../../lib/interfaceI18n';

  export let snapshot;
  let expanded = false;

  function handleToggleKey(event) {
    if (event.key === 'Escape' && expanded) {
      expanded = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function platformText(key, values) {
    return translatePlatformString(getActiveUiLocale(), key, values);
  }

  function barWidth(value, total) {
    if (!Number.isFinite(total) || total <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, (value / total) * 100));
  }

  function markerPosition(value, total) {
    return barWidth(value, total);
  }

  function formatProgressCount(value) {
    if (!Number.isFinite(value)) {
      return '0';
    }
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  function formatTurnCount(value) {
    return value === 1
      ? platformText('autoTutor.oneTurn')
      : platformText('autoTutor.turnCount', { count: value });
  }
</script>

<details class="sparc-auto-tutor-progress-popout" bind:open={expanded}>
  <summary aria-label={platformText('autoTutor.progress')} on:keydown={handleToggleKey}>
    <svg viewBox="0 0 24 24" aria-hidden="true" class:expanded>
      <path d="m15 6-6 6 6 6" />
    </svg>
    <span>{platformText('learningProgress.progress')}</span>
  </summary>
  <section class="sparc-auto-tutor-progress" aria-label={platformText('autoTutor.progress')}>

  <div class="sparc-auto-tutor-meter-row">
    <div class="sparc-auto-tutor-meter-copy">
      <span>{platformText('autoTutor.expectations')}</span>
      <strong>{formatProgressCount(snapshot.coveredExpectations)}/{snapshot.requiredExpectations}</strong>
    </div>
    <div
      class="sparc-auto-tutor-progress-track"
      role="meter"
      aria-label={platformText('autoTutor.coveredExpectations')}
      aria-valuemin="0"
      aria-valuemax={snapshot.requiredExpectations}
      aria-valuenow={snapshot.coveredExpectations}
    >
      <div
        class="sparc-auto-tutor-progress-fill"
        style={`width: ${barWidth(snapshot.coveredExpectations, snapshot.requiredExpectations)}%;`}
      ></div>
      <div
        class="sparc-auto-tutor-progress-marker"
        style={`left: ${markerPosition(snapshot.neededExpectations, snapshot.requiredExpectations)}%;`}
        aria-hidden="true"
      ></div>
    </div>
  </div>

  <div class="sparc-auto-tutor-meter-row">
    <div class="sparc-auto-tutor-meter-copy">
      <span>{platformText('autoTutor.misconceptions')}</span>
      <strong>{formatProgressCount(snapshot.misconceptionScore)}/{snapshot.totalMisconceptions}</strong>
    </div>
    <div
      class="sparc-auto-tutor-progress-track sparc-auto-tutor-progress-track-misconceptions"
      role="meter"
      aria-label={platformText('autoTutor.misconceptionScore')}
      aria-valuemin="0"
      aria-valuemax={snapshot.totalMisconceptions}
      aria-valuenow={snapshot.misconceptionScore}
    >
      <div
        class="sparc-auto-tutor-progress-fill sparc-auto-tutor-progress-fill-misconceptions"
        style={`width: ${barWidth(snapshot.misconceptionScore, snapshot.totalMisconceptions)}%;`}
      ></div>
      <div
        class="sparc-auto-tutor-progress-marker"
        style={`left: ${markerPosition(snapshot.maxActiveMisconceptions, snapshot.totalMisconceptions)}%;`}
        aria-hidden="true"
      ></div>
    </div>
  </div>

  <div class="sparc-auto-tutor-turns">
    {formatTurnCount(snapshot.turnCount)}
  </div>
</section>
</details>

<style>
  .sparc-auto-tutor-progress-popout {
    position: absolute;
    top: var(--app-space-2);
    right: var(--app-space-2);
    z-index: 3;
    width: max-content;
    max-width: calc(100% - var(--app-space-2) - var(--app-space-2));
    border: 1px solid var(--sparc-border-color);
    border-radius: var(--sparc-border-radius-sm);
    color: var(--app-text-color);
    background: var(--learning-card-surface-color);
    box-shadow: 0 3px 12px rgb(0 0 0 / 12%);
  }

  .sparc-auto-tutor-progress-popout[open] {
    width: min(24rem, calc(100% - var(--app-space-2) - var(--app-space-2)));
  }

  summary {
    display: flex;
    align-items: center;
    gap: var(--app-space-2);
    padding: calc(0.45rem * var(--app-density-scale)) calc(0.7rem * var(--app-density-scale));
    font-size: calc(var(--app-font-size-base) * 0.85);
    font-weight: 600;
    line-height: 1.25;
    list-style: none;
    cursor: pointer;
    border-radius: inherit;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary:focus-visible {
    outline: 2px solid var(--app-text-color);
    outline-offset: 2px;
  }

  summary svg {
    flex: 0 0 1rem;
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    transition: transform 160ms ease;
  }

  summary svg.expanded {
    transform: rotate(180deg);
  }

  .sparc-auto-tutor-progress {
    display: flex;
    flex-direction: column;
    gap: calc(0.35rem * var(--app-density-scale));
    min-width: 0;
    max-width: 24rem;
    padding: var(--app-space-3);
    border-top: 1px solid var(--sparc-border-color);
    color: var(--app-text-color);
  }

  .sparc-auto-tutor-progress-popout[open] .sparc-auto-tutor-progress {
    animation: reveal-progress 160ms ease-out;
  }

  @keyframes reveal-progress {
    from { opacity: 0; transform: translateX(0.5rem); }
    to { opacity: 1; transform: translateX(0); }
  }

  .sparc-auto-tutor-meter-row {
    display: grid;
    grid-template-columns: minmax(7.5rem, 9rem) minmax(0, 1fr);
    gap: var(--app-space-2);
    align-items: center;
  }

  .sparc-auto-tutor-meter-copy {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: calc(0.4rem * var(--app-density-scale));
    min-width: 0;
    font-size: calc(var(--app-font-size-base) * 0.75);
    font-weight: 600;
  }

  .sparc-auto-tutor-meter-copy span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sparc-auto-tutor-meter-copy strong {
    flex: 0 0 auto;
    font-size: calc(var(--app-font-size-base) * 0.78);
    font-variant-numeric: tabular-nums;
  }

  .sparc-auto-tutor-progress-track {
    position: relative;
    width: 100%;
    height: calc(10px * var(--app-density-scale));
    border: 1px solid var(--app-secondary-surface-color);
    border-radius: var(--app-border-radius-sm);
    background: var(--learning-card-surface-color);
    box-sizing: border-box;
  }

  .sparc-auto-tutor-progress-fill {
    position: absolute;
    inset: 0 auto 0 0;
    height: 100%;
    background: var(--learning-card-primary-action-surface-color);
    border-radius: var(--app-border-radius-sm);
  }

  .sparc-auto-tutor-progress-fill-misconceptions {
    background: var(--warning-color, var(--app-accent-color));
  }

  .sparc-auto-tutor-progress-marker {
    position: absolute;
    top: calc(-3px * var(--app-density-scale));
    bottom: calc(-3px * var(--app-density-scale));
    width: calc(2px * var(--app-density-scale));
    border-radius: 999px;
    background: var(--app-text-color);
    opacity: 0.65;
    transform: translateX(calc(-1px * var(--app-density-scale)));
  }

  .sparc-auto-tutor-turns {
    color: var(--app-secondary-text-color);
    font-size: calc(var(--app-font-size-base) * 0.74);
  }

  @media (prefers-reduced-motion: reduce) {
    summary svg {
      transition: none;
    }

    .sparc-auto-tutor-progress-popout[open] .sparc-auto-tutor-progress {
      animation: none;
    }
  }
</style>
