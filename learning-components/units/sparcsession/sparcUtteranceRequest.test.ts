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

    assert.deepEqual(request, {
      targetType: 'learningTarget',
      targetId: 'kc-a',
      action: 'hint',
      contentTexts: ['Think about the first idea.'],
      selectedAction: {
        targetType: 'learningTarget',
        clusterKC: 'kc-a',
        action: 'hint',
        sourceRuleId: 'paper-rule-06-hint',
        templateVersion: 'paper-dialogue-move-v1',
      },
      sourceRuleId: 'paper-rule-06-hint',
      templateVersion: 'paper-dialogue-move-v1',
    });
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

    assert.deepEqual(request, {
      targetType: 'completion',
      targetId: 'completion',
      action: 'summary',
      contentTexts: ['Summarize the lesson.'],
      selectedAction: {
        targetType: 'completion',
        action: 'summary',
      },
    });
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
