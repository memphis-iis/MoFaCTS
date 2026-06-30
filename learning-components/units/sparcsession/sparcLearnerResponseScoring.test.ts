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
  schemaVersion: 1,
  workingMemoryFacts: [
    fact('learningTarget.source', { clusterKC: 'kc-a' }),
    fact('learningTarget.source', { clusterKC: 'kc-b' }),
    fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.4 }),
    fact('learningTarget.score', { clusterKC: 'kc-b', coverage: 0.1 }),
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
    documentId: 'score-doc',
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
          evidence: 'Partial evidence.',
        }, {
          clusterKC: 'kc-b',
          coverage: 0.6,
        }],
        diagnosticMisconceptionScores: [{
          id: 'm1',
          confidence: 0.7,
          current: true,
        }],
        answerQuality: 'partial',
        learnerContribution: {
          type: 'answer',
          confidence: 0.8,
          streakCount: 1,
        },
        learnerQuestion: {
          answerableFromAuthoredContent: false,
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
      && entry.slots.confidence === 0.7
      && entry.slots.current === true
    )));
    assert.ok(facts.some((entry) => entry.factType === 'learnerResponse.answerQuality'));
    assert.ok(facts.some((entry) => entry.factType === 'learnerResponse.contribution'));
    assert.equal(facts.some((entry) => entry.factType === 'dialogue.learnerQuestion'), false);
  });

  it('stores learner question metadata only for question contributions', function() {
    const facts = createSparcLearnerResponseScoreFacts({
      facts: document.workingMemoryFacts ?? [],
      score: {
        answerQuality: 'low',
        learnerContribution: {
          type: 'question',
          confidence: 0.9,
        },
        learnerQuestion: {
          answerableFromAuthoredContent: true,
        },
      },
    });

    assert.ok(facts.some((entry) => (
      entry.factType === 'dialogue.learnerQuestion'
      && entry.slots?.answerableFromAuthoredContent === true
    )));
  });

  it('fails clearly when a question contribution lacks learner question metadata', function() {
    assert.throws(
      () => createSparcLearnerResponseScoreFacts({
        facts: document.workingMemoryFacts ?? [],
        score: {
          answerQuality: 'low',
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
        answerQuality: 'high',
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
    assert.ok(facts.some((entry) => (
      entry.factType === 'learnerResponse.answerQuality'
      && entry.slots?.value === 'high'
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

  it('rejects scorer confidence values outside 0..1', function() {
    assert.throws(
      () => createSparcLearnerResponseScoreFacts({
        facts: document.workingMemoryFacts ?? [],
        score: {
          diagnosticMisconceptionScores: [{
            id: 'm1',
            confidence: 1.2,
          }],
        },
      }),
      /confidence must be a number from 0 to 1/,
    );
  });
});
