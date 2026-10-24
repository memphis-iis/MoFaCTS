import type { PoseLandmarker, HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';

export interface PoseObservation {
  readonly landmarks: readonly NormalizedLandmark[];
  readonly hands: readonly (readonly NormalizedLandmark[])[];
  // Monotonic inference timestamp, not a claim of sensor capture time.
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

// Each consumer owns its instance; no global camera, frame buffer, or sample history.
export function createPoseTracking() {
  let generation = 0;
  let landmarker: PoseLandmarker | null = null;
  let handLandmarker: HandLandmarker | null = null;
  let animationFrame: number | null = null;

  function stop(): void {
    generation++;
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    landmarker?.close();
    landmarker = null;
    handLandmarker?.close();
    handLandmarker = null;
  }

  async function start(
    video: HTMLVideoElement,
    onFrame: (observation: PoseObservation, connections: readonly PoseConnection[], handConnections: readonly PoseConnection[]) => void,
    onError: (error: unknown) => void,
  ): Promise<void> {
    stop();
    const token = generation;
    const { FilesetResolver, PoseLandmarker, HandLandmarker } = await import('@mediapipe/tasks-vision');
    if (token !== generation) return;
    const files = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
    if (token !== generation) return;
    const created = await PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/mediapipe/pose_landmarker_full.task', delegate: 'CPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
      outputSegmentationMasks: false,
    });
    if (token !== generation) { created.close(); return; }
    landmarker = created;
    let hands: HandLandmarker;
    try {
      hands = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/mediapipe/hand_landmarker.task', delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2,
      });
    } catch (error) {
      if (token === generation) stop();
      throw error;
    }
    if (token !== generation) { hands.close(); return; }
    handLandmarker = hands;
    let lastVideoTime = -1;
    let lastInference = -Infinity;
    function frame(timestamp: number): void {
      if (token !== generation) return;
      // Bound synchronous inference to 15 Hz; skip repeated decoded frames.
      if (!document.hidden && video.readyState >= 2 && video.currentTime !== lastVideoTime
        && timestamp - lastInference >= 1000 / 15) {
        lastVideoTime = video.currentTime;
        lastInference = timestamp;
        try {
          const result = created.detectForVideo(video, timestamp);
          const handResult = hands.detectForVideo(video, timestamp);
          onFrame({ landmarks: result.landmarks[0] ?? [], hands: handResult.landmarks, timestamp,
            width: video.videoWidth, height: video.videoHeight }, PoseLandmarker.POSE_CONNECTIONS, HandLandmarker.HAND_CONNECTIONS);
        } catch (error) {
          stop();
          onError(error);
          return;
        }
      }
      if (token === generation) animationFrame = requestAnimationFrame(frame);
    }
    animationFrame = requestAnimationFrame(frame);
  }

  return { start, stop };
}
