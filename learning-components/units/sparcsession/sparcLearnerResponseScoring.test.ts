import { strict as assert } from 'node:assert';
import { applySparcStateTransition, createEmptySparcReplayState } from './sparcStateReplay';
import { buildSparcWorkingMemoryFacts } from './sparcWorkingMemoryFacts';
import {
  createSparcLearnerResponseScoreFacts,
  createSparcLearnerResponseScoreTransition,
  reduceSparcLearnerResponseEvidence,
} from './sparcLearnerResponseScoring';
import type { SparcLearnerResponseEvidenceEnvelope } from './sparcLearnerResponseScoring';
import type {
  SparcAuthoredDocument,
  SparcInterfaceEvent,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';

function fact(factType: string, slots: Record<string, unknown>): SparcWorkingMemoryFact {
  return { factType, slots };
}

const document: SparcAuthoredDocument = {
  id: 'score-doc',
  schemaVersion: 2,
  workingMemoryFacts: [
    fact('autotutor.expectation', { clusterKC: 'kc-a' }),
    fact('autotutor.expectation', { clusterKC: 'kc-b' }),
    fact('autotutor.misconception', { id: 'm1' }),
    fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.4 }),
    fact('learningTarget.score', { clusterKC: 'kc-b', coverage: 0.1 }),
    fact('diagnostic.misconceptionScore', { id: 'm1', supportStrength: 0.2 }),
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

const event: SparcInterfaceEvent = {
  eventId: 'score-turn-1',
  type: 'response-submitted',
  source: {
    pageKey: 'score-doc',
    nodeId: 'learner-input',
  },
  time: 1000,
  payload: {
    input: 'Learner answer.',
  },
};

describe('sparcLearnerResponseScoring', function() {
  it('reduces complete overlapping E1-E4 evidence and clears only contradicted misconceptions', function() {
    const facts = [
      ...['e1', 'e2', 'e3', 'e4'].map((clusterKC) => fact('autotutor.expectation', { clusterKC })),
      ...['M1', 'M2', 'M3'].map((id) => fact('autotutor.misconception', { id })),
      fact('learningTarget.score', { clusterKC: 'e1', coverage: 0.25 }),
      fact('learningTarget.score', { clusterKC: 'e2', coverage: 0.5 }),
      fact('learningTarget.score', { clusterKC: 'e3', coverage: 0.75 }),
      fact('diagnostic.misconceptionScore', { id: 'M1', supportStrength: 0.8 }),
      fact('diagnostic.misconceptionScore', { id: 'M2', supportStrength: 0.4 }),
      fact('diagnostic.misconceptionScore', { id: 'M3', supportStrength: 0.25 }),
    ];
    const score = reduceSparcLearnerResponseEvidence({
      facts,
      evidence: {
        learningTargetEvaluations: ['e4', 'e3', 'e2', 'e1'].map((clusterKC) => ({
          clusterKC,
          evidenceDirection: 'supports' as const,
          evidenceStrength: 1,
        })),
        diagnosticMisconceptionEvaluations: [{
          id: 'M1', evidenceDirection: 'contradicts', evidenceStrength: 1,
        }, {
          id: 'M2', evidenceDirection: 'unaddressed', evidenceStrength: 0,
        }, {
          id: 'M3', evidenceDirection: 'unaddressed', evidenceStrength: 0,
        }],
        learnerContribution: { type: 'answer' },
      },
    });

    assert.deepEqual(score.learningTargetScores, [
      { clusterKC: 'e1', coverage: 1 },
      { clusterKC: 'e2', coverage: 1 },
      { clusterKC: 'e3', coverage: 1 },
      { clusterKC: 'e4', coverage: 1 },
    ]);
    assert.deepEqual(score.diagnosticMisconceptionScores, [{ id: 'M1', supportStrength: 0 }]);
    assert.equal(score.learnerContribution?.type, 'answer');
  });

  it('uses contradiction direction without reducing expectations and clears contradicted misconceptions', function() {
    const score = reduceSparcLearnerResponseEvidence({
      facts: document.workingMemoryFacts ?? [],
      evidence: {
        learningTargetEvaluations: [{
          clusterKC: 'kc-a', evidenceDirection: 'contradicts', evidenceStrength: 0.6,
        }, {
          clusterKC: 'kc-b', evidenceDirection: 'unaddressed', evidenceStrength: 0,
        }],
        diagnosticMisconceptionEvaluations: [{
          id: 'm1', evidenceDirection: 'contradicts', evidenceStrength: 0.4,
        }],
        learnerContribution: { type: 'answer' },
      },
    });

    assert.deepEqual(score.learningTargetScores, []);
    assert.deepEqual(score.diagnosticMisconceptionScores, [{ id: 'm1', supportStrength: 0 }]);
  });

  it('keeps expectation coverage cumulative while replacing changed supported misconception strength', function() {
    const score = reduceSparcLearnerResponseEvidence({
      facts: document.workingMemoryFacts ?? [],
      evidence: {
        learningTargetEvaluations: [{
          clusterKC: 'kc-a', evidenceDirection: 'supports', evidenceStrength: 0.3,
        }, {
          clusterKC: 'kc-b', evidenceDirection: 'supports', evidenceStrength: 0.1,
        }],
        diagnosticMisconceptionEvaluations: [{
          id: 'm1', evidenceDirection: 'supports', evidenceStrength: 0.1,
        }],
        learnerContribution: { type: 'answer' },
      },
    });

    assert.deepEqual(score.learningTargetScores, []);
    assert.deepEqual(score.diagnosticMisconceptionScores, [{ id: 'm1', supportStrength: 0.1 }]);
  });

  it('preserves an active compounding-frequency misconception when a calculation leaves it unaddressed', function() {
    const score = reduceSparcLearnerResponseEvidence({
      facts: [
        fact('autotutor.expectation', { clusterKC: 'compound.e1' }),
        fact('autotutor.misconception', { id: 'M3' }),
        fact('diagnostic.misconceptionScore', { id: 'M3', supportStrength: 0.25 }),
      ],
      evidence: {
        learningTargetEvaluations: [{
          clusterKC: 'compound.e1', evidenceDirection: 'unaddressed', evidenceStrength: 0,
        }],
        diagnosticMisconceptionEvaluations: [{
          id: 'M3', evidenceDirection: 'unaddressed', evidenceStrength: 0,
        }],
        learnerContribution: { type: 'answer' },
      },
    });

    assert.deepEqual(score.learningTargetScores, []);
    assert.equal(score.diagnosticMisconceptionScores, undefined);
  });

  it('requires a complete exact set of authored evidence identifiers', function() {
    const completeEvidence: SparcLearnerResponseEvidenceEnvelope = {
      learningTargetEvaluations: [{
        clusterKC: 'kc-a', evidenceDirection: 'unaddressed', evidenceStrength: 0,
      }, {
        clusterKC: 'kc-b', evidenceDirection: 'unaddressed', evidenceStrength: 0,
      }],
      diagnosticMisconceptionEvaluations: [{
        id: 'm1', evidenceDirection: 'unaddressed', evidenceStrength: 0,
      }],
      learnerContribution: { type: 'answer' },
    };
    const invalidEvidence: Array<{
      readonly evidence: SparcLearnerResponseEvidenceEnvelope;
      readonly message: RegExp;
    }> = [{
      evidence: { ...completeEvidence, learningTargetEvaluations: completeEvidence.learningTargetEvaluations.slice(0, 1) },
      message: /missing learning target clusterKC "kc-b"/,
    }, {
      evidence: {
        ...completeEvidence,
        learningTargetEvaluations: [{
          clusterKC: 'kc-a ', evidenceDirection: 'unaddressed', evidenceStrength: 0,
        }, completeEvidence.learningTargetEvaluations[1]!],
      },
      message: /unknown learning target clusterKC "kc-a "/,
    }, {
      evidence: {
        ...completeEvidence,
        diagnosticMisconceptionEvaluations: [
          completeEvidence.diagnosticMisconceptionEvaluations[0]!,
          completeEvidence.diagnosticMisconceptionEvaluations[0]!,
        ],
      },
      message: /duplicate diagnostic misconception id "m1"/,
    }];

    for (const invalid of invalidEvidence) {
      assert.throws(
        () => reduceSparcLearnerResponseEvidence({
          facts: document.workingMemoryFacts ?? [],
          evidence: invalid.evidence,
        }),
        invalid.message,
      );
    }
  });

  it('rejects inconsistent evidence directions and strengths', function() {
    const invalidEvidence = [{
      learningTargetEvaluations: [{
        clusterKC: 'kc-a', evidenceDirection: 'supports', evidenceStrength: 0,
      }, {
        clusterKC: 'kc-b', evidenceDirection: 'unaddressed', evidenceStrength: 0,
      }],
      diagnosticMisconceptionEvaluations: [{
        id: 'm1', evidenceDirection: 'unaddressed', evidenceStrength: 0,
      }],
      learnerContribution: { type: 'answer' },
    }, {
      learningTargetEvaluations: [{
        clusterKC: 'kc-a', evidenceDirection: 'contradicts', evidenceStrength: 0,
      }, {
        clusterKC: 'kc-b', evidenceDirection: 'unaddressed', evidenceStrength: 0,
      }],
      diagnosticMisconceptionEvaluations: [{
        id: 'm1', evidenceDirection: 'unaddressed', evidenceStrength: 0,
      }],
      learnerContribution: { type: 'answer' },
    }, {
      learningTargetEvaluations: [{
        clusterKC: 'kc-a', evidenceDirection: 'unaddressed', evidenceStrength: 0.2,
      }, {
        clusterKC: 'kc-b', evidenceDirection: 'unaddressed', evidenceStrength: 0,
      }],
      diagnosticMisconceptionEvaluations: [{
        id: 'm1', evidenceDirection: 'unaddressed', evidenceStrength: 0,
      }],
      learnerContribution: { type: 'answer' },
    }] as SparcLearnerResponseEvidenceEnvelope[];
    const messages = [
      /evidenceStrength must be greater than 0 when evidenceDirection is supports/,
      /evidenceStrength must be greater than 0 when evidenceDirection is contradicts/,
      /evidenceStrength must be 0 when evidenceDirection is unaddressed/,
    ];

    invalidEvidence.forEach((evidence, index) => {
      assert.throws(
        () => reduceSparcLearnerResponseEvidence({
          facts: document.workingMemoryFacts ?? [],
          evidence,
        }),
        messages[index]!,
      );
    });
  });

  it('accepts cumulative instructional evidence with an off-task latest contribution', function() {
    const score = reduceSparcLearnerResponseEvidence({
      facts: document.workingMemoryFacts ?? [],
      evidence: {
        learningTargetEvaluations: [{
          clusterKC: 'kc-a', evidenceDirection: 'supports', evidenceStrength: 0.4,
        }, {
          clusterKC: 'kc-b', evidenceDirection: 'supports', evidenceStrength: 0.1,
        }],
        diagnosticMisconceptionEvaluations: [{
          id: 'm1', evidenceDirection: 'supports', evidenceStrength: 0.2,
        }],
        learnerContribution: { type: 'off-task' },
      },
    });

    assert.deepEqual(score.learningTargetScores, []);
    assert.equal(score.diagnosticMisconceptionScores, undefined);
    assert.deepEqual(score.learnerContribution, { type: 'off-task' });
  });

  it('rejects invalid evidence directions and nonnumeric strengths', function() {
    const baseEvidence = {
      learningTargetEvaluations: [{
        clusterKC: 'kc-a', evidenceDirection: 'unaddressed', evidenceStrength: 0,
      }, {
        clusterKC: 'kc-b', evidenceDirection: 'unaddressed', evidenceStrength: 0,
      }],
      diagnosticMisconceptionEvaluations: [{
        id: 'm1', evidenceDirection: 'unaddressed', evidenceStrength: 0,
      }],
      learnerContribution: { type: 'answer' },
    };
    const invalidDirection = {
      ...baseEvidence,
      learningTargetEvaluations: [{
        clusterKC: 'kc-a', evidenceDirection: 'maybe', evidenceStrength: 0,
      }, baseEvidence.learningTargetEvaluations[1]],
    } as unknown as SparcLearnerResponseEvidenceEnvelope;
    const nonnumericStrength = {
      ...baseEvidence,
      diagnosticMisconceptionEvaluations: [{
        id: 'm1', evidenceDirection: 'supports', evidenceStrength: '0.5',
      }],
    } as unknown as SparcLearnerResponseEvidenceEnvelope;

    assert.throws(
      () => reduceSparcLearnerResponseEvidence({
        facts: document.workingMemoryFacts ?? [],
        evidence: invalidDirection,
      }),
      /evidenceDirection must be supports, contradicts, or unaddressed/,
    );
    assert.throws(
      () => reduceSparcLearnerResponseEvidence({
        facts: document.workingMemoryFacts ?? [],
        evidence: nonnumericStrength,
      }),
      /evidenceStrength must be a number from 0 to 1/,
    );
  });

  it('requires question metadata and ignores it for non-question contributions', function() {
    const baseEvidence = {
      learningTargetEvaluations: [{
        clusterKC: 'kc-a', evidenceDirection: 'unaddressed' as const, evidenceStrength: 0,
      }, {
        clusterKC: 'kc-b', evidenceDirection: 'unaddressed' as const, evidenceStrength: 0,
      }],
      diagnosticMisconceptionEvaluations: [{
        id: 'm1', evidenceDirection: 'unaddressed' as const, evidenceStrength: 0,
      }],
    };
    assert.throws(
      () => reduceSparcLearnerResponseEvidence({
        facts: document.workingMemoryFacts ?? [],
        evidence: { ...baseEvidence, learnerContribution: { type: 'question' } },
      }),
      /learner question metadata is required/,
    );

    const score = reduceSparcLearnerResponseEvidence({
      facts: document.workingMemoryFacts ?? [],
      evidence: {
        ...baseEvidence,
        learnerContribution: { type: 'answer' },
        learnerQuestion: { contentFocused: true },
      },
    });
    assert.equal(score.learnerQuestion, undefined);
  });

  it('normalizes scorer output into canonical SPARC learner and score facts', function() {
    const facts = createSparcLearnerResponseScoreFacts({
      facts: document.workingMemoryFacts ?? [],
      score: {
        learningTargetScores: [{
          clusterKC: 'kc-a',
          coverage: 0.3,
        }, {
          clusterKC: 'kc-b',
          coverage: 0.6,
        }],
        diagnosticMisconceptionScores: [{
          id: 'm1',
          supportStrength: 0.7,
        }],
        learnerContribution: {
          type: 'answer',
          confidence: 0.8,
          streakCount: 1,
        },
        learnerQuestion: {
          contentFocused: false,
        },
      },
    });

    assert.equal(facts.find((entry) => (
      entry.factType === 'learningTarget.score'
      && entry.slots?.clusterKC === 'kc-a'
    ))?.slots?.coverage, 0.4);
    assert.equal(facts.find((entry) => (
      entry.factType === 'learningTarget.score'
      && entry.slots?.clusterKC === 'kc-b'
    ))?.slots?.coverage, 0.6);
    assert.ok(facts.some((entry) => (
      entry.factType === 'diagnostic.misconceptionScore'
      && entry.slots?.id === 'm1'
      && entry.slots.supportStrength === 0.7
    )));
    assert.ok(facts.some((entry) => entry.factType === 'learnerResponse.contribution'));
    assert.equal(facts.some((entry) => entry.factType.startsWith('selector.')), false);
    assert.equal(facts.some((entry) => entry.factType === 'dialogue.learnerQuestion'), false);
  });

  it('preserves durable target scores when the scorer omits an update', function() {
    const facts = createSparcLearnerResponseScoreFacts({
      facts: document.workingMemoryFacts ?? [],
      score: {
        learningTargetScores: [{
          clusterKC: 'kc-b',
          coverage: 0.2,
        }],
      },
    });

    assert.equal(facts.find((entry) => entry.slots?.clusterKC === 'kc-a')?.slots?.coverage, 0.4);
    assert.equal(facts.find((entry) => entry.slots?.clusterKC === 'kc-b')?.slots?.coverage, 0.2);
    assert.equal(facts.find((entry) => entry.slots?.id === 'm1')?.slots?.supportStrength, 0.2);
  });

  it('stores learner question metadata only for question contributions', function() {
    const facts = createSparcLearnerResponseScoreFacts({
      facts: document.workingMemoryFacts ?? [],
      score: {
        learnerContribution: {
          type: 'question',
          confidence: 0.9,
        },
        learnerQuestion: {
          contentFocused: true,
        },
      },
    });

    assert.ok(facts.some((entry) => (
      entry.factType === 'dialogue.learnerQuestion'
      && entry.slots?.contentFocused === true
    )));
  });

  it('fails clearly when a question contribution lacks learner question metadata', function() {
    assert.throws(
      () => createSparcLearnerResponseScoreFacts({
        facts: document.workingMemoryFacts ?? [],
        score: {
          learnerContribution: {
            type: 'question',
          },
        },
      }),
      /learner question metadata is required/,
    );
  });

  it('persists scoring facts as latest-value SPARC replay state', function() {
    const transition = createSparcLearnerResponseScoreTransition({
      document,
      event,
      facts: document.workingMemoryFacts ?? [],
      score: {
        learningTargetScores: [{
          clusterKC: 'kc-b',
          coverage: 0.6,
        }],
      },
    });
    const replayState = applySparcStateTransition(createEmptySparcReplayState(), transition);
    const facts = buildSparcWorkingMemoryFacts({
      document,
      replayState,
    });

    assert.ok(facts.some((entry) => (
      entry.factType === 'learningTarget.score'
      && entry.slots?.clusterKC === 'kc-b'
      && entry.slots.coverage === 0.6
    )));
  });

  it('rejects unknown learning target clusterKCs clearly', function() {
    assert.throws(
      () => createSparcLearnerResponseScoreFacts({
        facts: document.workingMemoryFacts ?? [],
        score: {
          learningTargetScores: [{
            clusterKC: 'kc-missing',
            coverage: 0.5,
          }],
        },
      }),
      /unknown learning target clusterKC "kc-missing"/,
    );
  });

  it('uses learner question metadata only as a current-turn routing fact', function() {
    const scoredFacts = createSparcLearnerResponseScoreFacts({
      facts: document.workingMemoryFacts ?? [],
      score: {
        learnerContribution: { type: 'question' },
        learnerQuestion: { contentFocused: true },
      },
    });
    const transition = createSparcLearnerResponseScoreTransition({
      document,
      event,
      facts: document.workingMemoryFacts ?? [],
      score: {
        learnerContribution: { type: 'question' },
        learnerQuestion: { contentFocused: true },
      },
    });

    assert.ok(scoredFacts.some((entry) => entry.factType === 'dialogue.learnerQuestion'));
    assert.equal(transition.writes.some((write) => (
      write.value
      && typeof write.value === 'object'
      && (write.value as { factType?: string }).factType === 'dialogue.learnerQuestion'
    )), false);
  });

  it('rejects duplicate score updates for the same target', function() {
    assert.throws(
      () => createSparcLearnerResponseScoreFacts({
        facts: document.workingMemoryFacts ?? [],
        score: {
          learningTargetScores: [{
            clusterKC: 'kc-a',
            coverage: 0.5,
          }, {
            clusterKC: 'kc-a',
            coverage: 0.6,
          }],
        },
      }),
      /duplicate learning target clusterKC "kc-a"/,
    );
  });

  it('rejects unknown misconception ids clearly', function() {
    assert.throws(
      () => createSparcLearnerResponseScoreFacts({
        facts: document.workingMemoryFacts ?? [],
        score: {
          diagnosticMisconceptionScores: [{
            id: 'm-missing',
            supportStrength: 0.5,
          }],
        },
      }),
      /unknown diagnostic misconception id "m-missing"/,
    );
  });

  it('rejects scorer support-strength values outside 0..1', function() {
    assert.throws(
      () => createSparcLearnerResponseScoreFacts({
        facts: document.workingMemoryFacts ?? [],
        score: {
          diagnosticMisconceptionScores: [{
            id: 'm1',
            supportStrength: 1.2,
          }],
        },
      }),
      /supportStrength must be a number from 0 to 1/,
    );
  });
});
