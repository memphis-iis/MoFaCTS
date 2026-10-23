// Pure saved-content projection: no account, provider, learner history or server.
require('./registerHistoryTypescript.cjs');
const { it } = require('node:test');
const assert = require('node:assert/strict');
const { sparcLibraryPreviewNode } = require('../client/views/experimentSetup/sparc/sparcLibraryPreview.ts');
const { sparcQuestionAnswerNodes } = require('../../learning-components/units/sparcsession/sparcMultipleChoiceQuestion.ts');
const { SPARC_CATEGORIZED_MOVE_DEFINITIONS } = require('../../learning-components/units/sparcsession/sparcMoveDefinitions.ts');

it('previews every categorized component independently of its missing sequence siblings', () => {
  for (const definition of SPARC_CATEGORIZED_MOVE_DEFINITIONS) {
    for (const kind of definition.components) {
      const entry = { id: 'independent1', kind, move: definition.moveId, content: { text: `Saved ${kind}` } };
      const before = JSON.stringify(entry);
      for (const scope of ['inspection', 'thumbnail']) {
        const preview = sparcLibraryPreviewNode(entry, scope);
        assert.ok(preview, `${definition.moveId}: ${kind} ${scope} must be visible`);
        assert.equal(preview.children.length, 1);
        const component = preview.children[0];
        assert.equal(component.id, `library:${scope}:${entry.id}:${kind}`);
        assert.equal(component.component, kind);
        assert.equal(component.action, entry.move);
        assert.equal(component.value, entry.content.text);
        assert.equal(component.readOnly, true);
      }
      assert.equal(JSON.stringify(entry), before);
    }
  }
});

it('projects saved categorized support with the learner heading, figure and durable display width intact', () => {
  const entry = { id: 'support1', kind: 'richContent', move: 'instruction.dynamic.explanation-rich-question.text',
    content: { text: '| A | B |\n| --- | --- |\n| 1 | 2 |', supportHeading: 'Comparison',
      figure: { assetId: 'image1', description: 'A comparison', displayWidth: 320 } } };
  const before = JSON.stringify(entry);
  for (const scope of ['inspection', 'thumbnail']) {
    const projected = sparcLibraryPreviewNode(entry, scope);
    const support = projected.children[0];
    assert.equal(support.id, `${support.turnEventId}:richContent`);
    assert.equal(support.action, entry.move);
    assert.equal(support.supportHeading, 'Comparison');
    assert.deepEqual(support.figure, entry.content.figure);
    assert.equal(support.value, entry.content.text);
  }
  assert.equal(JSON.stringify(entry), before, 'Inspection must not mutate saved content');
});

it('displays every saved choice through the learner answer nodes without enabling learner execution', () => {
  const entry = { id: 'question1', kind: 'question', move: 'instruction.dynamic.question.multiple-choice',
    content: { text: 'Which one?', choices: [{ id: 'a', label: 'A', correct: false }, { id: 'b', label: 'B', correct: true }, { id: 'c', label: 'C', correct: false }] } };
  const question = sparcLibraryPreviewNode(entry).children[0];
  const answers = sparcQuestionAnswerNodes(question, question.readOnly);
  assert.deepEqual(answers.children.map(choice => choice.label), ['A', 'B', 'C']);
  assert.ok(answers.children.every(choice => choice.readOnly && !choice.selected));
  assert.equal(question.value, 'Which one?');
  assert.notEqual(sparcLibraryPreviewNode(entry).id, sparcLibraryPreviewNode(entry, 'thumbnail').id,
    'An open inspection and its thumbnail must not duplicate DOM identities');
});

it('retains plain feedback on the learner dialogue path without inventing instructional structure', () => {
  const result = sparcLibraryPreviewNode({ id: 'feedback1', kind: 'feedback', move: 'instruction.feedback', content: { text: '**Good reasoning.**' } });
  assert.equal(result.atomType, 'dialogue-utterance');
  assert.equal(result.speaker, 'tutor');
  assert.equal(result.value, '**Good reasoning.**');
  assert.equal(result.children, undefined);
});

it('previews cloze and true/false through their saved format without exposing an executable response', () => {
  const cloze = sparcLibraryPreviewNode({ id: 'cloze1', kind: 'question', move: 'instruction.dynamic.question.cloze',
    content: { text: 'Different phenotypes within one species are called _____.' } }).children[0];
  assert.equal(cloze.value, 'Different phenotypes within one species are called _____.');
  assert.equal(cloze.choices, undefined); assert.equal(cloze.readOnly, true);
  const binary = sparcLibraryPreviewNode({ id: 'binary1', kind: 'question', move: 'instruction.dynamic.question.true-false',
    content: { text: 'Polymorphism requires different species.', choices: [
      { id: 'true', label: 'True', correct: false }, { id: 'false', label: 'False', correct: true },
    ] } }).children[0];
  const buttons = sparcQuestionAnswerNodes(binary, binary.readOnly).children;
  assert.deepEqual(buttons.map(button => button.label), ['True', 'False']);
  assert.ok(buttons.every(button => button.readOnly && !button.selected));
});
