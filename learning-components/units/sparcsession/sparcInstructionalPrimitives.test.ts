import { strict as assert } from 'node:assert';
import { SPARC_CATEGORIZED_MOVE_DEFINITIONS, requireActiveSparcMoveDefinition } from './sparcMoveDefinitions';
import { createSparcFeedbackRequest, createSparcInstructionTransition, parseInstructionComponents, projectSparcInstructionMessages } from './sparcInstructionalPrimitives';
import type { SparcWorkingMemoryFact } from './sparcSessionContracts';
import { primitiveContext } from './sparcMoveLibrary';
import type { SparcUtteranceRequest } from './sparcUtteranceRequest';
import { parseSparcSupportedPrompt, parseSparcSupportedPromptBrief } from './sparcSupportedPrompt';
import { progressiveDialogueFacts } from './sparcWorkingMemoryFacts';
import { buildSparcDialogueHistory } from './sparcUtteranceRequest';
import { parseSparcQuestionChoices } from '../../runtime/sparcQuestionChoiceContract';
import { composeSparcCategoryInstructions } from './sparcCategoryInstructions';

describe('SPARC instructional primitives', () => {
  it('reveals only the available prefix for every composition and arrival order without changing saved nodes', () => {
    for (const definition of SPARC_CATEGORIZED_MOVE_DEFINITIONS) {
      const components = definition.components!;
      const permutations = <T,>(items: readonly T[]): T[][] => items.length === 0 ? [[]]
        : items.flatMap((item, i) => permutations(items.filter((_, j) => i !== j)).map(rest => [item, ...rest]));
      for (const order of permutations(components)) {
        const nodes = order.map(component => ({ id: `turn:${component}`, turnEventId: 'turn',
          action: definition.moveId, atomType: 'dialogue-utterance', value: component }));
        const snapshot = JSON.stringify(nodes);
        for (let count = 0; count <= nodes.length; count++) {
          const available = nodes.slice(0, count);
          const missing = components.findIndex(component => !available.some(node => node.value === component));
          const expected = components.slice(0, missing === -1 ? components.length : missing);
          const projected = projectSparcInstructionMessages(available);
          assert.deepEqual(projected.flatMap(node => node.children ?? []).map(node => node.value), expected);
          assert.equal(projected.length, expected.length ? 1 : 0);
          // Reloads reconstruct exactly the same visible prefix.
          assert.deepEqual(projectSparcInstructionMessages(JSON.parse(JSON.stringify(available))), projected);
        }
        assert.equal(JSON.stringify(nodes), snapshot);
      }
    }
  });
  it('keeps checked explanation visible, holds the question through figure loading, and accepts receipts and links', () => {
    const action = 'instruction.dynamic.explanation-visual-question.text';
    const nodes = ['richContent', 'question', 'explanation'].map(component => ({
      id: `turn:${component}`, turnEventId: 'turn', action, value: component,
    }));
    const values = (options: NonNullable<Parameters<typeof projectSparcInstructionMessages>[1]> = {}) =>
      projectSparcInstructionMessages(nodes, options).flatMap(node => node.children ?? []).map(node => node.value);
    assert.deepEqual(values({ canReveal: node => node.value !== 'richContent' }), ['explanation']);
    assert.deepEqual(values({ isReady: node => node.value !== 'richContent' }), ['explanation', 'richContent']);
    assert.deepEqual(values(), ['explanation', 'richContent', 'question']);
    const receipt = { ...nodes[0]!, administrativeRemoval: true };
    const link = { ...nodes[0]!, primitiveReference: { priorNodeId: 'earlier' } };
    for (const support of [receipt, link]) {
      assert.equal(projectSparcInstructionMessages([support, ...nodes.slice(1)], {
        isReady: node => node.value !== 'richContent' || !!node.administrativeRemoval || !!node.primitiveReference,
      })[0]!.children!.length, 3);
    }
    const menu = { id: 'menu', children: [{ id: 'option' }] };
    assert.deepEqual(projectSparcInstructionMessages([menu]), [menu]);
  });
  const document = { id: 'page', schemaVersion: 2 as const, root: { id: 'root', kind: 'document' as const } };
  const event = { eventId: 'turn', type: 'response-submitted' as const, source: { pageKey: 'page', nodeId: 'input' }, time: 1 };
  const request = (action: string): SparcUtteranceRequest => ({ action, targetType: 'learningTarget', targetId: 'a', problemStatement: 'Explain A', contentTexts: ['A'], selectedAction: {}, responseModifiers: [], moveDefinition: requireActiveSparcMoveDefinition(action) });
  it('requires a substantive single cloze blank and keeps binary choices distinct from ordinary MC', () => {
    const cloze = request('instruction.dynamic.question.cloze');
    for (const question of ['No blank.', '_____ and _____.', '_____', 'A ____ blank.']) {
      assert.throws(() => parseInstructionComponents({ explanation: null, richContent: null, question }, cloze), /exactly one/);
    }
    assert.equal(parseInstructionComponents({ explanation: null, richContent: null, question: 'Variation within a species is _____.' }, cloze).question, 'Variation within a species is _____.');
    const choices = [{ id: 'true', label: 'True', correct: false }, { id: 'false', label: 'False', correct: true }];
    assert.deepEqual(parseSparcQuestionChoices(choices, 'true-false'), choices);
    assert.throws(() => parseSparcQuestionChoices(choices), /3 or 4/);
    assert.throws(() => parseSparcQuestionChoices([...choices].reverse(), 'true-false'), /True then False/);
    assert.throws(() => parseSparcQuestionChoices(choices.map(choice => ({ ...choice, correct: true })), 'true-false'), /exactly one/);
    const prompt = composeSparcCategoryInstructions('model-rule', ['question'], 'cloze');
    assert.ok(prompt.includes('must require understanding the statement'));
    assert.ok(prompt.includes('grammar, word shape, or familiar phrasing makes a poor item'));
    const binaryPrompt = composeSparcCategoryInstructions('rule', ['question'], 'true-false');
    assert.ok(binaryPrompt.includes('one clear truth value')); assert.ok(binaryPrompt.includes('without predictable alternation'));
  });
  for (const targetType of ['learningTarget', 'misconception'] as const) {
    it(`binds ${targetType} feedback to the answered question through saved history, excluding other targets`, () => {
      const expectation = targetType === 'learningTarget';
      const targeted = request('instruction.dynamic.question.text');
      const question = createSparcInstructionTransition({ document, event: { ...event, eventId: 'asked' }, learnerText: '',
        request: { ...targeted, targetType }, generated: { explanation: null, richContent: null, question: 'Explain A?' }, includeLearner: false });
      const history = progressiveDialogueFacts({ transitions: JSON.parse(JSON.stringify([question])) });
      const facts: SparcWorkingMemoryFact[] = [
        { factType: 'dialogue.problemStatement', slots: { text: 'Lesson topic' } },
        { factType: 'instructional.assessmentSnapshot', slots: { snapshotId: 'turn' } },
        { factType: 'controller.selectedAction', slots: { targetType: 'learningTarget', clusterKC: 'b' } },
        { factType: 'autotutor.expectation', slots: { clusterKC: 'a', text: 'Authored A' } },
        { factType: 'autotutor.misconception', slots: { id: 'a', text: 'Mistaken A' } },
        { factType: 'autotutor.expectation', slots: { clusterKC: 'b', text: 'Unrelated chapter content'.repeat(2000) } },
        { factType: 'learningTarget.score', slots: { clusterKC: 'a', coverage: .9 } },
        { factType: 'diagnostic.misconceptionScore', slots: { id: 'a', supportStrength: .8 } },
        ...['expectation', 'misconception'].flatMap(kind => ['a', 'b'].map(id => ({ factType: 'instructional.evidence',
          slots: { kind, id, demonstrated: [kind + id], incorrect: [], unresolved: [] } }))),
        { factType: 'dialogue.utterance', factId: 'earlier:question', slots: { speaker: 'tutor', eventId: 'earlier', targetType: 'learningTarget', targetId: 'b', text: 'Unrelated question' } },
        ...history,
      ];
      const response = { ...event, payload: { input: 'My answer', questionId: 'asked:question' } };
      const feedback = createSparcFeedbackRequest(facts, response, 'feedback-rule');
      assert.equal(feedback.targetId, 'a');
      assert.deepEqual(feedback.contentTexts, [expectation ? 'Authored A' : 'Mistaken A']);
      assert.equal(feedback.dialogueHistory?.length, 1);
      assert.equal(feedback.dialogueHistory?.[0]?.text, 'Explain A?');
      assert.equal((feedback.plannerState as { assessment: unknown[] }).assessment.length, 2);
      const context = primitiveContext(feedback, 'feedback', null);
      assert.equal(JSON.parse(context.focus).length, 1);
      assert.equal(JSON.parse(context.focus)[0].kind, expectation ? 'expectation' : 'misconception');
      assert.ok(!JSON.stringify(feedback).includes('Unrelated'));
      assert.throws(() => createSparcFeedbackRequest(facts.filter(fact => fact.factType !== 'dialogue.utterance'), response, 'feedback-rule'), /answered question/);
      assert.throws(() => createSparcFeedbackRequest(facts, { ...response, payload: { ...response.payload, questionId: 'earlier:question' } }, 'feedback-rule'), /answered question/);
    });
  }
  it('realizes each selected composite in its registered order with a final question', () => {
    for (const definition of SPARC_CATEGORIZED_MOVE_DEFINITIONS.filter(move => move.responseFormat === 'text')) {
      for (const richContent of ['<ol><li>Worked step</li></ol>', '<table><tr><th scope="col">A</th></tr><tr><td>1</td></tr></table>', '<img src="https://example.org/authored.png" alt="Authored diagram">', '<figure><img src="https://example.org/authored.png" alt="A"><figcaption>Figure A</figcaption></figure>']) {
        const generated = { explanation: definition.components!.includes('explanation') ? 'Explanation' : null, richContent: definition.components!.includes('richContent') ? richContent : null, question: 'Explain A?' };
        const transition = createSparcInstructionTransition({ document, event, learnerText: 'A', request: request(definition.moveId), generated, includeLearner: false });
        const nodes = transition.writes.map((write) => (write.value as { node: Record<string, unknown> }).node);
        assert.deepEqual(nodes.map((node) => node.value), definition.components!.map((component) => generated[component]));
        assert.equal(nodes.at(-1)!.value, 'Explain A?');
        assert.ok(nodes.every((node) => node.assistance === definition.assistance));
      }
    }
  });
  it('persists the supported text and incomplete figure in replay and scoring context', () => {
    const generated = { tutorMessage: 'What belongs at ? A?', figure: { assetId: 'image123', description: 'A process with its last step omitted.', displayWidth: 360 } };
    const transition = createSparcInstructionTransition({ document, event, learnerText: 'A', request: request('prompt-supported'), generated, includeLearner: false });
    assert.equal(transition.writes.length, 1);
    const node = (transition.writes[0]!.value as { node: Record<string, unknown> }).node;
    assert.equal(node.value, generated.tutorMessage);
    assert.equal(node.assistance, 1.33);
    assert.deepEqual(node.figure, generated.figure);
    const history = buildSparcDialogueHistory(progressiveDialogueFacts({ transitions: [JSON.parse(JSON.stringify(transition))] }));
    assert.deepEqual(history[0]!.figure, generated.figure);
    assert.equal(history[0]!.role, 'tutor');
    assert.throws(() => createSparcInstructionTransition({ document, event, learnerText: 'A', request: request('prompt-supported'), generated: 'Text only' }), /fields/);
    assert.deepEqual(['pump', 'prompt', 'prompt-supported', 'hint', 'assertion'].map(move => requireActiveSparcMoveDefinition(move).assistance), [0, .66, 1.33, 2, 2.4]);
  });
  it('rejects external URLs, inline image bytes, unsafe descriptions, and incomplete briefs', () => {
    for (const figure of [
      { assetId: 'https://example.org/image.png', description: 'Image' },
      { assetId: 'image123', description: '<script>run()</script>' },
      { assetId: 'image123', description: '' },
      { assetId: 'image123', description: 'Image', dataUrl: 'data:image/png;base64,123' },
    ]) assert.throws(() => parseSparcSupportedPrompt({ tutorMessage: 'Q?', figure }));
    assert.throws(() => parseSparcSupportedPromptBrief({ tutorMessage: 'Q?', imagePrompt: 'Figure' }));
    assert.throws(() => parseSparcSupportedPromptBrief({ tutorMessage: 'Q?', imagePrompt: '', figureDescription: 'Figure' }));
    assert.equal(parseSparcSupportedPromptBrief({ tutorMessage: 'What process is missing?', imagePrompt: 'Draw the process with its middle stage omitted.', figureDescription: 'Two visible stages separated by an empty area.', displayWidth: 360 }).tutorMessage, 'What process is missing?');
  });
  it('rejects invalid new width estimates and preserves historical figure references', () => {
    const brief = { tutorMessage: 'Q?', imagePrompt: 'Draw stages.', figureDescription: 'Stages.' };
    for (const displayWidth of [undefined, 239, 641, 360.5, '360', NaN, Infinity]) {
      assert.throws(() => parseSparcSupportedPromptBrief({ ...brief, displayWidth }));
    }
    const historical = { tutorMessage: 'Q?', figure: { assetId: 'image123', description: 'Stages.' } };
    assert.deepEqual(parseSparcSupportedPrompt(historical), historical);
    assert.throws(() => parseSparcSupportedPrompt({ ...historical, figure: { ...historical.figure, displayWidth: 641 } }));
  });
  it('retains the AutoTutor utterance and rejects incomplete or unsafe composite output', () => {
    const transition = createSparcInstructionTransition({ document, event, learnerText: 'A', request: request('pump'), generated: 'Tell me more about A.', includeLearner: false });
    assert.equal(transition.writes.length, 1);
    assert.equal((transition.writes[0]!.value as { node: { value: string } }).node.value, 'Tell me more about A.');
    assert.throws(() => parseInstructionComponents({ question: 'Q?' }, request('instruction.dynamic.explanation-question.text')));
    assert.throws(() => parseInstructionComponents({ explanation: null, richContent: '<script>alert(1)</script>', question: 'Q?' }, request('instruction.dynamic.explanation-rich-question.text')));
  });
});
