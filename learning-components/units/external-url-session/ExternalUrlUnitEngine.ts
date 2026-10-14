import type { UnitEngineSessionWriteKey } from '../UnitEngineSessionKeys';
import type { UnitEngineExtension } from '../UnitEngine';

export interface CreateExternalUrlUnitEngineDeps {
  readonly setSessionValue: (key: UnitEngineSessionWriteKey, value: unknown) => void;
  readonly log: (level: number, ...args: unknown[]) => void;
}

/**
 * External-url unit engine (issue #238).
 *
 * The unit is a boundary: mofacts launches an EXTERNAL page in a new tab
 * (the psynaptix external session page) and hands over calibration, trials,
 * and markers. This engine owns only the mofacts-side lifecycle:
 *
 *  - the explicit checkpoint card ("Open external session")
 *  - NO-OP model update (the external flow owns its own data)
 *  - the completion handoff: the runtime (#M3) calls completeExternalSession()
 *    when the external page posts its completion; the machine's isFinished()
 *    gate then advances to the next unit.
 */
export function createExternalUrlUnitEngine(deps: CreateExternalUrlUnitEngineDeps): UnitEngineExtension {
  let completed = false;

  const engine: any = {
    unitType: 'external-url',

    initImpl: function() {
      completed = false;
      deps.log(1, 'External URL unit engine initialized (external flow owns its own data)');
    },

    // Explicit checkpoint-card selection: the single "Open external session"
    // card. The runtime (#M3) renders the card; opening the tab happens there.
    selectNextCard: async function() {
      completed = false;
      deps.setSessionValue('clusterIndex', 0);
      deps.setSessionValue('testType', 'd');
    },

    findCurrentCardInfo: function() {
      return { clusterIndex: 0, whichStim: 0 };
    },

    // No-op model update — the external page owns calibration/trials/markers.
    cardAnswered: async function() {
      // The external flow does not touch mofacts model probabilities.
    },

    // Completion handoff — the runtime (#M3) calls this when the external
    // page posts the completion (external-url-complete). The machine's
    // isFinished gate then advances to the next unit.
    completeExternalSession: function() {
      completed = true;
    },

    unitFinished: function() {
      return completed;
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
    isFinished() { return completed; },
    async advanceAfterAnswer() { },
    getDisplayQuestionIndex(machineQuestionIndex: number) { return machineQuestionIndex; },
    clearPreparedTrial() { },
  };
  return engine as UnitEngineExtension;
}
