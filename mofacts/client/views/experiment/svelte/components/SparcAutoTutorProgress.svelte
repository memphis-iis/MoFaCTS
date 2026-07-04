<script>
  import {
    buildSparcAutoTutorProgressSnapshot,
  } from '../services/sparcAutoTutorProgress';

  export let display = null;
  export let runtimeNodeValues = {};

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

  $: snapshot = buildSparcAutoTutorProgressSnapshot({ display, runtimeNodeValues });
</script>

<section class="sparc-auto-tutor-progress" aria-label="AutoTutor progress">
  <div class="sparc-auto-tutor-progress-title">Progress</div>

  <div class="sparc-auto-tutor-meter-row">
    <div class="sparc-auto-tutor-meter-copy">
      <span>Expectations</span>
      <strong>{formatProgressCount(snapshot.coveredExpectations)}/{snapshot.requiredExpectations}</strong>
    </div>
    <div
      class="sparc-auto-tutor-progress-track"
      role="meter"
      aria-label="Covered expectations"
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
      <span>Misconceptions</span>
      <strong>{formatProgressCount(snapshot.misconceptionScore)}/{snapshot.totalMisconceptions}</strong>
    </div>
    <div
      class="sparc-auto-tutor-progress-track sparc-auto-tutor-progress-track-misconceptions"
      role="meter"
      aria-label="Misconception score"
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
    {snapshot.turnCount === 1 ? '1 turn' : `${snapshot.turnCount} turns`}
  </div>
</section>

<style>
  .sparc-auto-tutor-progress {
    display: flex;
    flex-direction: column;
    gap: calc(0.35rem * var(--app-density-scale));
    min-width: 15rem;
    max-width: 24rem;
    color: var(--app-text-color);
  }

  .sparc-auto-tutor-progress-title {
    font-size: calc(var(--app-font-size-base) * 0.9);
    font-weight: 700;
    line-height: 1.1;
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

  @media (max-width: 768px) {
    .sparc-auto-tutor-progress {
      min-width: 0;
      max-width: none;
      width: 100%;
    }
  }
</style>
