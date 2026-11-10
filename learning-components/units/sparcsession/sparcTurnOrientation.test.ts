import { strict as assert } from 'node:assert';
import { createSparcOrientation, type SparcSavedOrientation } from './sparcTurnOrientation';
import { progressiveDialogueFacts } from './sparcWorkingMemoryFacts';
import type { SparcStateTransition, SparcWorkingMemoryFact } from './sparcSessionContracts';
import type { SparcInstructionalCandidateProjection } from './sparcInstructionalCandidates';
import { SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY } from '../../trial-displays/sparc/sparcProgressiveNodes';

const facts: SparcWorkingMemoryFact[] = [
  { factType: 'dialogue.source', slots: { topic: 'Understanding intervals' } },
  ...['a', 'b', 'c'].map(clusterKC => ({ factType: 'autotutor.expectation', slots: { clusterKC, text: `Goal ${clusterKC}` } })),
  { factType: 'autotutor.misconception', slots: { id: 'm', text: 'Clarify the fixed parameter' } },
];
function projection(covered: string[] = []): SparcInstructionalCandidateProjection {
  return { snapshotId: 'event', coverageThreshold: .8, misconceptionThreshold: .2,
    expectations: ['a', 'b', 'c'].map((targetId, rankWithinKind) => ({ targetId, targetKey: `expectation:${targetId}`, targetKind: 'expectation',
      coverage: covered.includes(targetId) ? .8 : .2, goalValue: .8, instructionalNeed: 1,
      priorityScore: 1, eligible: !covered.includes(targetId), rankWithinKind, isMaximumWithinKind: rankWithinKind === 0 })),
    misconceptions: [], facts: [],
  };
}
const event = { eventId: 'previous', type: 'document-loaded' as const, time: 1, source: { pageKey: 'page', nodeId: 'root' } };
function saved(value: Omit<SparcSavedOrientation, 'bridge'>, bridge: string | null = 'A grounded transition.'): SparcStateTransition {
  return { transitionId: 'previous:orientation', event,
    writes: [{ target: event.source, key: 'instructionalOrientation', value: { ...value, bridge } }] };
}
function orient(target: 'a' | 'b' | 'c' | 'm' | undefined, covered: string[] = [], previous: SparcStateTransition[] = []) {
  return createSparcOrientation({ facts, candidates: projection(covered), previous,
    ...(target ? { target: { kind: target === 'm' ? 'misconception' : 'expectation', id: target } } : { completed: true }), selectionReason: 'test-selection' });
}

describe('SPARC post-selection orientation productions', () => {
  it('introduces the authored target with distinct required-KC counts', () => {
    const start = orient('a', ['c']);
    assert.equal(start.request.reason, 'introduction');
    assert.equal(start.request.current?.text, 'Goal a');
    assert.deepEqual(start.request.progress, { total: 3, met: 1, remaining: 2 });
    assert.equal(start.request.mentionRemaining, true);
  });
  it('continues without speech and distinguishes earned advancement from early switching', () => {
    const previous = [saved(orient('a'))];
    assert.equal(orient('a', [], previous).request.reason, 'continue');
    const early = orient('b', [], previous);
    assert.equal(early.request.reason, 'switch');
    assert.deepEqual(early.request.achieved, []);
    const advanced = orient('b', ['a', 'c'], previous);
    assert.equal(advanced.request.reason, 'advance');
    assert.deepEqual(advanced.request.achieved.map(goal => goal.id), ['a', 'c']);
    assert.equal(advanced.request.mentionRemaining, true);
    assert.equal(advanced.request.progress.remaining, 1);
  });
  it('handles repair, repair continuation and return without adding KCs', () => {
    const repair = orient('m', [], [saved(orient('a'))]);
    assert.equal(repair.request.reason, 'repair');
    assert.equal(repair.request.progress.total, 3);
    const repaired = [saved(repair)];
    assert.equal(orient('m', [], repaired).request.reason, 'continue');
    assert.equal(orient('a', [], repaired).request.reason, 'return');
    assert.equal(orient('b', [], repaired).request.reason, 'switch', 'A new KC after repair is not a return to interrupted work');
    assert.deepEqual(orient('a', [], repaired).request.achieved, []);
  });
  it('closes with the real progress snapshot and retains only five accepted bridges', () => {
    const previous = Array.from({ length: 7 }, (_, i) => saved(orient('a'), `Bridge ${i}`));
    const result = orient(undefined, ['a', 'b', 'c'], previous);
    assert.equal(result.request.reason, 'completion');
    assert.equal(result.request.current, undefined);
    assert.deepEqual(result.request.progress, { total: 3, met: 3, remaining: 0 });
    assert.deepEqual(result.request.recentBridges, ['Bridge 2', 'Bridge 3', 'Bridge 4', 'Bridge 5', 'Bridge 6']);
  });
  it('excludes navigation prose from assessment/dialogue facts', () => {
    const transition: SparcStateTransition = { transitionId: 'nav', event, writes: [{ target: event.source, key: SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY,
      value: { type: 'append-node', boxId: 'dialogue-flow', node: { id: 'nav', atomType: 'dialogue-utterance',
        speaker: 'tutor', navigationOnly: true, turnEventId: 'previous', value: 'You met a learning goal.' } } }] };
    assert.deepEqual(progressiveDialogueFacts({ transitions: [transition] }), []);
  });
});
