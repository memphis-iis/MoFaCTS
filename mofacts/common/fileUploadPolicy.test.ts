import { expect } from 'chai';
import { validateDynamicAssetUpload } from './fileUploadPolicy';

describe('Dynamic asset upload policy', function() {
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
