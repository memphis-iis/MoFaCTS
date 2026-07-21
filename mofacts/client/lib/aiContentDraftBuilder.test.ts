import { expect } from 'chai';
import { AI_CONTENT_CONTRACT_VERSION, type AiContentSaveContract } from '../../common/aiContentContract';
import { AI_LEARNING_INSTRUCTIONS, AI_TEST_INSTRUCTIONS, buildAiContentDraft } from './aiContentDraftBuilder';

function textContract(mode: 'learning' | 'test' = 'learning'): AiContentSaveContract {
  return {
    contractVersion: AI_CONTENT_CONTRACT_VERSION,
    mode,
    title: 'Spanish Basics',
    pairs: [
      { id: 'pair-1', kind: 'text', stimulus: 'rojo', response: 'red' },
      { id: 'pair-2', kind: 'text', stimulus: 'azul', response: 'blue' },
    ],
  };
}

describe('deterministic AI Content draft builder', function() {
  it('maps Learning and Test to fixed structures, boilerplate, and typed responses', function() {
    const learning = buildAiContentDraft(textContract('learning'));
    const test = buildAiContentDraft(textContract('test'));
    expect(learning.sourceConfig?.moduleId).to.equal('learningSession');
    expect(test.sourceConfig?.moduleId).to.equal('assessmentSession');
    expect((learning.workingCopy as any).instructions).to.contain(AI_LEARNING_INSTRUCTIONS);
    expect((test.workingCopy as any).instructions).to.contain(AI_TEST_INSTRUCTIONS);
    expect(learning.workingCopy.stimuli.setspec.clusters).to.have.length(2);
    expect(test.workingCopy.stimuli.setspec.clusters).to.have.length(2);
  });

  it('packages each resolved WebP under the exact reviewed filename', function() {
    const contract: AiContentSaveContract = {
      contractVersion: AI_CONTENT_CONTRACT_VERSION,
      mode: 'learning',
      title: 'Bird Photos',
      pairs: [{ id: 'pair-1', kind: 'image', stimulus: 'A private warbler image description', response: 'warbler', image: { source: 'uploaded', fileName: 'warbler.webp' } }],
    };
    const bytes = new Uint8Array([1, 2, 3]);
    const draft = buildAiContentDraft(contract, [{ id: 'asset-1', originalName: 'bird.jpg', sourcePath: 'birds/bird.jpg', packageFileName: 'warbler.webp', bytes, width: 1280, height: 720 }]);
    expect(draft.generatedBaseline.mediaFiles['warbler.webp']).to.deep.equal(bytes);
    expect((draft.workingCopy.stimuli.setspec.clusters[0] as any).stims[0].display.imgSrc).to.equal('warbler.webp');
    expect(JSON.stringify(draft.workingCopy)).not.to.contain('A private warbler image description');
  });

  it('refuses to build when a reviewed image asset is unavailable', function() {
    const contract: AiContentSaveContract = {
      contractVersion: AI_CONTENT_CONTRACT_VERSION,
      mode: 'test',
      title: 'Bird Photos',
      pairs: [{ id: 'pair-1', kind: 'image', stimulus: 'Private discovery description', response: 'warbler', image: { source: 'uploaded', fileName: 'warbler.webp' } }],
    };
    expect(() => buildAiContentDraft(contract)).to.throw('unavailable');
  });
});
