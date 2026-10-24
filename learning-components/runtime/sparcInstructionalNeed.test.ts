import { strict as assert } from 'node:assert';
import { buildSparcInstructionalNeed, sparcInstructionalNeedText, SPARC_LIBRARY_SIMILARITY } from './sparcInstructionalNeed';
import { instructionalNeed } from '../units/sparcsession/sparcMoveLibrary';
import type { SparcUtteranceRequest } from '../units/sparcsession/sparcUtteranceRequest';

const request = { targetType: 'learningTarget', targetId: 'kc-one', contentTexts: ['Isolation prevents gene flow.'],
  targetContent: { clusterKC: 'kc-one', text: 'Isolation prevents gene flow.', category: 'model' },
  moveDefinition: { assistance: 2.52, promptId: 'opaque', promptPolicy: 'A very long generation policy' },
  plannerState: { evidence: [
    { id: 'kc-one', kind: 'expectation', demonstrated: ['Identified isolation'], incorrect: [], unresolved: ['Explain gene flow'] },
    { id: 'unrelated', kind: 'expectation', demonstrated: ['Unrelated information'], incorrect: [], unresolved: [] },
  ] }, dialogueHistory: [{ role: 'tutor', component: 'question', text: 'What prevents gene flow?' }], learnerText: 'Isolation.' } as unknown as SparcUtteranceRequest;

describe('Shared instructional need representation', () => {
  it('uses the requested 0.95 library reuse boundary', () => {
    assert.equal(SPARC_LIBRARY_SIMILARITY.minimumSimilarity, 0.95);
  });
  it('uses one deterministic input for image and text common fields and omits operational metadata', () => {
    const ordinary = instructionalNeed(request, { figure: { assetId: 'asset-one', description: 'Separated populations.' } });
    const image = instructionalNeed(request, { figure: { assetId: 'asset-two', description: 'Separated populations.' } }, { illustrationBrief: 'Draw separated populations.' });
    const { illustrationBrief, ...common } = image;
    assert.equal(illustrationBrief, 'Draw separated populations.'); assert.deepEqual(common, ordinary);
    const serialized = sparcInstructionalNeedText(ordinary);
    for (const forbidden of ['kc-one', 'asset-one', 'opaque', 'generation policy', 'Unrelated information']) assert.equal(serialized.includes(forbidden), false);
    assert.equal(sparcInstructionalNeedText({ ...ordinary, target: { category: 'model', texts: ordinary.target.texts } }), serialized);
  });
  it('retains actual answers, case details and selected evidence without adding unrelated history', () => {
    const first = instructionalNeed(request, null, { feedback: true });
    const changed = instructionalNeed({ ...request, learnerText: 'There is no isolation.' }, null, { feedback: true });
    assert.notEqual(sparcInstructionalNeedText(first), sparcInstructionalNeedText(changed));
    assert.deepEqual(first.evidence[0]?.unresolved, ['Explain gene flow']);
    assert.notEqual(sparcInstructionalNeedText(instructionalNeed(request, { richContent: 'River separates populations.' })),
      sparcInstructionalNeedText(instructionalNeed(request, { richContent: 'Populations share a habitat.' })));
  });
  it('preserves misconception meaning and rejects malformed or private extra fields', () => {
    const need = buildSparcInstructionalNeed({ targetContent: { selectedMisconception: { id: 'mc', text: 'Isolation always requires distance.', category: 'rule' } },
      targetTexts: ['unused'], assistance: 1, evidence: [] });
    assert.deepEqual(need.target, { texts: ['Isolation always requires distance.'], category: 'rule' });
    assert.throws(() => sparcInstructionalNeedText({ ...need, userId: 'private' }), /Unexpected/);
    assert.throws(() => sparcInstructionalNeedText({ ...need, assistance: NaN }), /assistance/);
    assert.throws(() => sparcInstructionalNeedText({ ...need, feedback: { precedingQuestion: 'Question?', learnerResponse: '' } }), /text/);
  });
});
