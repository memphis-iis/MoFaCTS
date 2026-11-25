import type { NormalizedLandmark, Landmark } from '@mediapipe/tasks-vision';
import type { PoseWorkerMessage, PoseWorkerRequest } from './poseTrackingWorker';

export interface PoseObservation {
  readonly landmarks: readonly NormalizedLandmark[];
  readonly worldLandmarks: readonly Landmark[];
  readonly hands: readonly (readonly NormalizedLandmark[])[];
  readonly handWorldLandmarks: readonly (readonly Landmark[])[];
  readonly handedness: readonly string[];
  readonly handednessConfidence: readonly number[];
  // Monotonic inference input timestamp, not a claim of sensor capture time.
  readonly timestamp: number;
  readonly width: number;
  readonly height: number;
}
export interface PoseConnection { readonly start: number; readonly end: number }
export function isInFrameLandmark(point: NormalizedLandmark | undefined): point is NormalizedLandmark {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1);
}
export function isVisiblePoseLandmark(point: NormalizedLandmark | undefined): point is NormalizedLandmark {
  return isInFrameLandmark(point) && point.visibility >= 0.5;
}

export function createPoseTracking() {
  let generation = 0;
  let worker: Worker | null = null;
  let animationFrame: number | null = null;
  let cancelInitialization: (() => void) | null = null;
  let bodyTracking = false;

  function stop(): void {
    generation++;
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    // Termination also releases WASM/models during pending initialization.
    worker?.terminate(); worker = null;
    cancelInitialization?.(); cancelInitialization = null;
  }

  async function start(
    video: HTMLVideoElement,
    onFrame: (observation: PoseObservation, connections: readonly PoseConnection[], handConnections: readonly PoseConnection[]) => void,
    onError: (error: unknown) => void,
  ): Promise<void> {
    stop();
    const token = generation;
    const created = new Worker(new URL('./poseTrackingWorker.ts', import.meta.url));
    worker = created;
    let busy = false;
    let rejectInitialization: (error: Error) => void;
    let ready = false;
    const initialized = new Promise<void>((resolve, reject) => {
      cancelInitialization = resolve;
      rejectInitialization = reject;
      created.onmessage = ({ data }: MessageEvent<PoseWorkerMessage>) => {
        if (token !== generation) return;
        if (data.type === 'ready') { ready = true; cancelInitialization = null; resolve(); }
        else if (data.type === 'error') fail(new Error(data.message));
        else {
          busy = false;
          if (document.hidden) return;
          try { onFrame(data.observation, data.connections, data.handConnections); }
          catch (error) { fail(error); }
        }
      };
    });
    function fail(error: unknown): void {
      if (token !== generation) return;
      if (!ready) rejectInitialization(error instanceof Error ? error : new Error('Pose inference unavailable'));
      stop();
      if (ready) onError(error);
    }
    created.onerror = event => { event.preventDefault(); fail(new Error(event.message || 'Pose worker unavailable')); };
    const initialize: PoseWorkerRequest = { type: 'initialize' };
    try { created.postMessage(initialize); await initialized; }
    catch (error) { if (token === generation) stop(); throw error; }
    if (token !== generation) return;
    let lastVideoTime = -1;
    let lastInference = -Infinity;
    function frame(timestamp: number): void {
      if (token !== generation) return;
      // No queue: one transferred frame at a time, at most 15 Hz, no duplicates.
      if (!busy && !document.hidden && video.readyState >= 2 && video.currentTime !== lastVideoTime
        && timestamp - lastInference >= 1000 / 15) {
        lastVideoTime = video.currentTime;
        lastInference = timestamp;
        busy = true;
        void createImageBitmap(video).then(bitmap => {
          if (token !== generation) { bitmap.close(); return; }
          const request: PoseWorkerRequest = { type: 'frame', bitmap, timestamp, width: bitmap.width, height: bitmap.height, bodyTracking };
          try { created.postMessage(request, [bitmap]); }
          catch (error) { bitmap.close(); fail(error); }
        }).catch(fail);
      }
      animationFrame = requestAnimationFrame(frame);
    }
    animationFrame = requestAnimationFrame(frame);
  }
  return { start, stop, setBodyTracking: (enabled: boolean): void => { bodyTracking = enabled; } };
}
