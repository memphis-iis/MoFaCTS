import { Tracker } from 'meteor/tracker';
import { Meteor } from 'meteor/meteor';
import { isLessonRoutePath } from '../../../../lib/lessonRoute';
import { writable } from 'svelte/store';

export interface GazeSample {
  x: number;
  y: number;
  receivedAt: number;
}
export interface GazeContext {
  lessonId: string;
  unitId: number;
  enabled: boolean;
  phase?: string | null;
}
type GazeState = {
  status: string;
  calibrated: boolean;
  sample: GazeSample | null;
};
interface WebGazer {
  params: { faceMeshSolutionPath: string };
  begin(): Promise<unknown>;
  pause(): void;
  resume(): Promise<unknown>;
  end(): void;
  stopVideo(): void;
  saveDataAcrossSessions(value: boolean): WebGazer;
  applyKalmanFilter(value: boolean): WebGazer;
  showPredictionPoints(value: boolean): WebGazer;
  showVideoPreview(value: boolean): WebGazer;
  showFaceOverlay(value: boolean): WebGazer;
  showFaceFeedbackBox(value: boolean): WebGazer;
  removeMouseEventListeners(): void;
  recordScreenPosition(x: number, y: number, event: string): void;
  setGazeListener(listener: (sample: { x: number; y: number } | null) => void): WebGazer;
  getTracker(): { getPositions(): unknown[] | null };
  getRegression(): Array<{ init(): void; eyeFeaturesClicks: { length: number } }>;
}

const state: GazeState = { status: 'Not calibrated', calibrated: false, sample: null };
export const gazeState = writable<GazeState>({ ...state });
let tracker: WebGazer | null = null;
let initialized = false;
let initializing: Promise<void> | null = null;
let generation = 0;
let calibrationActive = false;
let context: GazeContext = { lessonId: '', unitId: 0, enabled: false };
let staleTimer: ReturnType<typeof setTimeout> | null = null;
let lastFrameAt = 0;
let lastBinnedAt = -Infinity;
let binX = 0;
let binY = 0;
let binCount = 0;
let dimensions = '';

function publish(): void { gazeState.set({ ...state }); }
function resetGazeBin(): void {
  lastBinnedAt = -Infinity;
  binX = 0;
  binY = 0;
  binCount = 0;
}
function releaseCamera(): void {
  tracker?.pause();
  tracker?.removeMouseEventListeners();
  const video = document.getElementById('webgazerVideoFeed') as HTMLVideoElement | null;
  (video?.srcObject as MediaStream | null)?.getTracks().forEach(track => track.stop());
  const container = document.getElementById('webgazerVideoContainer');
  const dot = document.getElementById('webgazerGazeDot');
  if (container && dot) tracker?.end();
  else { container?.remove(); dot?.remove(); }
  tracker?.getRegression().forEach(regression => regression.init());
}
function clearPrediction(): void {
  if (staleTimer) clearTimeout(staleTimer);
  staleTimer = null;
  resetGazeBin();
  state.sample = null;
  publish();
}
export function isValidGazeSample(sample: { x: number; y: number } | null): boolean {
  return sample !== null && Number.isFinite(sample.x) && Number.isFinite(sample.y);
}
function receive(sample: { x: number; y: number } | null): void {
  const receivedAt = performance.now();
  lastFrameAt = receivedAt;
  if ((!context.enabled && !calibrationActive) || document.hidden || !isValidGazeSample(sample)) {
    clearPrediction();
    return;
  }
  if (staleTimer) clearTimeout(staleTimer);
  staleTimer = setTimeout(clearPrediction, 250);
  if (receivedAt - lastBinnedAt < 100) return;
  lastBinnedAt = receivedAt;
  binX += sample!.x;
  binY += sample!.y;
  binCount++;
  if (binCount === 5) {
    state.sample = { x: binX / 5, y: binY / 5, receivedAt };
    resetGazeBin();
    // Retain the 100 ms gate between consecutive bins.
    lastBinnedAt = receivedAt;
    publish();
  }
}
function updateActivity(): void {
  clearPrediction();
  if (!initialized || !tracker) return;
  const active = !document.hidden && (calibrationActive || (context.enabled && state.calibrated));
  tracker.showVideoPreview(calibrationActive);
  if (active) {
    void tracker.resume().catch(() => {
      state.status = 'Tracking unavailable';
      state.calibrated = false;
      tracker?.pause();
      clearPrediction();
    });
  } else tracker.pause();
}
function resize(): void {
  const next = `${window.innerWidth}x${window.innerHeight}`;
  if (dimensions && dimensions !== next) {
    state.calibrated = false;
    calibrationActive = false;
    state.status = 'Viewport changed - recalibrate';
    updateActivity();
  }
  dimensions = next;
}

export function setGazePhase(phase: string | null): void { context = { ...context, phase }; }

export function getGazeContext(): Readonly<GazeContext> { return { ...context }; }

export function setGazeContext(next: GazeContext): void {
  if (context.lessonId && context.lessonId !== next.lessonId) disposeGazeTracking();
  context = next;
  updateActivity();
}
export async function startGazeCalibration(): Promise<void> {
  if (initializing) return initializing;
  const token = generation;
  initializing = (async () => {
    state.status = 'Starting camera';
    state.calibrated = false;
    publish();
    try {
      if (!tracker) {
        // The CommonJS bundle exposes the same documented WebGazer API.
        const module = await import('webgazer/dist/webgazer.commonjs2.js');
        if (token !== generation) return;
        tracker = module.default.webgazer as WebGazer;
        tracker.params.faceMeshSolutionPath = '/webgazer/mediapipe/face_mesh';
        tracker.saveDataAcrossSessions(false).applyKalmanFilter(false)
          .showPredictionPoints(false).showFaceOverlay(false).showFaceFeedbackBox(false)
          .setGazeListener(receive);
      }
      if (!initialized) {
        await tracker.begin();
        if (token !== generation) {
          releaseCamera();
          return;
        }
        initialized = true;
        tracker.removeMouseEventListeners();
        dimensions = `${window.innerWidth}x${window.innerHeight}`;
        window.addEventListener('resize', resize);
        document.addEventListener('visibilitychange', updateActivity);
        window.addEventListener('pagehide', disposeGazeTracking);
        const stream = (document.getElementById('webgazerVideoFeed') as HTMLVideoElement | null)?.srcObject as MediaStream | null;
        stream?.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
          if (token !== generation) return;
          disposeGazeTracking();
          state.status = 'Camera unavailable - recalibrate';
          publish();
        }));
      }
      // Reset only the in-memory regressions. clearData() also touches IndexedDB.
      tracker.getRegression().forEach(regression => regression.init());
      calibrationActive = true;
      state.status = 'Calibration';
      updateActivity();
    } catch (error) {
      releaseCamera();
      initialized = false;
      state.status = error instanceof Error ? `Tracking unavailable: ${error.message}` : 'Tracking unavailable';
      state.calibrated = false;
      calibrationActive = false;
      tracker?.pause();
      clearPrediction();
      throw error;
    }
  })();
  try { await initializing; } finally { initializing = null; }
}
export function trainGazeTarget(x: number, y: number): boolean {
  if (!tracker || !calibrationActive || document.hidden || performance.now() - lastFrameAt > 250 || !tracker.getTracker().getPositions()?.length) return false;
  const regression = tracker.getRegression()[0];
  if (!regression) return false;
  const count = regression.eyeFeaturesClicks.length;
  tracker.recordScreenPosition(x, y, 'click');
  return regression.eyeFeaturesClicks.length > count;
}
export function beginGazeValidation(): void {
  tracker?.showVideoPreview(false);
}
export function acceptGazeCalibration(): void {
  if (!calibrationActive) throw new Error('Calibration is no longer ready; recalibrate first');
  state.calibrated = true;
  state.status = 'Tracking';
  calibrationActive = false;
  updateActivity();
}
export function cancelGazeCalibration(): void {
  if (initializing) generation++;
  calibrationActive = false;
  state.calibrated = false;
  state.status = 'Not calibrated';
  updateActivity();
}
export function disposeGazeTracking(): void {
  generation++;
  calibrationActive = false;
  // A pending begin owns initialization DOM until it settles; its generation guard
  // releases a late stream without tearing down the loadeddata listener prematurely.
  if (initialized && tracker) releaseCamera();
  initialized = false;
  state.calibrated = false;
  state.status = 'Not calibrated';
  clearPrediction();
  window.removeEventListener('resize', resize);
  document.removeEventListener('visibilitychange', updateActivity);
  window.removeEventListener('pagehide', disposeGazeTracking);
}

const { FlowRouter } = require('meteor/ostrio:flow-router-extra') as {
  FlowRouter: { watchPathChange(): void; current(): { path?: string } };
};
Tracker.autorun(() => {
  FlowRouter.watchPathChange();
  const path = FlowRouter.current().path || '';
  const user = Meteor.userId();
  if (!user || (!isLessonRoutePath(path, '/content') && !isLessonRoutePath(path, '/instructions'))) {
    if (initialized || initializing) disposeGazeTracking();
  }
});
