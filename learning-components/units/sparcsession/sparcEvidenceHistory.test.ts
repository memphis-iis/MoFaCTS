import { strict as assert } from 'node:assert';
import { retainedEvidenceFacts, parseSparcEvidenceSummary } from './sparcEvidenceHistory';
import type { SparcWorkingMemoryFact } from './sparcSessionContracts';

describe('Retained instructional evidence', () => {
  const facts: SparcWorkingMemoryFact[] = [{ factType: 'autotutor.expectation', slots: { clusterKC: 'species' } }];
  it('retains descriptions within an authored target and points to canonical learner spans', () => {
    const [fact] = retainedEvidenceFacts(facts, [{ kind: 'expectation', id: 'species', demonstrated: ['Explains gene flow'],
      incorrect: [], unresolved: ['Distinguish reproductive barriers'], citations: [{ responseId: 'turn:learner', start: 0, end: 14 }] }]);
    assert.equal(fact?.factId, 'expectation:species');
    assert.deepEqual(fact?.slots?.citations, [{ responseId: 'turn:learner', start: 0, end: 14 }]);
    assert.equal(facts.length, 1);
  });
  it('rejects invented targets, duplicate targets, and malformed spans', () => {
    const e = { kind: 'expectation' as const, id: 'invented', demonstrated: [], incorrect: [], unresolved: [], citations: [] };
    assert.throws(() => retainedEvidenceFacts(facts, [e]), /target/);
    e.id = 'species'; assert.throws(() => retainedEvidenceFacts(facts, [e, e]), /target/);
    assert.throws(() => retainedEvidenceFacts(facts, [{ ...e, citations: [{ responseId: 'r', start: 3, end: 2 }] }]), /citations/);
    assert.throws(() => parseSparcEvidenceSummary({ demonstrated: ['x'.repeat(241)], incorrect: [], unresolved: [] }), /demonstrated/);
  });
});
