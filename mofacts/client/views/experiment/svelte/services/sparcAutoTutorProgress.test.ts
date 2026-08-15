import { expect } from 'chai';
import type { SparcControllerDisplay } from './sparcController';
import {
  buildSparcAutoTutorProgressSnapshot,
  selectSparcAutoTutorProgressSnapshotForRender,
} from './sparcAutoTutorProgress';
import { SPARC_DIALOGUE_PROGRESS_FACTS_VALUE_KEY } from './sparcDialogueRuntimeValues';

function displayWithMisconceptions(): SparcControllerDisplay {
  return {
    nodes: [],
    autoTutorTargets: {
      expectations: [],
      misconceptions: [{
        id: 'm-low',
        text: 'Low-support misconception.',
      }, {
        id: 'm-high-a',
        text: 'High-support misconception A.',
      }, {
        id: 'm-high-b',
        text: 'High-support misconception B.',
      }],
    },
  } as unknown as SparcControllerDisplay;
}

function displayWithExpectations(): SparcControllerDisplay {
  return {
    nodes: [],
    autoTutorTargets: {
      expectations: ['mechanism', 'growth', 'frequency'].map((clusterKC) => ({
        clusterKC,
        text: clusterKC,
      })),
      misconceptions: [],
    },
  } as unknown as SparcControllerDisplay;
}

function expectationRuntimeValues(scores: readonly number[]): Record<string, unknown> {
  return {
    [SPARC_DIALOGUE_PROGRESS_FACTS_VALUE_KEY]: [{
      factType: 'dialogue.thresholds',
      slots: {
        coverageThreshold: 0.8,
      },
    }, ...['mechanism', 'growth', 'frequency'].map((clusterKC, index) => ({
      factType: 'learningTarget.score',
      slots: {
        clusterKC,
        coverage: scores[index],
      },
    }))],
  };
}

describe('sparcAutoTutorProgress', function() {
  it('sums misconception support strengths at or above the threshold', function() {
    const snapshot = buildSparcAutoTutorProgressSnapshot({
      display: displayWithMisconceptions(),
      runtimeNodeValues: {
        [SPARC_DIALOGUE_PROGRESS_FACTS_VALUE_KEY]: [{
          factType: 'dialogue.thresholds',
          slots: {
            coverageThreshold: 0.8,
          },
        }, {
          factType: 'diagnostic.misconceptionScore',
          slots: {
            id: 'm-low',
            supportStrength: 0.1,
          },
        }, {
          factType: 'diagnostic.misconceptionScore',
          slots: {
            id: 'm-high-a',
            supportStrength: 0.9,
          },
        }, {
          factType: 'diagnostic.misconceptionScore',
          slots: {
            id: 'm-high-b',
            supportStrength: 0.7,
          },
        }],
      },
    });

    expect(snapshot.misconceptionScore).to.be.closeTo(1.6, 0.000001);
  });

  it('reports zero when all misconception values are below the threshold', function() {
    const snapshot = buildSparcAutoTutorProgressSnapshot({
      display: displayWithMisconceptions(),
      runtimeNodeValues: {
        [SPARC_DIALOGUE_PROGRESS_FACTS_VALUE_KEY]: [{
          factType: 'dialogue.thresholds',
          slots: {
            coverageThreshold: 0.8,
          },
        }, {
          factType: 'diagnostic.misconceptionScore',
          slots: {
            id: 'm-low',
            supportStrength: 0.1,
          },
        }, {
          factType: 'diagnostic.misconceptionScore',
          slots: {
            id: 'm-high-a',
            supportStrength: 0.19,
          },
        }, {
          factType: 'diagnostic.misconceptionScore',
          slots: {
            id: 'm-high-b',
            supportStrength: 0,
          },
        }],
      },
    });

    expect(snapshot.misconceptionScore).to.equal(0);
  });

  it('projects terminal completion state for the dialogue continuation control', function() {
    const snapshot = buildSparcAutoTutorProgressSnapshot({
      display: displayWithMisconceptions(),
      runtimeNodeValues: {
        [SPARC_DIALOGUE_PROGRESS_FACTS_VALUE_KEY]: [{
          factType: 'controller.completionState',
          slots: {
            completed: true,
            reason: 'max-turns',
            turnCount: 25,
          },
        }],
      },
    });

    expect(snapshot.completed).to.equal(true);
    expect(snapshot.completionReason).to.equal('max-turns');
    expect(snapshot.turnCount).to.equal(25);
  });

  it('holds the pre-assertion snapshot until the pending turn commits atomically', function() {
    const display = displayWithExpectations();
    const beforeAssertion = buildSparcAutoTutorProgressSnapshot({
      display,
      runtimeNodeValues: expectationRuntimeValues([0.9, 0.9, 0.75]),
    });
    const incompleteIntermediateProjection = buildSparcAutoTutorProgressSnapshot({
      display,
      runtimeNodeValues: {},
    });

    const duringAssertion = selectSparcAutoTutorProgressSnapshotForRender({
      currentSnapshot: incompleteIntermediateProjection,
      pendingSnapshot: beforeAssertion,
      submissionPending: true,
    });

    expect(beforeAssertion.coveredExpectations).to.equal(2.75);
    expect(incompleteIntermediateProjection.coveredExpectations).to.equal(0);
    expect(duringAssertion.coveredExpectations).to.equal(2.75);

    const afterAssertionUptake = buildSparcAutoTutorProgressSnapshot({
      display,
      runtimeNodeValues: expectationRuntimeValues([0.9, 0.9, 0.9]),
    });
    const committed = selectSparcAutoTutorProgressSnapshotForRender({
      currentSnapshot: afterAssertionUptake,
      pendingSnapshot: beforeAssertion,
      submissionPending: false,
    });

    expect(committed.coveredExpectations).to.equal(3);
  });
});
