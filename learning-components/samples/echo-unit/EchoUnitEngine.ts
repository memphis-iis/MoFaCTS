import type { UnitEngineExtension, UnitSelection } from '../../units/UnitEngine';

export const SAMPLE_ECHO_UNIT_TYPE = 'sample-echo';

export interface SampleEchoUnitDeps {
  readonly suffix: string;
  readonly log?: (level: number, ...args: unknown[]) => void;
}

export function createSampleEchoUnitEngine(deps: SampleEchoUnitDeps): UnitEngineExtension {
  return {
    unitType: `${SAMPLE_ECHO_UNIT_TYPE}:${deps.suffix}`,
    async cardAnswered() {
      deps.log?.(2, '[Sample Echo Unit] card answered');
    },
    selectNextCard(): UnitSelection {
      return { testType: SAMPLE_ECHO_UNIT_TYPE };
    },
    unitFinished() {
      return false;
    },
    async prepareNextTrial() { return { selection: null, preparedAdvanceMode: 'direct' }; },
    commitPreparedTrial() { return false; },
    async advanceAfterAnswer() { },
    isFinished() { return this.unitFinished(); },
    getDisplayQuestionIndex(machineQuestionIndex) { return machineQuestionIndex; },
    clearPreparedTrial() { },
  };
}
