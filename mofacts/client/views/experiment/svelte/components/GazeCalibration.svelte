<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import GazeDot from './GazeDot.svelte';
  import { gazeState, startGazeCalibration, trainGazeTarget, beginGazeValidation,
    acceptGazeCalibration, cancelGazeCalibration } from '../services/gazeTracking';
  const dispatch = createEventDispatcher();
  const training = [10, 50, 90].flatMap(y => [10, 50, 90].map(x => ({ x, y })));
  const validation = [{ x: 50, y: 50 }, { x: 25, y: 25 }, { x: 75, y: 25 },
    { x: 25, y: 75 }, { x: 75, y: 75 }];
  let stage = 'setup';
  let index = 0;
  let samples = 0;
  let sampling = false;
  let message = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  let run = 0;
  let previewHost: HTMLDivElement;
  $: target = stage === 'training' ? training[index] : validation[index];
  async function start() {
    const token = ++run;
    if (timer) clearTimeout(timer);
    stage = 'starting';
    message = '';
    try {
      await startGazeCalibration();
      if (token !== run) return;
      const preview = document.getElementById('webgazerVideoContainer');
      if (!preview) throw new Error('Gaze camera preview was not initialized');
      previewHost.appendChild(preview);
      index = 0;
      samples = 0;
      sampling = false;
      stage = 'training';
    } catch {
      if (token === run) stage = 'setup';
    }
  }
  function validateNext() {
    timer = setTimeout(() => {
      if (document.hidden) { validateNext(); return; }
      if (index < validation.length - 1) { index++; validateNext(); }
      else stage = 'review';
    }, 3000);
  }
  function train() {
    if (sampling) return;
    sampling = true;
    samples = 0;
    message = '';
    const token = run;
    const sample = () => {
      if (token !== run || finished) return;
      if (document.hidden) { timer = setTimeout(sample, 250); return; }
      const point = training[index];
      if (!trainGazeTarget(window.innerWidth * point.x / 100, window.innerHeight * point.y / 100)) {
        sampling = false;
        message = 'Wait until your face is visible to the camera, then click the target again.';
        return;
      }
      samples++;
      if (samples < 5) { timer = setTimeout(sample, 250); return; }
      sampling = false;
      samples = 0;
      if (index < training.length - 1) index++;
      else { stage = 'validation'; index = 0; beginGazeValidation(); validateNext(); }
    };
    sample();
  }
  function stopTimers() {
    run++;
    if (timer) clearTimeout(timer);
    sampling = false;
  }
  function finish(accept: boolean) {
    stopTimers();
    finished = true;
    if (accept) acceptGazeCalibration(); else cancelGazeCalibration();
    dispatch('complete');
  }
  onDestroy(() => {
    stopTimers();
    if (!finished) cancelGazeCalibration();
    // The gaze service retains the hidden camera between lesson units and
    // owns its eventual release. Do not destroy its DOM with this component.
    const preview = previewHost?.querySelector('#webgazerVideoContainer');
    if (preview) document.body.appendChild(preview);
  });
</script>

<section class="calibration" aria-label="Gaze calibration">
  <div class="calibration-preview" bind:this={previewHost} aria-label="Camera preview"></div>
  <h2>Gaze calibration</h2>
  <p role="status">{$gazeState.status}</p>
  {#if stage === 'setup' || stage === 'starting'}
    <p>Allow camera access, then click each target once and keep looking at it for one second.
      Camera images and calibration stay on this device for this lesson. No gaze data is saved.</p>
    <button disabled={stage === 'starting'} on:click={start}>Start calibration</button>
    <button on:click={() => finish(false)}>Continue without tracking</button>
  {:else if stage === 'training'}
    <p role="status">Target {index + 1} of 9. {sampling ? 'Keep looking at the target while samples are collected.' : 'Look at the target and click it once.'}</p>
    <button class="target" disabled={sampling} aria-label={`Calibration target ${index + 1}`}
      style:left={`${target.x}vw`} style:top={`${target.y}vh`} on:click={train}></button>
    <p role="status">{message}</p>
  {:else if stage === 'validation'}
    <p>Look at the blue target, not the red dot. Does the red dot land near it?</p>
    <div class="target validation" aria-hidden="true"
      style:left={`${target.x}vw`} style:top={`${target.y}vh`}></div>
    <GazeDot />
  {:else}
    <p>Calibration check complete. Continue to inspect the dot during practice, or recalibrate.</p>
    <button disabled={$gazeState.status !== 'Calibration'} on:click={() => finish(true)}>Continue</button>
    <button on:click={start}>Recalibrate</button>
    <button on:click={() => finish(false)}>Continue without tracking</button>
    <GazeDot />
  {/if}
  {#if stage === 'training' || stage === 'validation'}
    <button on:click={start}>Restart calibration</button>
    <button on:click={() => finish(false)}>Continue without tracking</button>
  {/if}
</section>

<style>
  .calibration { padding: 1rem; min-height: 75vh; display: flow-root; }
  .calibration-preview { float: right; width: min(40%, 320px); aspect-ratio: 4 / 3;
    margin: 0 0 1rem 1rem; pointer-events: none; }
  .calibration-preview :global(#webgazerVideoContainer) {
    position: relative !important; top: auto !important; left: auto !important;
    width: 100% !important; height: 100% !important;
  }
  .calibration-preview :global(video), .calibration-preview :global(canvas) {
    width: 100% !important; height: 100% !important;
  }
  .target { position: fixed; width: 24px; height: 24px; border-radius: 50%;
    background: #0064c8; border: 3px solid white; outline: 2px solid black;
    transform: translate(-50%, -50%); z-index: 9999; }
  button { margin: .5rem; }
  button.target { margin: 0; }
  button:focus-visible { outline: 3px solid #ffbf00; }
</style>
