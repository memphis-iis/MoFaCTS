import { expect } from 'chai';
import JSZip from 'jszip';
import sinon from 'sinon';
import {
  buildSaveEntries,
  buildUploadWithNameConflictRetry,
  readGeneratedNameConflict,
  renameDraftLesson,
  uploadBuiltPackage,
  type AiContentPackageSaveDeps,
} from './aiContentPackageSave';
import type { BuiltImportPackage, ImportDraftLesson } from './normalizedImportTypes';
import { AI_CONTENT_CONTRACT_VERSION, type AiContentSaveContract } from '../../common/aiContentContract';

const saveContract: AiContentSaveContract = {
  contractVersion: AI_CONTENT_CONTRACT_VERSION,
  mode: 'learning',
  title: 'AI Lesson',
  pairs: [{ id: 'pair-1', kind: 'text', stimulus: 'Prompt', response: 'Answer' }],
};

function buildDraft(title: string): ImportDraftLesson {
  return {
    id: `draft-${title}`,
    sourceKind: 'manual',
    title,
    sourceConfig: { moduleId: 'learningSession' },
    generatedBaseline: {
      tutor: { setspec: { lessonname: title, stimulusfile: `${title}_stim.json` } },
      stimuli: { setspec: { clusters: [{ stims: [{ display: { text: 'Prompt' }, response: { correctResponse: 'Answer' } }] }] } },
      mediaFiles: {},
      manifestMeta: { moduleId: 'learningSession' },
    },
    workingCopy: {
      tutor: { setspec: { lessonname: title, stimulusfile: `${title}_stim.json` } },
      stimuli: { setspec: { clusters: [{ stims: [{ display: { text: 'Prompt' }, response: { correctResponse: 'Answer' } }] }] } },
    },
    stats: {
      totalItems: 1,
      skippedItems: 0,
      mediaCount: 0,
    },
  };
}

function buildPackage(draft = buildDraft('AI Lesson')): BuiltImportPackage {
  return {
    mode: 'single',
    zipBlob: new Blob(['zip']),
    manifest: [{
      tdfName: draft.title,
      tdfFile: `${draft.title.replace(/\s+/g, '_')}_TDF.json`,
      stimFile: `${draft.title.replace(/\s+/g, '_')}_stimuli.json`,
      cardCount: 1,
      moduleId: 'learningSession',
    }],
    totalCards: 1,
    totalSkipped: 0,
    totalMedia: 0,
    lessons: [draft],
  };
}

function buildDeps(options: {
  callAsync: sinon.SinonStub;
  assetIds?: string[];
  refreshAssets?: sinon.SinonSpy;
  logCleanupError?: sinon.SinonSpy;
}): AiContentPackageSaveDeps {
  const assetIds = options.assetIds || ['asset-1'];
  let uploadIndex = 0;
  const deps: AiContentPackageSaveDeps = {
    callAsync: options.callAsync,
    getUploadIntegrity: sinon.stub().resolves({ sha256: 'hash' }),
    makeFile: ((parts: BlobPart[], name: string, fileOptions: FilePropertyBag): File => ({
      parts,
      name,
      type: fileOptions.type,
    }) as unknown as File),
    dynamicAssets: {
      link: sinon.stub().returns('/dynamic-assets/package.zip'),
      insert: sinon.stub().callsFake(() => {
        let endCallback: ((error: unknown, fileObj: { _id: string; ext?: string }) => void) | null = null;
        const assetId = assetIds[Math.min(uploadIndex, assetIds.length - 1)] || 'asset';
        uploadIndex += 1;
        return {
          on: (eventName: 'start' | 'progress' | 'end', callback: typeof endCallback) => {
            if (eventName === 'end') endCallback = callback;
          },
          start: () => {
            void endCallback?.(null, { _id: assetId, ext: 'zip' });
          },
        };
      }),
    },
  };
  if (options.refreshAssets) {
    deps.refreshAssets = options.refreshAssets;
  }
  if (options.logCleanupError) {
    deps.logCleanupError = options.logCleanupError;
  }
  return deps;
}

describe('aiContentPackageSave', function() {
  it('builds save entries from package manifest and cloned working copies', function() {
    const draft = buildDraft('AI Lesson');
    const builtPackage = buildPackage(draft);

    const [entry] = buildSaveEntries(builtPackage);
    ((entry!.tutor as any).setspec.lessonname) = 'Mutated';

    expect(entry).to.include({
      moduleId: 'learningSession',
      artifactKind: 'learningSession',
      title: 'AI_Lesson',
      tdfFile: 'AI_Lesson_TDF.json',
      stimFile: 'AI_Lesson_stimuli.json',
      itemCount: 1,
    });
    expect((draft.workingCopy.tutor as any).setspec.lessonname).to.equal('AI Lesson');
  });

  it('parses generated-name conflict details and rejects malformed conflicts', function() {
    expect(readGeneratedNameConflict({
      error: 'generated-package-name-conflict',
      details: JSON.stringify({ entryIndex: 0, tdfFile: 'Name_TDF.json', title: 'Name' }),
    })).to.deep.equal({ entryIndex: 0, tdfFile: 'Name_TDF.json', title: 'Name' });

    expect(readGeneratedNameConflict({ error: 'other-error' })).to.equal(null);
    expect(readGeneratedNameConflict({ error: 'generated-package-name-conflict', details: '{' })).to.equal(null);
  });

  it('renames a draft lesson and updates generated and working stimulus references', function() {
    const draft = buildDraft('Old Name');

    renameDraftLesson(draft, 'New Name');

    expect(draft.title).to.equal('New Name');
    expect((draft.generatedBaseline.tutor as any).setspec.lessonname).to.equal('New Name');
    expect((draft.generatedBaseline.tutor as any).setspec.stimulusfile).to.equal('New_Name_stims.json');
    expect((draft.workingCopy.tutor as any).setspec.lessonname).to.equal('New Name');
    expect((draft.workingCopy.tutor as any).setspec.stimulusfile).to.equal('New_Name_stims.json');
  });

  it('cleans up the uploaded asset when final package save fails', async function() {
    const saveError = new Error('save failed');
    const callAsync = sinon.stub();
    callAsync.withArgs('saveAiGeneratedPackageContent').rejects(saveError);
    callAsync.withArgs('removeAssetById', 'asset-1').resolves(true);
    const deps = buildDeps({ callAsync });

    try {
      await uploadBuiltPackage(buildPackage(), 'summary', deps, saveContract);
      throw new Error('Expected upload failure');
    } catch (error) {
      expect(error).to.equal(saveError);
    }

    expect(callAsync.calledWith('saveAiGeneratedPackageContent')).to.equal(true);
    expect(callAsync.firstCall.args[1]).not.to.have.property('entries');
    expect(callAsync.calledWith('removeAssetById', 'asset-1')).to.equal(true);
  });

  it('creates an upload-safe archive name when the authored title ends in punctuation', async function() {
    const callAsync = sinon.stub();
    callAsync.withArgs('saveAiGeneratedPackageContent').resolves([]);
    const makeFile = sinon.spy((parts: BlobPart[], name: string, fileOptions: FilePropertyBag): File => ({
      parts,
      name,
      type: fileOptions.type,
    }) as unknown as File);
    const deps = { ...buildDeps({ callAsync }), makeFile };
    const builtPackage = buildPackage(buildDraft('U.S. states...'));

    await uploadBuiltPackage(builtPackage, 'summary', deps, saveContract);

    expect(makeFile.firstCall.args[1]).to.equal('U.S._states.zip');
    expect(makeFile.firstCall.args[1]).not.to.include('..');
    expect(callAsync.firstCall.args[1].packageFileName).to.equal('U.S._states.zip');
  });

  it('keeps spaces in the packaged lesson name while using safe filenames', async function() {
    const draft = buildDraft('Learn the 50 U.S. states');
    const callAsync = sinon.stub();
    callAsync.withArgs('saveAiGeneratedPackageContent').resolves([]);
    const deps = {
      ...buildDeps({ callAsync }),
      promptForReplacementName: sinon.stub(),
    };

    const result = await buildUploadWithNameConflictRetry([draft], 'summary', deps, saveContract);
    const zip = await JSZip.loadAsync(await result.builtPackage.zipBlob.arrayBuffer());
    const tdfText = await zip.file('Learn_the_50_U.S._states_TDF.json')!.async('string');
    const tdf = JSON.parse(tdfText);

    expect(tdf.tutor.setspec.lessonname).to.equal('Learn the 50 U.S. states');
    expect(tdf.tutor.setspec.stimulusfile).to.equal('Learn_the_50_U.S._states_stims.json');
  });

  it('prompts for a new name, rebuilds, and retries when generated content name conflicts', async function() {
    const draft = buildDraft('Existing Name');
    const conflict = {
      error: 'generated-package-name-conflict',
      details: JSON.stringify({ entryIndex: 0, tdfFile: 'Existing_Name_TDF.json', title: 'Existing Name' }),
    };
    const callAsync = sinon.stub();
    callAsync.onFirstCall().rejects(conflict);
    callAsync.onSecondCall().resolves(true);
    callAsync.onThirdCall().resolves([{
      moduleId: 'learningSession',
      title: 'Replacement_Name',
      artifactKindLabel: 'Learning session',
      itemCount: 1,
    }]);
    const promptForReplacementName = sinon.stub().returns('Replacement Name');
    const deps = {
      ...buildDeps({ callAsync, assetIds: ['asset-1', 'asset-2'] }),
      promptForReplacementName,
    };

    const result = await buildUploadWithNameConflictRetry([draft], 'summary', deps, saveContract);

    expect(promptForReplacementName.calledOnce).to.equal(true);
    expect(draft.title).to.equal('Replacement Name');
    expect(callAsync.firstCall.args[0]).to.equal('saveAiGeneratedPackageContent');
    expect(callAsync.secondCall.args).to.deep.equal(['removeAssetById', 'asset-1']);
    expect(callAsync.thirdCall.args[0]).to.equal('saveAiGeneratedPackageContent');
    expect(result.outputs[0]!.title).to.equal('Replacement_Name');
  });

  it('rejects multiple generated modules before creating a package', async function() {
    const drafts = [buildDraft('Learn Draft'), buildDraft('Assessment Draft')];
    const callAsync = sinon.stub();
    callAsync.onFirstCall().resolves([
      { moduleId: 'learningSession', title: 'Learn_Draft', artifactKindLabel: 'Learning session', packageAssetId: 'asset-1', itemCount: 1 },
      { moduleId: 'assessmentSession', title: 'Assessment_Draft', artifactKindLabel: 'Assessment session', packageAssetId: 'asset-1', itemCount: 1 },
    ]);
    const deps = {
      ...buildDeps({ callAsync, assetIds: ['asset-1', 'asset-2'] }),
      promptForReplacementName: sinon.stub(),
    };

    try {
      await buildUploadWithNameConflictRetry(drafts, 'summary', deps, saveContract);
      throw new Error('Expected the single-content-system guard to fail');
    } catch (error) {
      expect((error as Error).message).to.equal('AI Content Creator saves exactly one Learning or Test content system.');
    }
    expect((deps.dynamicAssets.insert as sinon.SinonStub).called).to.equal(false);
    expect(callAsync.called).to.equal(false);
  });
});
