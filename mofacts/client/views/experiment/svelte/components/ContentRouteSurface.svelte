<script>
  import { onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { Tracker } from 'meteor/tracker';
  import { Session } from 'meteor/session';
  import ContentSurface from './ContentSurface.svelte';
  import GazeCalibration from './GazeCalibration.svelte';
  import GazeDot from './GazeDot.svelte';
  import { contentSurfaceRevision } from '../services/contentSurfaceInstance';
  import { unitIsFinished } from '../services/unitProgression';
  import { gazeState, getGazeContext, setGazeContext, cancelGazeCalibration } from '../services/gazeTracking';
  import { initializeEngine } from '../services/unitEngineService';
  import { getEngine, setEngine } from '../../../../lib/engineManager';
  import { resolveUnitEngineTypeForUnit } from '../../engineConstructors';
  import { finishLaunchLoading } from '../../../../lib/launchLoading';
  export let tdfId;
  export let unitId;
  export let userId;
  let unit = null;
  let recalibrating = false;
  let initialCalibrationPending = false;
  let lastUnit;
  let engineReady = Promise.resolve();
  let engineError = '';
  let entryGeneration = 0;
  const computation = Tracker.autorun(() => {
    const file = Session.get('currentTdfFile');
    const number = Session.get('currentUnitNumber');
    unit = Session.get('currentTdfUnit');
    const entryKey = `${Session.get('currentTdfId')}:${number}:${Boolean(unit?.gazecalibrationsession)}:${unit?.gazeTracking === true}`;
    if (lastUnit !== entryKey) {
      initialCalibrationPending = unit?.gazeTracking === true &&
        (getGazeContext().lessonId !== String(tdfId || '') || !get(gazeState).calibrated);
      recalibrating = initialCalibrationPending;
      lastUnit = entryKey;
      engineError = '';
      const token = ++entryGeneration;
      if (unit?.gazecalibrationsession) {
        const type = resolveUnitEngineTypeForUnit(unit, 'gazeCalibration.entry');
        engineReady = initializeEngine(file, number, type).then(engine => {
          if (token === entryGeneration) setEngine(engine);
        }).catch(error => { engineError = error.message; });
      }
    }
    if (unit?.gazecalibrationsession || initialCalibrationPending) finishLaunchLoading('gaze-calibration-ready');
  });
  $: calibrationUnit = Boolean(unit?.gazecalibrationsession);
  $: enabled = unit?.gazeTracking === true;
  $: setGazeContext({ lessonId: String(tdfId || ''), unitId: Number(unitId), enabled: enabled && !calibrationUnit });
  async function completeCalibration() {
    if (calibrationUnit) {
      await engineReady;
      if (engineError) return;
      const engine = getEngine();
      if (!engine || typeof engine.completeCalibration !== 'function') throw new Error('Calibration engine is not ready');
      engine.completeCalibration();
      await unitIsFinished('Gaze calibration complete');
    }
    else {
      recalibrating = false;
      initialCalibrationPending = false;
    }
  }
  onDestroy(() => {
    entryGeneration++;
    computation.stop();
    cancelGazeCalibrationIfOpen();
    setGazeContext({ lessonId: String(tdfId || ''), unitId: Number(unitId), enabled: false });
  });
  function cancelGazeCalibrationIfOpen() {
    if (recalibrating) cancelGazeCalibration();
  }
</script>

{#if calibrationUnit}
  {#if engineError}<p role="alert">{engineError}</p>{:else}<GazeCalibration on:complete={completeCalibration} />{/if}
{:else}
  {#if !initialCalibrationPending}
    {#key $contentSurfaceRevision}
      <ContentSurface {tdfId} {unitId} {userId} {...$$restProps} />
    {/key}
  {/if}
  {#if enabled}
    <aside class="gaze-status" aria-label="Gaze tracking">
      <span role="status">{$gazeState.status}</span>
      {#if !$gazeState.calibrated && !recalibrating}
        <button on:click={() => recalibrating = true}>Calibrate gaze</button>
      {/if}
    </aside>
    {#if recalibrating}
      <div class="calibration-panel"><GazeCalibration on:complete={completeCalibration} /></div>
    {:else}
      <GazeDot />
    {/if}
  {/if}
{/if}
<style>
  .gaze-status { position: fixed; bottom: .5rem; right: .5rem; z-index: 9998;
    padding: .3rem; background: white; color: black; border: 1px solid #555; }
  .calibration-panel { background: white; color: black; border: 1px solid #555; }
</style>
