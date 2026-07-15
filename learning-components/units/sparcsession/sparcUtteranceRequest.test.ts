import { strict as assert } from 'node:assert';
import type { SparcWorkingMemoryFact } from './sparcSessionContracts';
import { createSparcUtteranceRequestFromFacts } from './sparcUtteranceRequest';

function fact(factType: string, slots: Record<string, unknown>): SparcWorkingMemoryFact {
  return { factType, slots };
}

describe('createSparcUtteranceRequestFromFacts', function() {
  it('fails clearly when the problem statement is missing', function() {
    assert.throws(
      () => createSparcUtteranceRequestFromFacts([
        fact('autotutor.expectation', {
          clusterKC: 'kc-a',
          text: 'Target text.',
        }),
        fact('controller.selectedAction', {
          targetType: 'learningTarget',
          clusterKC: 'kc-a',
          action: 'hint',
        }),
      ]),
      /requires dialogue\.problemStatement\.text/,
    );
  });

  it('creates an utterance request from the selected learning-target action and clean target text', function() {
    const request = createSparcUtteranceRequestFromFacts([
      fact('dialogue.problemStatement', { text: 'Explain the relationship.' }),
      fact('autotutor.expectation', {
        clusterKC: 'kc-a',
        text: 'Think about the first idea.',
      }),
      fact('controller.selectedAction', {
        targetType: 'learningTarget',
        clusterKC: 'kc-a',
        action: 'hint',
        sourceRuleId: 'paper-rule-06-hint',
      }),
    ]);

    assert.equal(request.targetType, 'learningTarget');
    assert.equal(request.targetId, 'kc-a');
    assert.equal(request.action, 'hint');
    assert.deepEqual(request.contentTexts, ['Think about the first idea.']);
    assert.deepEqual(request.selectedAction, {
      targetType: 'learningTarget',
      clusterKC: 'kc-a',
      action: 'hint',
      sourceRuleId: 'paper-rule-06-hint',
    });
    assert.equal(request.moveDefinition.moveId, 'hint');
    assert.equal(request.moveDefinition.promptId, 'autotutor.hint');
    assert.equal(request.sourceRuleId, 'paper-rule-06-hint');
  });

  it('matches clean misconception text by misconception id', function() {
    const request = createSparcUtteranceRequestFromFacts([
      fact('dialogue.problemStatement', { text: 'Explain the relationship.' }),
      fact('autotutor.expectation', {
        clusterKC: 'kc-a',
        text: 'Interest is calculated from the updated balance.',
      }),
      fact('autotutor.misconception', {
        id: 'm1',
        text: 'The same dollar amount is added every year.',
      }),
      fact('diagnostic.misconceptionScore', {
        id: 'm1',
        confidence: 0.95,
      }),
      fact('learnerResponse.contribution', {
        type: 'answer',
        confidence: 0.9,
      }),
      fact('controller.selectedAction', {
        targetType: 'misconception',
        id: 'm1',
        action: 'assertion',
      }),
    ]);

    assert.equal(request.targetId, 'm1');
    assert.deepEqual(request.contentTexts, ['The same dollar amount is added every year.']);
    assert.deepEqual(request.targetContent, {
      selectedMisconception: {
        id: 'm1',
        text: 'The same dollar amount is added every year.',
      },
      correctExpectations: [{
        clusterKC: 'kc-a',
        text: 'Interest is calculated from the updated balance.',
      }],
    });
    assert.deepEqual((request.plannerState as { misconceptions: unknown[] }).misconceptions, [{
      id: 'm1',
      confidence: 0.95,
    }]);
  });

  it('creates a dedicated utterance request for a legitimate learner question', function() {
    const request = createSparcUtteranceRequestFromFacts([
      fact('dialogue.problemStatement', { text: 'Explain the relationship.' }),
      fact('dialogue.learnerQuestion', { contentFocused: true }),
      fact('learnerResponse.contribution', { type: 'question', confidence: 0.95 }),
      fact('controller.selectedAction', {
        targetType: 'learnerQuestion',
        targetId: 'learner-question',
        action: 'question-deferral',
        sourceRuleId: 'dialogue.question.defer',
      }),
    ]);

    assert.equal(request.targetType, 'learnerQuestion');
    assert.equal(request.targetId, 'learner-question');
    assert.equal(request.action, 'question-deferral');
    assert.deepEqual(request.contentTexts, []);
    assert.deepEqual(request.targetContent, { contentFocused: true });
    assert.equal(request.moveDefinition.moveId, 'question-deferral');
  });

  it('fails clearly when selected clean target text is missing', function() {
    assert.throws(
      () => createSparcUtteranceRequestFromFacts([
        fact('dialogue.problemStatement', { text: 'Explain the relationship.' }),
        fact('controller.selectedAction', {
          targetType: 'learningTarget',
          clusterKC: 'kc-a',
          action: 'prompt',
        }),
      ]),
      /missing clean expectation text for clusterKC "kc-a"/,
    );
  });

  it('creates a completion utterance request from clean expectation text', function() {
    const request = createSparcUtteranceRequestFromFacts([
      fact('dialogue.problemStatement', { text: 'Explain the relationship.' }),
      fact('autotutor.expectation', {
        clusterKC: 'kc-a',
        text: 'Summarize the first target.',
      }),
      fact('autotutor.expectation', {
        clusterKC: 'kc-b',
        text: 'Summarize the second target.',
      }),
      fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.9 }),
      fact('learningTarget.score', { clusterKC: 'kc-b', coverage: 0.4 }),
      fact('autotutor.misconception', { id: 'm1', text: 'An unresolved misconception.' }),
      fact('diagnostic.misconceptionScore', { id: 'm1', confidence: 0.7 }),
      fact('controller.completionState', {
        completed: true,
        reason: 'max-turns',
        coverageThreshold: 0.8,
        turnCount: 25,
        maxTurns: 25,
      }),
      fact('controller.selectedAction', {
        targetType: 'completion',
        action: 'summary',
      }),
    ]);

    assert.equal(request.targetType, 'completion');
    assert.equal(request.targetId, 'completion');
    assert.equal(request.action, 'summary');
    assert.deepEqual(request.contentTexts, ['Summarize the first target.', 'Summarize the second target.']);
    assert.deepEqual(request.selectedAction, {
      targetType: 'completion',
      action: 'summary',
    });
    assert.equal(request.moveDefinition.moveId, 'summary');
    assert.deepEqual(request.targetContent, {
      completion: {
        completed: true,
        reason: 'max-turns',
        coverageThreshold: 0.8,
        turnCount: 25,
        maxTurns: 25,
      },
      expectations: [{
        clusterKC: 'kc-a',
        text: 'Summarize the first target.',
        coverage: 0.9,
        status: 'covered',
      }, {
        clusterKC: 'kc-b',
        text: 'Summarize the second target.',
        coverage: 0.4,
        status: 'uncovered',
      }],
      misconceptions: [{
        id: 'm1',
        text: 'An unresolved misconception.',
        confidence: 0.7,
        status: 'active',
      }],
    });
  });

  it('fails clearly when the selected move has no active registered definition', function() {
    assert.throws(
      () => createSparcUtteranceRequestFromFacts([
        fact('dialogue.problemStatement', { text: 'Explain the relationship.' }),
        fact('autotutor.expectation', {
          clusterKC: 'kc-a',
          text: 'Target text.',
        }),
        fact('controller.selectedAction', {
          targetType: 'learningTarget',
          clusterKC: 'kc-a',
          action: 'neutral_feedback',
        }),
      ]),
      /selected move "neutral_feedback" has no registered move definition/,
    );
  });

  it('fails clearly when completion selected action content is missing', function() {
    assert.throws(
      () => createSparcUtteranceRequestFromFacts([
        fact('dialogue.problemStatement', { text: 'Explain the relationship.' }),
        fact('controller.selectedAction', {
          targetType: 'completion',
          action: 'summary',
        }),
      ]),
      /missing clean expectation text for completion summary/,
    );
  });

  it('requires exactly one selected action fact', function() {
    assert.throws(
      () => createSparcUtteranceRequestFromFacts([
        fact('dialogue.problemStatement', { text: 'Explain the relationship.' }),
        fact('controller.selectedAction', {
          targetType: 'learningTarget',
          clusterKC: 'kc-a',
          action: 'hint',
        }),
        fact('controller.selectedAction', {
          targetType: 'learningTarget',
          clusterKC: 'kc-a',
          action: 'prompt',
        }),
      ]),
      /requires exactly one controller\.selectedAction fact; found 2/,
    );
  });
});
