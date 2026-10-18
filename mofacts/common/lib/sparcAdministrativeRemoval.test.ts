import { strict as assert } from 'node:assert';
import { sparcContentReferenceIds, projectSparcAdministrativeRemovals, SPARC_ADMINISTRATIVE_REMOVAL_TEXT } from '../../../learning-components/runtime/sparcAdministrativeRemoval';
import { parseInstructionComponents } from '../../../learning-components/units/sparcsession/sparcInstructionalPrimitives';
import { getSparcMoveDefinition } from '../../../learning-components/units/sparcsession/sparcMoveDefinitions';

describe('Administrative removal rendering', () => {
  it('allows a removed multiple-choice question without inventing options, while rejecting broken questions', () => {
    const request: Parameters<typeof parseInstructionComponents>[1] = { problemStatement: 'Topic', targetType: 'learningTarget',
      action: 'instruction.dynamic.question.multiple-choice', targetId: 'KC A', contentTexts: ['A fact'],
      selectedAction: { snapshotId: 'event', action: 'instruction.dynamic.question.multiple-choice', sourceRuleId: 'test' },
      moveDefinition: getSparcMoveDefinition('instruction.dynamic.question.multiple-choice')!, sourceRuleId: 'test', responseModifiers: [] };
    const content = { explanation: null, richContent: null, question: SPARC_ADMINISTRATIVE_REMOVAL_TEXT, removedComponents: ['question'] };
    assert.deepEqual(parseInstructionComponents(content, request), content);
    assert.throws(() => parseInstructionComponents({ ...content, removedComponents: undefined }, request));
    assert.throws(() => parseInstructionComponents({ ...content, question: 'A normal question' }, request), /Invalid administrative/);
  });
  it('stamps only the deleted field and leaves journaled values and neighboring content unchanged', () => {
    const nodes = [{ id: 'move:instruction', primitiveReference: { entryId: 'explanation' }, children: [
      { id: 'explanation', value: 'Explain', primitiveReference: { entryId: 'explanation' } },
      { id: 'question', value: 'Old question', primitiveReference: { entryId: 'removed', priorNodeId: 'earlier' }, choices: [{ correct: true }] },
    ] }];
    const before = JSON.stringify(nodes);
    assert.deepEqual(sparcContentReferenceIds(nodes), ['explanation', 'removed']);
    const projected = projectSparcAdministrativeRemovals(nodes, new Set(['removed']));
    assert.equal(projected[0]!.children![0]!.value, 'Explain');
    const field = projected[0]!.children![1]!;
    assert.equal(field.value, SPARC_ADMINISTRATIVE_REMOVAL_TEXT);
    assert.equal('choices' in field, false);
    assert.equal(field.primitiveReference.priorNodeId, undefined);
    assert.equal(JSON.stringify(nodes), before);
  });
  it('removes a deleted video embed and leaves standalone figure handling to its authorized reader', () => {
    const video = { value: 'A transcript', video: { segmentId: 'video' } };
    const figure = { value: 'Question about the figure', figure: { assetId: 'image' } };
    const projected = projectSparcAdministrativeRemovals([video, figure], new Set(['video', 'image']));
    assert.equal(projected[0]!.value, SPARC_ADMINISTRATIVE_REMOVAL_TEXT);
    assert.equal('video' in projected[0]!, false);
    assert.deepEqual(projected[1], figure);
  });
});
