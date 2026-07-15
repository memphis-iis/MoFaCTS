import { expect } from 'chai';
import type { SparcControllerDisplay } from './sparcController';
import {
  buildSparcAutoTutorProgressSnapshot,
  SPARC_DIALOGUE_PROGRESS_FACTS_VALUE_KEY,
} from './sparcAutoTutorProgress';

function displayWithMisconceptions(): SparcControllerDisplay {
  return {
    nodes: [],
    autoTutorTargets: {
      expectations: [],
      misconceptions: [{
        id: 'm-low',
        text: 'Low-confidence misconception.',
      }, {
        id: 'm-high-a',
        text: 'High-confidence misconception A.',
      }, {
        id: 'm-high-b',
        text: 'High-confidence misconception B.',
      }],
    },
  } as unknown as SparcControllerDisplay;
}

describe('sparcAutoTutorProgress', function() {
  it('sums misconception confidence values at or above the threshold', function() {
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
            confidence: 0.1,
          },
        }, {
          factType: 'diagnostic.misconceptionScore',
          slots: {
            id: 'm-high-a',
            confidence: 0.9,
          },
        }, {
          factType: 'diagnostic.misconceptionScore',
          slots: {
            id: 'm-high-b',
            confidence: 0.7,
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
            confidence: 0.1,
          },
        }, {
          factType: 'diagnostic.misconceptionScore',
          slots: {
            id: 'm-high-a',
            confidence: 0.19,
          },
        }, {
          factType: 'diagnostic.misconceptionScore',
          slots: {
            id: 'm-high-b',
            confidence: 0,
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
});
