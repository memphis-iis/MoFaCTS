import { expect } from 'chai';
import { contentMediaStimuliSetId, validateDynamicAssetUpload } from './fileUploadPolicy';

describe('Dynamic asset upload policy', function() {
  it('preserves the lesson identifier type rather than a DOM string or numeric guess', function() {
    expect(contentMediaStimuliSetId({ stimuliSetId: 346 })).to.equal(346);
    expect(contentMediaStimuliSetId({ stimuliSetId: '346' })).to.equal('346');
    expect(contentMediaStimuliSetId({ stimuliSetId: '007' })).to.equal('007');
    expect(contentMediaStimuliSetId({ stimuliSetId: 'sparc:selection' })).to.equal('sparc:selection');
    expect(contentMediaStimuliSetId({ stimuliSetId: 0 })).to.equal(0);
    for (const stimuliSetId of [null, undefined, '', ' ', NaN, Infinity, {}, []]) {
      expect(contentMediaStimuliSetId({ stimuliSetId })).to.equal(null);
      expect(validateDynamicAssetUpload({ name: 'map.png', type: 'image/png',
        meta: { uploadPurpose: 'content-media', tdfId: 'tdf-1', stimuliSetId } as any })).not.to.equal(true);
    }
  });
  it('accepts package ZIPs and rejects persisted APKG and IMSCC files', function() {
    expect(validateDynamicAssetUpload({ name: 'lesson.zip', extension: 'zip', type: 'application/zip', meta: { uploadPurpose: 'package' } })).to.equal(true);
    expect(validateDynamicAssetUpload({ name: 'deck.apkg', extension: 'apkg', type: 'application/zip', meta: { uploadPurpose: 'package' } })).to.equal('Package uploads must be ZIP files');
    expect(validateDynamicAssetUpload({ name: 'course.imscc', extension: 'imscc', type: 'application/zip', meta: { uploadPurpose: 'package' } })).to.equal('Package uploads must be ZIP files');
  });

  it('requires owned target metadata for content media', function() {
    expect(validateDynamicAssetUpload({ name: 'map.png', extension: 'png', type: 'image/png', meta: { uploadPurpose: 'content-media' } })).to.equal('Content media uploads require a TDF and stimuli set');
    expect(validateDynamicAssetUpload({ name: 'map.png', extension: 'png', type: 'image/png', meta: { uploadPurpose: 'content-media', tdfId: 'tdf-1', stimuliSetId: 7 } })).to.equal(true);
  });

  it('rejects missing purposes and unsafe filenames', function() {
    expect(validateDynamicAssetUpload({ name: 'lesson.zip', extension: 'zip', type: 'application/zip' })).to.equal('Upload purpose is required');
    expect(validateDynamicAssetUpload({ name: '../lesson.zip', extension: 'zip', type: 'application/zip', meta: { uploadPurpose: 'package' } })).to.contain('path traversal');
  });
});
