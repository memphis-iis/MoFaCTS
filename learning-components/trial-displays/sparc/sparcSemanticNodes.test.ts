import assert from 'node:assert/strict';
import { sparcTrialDisplayAdapter } from './SparcTrialDisplayAdapter';

function generatedRules(display: { productionRules?: unknown[] }): Record<string, unknown>[] {
  return (display.productionRules ?? []) as Record<string, unknown>[];
}

function generatedEffects(rule: Record<string, unknown>): Record<string, unknown>[] {
  return (rule.then ?? []) as Record<string, unknown>[];
}

describe('sparc semantic nodes', function() {
  it('keeps existing semantic multiple-choice display expansion without requiring model metadata', function() {
    const display = sparcTrialDisplayAdapter.normalizeDisplay({
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
    assert.deepEqual(children.map((node) => node.id), ['mc-1-question', 'mc-1-answers']);
    assert.deepEqual(answerChildren.map((node) => [node.id, node.atomType, node.label, node.value]), [
      ['choice-a', 'button', 'Choice A', 'A'],
      ['choice-b', 'button', 'Choice B', 'B'],
    ]);
    assert.equal(display.productionRules?.length, undefined);
    assert.equal(display.response, undefined);
  });

  it('generates multiple-choice response intent, feedback rules, and model-practice effects when modeled', function() {
    const display = sparcTrialDisplayAdapter.normalizeDisplay({
      documentId: 'doc-1',
      nodes: [{
        id: 'mc-1',
        nodeType: 'semantic',
        semanticType: 'multiple-choice',
        clusterIndex: 2,
        kc: 'stats.variables',
        prompt: { value: 'Pick one.' },
        choices: [{
          id: 'choice-a',
          label: 'Choice A',
          value: 'A',
        }, {
          id: 'choice-b',
          label: 'Choice B',
          value: 'B',
          correct: true,
        }],
      }],
    });

    const multipleChoice = display.nodes[0] as Record<string, unknown>;
    const children = multipleChoice.children as Record<string, unknown>[];
    const answers = children[1] as Record<string, unknown>;
    const answerChildren = answers.children as Record<string, unknown>[];
    const rules = generatedRules(display);

    assert.deepEqual(answerChildren.map((node) => [node.id, node.clusterIndex, node.expected]), [
      ['choice-a', 2, 'B'],
      ['choice-b', 2, 'B'],
    ]);
    assert.deepEqual(display.response?.intentByNode?.map((intent) => [intent.node, intent.expected, intent.type]), [
      ['choice-a', 'B', 'incorrect-choice'],
      ['choice-b', 'B', 'correct-choice'],
    ]);
    assert.equal(rules.length, 2);
    assert.deepEqual(rules.map((rule) => rule.id), [
      'mc-1.choice-a.A',
      'mc-1.choice-b.B',
    ]);
    assert.equal(generatedEffects(rules[1]!).some((effect) => (
      effect.type === 'model-practice'
      && effect.outcome === 'correct'
      && effect.clusterIndex === 2
      && effect.nodeId === 'choice-b'
    )), true);
    assert.equal(children[2]?.id, 'mc-1-feedback');
  });

  it('generates semantic dropdown rows and UpdateComboBox production rules', function() {
    const display = sparcTrialDisplayAdapter.normalizeDisplay({
      nodes: [{
        id: 'dropdown-1',
        nodeType: 'semantic',
        semanticType: 'dropdown',
        prompt: { html: '<p>Classify each item.</p>' },
        inputs: [{
          id: 'a',
          label: '<p>Item A</p>',
          clusterIndex: 3,
          expected: 'Discrete',
          options: ['Discrete', 'Continuous'],
        }],
      }],
    });

    const dropdown = display.nodes[0] as Record<string, unknown>;
    const row = (dropdown.children as Record<string, unknown>[])[1] as Record<string, unknown>;
    const input = (row.children as Record<string, unknown>[])[1] as Record<string, unknown>;
    const rule = generatedRules(display)[0]!;

    assert.equal(dropdown.groupType, 'dropdown-exercise');
    assert.deepEqual([input.id, input.atomType, input.clusterIndex, input.expected], [
      'dropdown-1-input-a',
      'dropdown',
      3,
      'Discrete',
    ]);
    assert.deepEqual(display.response?.intentByNode?.[0], {
      node: 'dropdown-1-input-a',
      expected: 'Discrete',
      type: 'dropdown',
    });
    const when = (rule.when as Record<string, unknown>[])[0]!;
    const slots = when.slots as Record<string, Record<string, unknown>>;
    assert.equal(slots.action?.value, 'UpdateComboBox');
  });

  it('generates select-many checkbox rows with a modeled check button', function() {
    const display = sparcTrialDisplayAdapter.normalizeDisplay({
      nodes: [{
        id: 'cata-1',
        nodeType: 'semantic',
        semanticType: 'select-many',
        clusterIndex: 4,
        prompt: { value: 'Select all correct choices.' },
        choices: [{
          id: 'a',
          label: 'A',
          correct: true,
        }, {
          id: 'b',
          label: 'B',
          correct: false,
        }],
      }],
    });

    const cata = display.nodes[0] as Record<string, unknown>;
    const answers = (cata.children as Record<string, unknown>[])[1] as Record<string, unknown>;
    const firstChoice = ((answers.children as Record<string, unknown>[])[0]!.children as Record<string, unknown>[])[0]!;

    assert.equal(cata.groupType, 'targeted-cata');
    assert.deepEqual([firstChoice.id, firstChoice.atomType, firstChoice.clusterIndex, firstChoice.expected], [
      'cata-1-choice-a-checkbox',
      'checkbox',
      4,
      true,
    ]);
    assert.equal(display.response?.intentByNode?.[0]?.node, 'cata-1-check');
    assert.equal(generatedRules(display)[0]?.id, 'cata-1.cata-1-check.correct');
  });

  it('generates text, numeric, and short-answer semantic controls', function() {
    const textDisplay = sparcTrialDisplayAdapter.normalizeDisplay({
      nodes: [{
        id: 'text-1',
        nodeType: 'semantic',
        semanticType: 'text-input',
        prompt: { value: 'Enter text.' },
        inputs: [{ id: 'answer', clusterIndex: 5, expected: 'mean' }],
      }],
    });
    const numericDisplay = sparcTrialDisplayAdapter.normalizeDisplay({
      nodes: [{
        id: 'num-1',
        nodeType: 'semantic',
        semanticType: 'numeric-input',
        prompt: { value: 'Enter number.' },
        inputs: [{ id: 'answer', clusterIndex: 6, expected: 42 }],
      }],
    });
    const shortAnswerDisplay = sparcTrialDisplayAdapter.normalizeDisplay({
      nodes: [{
        id: 'short-1',
        nodeType: 'semantic',
        semanticType: 'short-answer',
        clusterIndex: 7,
        prompt: { value: 'Explain.' },
        expected: 'input like {.*}',
        scoring: {
          responses: [{
            id: 'regex',
            regex: '.*',
            outcome: 'correct',
            feedback: 'Thanks.',
          }],
        },
      }],
    });

    const textGroup = textDisplay.nodes[0] as Record<string, unknown>;
    const textRow = (textGroup.children as Record<string, unknown>[])[1] as Record<string, unknown>;
    const textInput = (textRow.children as Record<string, unknown>[])[0] as Record<string, unknown>;
    const numericGroup = numericDisplay.nodes[0] as Record<string, unknown>;
    const numericRow = (numericGroup.children as Record<string, unknown>[])[1] as Record<string, unknown>;
    const numericInput = (numericRow.children as Record<string, unknown>[])[0] as Record<string, unknown>;
    const shortRules = generatedRules(shortAnswerDisplay);

    assert.deepEqual([textInput.id, textInput.atomType, textInput.clusterIndex, textInput.expected], [
      'text-1-input-answer',
      'text-input',
      5,
      'mean',
    ]);
    assert.deepEqual([numericInput.id, numericInput.inputMode, numericInput.expected], ['num-1-input-answer', 'numeric', 42]);
    assert.equal((shortAnswerDisplay.nodes[0] as Record<string, unknown>).groupType, 'short-answer');
    assert.equal(shortAnswerDisplay.response?.intentByNode?.[0]?.node, 'short-1-input');
    assert.equal(((shortRules[0]!.tests as Record<string, unknown>[])[0]!).op, 'regex');
  });

  it('fails clearly for modeled semantic questions without a model target', function() {
    assert.throws(() => sparcTrialDisplayAdapter.normalizeDisplay({
      nodes: [{
        id: 'dropdown-1',
        nodeType: 'semantic',
        semanticType: 'dropdown',
        inputs: [{ id: 'a', expected: 'A', options: ['A'] }],
      }],
    }), /requires an explicit non-negative clusterIndex/);
  });

  it('fails clearly for unsupported semantic types and duplicate generated ids', function() {
    assert.throws(() => sparcTrialDisplayAdapter.normalizeDisplay({
      nodes: [{
        id: 'semantic-1',
        nodeType: 'semantic',
        semanticType: 'slider',
      }],
    }), /Unsupported SPARC semanticType "slider"/);

    assert.throws(() => sparcTrialDisplayAdapter.normalizeDisplay({
      nodes: [{
        id: 'existing',
        nodeType: 'atomic',
        atomType: 'text-block',
        value: 'Existing',
      }, {
        id: 'mc-1',
        nodeType: 'semantic',
        semanticType: 'multiple-choice',
        clusterIndex: 0,
        choices: [{ id: 'existing', label: 'Duplicate', value: 'A', correct: true }],
      }],
    }), /duplicate node id "existing"/);
  });
});
