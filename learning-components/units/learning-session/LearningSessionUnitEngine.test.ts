import { strict as assert } from 'assert';
import { createLearningSessionUnitEngine } from './LearningSessionUnitEngine';

function createMinimalDeps(overrides: Record<string, unknown> = {}): any {
  let unitFinishedCalls = 0;
  const deps = {
    getSessionValue(key: string) {
      if (key === 'currentTdfUnit') {
        return { learningsession: {} };
      }
      if (key === 'curStudentPerformance') {
        return { totalTime: 0 };
      }
      return undefined;
    },
    setSessionValue() {},
    getDeliverySettings: () => ({}),
    getStimCount: () => 0,
    getStimCluster: () => ({ stims: [] }),
    getStimKCBaseForCurrentStimuliSet: () => [],
    getTestType: () => 'd',
    getHiddenItems: () => [],
    setNumVisibleCards() {},
    setQuestionIndex() {},
    getDisplayAnswerText: (answer: unknown) => String(answer || ''),
    updateCurStudentPerformance() {},
    updateCurStudedentPracticeTime() {},
    serverMethods: {
      getResponseKCMapForTdf: async () => ({}),
      getStimulusCrowdStatsForDeck: async () => [],
      getLearningHistoryForUnit: async () => [],
    },
    getCurrentUserId: () => 'user-1',
    reconstructLearningStateFromHistory: () => ({}),
    extractDelimFields() {},
    rangeVal: (source: unknown) => [source],
    legacyFloat: (source: unknown) => Number(source),
    legacyInt: (source: unknown) => Number(source),
    currentUserHasRole: () => false,
    displayify: (value: unknown) => value,
    unitIsFinished() {
      unitFinishedCalls += 1;
    },
    alertUser() {},
    log() {},
    findTdfById: () => ({
      content: {
        tdfs: {
          tutor: {
            unit: [{ learningsession: { clusterlist: '' } }],
          },
        },
      },
    }),
    getUnitFinishedCalls: () => unitFinishedCalls,
    ...overrides,
  };
  return deps;
}

describe('LearningSessionUnitEngine selection completion guard', function() {
  it('does not advance the unit when no card is selected before a completion rule is satisfied', async function() {
    const deps = createMinimalDeps();
    const engine = await createLearningSessionUnitEngine(deps);

    try {
      await engine.selectNextCard({ clusterIndex: -1, stimIndex: -1 }, {});
      throw new Error('Expected selectNextCard to reject missing selection');
    } catch (error) {
      assert(error instanceof Error);
      assert.equal(
        error.message,
        'Learning session selection produced no card before a completion rule was satisfied; refusing to advance unit.'
      );
    }

    assert.equal(deps.getUnitFinishedCalls(), 0);
  });
});
