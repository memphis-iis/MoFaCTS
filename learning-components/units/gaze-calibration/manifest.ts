import type { LearningComponentManifest } from '../../runtime/ComponentManifest';
import type { CreateUnitEngineDeps } from '../createUnitEngine';
import type { UnitEngine } from '../UnitEngine';

export const GAZE_CALIBRATION_UNIT_TYPE = 'gaze-calibration';
export function createGazeCalibrationUnitEngine(): UnitEngine & Record<string, unknown> & { completeCalibration(): void } {
  let completed = false;
  return {
    unitType: GAZE_CALIBRATION_UNIT_TYPE,
    async init() {},
    async loadResumeState() {},
    completeCalibration() { completed = true; },
    unitFinished: () => completed,
    isFinished: () => completed,
    selectNextCard() {},
    findCurrentCardInfo() {},
    async cardAnswered() { throw new Error('Calibration does not accept trial answers'); },
    async prepareNextTrial() { return { selection: null, preparedAdvanceMode: 'direct' }; },
    commitPreparedTrial() { return false; },
    async advanceAfterAnswer() { throw new Error('Calibration does not accept trial answers'); },
    getDisplayQuestionIndex(index: number) { return index; },
    clearPreparedTrial() {},
  };
}
export const gazeCalibrationUnitComponentManifest: LearningComponentManifest<CreateUnitEngineDeps> = {
  id: 'mofacts.gaze-calibration-unit',
  kind: 'unit',
  unitTypes: [GAZE_CALIBRATION_UNIT_TYPE],
  requiredCapabilities: [],
  register(context) {
    context.registerUnitEngine(GAZE_CALIBRATION_UNIT_TYPE, createGazeCalibrationUnitEngine);
  },
};
