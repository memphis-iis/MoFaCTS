import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { projectSparcInstructionalCandidates } from './sparcInstructionalCandidates';
import type { SparcWorkingMemoryFact } from './sparcSessionContracts';

function fact(factType: string, slots: Record<string, unknown>): SparcWorkingMemoryFact {
  return { factType, slots };
}

function baseFacts(): SparcWorkingMemoryFact[] {
  return [
    fact('autotutor.expectation', { clusterKC: 'kc-a' }),
    fact('autotutor.expectation', { clusterKC: 'kc-b' }),
    fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.2 }),
    fact('learningTarget.score', { clusterKC: 'kc-b', coverage: 0.6 }),
    fact('kcGraph.node', { clusterKC: 'kc-a', centrality: 0.1 }),
    fact('kcGraph.node', { clusterKC: 'kc-b', centrality: 0.8 }),
    fact('kcGraph.relationship', { sourceClusterKC: 'kc-a', targetClusterKC: 'kc-b', strength: 0.9 }),
  ];
}

describe('projectSparcInstructionalCandidates', function() {
  it('projects transparent expectation candidates and a within-kind maximum without selecting a target', function() {
    const result = projectSparcInstructionalCandidates({
      snapshotId: 'snapshot-1',
      facts: baseFacts(),
      options: { anchorClusterKC: 'kc-a' },
    });
    assert.equal(result.maximumExpectation?.targetId, 'kc-a');
    assert.equal(result.expectations.find((candidate) => candidate.targetId === 'kc-a')?.instructionalNeed, 0.75);
    assert.equal(result.facts.filter((entry) => entry.factType === 'instructional.candidate').length, 2);
    assert.equal(result.facts.some((entry) => entry.factType === 'instructional.decision'), false);
    assert.equal(result.facts.some((entry) => entry.factType === 'instructional.activeCycle'), false);
  });

  it('allows all expectations to be covered without manufacturing a winner', function() {
    const facts = baseFacts().filter((entry) => entry.factType !== 'learningTarget.score');
    facts.push(
      fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.8 }),
      fact('learningTarget.score', { clusterKC: 'kc-b', coverage: 0.9 }),
    );
    const result = projectSparcInstructionalCandidates({ snapshotId: 'snapshot-2', facts });
    assert.equal(result.maximumExpectation, undefined);
    assert.equal(result.expectations.every((candidate) => !candidate.eligible), true);
  });

  it('uses an independent misconception threshold and selects the strongest eligible misconception', function() {
    const result = projectSparcInstructionalCandidates({
      snapshotId: 'snapshot-3',
      facts: [
        ...baseFacts(),
        fact('dialogue.thresholds', { coverageThreshold: 0.9, misconceptionThreshold: 0.6 }),
        fact('autotutor.misconception', { id: 'm-low' }),
        fact('autotutor.misconception', { id: 'm-high' }),
        fact('diagnostic.misconceptionScore', { id: 'm-low', supportStrength: 0.5 }),
        fact('diagnostic.misconceptionScore', { id: 'm-high', supportStrength: 0.7 }),
      ],
    });
    assert.equal(result.misconceptionThreshold, 0.6);
    assert.equal(result.misconceptions.find((candidate) => candidate.targetId === 'm-low')?.eligible, false);
    assert.equal(result.maximumMisconception?.targetId, 'm-high');
  });

  it('treats a misconception exactly at threshold as eligible', function() {
    const result = projectSparcInstructionalCandidates({
      snapshotId: 'snapshot-4',
      facts: [
        ...baseFacts(),
        fact('dialogue.thresholds', { misconceptionThreshold: 0.4 }),
        fact('autotutor.misconception', { id: 'm1' }),
        fact('diagnostic.misconceptionScore', { id: 'm1', supportStrength: 0.4 }),
      ],
    });
    assert.equal(result.maximumMisconception?.targetId, 'm1');
  });

  it('breaks within-kind ties by stable target id', function() {
    const result = projectSparcInstructionalCandidates({
      snapshotId: 'snapshot-5',
      facts: [
        fact('autotutor.expectation', { clusterKC: 'kc-b' }),
        fact('autotutor.expectation', { clusterKC: 'kc-a' }),
        fact('kcGraph.node', { clusterKC: 'kc-b', centrality: 0.5 }),
        fact('kcGraph.node', { clusterKC: 'kc-a', centrality: 0.5 }),
      ],
    });
    assert.equal(result.maximumExpectation?.targetId, 'kc-a');
  });
});
