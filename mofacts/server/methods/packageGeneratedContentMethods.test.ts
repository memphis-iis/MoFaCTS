import { strict as assert } from 'node:assert';
import { AI_CONTENT_CONTRACT_VERSION, type AiContentSaveContract } from '../../common/aiContentContract';
import type { UploadedPackageFile } from '../lib/packageParser';
import { prepareAiGeneratedPackage } from './packageGeneratedContentMethods';

function packageFile(name: string, type: UploadedPackageFile['type'], contents: unknown): UploadedPackageFile {
  return { name, type, contents, extension: name.split('.').pop() || '', path: name, packageFile: 'generated.zip' };
}

function imageContract(mode: 'learning' | 'test' = 'learning'): AiContentSaveContract {
  return {
    contractVersion: AI_CONTENT_CONTRACT_VERSION,
    mode,
    title: 'Hand Bones',
    pairs: [{
      id: 'pair-1',
      kind: 'image',
      stimulus: 'image: capitate',
      response: 'capitate',
      image: { source: 'uploaded', fileName: 'capitate.webp' },
    }],
  };
}

function generatedFiles(options: { mode?: 'learning' | 'test'; includeMedia?: boolean } = {}): UploadedPackageFile[] {
  const mode = options.mode || 'learning';
  return [
    packageFile('Hand_Bones_TDF.json', 'tdf', {
      tutor: {
        setspec: { lessonname: 'Hand_Bones', stimulusfile: 'Hand_Bones_STIM.json', userselect: 'true' },
        unit: mode === 'test' ? [{ assessmentsession: {} }] : [{ learningsession: {} }],
      },
    }),
    packageFile('Hand_Bones_STIM.json', 'stim', {
      setspec: {
        clusters: [{ stims: [{ display: { imgSrc: 'capitate.webp' }, response: { correctResponse: 'capitate' } }] }],
      },
    }),
    ...(options.includeMedia === false ? [] : [packageFile('capitate.webp', 'media', Buffer.from([1, 2, 3]))]),
  ];
}

describe('AI generated package ingestion policy', function() {
  it('accepts one reviewed image package and applies the generated-media visibility lock', function() {
    const files = generatedFiles();
    const prepared = prepareAiGeneratedPackage(files, imageContract(), true);
    const tutor = (files[0]!.contents as any).tutor;

    assert.equal(prepared.tdfFileName, 'Hand_Bones_TDF.json');
    assert.equal(prepared.moduleId, 'learningSession');
    assert.equal(tutor.setspec.userselect, 'false');
    assert.match(tutor.setspec.aiVisibilityLockReason, /attribution evidence/);
  });

  it('rejects a package whose reviewed image bytes are missing', function() {
    assert.throws(
      () => prepareAiGeneratedPackage(generatedFiles({ includeMedia: false }), imageContract(), true),
      /missing reviewed image/,
    );
  });

  it('rejects a package whose session mode differs from the reviewed contract', function() {
    assert.throws(
      () => prepareAiGeneratedPackage(generatedFiles({ mode: 'test' }), imageContract('learning'), true),
      /mode does not match/,
    );
  });

  it('rejects duplicate package media names rather than choosing one', function() {
    const files = generatedFiles();
    files.push(packageFile('capitate.webp', 'media', Buffer.from([4, 5, 6])));
    assert.throws(() => prepareAiGeneratedPackage(files, imageContract(), true), /missing reviewed image/);
  });
});
