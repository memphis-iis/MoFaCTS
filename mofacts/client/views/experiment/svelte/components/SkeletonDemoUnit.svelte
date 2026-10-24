<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Session } from 'meteor/session';
  import PoseCameraPreview from './PoseCameraPreview.svelte';
  import { createCameraCapture } from '../services/cameraCapture';
  import { createPoseTracking, type PoseObservation, type PoseConnection } from '../services/poseTracking';
  import { initializeEngine } from '../services/unitEngineService';
  import { unitIsFinished } from '../services/unitProgression';
  import { setEngine } from '../../../../lib/engineManager';
  import { finishLaunchLoading } from '../../../../lib/launchLoading';
  import { resolveUnitEngineTypeForUnit } from '../../engineConstructors';

  let videoElement: HTMLVideoElement;
  let observation: PoseObservation | null = null;
  let connections: readonly PoseConnection[] = [];
  let status = 'Choose Start camera to see your skeleton.';
  let error = '';
  let active = false;
  let starting = false;
  let completing = false;
  let facingMode: 'user' | 'environment' | undefined;
  let mounted = true;
  let generation = 0;
  let engine: Awaited<ReturnType<typeof initializeEngine>> | null = null;
  const camera = createCameraCapture();
  const tracking = createPoseTracking();

  function stop(): void {
    generation++;
    tracking.stop();
    camera.stop();
    observation = null;
    connections = [];
    active = false;
    starting = false;
    status = 'Camera stopped. Choose Start camera to try again.';
  }

  function fail(): void {
    stop();
    error = 'Camera or pose tracking is unavailable. Check camera permission, close other camera applications, and try Start camera again.';
  }

  async function start(): Promise<void> {
    stop();
    const token = generation;
    error = '';
    starting = true;
    status = 'Starting camera and loading body tracking…';
    try {
      await camera.start(videoElement, fail, facingMode);
      if (token !== generation) return;
      await tracking.start(videoElement, (frame, edges) => {
        if (token !== generation) return;
        observation = frame;
        connections = edges;
        status = frame.landmarks.length ? 'Body detected. Move your arms and compare the skeleton with your position.'
          : 'No body detected. Keep your head and shoulders in view and move back if needed.';
      }, fail);
      if (token !== generation) return;
      starting = false;
      active = true;
      status = 'Looking for a person…';
    } catch (cause) {
      if (token === generation) {
        fail();
        if (facingMode && cause instanceof DOMException && (cause.name === 'OverconstrainedError' || cause.name === 'NotFoundError')) {
          error = 'The selected camera is unavailable. Use Switch camera to select the other camera, then try Start camera again.';
        }
      }
    }
  }

  function switchCamera(): void {
    if (starting || completing) return;
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    error = '';
    if (active) void start();
    else status = `${facingMode === 'environment' ? 'Rear' : 'Front'} camera selected. Choose Start camera to begin.`;
  }

  async function complete(): Promise<void> {
    if (!engine || completing) return;
    completing = true;
    stop();
    try {
      if (typeof engine.completeDemo !== 'function') throw new Error('Skeleton demo engine is not ready');
      engine.completeDemo();
      await unitIsFinished('Skeleton demo complete');
    } catch {
      error = 'Unable to continue. Please try Continue again.';
      completing = false;
    }
  }

  onMount(() => {
    const initialize = async () => {
      const type = resolveUnitEngineTypeForUnit(Session.get('currentTdfUnit'), 'skeletonDemo.entry');
      return initializeEngine(Session.get('currentTdfFile'), Session.get('currentUnitNumber'), type);
    };
    void initialize()
      .then(created => { if (mounted) { engine = created; setEngine(created); } })
      .catch(() => { if (mounted) error = 'Unable to initialize the skeleton demo unit.'; })
      .finally(() => { if (mounted) finishLaunchLoading('skeleton-demo-ready'); });
  });
  onDestroy(() => { mounted = false; stop(); });
  function visibilityChanged(): void {
    if (document.hidden && (active || starting)) stop();
  }
</script>

<svelte:document on:visibilitychange={visibilityChanged} />
<svelte:window on:pagehide={stop} />
<section class="skeleton-demo" aria-label="Skeleton demo">
  <h2>Skeleton demo</h2>
  <p>Start the camera, then move your head, shoulders, and arms to inspect the skeleton overlay.</p>
  <div class="skeleton-demo-controls">
    {#if active || starting}
      <button type="button" class="btn btn-secondary" on:click={stop}>Stop camera</button>
    {:else}
      <button type="button" class="btn btn-secondary" disabled={!engine || completing} on:click={start}>Start camera</button>
    {/if}
    <button type="button" class="btn btn-secondary skeleton-demo-switch-camera"
      disabled={!engine || starting || completing} on:click={switchCamera}
      aria-label={`Switch camera to ${facingMode === 'environment' ? 'front' : 'rear'}`}>Switch camera</button>
    <button type="button" class="btn btn-primary" disabled={!engine || completing} on:click={complete}>Continue</button>
  </div>
  <p role="status">{status}</p>
  {#if error}<p role="alert">{error}</p>{/if}
  <PoseCameraPreview bind:videoElement {observation} {connections} mirrored={facingMode !== 'environment'} />
  <p>Camera images and body positions stay on this device and are not recorded or saved.
    The front camera preview is mirrored; the rear camera preview is not.</p>
</section>
