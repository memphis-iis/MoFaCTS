import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { instantiateSparcAutoTutorInstructionalFacts } from './sparcInstructionalControl';
import type { SparcLearningTargetSelection } from './sparcTargetSelection';
import type { SparcInstructionalControllerConfig, SparcWorkingMemoryFact } from './sparcSessionContracts';

const config: SparcInstructionalControllerConfig = {
  adapterId: 'sparc-autotutor-v1',
  policyId: 'progressive-scaffolding-v1',
  policyVersion: 1,
  parameters: { minimumProgress: 0.3 },
};

function fact(factType: string, slots: Record<string, unknown>): SparcWorkingMemoryFact {
  return { factType, slots };
}

const expectationSelection: SparcLearningTargetSelection = {
  selectedTargetType: 'learningTarget',
  selectedClusterKC: 'kc-a',
  candidates: [],
  misconceptionCandidates: [],
  facts: [],
};

describe('SPARC AutoTutor instructional adapter', function() {
  it('instantiates an expectation target and new focus at ELICIT', function() {
    const result = instantiateSparcAutoTutorInstructionalFacts({
      selection: expectationSelection,
      config,
      facts: [fact('dialogue.thresholds', { coverageThreshold: 0.8 })],
    });
    assert.deepEqual(result.find((entry) => entry.factType === 'instructionalTarget.active')?.slots, {
      targetKey: 'expectation:kc-a',
      targetKind: 'expectation',
      targetId: 'kc-a',
      currentProgress: 0,
      resolutionThreshold: 0.8,
      resolutionInclusive: true,
      focusEpisodeId: 'expectation:kc-a:turn:0',
      status: 'active',
    });
    assert.equal(result.find((entry) => entry.factType === 'scaffold.state')?.slots?.stage, 'ELICIT');
  });

  it('requires at least 0.3 expectation progress', function() {
    const result = instantiateSparcAutoTutorInstructionalFacts({
      selection: expectationSelection,
      config,
      facts: [
        fact('dialogue.thresholds', { coverageThreshold: 0.8 }),
        fact('instructionalTarget.active', {
          targetKey: 'expectation:kc-a', targetKind: 'expectation', targetId: 'kc-a', resolutionThreshold: 0.8,
        }),
        fact('instructionalFocus.episode', {
          focusEpisodeId: 'episode-1', targetKey: 'expectation:kc-a', startedAtTurn: 1, status: 'active',
        }),
        fact('scaffold.state', { focusEpisodeId: 'episode-1', targetKey: 'expectation:kc-a', stage: 'PUMP' }),
        fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.2 }),
        fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.4 }),
      ],
    });
    assert.deepEqual(result.find((entry) => entry.factType === 'learningObservation.targetProgress')?.slots, {
      targetKey: 'expectation:kc-a',
      targetKind: 'expectation',
      targetId: 'kc-a',
      progressBefore: 0.2,
      progressAfter: 0.4,
      progressDelta: 0.2,
      madeProgress: false,
      newlyResolved: false,
    });
  });

  it('requires at least 0.3 normalized misconception progress', function() {
    const selection: SparcLearningTargetSelection = {
      ...expectationSelection,
      selectedTargetType: 'misconception',
      selectedMisconceptionId: 'm1',
    };
    const result = instantiateSparcAutoTutorInstructionalFacts({
      selection,
      config,
      facts: [
        fact('dialogue.thresholds', { coverageThreshold: 0.8 }),
        fact('instructionalTarget.active', {
          targetKey: 'misconception:m1', targetKind: 'misconception', targetId: 'm1', resolutionThreshold: 0.8,
        }),
        fact('instructionalFocus.episode', {
          focusEpisodeId: 'episode-m1', targetKey: 'misconception:m1', startedAtTurn: 1, status: 'active',
        }),
        fact('diagnostic.misconceptionScore', { id: 'm1', confidence: 0.8 }),
        fact('diagnostic.misconceptionScore', { id: 'm1', confidence: 0.6 }),
      ],
    });
    const observation = result.find((entry) => entry.factType === 'learningObservation.targetProgress');
    assert.equal(observation?.slots?.progressDelta, 0.2);
    assert.equal(observation?.slots?.madeProgress, false);
  });

  it('accepts a 0.3 gain for both expectations and misconceptions', function() {
    const baseFacts = [
      fact('dialogue.thresholds', { coverageThreshold: 0.8 }),
      fact('instructionalFocus.episode', {
        focusEpisodeId: 'episode-1', targetKey: 'expectation:kc-a', startedAtTurn: 1, status: 'active',
      }),
    ];
    const expectationResult = instantiateSparcAutoTutorInstructionalFacts({
      selection: expectationSelection,
      config,
      facts: [
        ...baseFacts,
        fact('instructionalTarget.active', {
          targetKey: 'expectation:kc-a', targetKind: 'expectation', targetId: 'kc-a', resolutionThreshold: 0.8,
        }),
        fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.2 }),
        fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.5 }),
      ],
    });
    const misconceptionResult = instantiateSparcAutoTutorInstructionalFacts({
      selection: {
        ...expectationSelection,
        selectedTargetType: 'misconception',
        selectedMisconceptionId: 'm1',
      },
      config,
      facts: [
        fact('dialogue.thresholds', { coverageThreshold: 0.8 }),
        fact('instructionalTarget.active', {
          targetKey: 'misconception:m1', targetKind: 'misconception', targetId: 'm1', resolutionThreshold: 0.8,
        }),
        fact('instructionalFocus.episode', {
          focusEpisodeId: 'episode-m1', targetKey: 'misconception:m1', startedAtTurn: 1, status: 'active',
        }),
        fact('diagnostic.misconceptionScore', { id: 'm1', confidence: 0.8 }),
        fact('diagnostic.misconceptionScore', { id: 'm1', confidence: 0.5 }),
      ],
    });

    assert.equal(
      expectationResult.find((entry) => entry.factType === 'learningObservation.targetProgress')?.slots?.madeProgress,
      true,
    );
    assert.equal(
      misconceptionResult.find((entry) => entry.factType === 'learningObservation.targetProgress')?.slots?.madeProgress,
      true,
    );
  });
});
