import { strict as assert } from 'node:assert';
import type { SparcWorkingMemoryFact } from './sparcSessionContracts';
import { deriveSparcControllerFacts } from './sparcControllerDerivedFacts';

function fact(factType: string, slots: Record<string, unknown>): SparcWorkingMemoryFact {
  return { factType, slots };
}

describe('deriveSparcControllerFacts', function() {
  it('derives learner word count, required coverage mean, and turn state', function() {
    const result = deriveSparcControllerFacts([
      fact('autotutor.expectation', { clusterKC: 'kc-a' }),
      fact('autotutor.expectation', { clusterKC: 'kc-b' }),
      fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.25 }),
      fact('learningTarget.score', { clusterKC: 'kc-b', coverage: 0.75 }),
      fact('dialogue.learnerWordCount', { cumulative: 4 }),
      fact('session.turnState', { turnCount: 2 }),
      fact('interface-event', {
        eventType: 'response-submitted',
        input: 'three more words',
      }),
    ]);

    assert.deepEqual(result, [{
      factType: 'dialogue.learnerWordCount',
      slots: {
        cumulative: 7,
      },
    }, {
      factType: 'learningTarget.coverageMean',
      slots: {
        scope: 'required',
        value: 0.5,
      },
    }, {
      factType: 'session.turnState',
      slots: {
        turnCount: 3,
      },
    }, {
      factType: 'controller.completionState',
      slots: {
        completed: false,
        reason: 'in-progress',
        coveredTargetCount: 0,
        requiredTargetCount: 2,
        totalTargetCount: 2,
        coverageThreshold: 0.8,
        turnCount: 3,
      },
    }]);
  });

  it('treats missing learning-target coverage as zero', function() {
    const result = deriveSparcControllerFacts([
      fact('autotutor.expectation', { clusterKC: 'kc-a' }),
      fact('autotutor.expectation', { clusterKC: 'kc-b' }),
      fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.5 }),
    ], {
      includeCurrentTurn: false,
    });

    assert.equal(result.find((entry) => entry.factType === 'learningTarget.coverageMean')?.slots?.value, 0.25);
    assert.equal(result.find((entry) => entry.factType === 'session.turnState')?.slots?.turnCount, 0);
    assert.equal(result.find((entry) => entry.factType === 'controller.completionState')?.slots?.completed, false);
  });

  it('does not increment the turn count for blank submitted input', function() {
    const result = deriveSparcControllerFacts([
      fact('autotutor.expectation', { clusterKC: 'kc-a' }),
      fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0 }),
      fact('session.turnState', { turnCount: 2 }),
      fact('interface-event', {
        eventType: 'response-submitted',
        input: '   ',
      }),
    ]);

    assert.equal(result.find((entry) => entry.factType === 'session.turnState')?.slots?.turnCount, 2);
  });

  it('marks completion when enough required targets meet the coverage threshold', function() {
    const result = deriveSparcControllerFacts([
      fact('dialogue.thresholds', { coverageThreshold: 0.75 }),
      fact('dialogue.graduation', { requiredTargetCount: 2 }),
      fact('autotutor.expectation', { clusterKC: 'kc-a' }),
      fact('autotutor.expectation', { clusterKC: 'kc-b' }),
      fact('autotutor.expectation', { clusterKC: 'kc-c' }),
      fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.8 }),
      fact('learningTarget.score', { clusterKC: 'kc-b', coverage: 0.75 }),
      fact('learningTarget.score', { clusterKC: 'kc-c', coverage: 0.1 }),
    ], {
      includeCurrentTurn: false,
    });

    assert.deepEqual(result.find((entry) => entry.factType === 'controller.completionState')?.slots, {
      completed: true,
      reason: 'required-coverage',
      coveredTargetCount: 2,
      requiredTargetCount: 2,
      totalTargetCount: 3,
      coverageThreshold: 0.75,
      turnCount: 0,
    });
  });

  it('marks completion when the max turn policy is reached', function() {
    const result = deriveSparcControllerFacts([
      fact('dialogue.graduation', { requiredTargetCount: 1, maxTurns: 3 }),
      fact('autotutor.expectation', { clusterKC: 'kc-a' }),
      fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.2 }),
      fact('session.turnState', { turnCount: 2 }),
      fact('interface-event', {
        eventType: 'response-submitted',
        input: 'last try',
      }),
    ]);

    assert.equal(result.find((entry) => entry.factType === 'controller.completionState')?.slots?.completed, true);
    assert.equal(result.find((entry) => entry.factType === 'controller.completionState')?.slots?.reason, 'max-turns');
    assert.equal(result.find((entry) => entry.factType === 'controller.completionState')?.slots?.maxTurns, 3);
  });

  it('fails clearly without generated learning targets', function() {
    assert.throws(
      () => deriveSparcControllerFacts([]),
      /requires at least one learningTarget\.source fact/,
    );
  });
});
