<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Session } from 'meteor/session';
  import PoseCameraPreview from './PoseCameraPreview.svelte';
  import FigureOverlay from './FigureOverlay.svelte';
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
  let handConnections: readonly PoseConnection[] = [];
  let status = 'Choose Start camera to see your skeleton.';
  let error = '';
  let active = false;
  let starting = false;
  let completing = false;
  let cameraIds: string[] = [];
  let currentCameraId: string | undefined;
  let mirrored = true;
  let cameraVisible = true;
  let wireframeVisible = true;
  $: canSwitchCamera = active && cameraIds.length > 1 && cameraIds.includes(currentCameraId ?? '');
  let mounted = true;
  let generation = 0;
  let engine: Awaited<ReturnType<typeof initializeEngine>> | null = null;
  const camera = createCameraCapture();
  const tracking = createPoseTracking();
  let figureSurface: FigureOverlay;
  let figureReady = false;
  let figureFailed = false;
  function figureUnavailable(): void {
    figureFailed = true; figureReady = false; stop();
    error = 'The 3D figures are unavailable. Reload this page to try again.';
  }

  function stop(): void {
    generation++;
    tracking.stop();
    figureSurface?.resetGestures();
    camera.stop();
    observation = null;
    connections = [];
    handConnections = [];
    active = false;
    starting = false;
    cameraIds = [];
    currentCameraId = undefined;
    status = 'Camera stopped. Choose Start camera to try again.';
  }

  function fail(): void {
    stop();
    error = 'Camera or pose tracking is unavailable. Check camera permission, close other camera applications, and try Start camera again.';
  }

  async function start(deviceId?: string): Promise<void> {
    stop();
    const token = generation;
    error = '';
    starting = true;
    status = 'Opening camera…';
    try {
      const capture = await camera.start(videoElement, fail, deviceId);
      if (token !== generation) return;
      cameraIds = capture.cameraIds;
      currentCameraId = capture.deviceId;
      mirrored = capture.mirrored;
      status = 'Loading body and finger tracking…';
      await tracking.start(videoElement, (frame, edges, handEdges) => {
        if (token !== generation) return;
        observation = frame;
        connections = edges;
        handConnections = handEdges;
        const control = figureSurface.update(frame, mirrored);
        const detection = frame.landmarks.length ? 'Body detected' : 'No body detected';
        status = `${detection} · ${control.selection ? 'Figure selected.' : control.state === 'ignored' ? 'Fast movement ignored.'
          : control.mode === 'rotation' ? 'Rotate with three fingertips spread apart.'
            : control.mode === 'scaling' ? 'Triple pinch: move up to enlarge, down to shrink.'
              : 'Pinch over a figure on the left to select it.'}`;
      }, fail);
      if (token !== generation) return;
      starting = false;
      active = true;
      status = 'Looking for a person…';
    } catch (cause) {
      if (token === generation) {
        fail();
        if (cause instanceof DOMException && (cause.name === 'OverconstrainedError' || cause.name === 'NotFoundError')) {
          error = deviceId ? 'The selected camera is unavailable. Choose Start camera to reopen your default camera.'
            : `The browser could not open a camera for this page (${cause.name}).`;
        } else if (cause instanceof DOMException && cause.name === 'NotReadableError') {
          error = 'The camera is busy or could not send video. Stop other camera previews, then try Start camera again.';
        }
      }
    }
  }

  function switchCamera(): void {
    if (!canSwitchCamera || starting || completing) return;
    const next = (cameraIds.indexOf(currentCameraId!) + 1) % cameraIds.length;
    void start(cameraIds[next]);
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
  <div class="card skeleton-demo-controls-card">
  <div class="card-body skeleton-demo-toolbar">
  <p class="skeleton-demo-instructions">Pinch an icon to select. Spread three fingers to rotate; triple pinch and move up/down to resize.</p>
  <div class="skeleton-demo-control-row">
  <div class="skeleton-demo-controls">
    {#if active || starting}
      <button type="button" class="btn btn-secondary" on:click={stop}>Stop camera</button>
    {:else}
      <button type="button" class="btn btn-secondary" disabled={!engine || completing || !figureReady || figureFailed} on:click={() => start()}>Start camera</button>
    {/if}
    {#if canSwitchCamera}<button type="button" class="btn btn-secondary" disabled={starting || completing}
      on:click={switchCamera}>Switch camera</button>{/if}
    <button type="button" class="btn btn-primary" disabled={!engine || completing} on:click={complete}>Continue</button>
  </div>
  <div class="skeleton-demo-controls skeleton-demo-visibility" role="group" aria-label="Visible layers">
    <button type="button" class={`btn ${cameraVisible ? 'btn-primary' : 'btn-secondary'}`} aria-label="Camera visibility"
      aria-pressed={cameraVisible} title="Show or hide the camera view; gesture tracking continues"
      on:click={() => cameraVisible = !cameraVisible}>
      <i class="fa fa-video-camera" aria-hidden="true"></i> Camera <span>{cameraVisible ? 'On' : 'Off'}</span>
    </button>
    <button type="button" class={`btn ${wireframeVisible ? 'btn-primary' : 'btn-secondary'}`} aria-label="Wireframe visibility"
      aria-pressed={wireframeVisible} title="Show or hide body and hand tracking lines; gesture tracking continues"
      on:click={() => wireframeVisible = !wireframeVisible}>
      <i class="fa fa-share-alt" aria-hidden="true"></i> Wireframe <span>{wireframeVisible ? 'On' : 'Off'}</span>
    </button>
  </div>
  </div>
  <div class="skeleton-demo-status">
    {#if error}<p role="alert">{error}</p>{:else}<p role="status">{status}</p>{/if}
  </div>
  </div>
  </div>
  <PoseCameraPreview bind:videoElement {observation} {connections} {handConnections} {mirrored} {cameraVisible} {wireframeVisible}>
    <FigureOverlay bind:this={figureSurface} onReady={() => { if (!figureFailed) figureReady = true; }} onError={figureUnavailable} />
  </PoseCameraPreview>
  <p class="skeleton-demo-privacy">Processed on this device. Nothing recorded or uploaded.</p>
</section>
