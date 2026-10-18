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
