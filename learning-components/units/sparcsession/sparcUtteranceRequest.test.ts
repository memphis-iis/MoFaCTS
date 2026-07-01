import { strict as assert } from 'node:assert';
import type { SparcWorkingMemoryFact } from './sparcSessionContracts';
import { createSparcUtteranceRequestFromFacts } from './sparcUtteranceRequest';

function fact(factType: string, slots: Record<string, unknown>): SparcWorkingMemoryFact {
  return { factType, slots };
}

describe('createSparcUtteranceRequestFromFacts', function() {
  it('creates an utterance request from the selected learning-target action and authored move content', function() {
    const request = createSparcUtteranceRequestFromFacts([
      fact('controller.selectedAction', {
        targetType: 'learningTarget',
        clusterKC: 'kc-a',
        action: 'hint',
        sourceRuleId: 'paper-rule-06-hint',
        templateVersion: 'paper-dialogue-move-v1',
      }),
      fact('dialogue.moveContent', {
        targetType: 'learningTarget',
        clusterKC: 'kc-a',
        action: 'hint',
        text: 'Think about the first idea.',
      }),
      fact('dialogue.moveContent', {
        targetType: 'learningTarget',
        clusterKC: 'kc-b',
        action: 'hint',
        text: 'Wrong target.',
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
      templateVersion: 'paper-dialogue-move-v1',
    });
    assert.equal(request.moveDefinition.moveId, 'hint');
    assert.equal(request.moveDefinition.promptId, 'autotutor.hint');
    assert.equal(request.sourceRuleId, 'paper-rule-06-hint');
    assert.equal(request.templateVersion, 'paper-dialogue-move-v1');
  });

  it('matches misconception move content by misconception id', function() {
    const request = createSparcUtteranceRequestFromFacts([
      fact('controller.selectedAction', {
        targetType: 'misconception',
        id: 'm1',
        action: 'splice',
      }),
      fact('dialogue.moveContent', {
        targetType: 'misconception',
        id: 'm1',
        action: 'splice',
        text: 'Repair this misconception.',
      }),
    ]);

    assert.equal(request.targetId, 'm1');
    assert.deepEqual(request.contentTexts, ['Repair this misconception.']);
  });

  it('fails clearly when selected action content is missing', function() {
    assert.throws(
      () => createSparcUtteranceRequestFromFacts([
        fact('controller.selectedAction', {
          targetType: 'learningTarget',
          clusterKC: 'kc-a',
          action: 'prompt',
        }),
        fact('dialogue.moveContent', {
          targetType: 'learningTarget',
          clusterKC: 'kc-a',
          action: 'hint',
          text: 'Wrong action.',
        }),
      ]),
      /missing dialogue\.moveContent for learningTarget "kc-a" action "prompt"/,
    );
  });

  it('creates a completion utterance request from completion move content', function() {
    const request = createSparcUtteranceRequestFromFacts([
      fact('controller.selectedAction', {
        targetType: 'completion',
        action: 'summary',
      }),
      fact('dialogue.moveContent', {
        targetType: 'completion',
        action: 'summary',
        text: 'Summarize the lesson.',
      }),
    ]);

    assert.equal(request.targetType, 'completion');
    assert.equal(request.targetId, 'completion');
    assert.equal(request.action, 'summary');
    assert.deepEqual(request.contentTexts, ['Summarize the lesson.']);
    assert.deepEqual(request.selectedAction, {
      targetType: 'completion',
      action: 'summary',
    });
    assert.equal(request.moveDefinition.moveId, 'summary');
  });

  it('fails clearly when the selected move has no active registered definition', function() {
    assert.throws(
      () => createSparcUtteranceRequestFromFacts([
        fact('controller.selectedAction', {
          targetType: 'learningTarget',
          clusterKC: 'kc-a',
          action: 'neutral_feedback',
        }),
        fact('dialogue.moveContent', {
          targetType: 'learningTarget',
          clusterKC: 'kc-a',
          action: 'neutral_feedback',
          text: 'Legacy feedback content.',
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
      /missing dialogue\.moveContent for completion "completion" action "summary"/,
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
