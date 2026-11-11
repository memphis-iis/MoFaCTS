import type { PoseLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';
import type { PoseObservation, PoseConnection } from './poseTracking';

export type PoseWorkerRequest = { type: 'initialize' } | {
  type: 'frame'; bitmap: ImageBitmap; timestamp: number; width: number; height: number;
};
export type PoseWorkerMessage = { type: 'ready' } | { type: 'error'; message: string } | {
  type: 'frame'; observation: PoseObservation; connections: readonly PoseConnection[]; handConnections: readonly PoseConnection[];
};
const scope = self as unknown as {
  location: { origin: string };
  onmessage: ((event: MessageEvent<PoseWorkerRequest>) => void) | null;
  postMessage(message: PoseWorkerMessage): void;
};
let pose: PoseLandmarker | null = null;
let hands: HandLandmarker | null = null;
let connections: readonly PoseConnection[] = [];
let handConnections: readonly PoseConnection[] = [];

// Separate realm: WebGazer's FaceMesh and Tasks Vision both use Emscripten
// globals. No browser/library globals are patched or shared between them.
scope.onmessage = async ({ data }) => {
  try {
    if (data.type === 'initialize') {
      const { FilesetResolver, PoseLandmarker, HandLandmarker } = await import('@mediapipe/tasks-vision');
      const base = scope.location.origin + '/mediapipe/';
      const files = await FilesetResolver.forVisionTasks(base + 'wasm');
      pose = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: base + 'pose_landmarker_full.task', delegate: 'CPU' },
        canvas: new OffscreenCanvas(1, 1), runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: false,
      });
      hands = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: base + 'hand_landmarker.task', delegate: 'CPU' },
        canvas: new OffscreenCanvas(1, 1), runningMode: 'VIDEO', numHands: 2,
      });
      connections = PoseLandmarker.POSE_CONNECTIONS;
      handConnections = HandLandmarker.HAND_CONNECTIONS;
      scope.postMessage({ type: 'ready' });
    } else {
      try {
        if (!pose || !hands) throw new Error('Pose inference is not initialized');
        const result = pose.detectForVideo(data.bitmap, data.timestamp);
        const handResult = hands.detectForVideo(data.bitmap, data.timestamp);
        scope.postMessage({ type: 'frame', observation: {
          landmarks: result.landmarks[0] ?? [], worldLandmarks: result.worldLandmarks[0] ?? [],
          hands: handResult.landmarks, handWorldLandmarks: handResult.worldLandmarks,
          handedness: handResult.handedness.map(categories => categories[0]?.categoryName ?? ''),
          handednessConfidence: handResult.handedness.map(categories => categories[0]?.score ?? 0),
          timestamp: data.timestamp, width: data.width, height: data.height,
        }, connections, handConnections });
      } finally { data.bitmap.close(); }
    }
  } catch (error) {
    pose?.close(); pose = null;
    hands?.close(); hands = null;
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Pose inference unavailable' });
  }
};
