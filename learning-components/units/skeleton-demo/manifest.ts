import type { LearningComponentManifest } from '../../runtime/ComponentManifest';
import type { CreateUnitEngineDeps } from '../createUnitEngine';
import type { UnitEngine } from '../UnitEngine';

export const SKELETON_DEMO_UNIT_TYPE = 'skeleton-demo';

// Display-only: no stimuli, answers, adaptive model, or history writer.
export function createSkeletonDemoUnitEngine(): UnitEngine & Record<string, unknown> & { completeDemo(): void } {
  let completed = false;
  return {
    unitType: SKELETON_DEMO_UNIT_TYPE,
    async init() {},
    async loadResumeState() {},
    completeDemo() { completed = true; },
    unitFinished: () => completed,
    isFinished: () => completed,
    selectNextCard() {},
    findCurrentCardInfo() {},
    async cardAnswered() { throw new Error('Skeleton demo does not accept trial answers'); },
    async prepareNextTrial() { return { selection: null, preparedAdvanceMode: 'direct' }; },
    commitPreparedTrial() { return false; },
    async advanceAfterAnswer() { throw new Error('Skeleton demo does not accept trial answers'); },
    getDisplayQuestionIndex(index: number) { return index; },
    clearPreparedTrial() {},
  };
}

export const skeletonDemoUnitComponentManifest: LearningComponentManifest<CreateUnitEngineDeps> = {
  id: 'mofacts.skeleton-demo-unit',
  kind: 'unit',
  unitTypes: [SKELETON_DEMO_UNIT_TYPE],
  requiredCapabilities: [],
  register(context) {
    context.registerUnitEngine(SKELETON_DEMO_UNIT_TYPE, createSkeletonDemoUnitEngine);
  },
};
