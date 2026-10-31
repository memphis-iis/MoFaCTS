<script lang="ts">
  import type { PoseObservation } from '../services/poseTracking';
  import { CALIBRATION_FRAMES, createPoseCalibration, correctPose, distanceVector, segmentLengths, scoreDistances } from '../../../../../../learning-components/units/skeleton-demo/poseDistanceMatcher';
  import type { PoseScore } from '../../../../../../learning-components/units/skeleton-demo/poseDistanceMatcher';
  export let observation: PoseObservation | null = null;
  const calibration = createPoseCalibration();
  let collecting = false;
  let count = 0;
  let baseline: number[] | null = null;
  let targetLengths: number[] | null = null;
  let targetDistances: number[] | null = null;
  let fitScale = true;
  let simple: PoseScore | null = null;
  let calibrated: PoseScore | null = null;
  let calibratedFixed: PoseScore | null = null;
  $: points = observation?.worldLandmarks ?? [];
  $: currentDistances = distanceVector(points);
  $: if (collecting && observation) {
    calibration.add(points, observation.timestamp);
    count = calibration.count;
    baseline = calibration.baseline();
    if (baseline) collecting = false;
  }
  $: {
    simple = currentDistances && targetDistances ? scoreDistances(currentDistances, targetDistances, fitScale) : null;
    const corrected = baseline && targetLengths ? correctPose(points, baseline, targetLengths) : null;
    const distances = corrected ? distanceVector(corrected) : null;
    calibrated = distances && targetDistances ? scoreDistances(distances, targetDistances, fitScale) : null;
    calibratedFixed = distances && targetDistances ? scoreDistances(distances, targetDistances, false) : null;
  }
  function captureTemplate(): void {
    targetLengths = segmentLengths(points);
    targetDistances = distanceVector(points);
  }
  function calibrate(): void {
    calibration.reset(); baseline = null; count = 0; collecting = true;
  }
  function clear(): void {
    calibration.reset(); baseline = null; targetLengths = null; targetDistances = null; count = 0; collecting = false;
  }
  const display = (score: PoseScore | null): string => score ? `${score.residual.toFixed(6)} (scale ${score.scale.toFixed(3)})` : 'Unavailable';
</script>

<details class="card pose-matcher-comparison">
  <summary>3D pose matcher comparison</summary>
  <div class="pose-matcher-comparison-body">
  <div class="skeleton-demo-controls">
    <button type="button" class="btn btn-secondary" disabled={!currentDistances || collecting} on:click={captureTemplate}>Capture template</button>
    <button type="button" class="btn btn-secondary" disabled={!observation || collecting} on:click={calibrate}>Calibrate person</button>
    <button type="button" class="btn btn-secondary" on:click={clear}>Clear comparison</button>
    <label><input type="checkbox" bind:checked={fitScale} /> Fit one global scale for both methods</label>
  </div>
  <p>Template: {targetDistances ? 'ready' : 'needed'}. Calibration: {count}/{CALIBRATION_FRAMES} valid frames {collecting ? '(collecting)' : baseline ? '(ready)' : ''}. {currentDistances ? 'Tracking usable.' : 'Waiting for six reliable world landmarks.'}</p>
  <p>Normalized squared error, lower is closer. Simple distances: {display(simple)}. Calibrated skeleton: {display(calibrated)}. Calibrated without scale fit: {display(calibratedFixed)}.</p>
  <p>Keep both shoulders, elbows and wrists visible. Capture a reference pose first. For a different person, record a personal baseline while moving both arms; then reproduce the reference pose. Scroll within this panel for all controls and scores.</p>
  <p>Labels remain left/right; mirrored geometry has the same distances. This experiment does not distinguish reflections. Scores do not control the existing gestures. Data stays in memory until Clear or leaving this unit.</p>
  </div>
</details>
