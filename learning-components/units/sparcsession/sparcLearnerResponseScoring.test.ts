import { strict as assert } from 'node:assert';
import { applySparcStateTransition, createEmptySparcReplayState } from './sparcStateReplay';
import { buildSparcWorkingMemoryFacts } from './sparcWorkingMemoryFacts';
import {
  createSparcLearnerResponseScoreFacts,
  createSparcLearnerResponseScoreTransition,
} from './sparcLearnerResponseScoring';
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
