import type { UnitEngine, UnitSelection } from '../../units/UnitEngine';

export const SAMPLE_ECHO_UNIT_TYPE = 'sample-echo';

export interface SampleEchoUnitDeps {
  readonly suffix: string;
  readonly log?: (level: number, ...args: unknown[]) => void;
}

export function createSampleEchoUnitEngine(deps: SampleEchoUnitDeps): Partial<UnitEngine> {
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
  };
}
