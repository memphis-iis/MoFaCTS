import type { UnitEngineSessionWriteKey } from '../UnitEngineSessionKeys';
import type { UnitEngineExtension } from '../UnitEngine';

export interface CreateVideoSessionUnitEngineDeps {
  readonly setSessionValue: (key: UnitEngineSessionWriteKey, value: any) => void;
  readonly log: (level: number, ...args: unknown[]) => void;
}

export function createVideoSessionUnitEngine(deps: CreateVideoSessionUnitEngineDeps): UnitEngineExtension {
  let currentVideoCardInfo: any = { clusterIndex: -1, whichStim: 0 };

  const engine: any = {
    unitType: "video",

    initImpl: function() {
      // Video sessions don't need model/probability initialization.
      deps.log(1, "Video unit engine initialized (no model setup needed)");
    },

    selectNextCard: async function(indices: any, _curExperimentState: any) {
      if (!indices || !Number.isFinite(indices.clusterIndex)) {
        throw new Error("Video session selectNextCard requires explicit indices with clusterIndex");
      }

      const cardIndex = indices.clusterIndex;
      const whichStim = indices.stimIndex || 0;

      deps.log(1, "VIDEO UNIT (selectNextCard: any) => cluster:", cardIndex, "stim:", whichStim);

      currentVideoCardInfo = { clusterIndex: cardIndex, whichStim: whichStim };

      deps.setSessionValue("clusterIndex", cardIndex);

      deps.setSessionValue("testType", "d");
      await this.setUpCardQuestionAndAnswerGlobals(cardIndex, whichStim, undefined, { testType: "d" });
    },

    findCurrentCardInfo: function() {
      return currentVideoCardInfo;
    },

    unitFinished: function() {
      return false;
    },

    cardAnswered: async function() {
      // Video sessions don't update model probabilities.
    },

    calculateIndices: function() {
      return null;
    },

    prefetchNextCard: function() { },
    applyPrefetchedNextCard: async function() { return false; },
    clearPrefetchedNextCard: function() { },
    loadResumeState: async function() { },
    async prepareNextTrial() {
      return { selection: null, preparedAdvanceMode: 'none' };
    },
    commitPreparedTrial() { return false; },
    async advanceAfterAnswer() { },
    isFinished() { return this.unitFinished(); },
    getDisplayQuestionIndex(machineQuestionIndex: number) { return machineQuestionIndex; },
    clearPreparedTrial() { },
  };
  return engine as UnitEngineExtension;
}
