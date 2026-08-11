import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { projectSparcAutoTutorInstructionalFacts } from './sparcInstructionalControl';
import type { SparcInstructionalControllerConfig, SparcWorkingMemoryFact } from './sparcSessionContracts';

const config: SparcInstructionalControllerConfig = {
  adapterId: 'sparc-autotutor-v1',
  policyId: 'progressive-scaffolding-v1',
  policyVersion: 1,
  parameters: { minimumProgress: 0.2 },
};

function fact(factType: string, slots: Record<string, unknown>): SparcWorkingMemoryFact {
  return { factType, slots };
}

function authoredFacts(extra: readonly SparcWorkingMemoryFact[] = []): SparcWorkingMemoryFact[] {
  return [
    fact('dialogue.thresholds', { coverageThreshold: 0.8, misconceptionThreshold: 0.2 }),
    fact('autotutor.expectation', { clusterKC: 'kc-a' }),
    fact('kcGraph.node', { clusterKC: 'kc-a', centrality: 0.5 }),
    ...extra,
  ];
}

describe('SPARC AutoTutor instructional projection', function() {
  it('does not choose a target when no cycle exists', function() {
    const result = projectSparcAutoTutorInstructionalFacts({
      snapshotId: 'snapshot-1',
      config,
      facts: authoredFacts([fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.2 })]),
    });
    assert.equal(result.facts.some((entry) => entry.factType === 'instructional.activeCycle'), false);
    assert.equal(result.facts.find((entry) => entry.factType === 'instructional.cycleStatus')?.slots?.continuable, false);
  });

  it('derives meaningful expectation gain from the canonical cycle prior value', function() {
    const result = projectSparcAutoTutorInstructionalFacts({
      snapshotId: 'snapshot-2',
      config,
      facts: authoredFacts([
        fact('instructional.activeCycle', {
          cycleId: 'cycle-a', targetKind: 'expectation', targetId: 'kc-a', targetKey: 'expectation:kc-a',
          stage: 'PUMP', priorValue: 0.2, startedAtTurn: 1, cycleTurnCount: 0, status: 'active',
        }),
        fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.4 }),
      ]),
    });
    const progress = result.facts.find((entry) => entry.factType === 'instructional.progress');
    assert.equal(progress?.slots?.gain, 0.2);
    assert.equal(progress?.slots?.meaningfulGain, true);
    assert.equal(progress?.slots?.goalReached, false);
  });

  it('normalizes misconception repair gain in the improving direction', function() {
    const result = projectSparcAutoTutorInstructionalFacts({
      snapshotId: 'snapshot-3',
      config,
      facts: authoredFacts([
        fact('autotutor.misconception', { id: 'm1' }),
        fact('instructional.activeCycle', {
          cycleId: 'cycle-m1', targetKind: 'misconception', targetId: 'm1', targetKey: 'misconception:m1',
          stage: 'PROMPT', priorValue: 0.8, startedAtTurn: 1, cycleTurnCount: 0, status: 'active',
        }),
        fact('diagnostic.misconceptionScore', { id: 'm1', supportStrength: 0.6 }),
      ]),
    });
    const progress = result.facts.find((entry) => entry.factType === 'instructional.progress');
    assert.equal(progress?.slots?.gain, 0.2);
    assert.equal(progress?.slots?.meaningfulGain, true);
  });

  it('releases a misconception below its repair criterion', function() {
    const result = projectSparcAutoTutorInstructionalFacts({
      snapshotId: 'snapshot-4',
      config,
      facts: authoredFacts([
        fact('autotutor.misconception', { id: 'm1' }),
        fact('instructional.activeCycle', {
          cycleId: 'cycle-m1', targetKind: 'misconception', targetId: 'm1', targetKey: 'misconception:m1',
          stage: 'PROMPT', priorValue: 0.21, startedAtTurn: 1, cycleTurnCount: 1, status: 'active',
        }),
        fact('diagnostic.misconceptionScore', { id: 'm1', supportStrength: 0.19 }),
      ]),
    });
    assert.equal(result.facts.find((entry) => entry.factType === 'instructional.progress')?.slots?.goalReached, true);
    assert.equal(result.facts.find((entry) => entry.factType === 'instructional.cycleStatus')?.slots?.continuable, false);
  });

  it('projects pre-cutover focus state into one canonical cycle', function() {
    const result = projectSparcAutoTutorInstructionalFacts({
      snapshotId: 'snapshot-5',
      config,
      facts: authoredFacts([
        fact('instructionalTarget.active', {
          targetKind: 'expectation', targetId: 'kc-a', targetKey: 'expectation:kc-a', currentProgress: 0.2, status: 'active',
        }),
        fact('instructionalFocus.episode', {
          focusEpisodeId: 'legacy-cycle', targetKey: 'expectation:kc-a', startedAtTurn: 1, status: 'active',
        }),
        fact('scaffold.state', { focusEpisodeId: 'legacy-cycle', stage: 'PUMP' }),
        fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.4 }),
      ]),
    });
    const cycle = result.facts.find((entry) => entry.factType === 'instructional.activeCycle');
    assert.equal(cycle?.slots?.cycleId, 'legacy-cycle');
    assert.equal(cycle?.slots?.migratedFrom, 'pre-canonical-instructional-focus');
  });
});
