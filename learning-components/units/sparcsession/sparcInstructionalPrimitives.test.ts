import { strict as assert } from 'node:assert';
import { SPARC_COMPOSITE_MOVE_DEFINITIONS, requireActiveSparcMoveDefinition } from './sparcMoveDefinitions';
import { createSparcInstructionTransition, parseInstructionComponents } from './sparcInstructionalPrimitives';
import type { SparcUtteranceRequest } from './sparcUtteranceRequest';
import { parseSparcSupportedPrompt, parseSparcSupportedPromptBrief } from './sparcSupportedPrompt';
import { progressiveDialogueFacts } from './sparcWorkingMemoryFacts';
import { buildSparcDialogueHistory } from './sparcUtteranceRequest';

describe('SPARC instructional primitives', () => {
  const document = { id: 'page', schemaVersion: 2 as const, root: { id: 'root', kind: 'document' as const } };
  const event = { eventId: 'turn', type: 'response-submitted' as const, source: { pageKey: 'page', nodeId: 'input' }, time: 1 };
  const request = (action: string): SparcUtteranceRequest => ({ action, targetType: 'learningTarget', targetId: 'a', problemStatement: 'Explain A', contentTexts: ['A'], selectedAction: {}, responseModifiers: [], moveDefinition: requireActiveSparcMoveDefinition(action) });
  it('realizes each selected composite in its registered order with a final question', () => {
    for (const definition of SPARC_COMPOSITE_MOVE_DEFINITIONS) {
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
      { assetId: 'image123', description: 'A'.repeat(2049) },
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
    assert.throws(() => parseInstructionComponents({ question: 'Q?' }, request('instruction.explanation-question')));
    assert.throws(() => parseInstructionComponents({ explanation: null, richContent: '<script>alert(1)</script>', question: 'Q?' }, request('instruction.rich-question')));
  });
});
