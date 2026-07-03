import { strict as assert } from 'node:assert';
import type { SparcWorkingMemoryFact } from './sparcSessionContracts';
import { createSparcUtteranceRequestFromFacts } from './sparcUtteranceRequest';

function fact(factType: string, slots: Record<string, unknown>): SparcWorkingMemoryFact {
  return { factType, slots };
}

describe('createSparcUtteranceRequestFromFacts', function() {
  it('creates an utterance request from the selected learning-target action and clean target text', function() {
    const request = createSparcUtteranceRequestFromFacts([
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
      fact('autotutor.misconception', {
        id: 'm1',
        text: 'Repair this misconception.',
      }),
      fact('controller.selectedAction', {
        targetType: 'misconception',
        id: 'm1',
        action: 'splice',
      }),
    ]);

    assert.equal(request.targetId, 'm1');
    assert.deepEqual(request.contentTexts, ['Repair this misconception.']);
  });

  it('fails clearly when selected clean target text is missing', function() {
    assert.throws(
      () => createSparcUtteranceRequestFromFacts([
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
      fact('autotutor.expectation', {
        clusterKC: 'kc-a',
        text: 'Summarize the first target.',
      }),
      fact('autotutor.expectation', {
        clusterKC: 'kc-b',
        text: 'Summarize the second target.',
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
  });

  it('fails clearly when the selected move has no active registered definition', function() {
    assert.throws(
      () => createSparcUtteranceRequestFromFacts([
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
      /selected move "neutral_feedback" is registered as legacy-disabled/,
    );
  });

  it('fails clearly when completion selected action content is missing', function() {
    assert.throws(
      () => createSparcUtteranceRequestFromFacts([
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
