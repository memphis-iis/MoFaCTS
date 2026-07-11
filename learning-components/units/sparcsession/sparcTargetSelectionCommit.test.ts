import { strict as assert } from 'node:assert';
import type { SparcAuthoredDocument, SparcInterfaceEvent, SparcWorkingMemoryFact } from './sparcSessionContracts';
import { createEmptySparcReplayState, applySparcStateTransition } from './sparcStateReplay';
import { buildSparcWorkingMemoryFacts } from './sparcWorkingMemoryFacts';
import {
  commitSparcTargetSelection,
  evaluateSparcTargetSelection,
} from './sparcTargetSelectionCommit';

const event: SparcInterfaceEvent = {
  eventId: 'event-target-selection',
  type: 'response-submitted',
  source: {
    pageKey: 'sparc-doc',
    nodeId: 'learner-input',
  },
  time: 1200,
  payload: {
    input: 'learner response',
  },
};

function fact(factType: string, slots: Record<string, unknown>): SparcWorkingMemoryFact {
  return { factType, slots };
}

function document(): SparcAuthoredDocument {
  return {
    id: 'sparc-doc',
    schemaVersion: 1,
    workingMemoryFacts: [
      fact('controller.targetSelectionPolicy', {
        policy: 'kc-graph-priority',
        coverageThreshold: 0.8,
        frontierWeight: 0.5,
        coherenceWeight: 0.3,
        centralityWeight: 0.2,
      }),
      fact('autotutor.expectation', { clusterKC: 'kc-a' }),
      fact('autotutor.expectation', { clusterKC: 'kc-b' }),
      fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.2 }),
      fact('learningTarget.score', { clusterKC: 'kc-b', coverage: 0.1 }),
      fact('kcGraph.node', { clusterKC: 'kc-a', centrality: 0.1, description: 'A' }),
      fact('kcGraph.node', { clusterKC: 'kc-b', centrality: 0.8, description: 'B' }),
      fact('kcGraph.relationship', { sourceClusterKC: 'kc-a', targetClusterKC: 'kc-b', strength: 0.9 }),
      fact('kcGraph.relationship', { sourceClusterKC: 'kc-b', targetClusterKC: 'kc-a', strength: 0.9 }),
    ],
    root: {
      id: 'root',
      kind: 'document',
      children: [{
        id: 'learner-input',
        kind: 'input',
      }],
    },
  };
}

describe('sparcTargetSelectionCommit', function() {
  it('persists selected target and candidate facts as replayable SPARC working-memory state', function() {
    const doc = document();
    const evaluated = evaluateSparcTargetSelection({
      document: doc,
      event,
      options: {
        anchorClusterKC: 'kc-a',
      },
    });

    assert.equal(evaluated.selection.selectedClusterKC, 'kc-b');
    assert.equal(evaluated.transition.transitionId, 'event-target-selection:target-selection');
    assert.equal(evaluated.transition.writes.length, 3);

    const replayState = applySparcStateTransition(createEmptySparcReplayState(), evaluated.transition);
    const replayedFacts = buildSparcWorkingMemoryFacts({
      document: doc,
      replayState,
    });
    assert.ok(replayedFacts.some((replayedFact) => (
      replayedFact.factType === 'learningTarget.selected'
      && replayedFact.slots?.clusterKC === 'kc-b'
    )));
    assert.equal(replayedFacts.filter((replayedFact) => replayedFact.factType === 'learningTarget.candidate').length, 2);
  });

  it('writes a canonical SPARC history record when committed', async function() {
    const writtenRecords: unknown[] = [];
    const result = await commitSparcTargetSelection({
      core: {
        TDFId: 'tdf-1',
        sessionID: 'session-1',
        userId: 'user-1',
        levelUnit: 1,
        levelUnitName: 'SPARC',
      },
      document: document(),
      event,
      options: {
        anchorClusterKC: 'kc-a',
      },
      runtime: {
        history: {
          async writeCanonicalHistory(record) {
            writtenRecords.push(record);
          },
        },
      },
    });

    assert.equal(result.historyRecord?.action, 'sparc-target-selection');
    assert.equal(result.historyRecord?.responseValue, 'kc-b');
    assert.equal(writtenRecords.length, 1);
    assert.deepEqual(writtenRecords[0], result.historyRecord);
  });
});
