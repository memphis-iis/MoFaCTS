import assert from 'node:assert/strict';
import { sparcTrialDisplayAdapter } from './SparcTrialDisplayAdapter';

describe('sparc semantic nodes', function() {
  it('normalizes semantic multiple-choice nodes into prompt and vertical answer-list nodes', function() {
    const display = sparcTrialDisplayAdapter.normalizeDisplay({
      type: 'sparc',
      nodes: [{
        id: 'mc-1',
        nodeType: 'semantic',
        semanticType: 'multiple-choice',
        prompt: {
          id: 'mc-1-question',
          value: 'Which event came first?',
        },
        answerGroupId: 'mc-1-answers',
        choices: [{
          id: 'choice-a',
          label: 'Choice A',
          value: 'A',
        }, {
          id: 'choice-b',
          label: 'Choice B',
          value: 'B',
        }],
      }],
    });

    const multipleChoice = display.nodes[0] as Record<string, unknown>;
    const children = multipleChoice.children as Record<string, unknown>[];
    const answers = children[1] as Record<string, unknown>;
    const answerChildren = answers.children as Record<string, unknown>[];

    assert.equal(multipleChoice.nodeType, 'group');
    assert.equal(multipleChoice.groupType, 'multiple-choice');
    assert.deepEqual(multipleChoice.layout, {
      glue: {
        mode: 'multiple-choice',
        answerPlacement: 'below-prompt',
        answerAlign: 'center',
      },
    });
    assert.deepEqual(children.map((node) => node.id), ['mc-1-question', 'mc-1-answers']);
    assert.equal(answers.groupType, 'answer-list');
    assert.deepEqual(answers.layout, {
      glue: {
        mode: 'answer-list',
        orientation: 'vertical',
      },
    });
    assert.deepEqual(answerChildren.map((node) => [node.id, node.atomType, node.label, node.value]), [
      ['choice-a', 'button', 'Choice A', 'A'],
      ['choice-b', 'button', 'Choice B', 'B'],
    ]);
  });

  it('adds optional multiple-choice header feedback as a header-only message node', function() {
    const display = sparcTrialDisplayAdapter.normalizeDisplay({
      type: 'sparc',
      nodes: [{
        id: 'mc-1',
        nodeType: 'semantic',
        semanticType: 'multiple-choice',
        label: 'Multiple choice',
        feedbackNodeId: 'mc-1-feedback',
        prompt: {
          id: 'mc-1-question',
          value: 'Which event came first?',
        },
        choices: [{
          id: 'choice-a',
          label: 'Choice A',
          value: 'A',
        }],
      }],
    });

    const multipleChoice = display.nodes[0] as Record<string, unknown>;
    const children = multipleChoice.children as Record<string, unknown>[];
    const feedback = children[0] as Record<string, unknown>;

    assert.equal(feedback.id, 'mc-1-feedback');
    assert.equal(feedback.atomType, 'message-box');
    assert.deepEqual(feedback.layout, { role: 'header-feedback' });
    assert.deepEqual(children.map((node) => node.id), ['mc-1-feedback', 'mc-1-question', 'mc-1-answers']);
  });
});
