import { expect } from 'chai';
import JSZip from 'jszip';
import {
  AI_IMAGE_MAX_WIDTH,
  AI_IMAGE_WEBP_QUALITY,
  expandAiImageSources,
  prepareAiImageAssets,
} from './aiContentImageAssets';

describe('aiContentImageAssets', function() {
  it('uses the approved WebP conversion settings', function() {
    expect(AI_IMAGE_MAX_WIDTH).to.equal(1280);
    expect(AI_IMAGE_WEBP_QUALITY).to.equal(0.86);
  });

  it('extracts supported images from ZIP files and ignores non-image entries', async function() {
    const zip = new JSZip();
    zip.file('photos/first.png', new Uint8Array([1, 2, 3]));
    zip.file('photos/notes.txt', 'not an image');
    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    const zipFile = new File([new Uint8Array(zipBytes).buffer], 'photos.zip', { type: 'application/zip' });

    const expanded = await expandAiImageSources([{ file: zipFile, sourcePath: zipFile.name }]);

    expect(expanded).to.have.length(1);
    expect(expanded[0]!.file.name).to.equal('first.png');
    expect(expanded[0]!.sourcePath).to.equal('photos.zip/photos/first.png');
  });

  it('creates unique WebP package names while preserving every selected image', async function() {
    const sources = [
      { file: new File(['one'], 'bird.png', { type: 'image/png' }), sourcePath: 'one/bird.png' },
      { file: new File(['two'], 'bird.jpg', { type: 'image/jpeg' }), sourcePath: 'two/bird.jpg' },
    ];
    const assets = await prepareAiImageAssets(sources, [], async () => ({
      bytes: new Uint8Array([4, 5, 6]),
      width: 1280,
      height: 720,
    }));

    expect(assets.map((asset) => asset.packageFileName)).to.deep.equal(['bird.webp', 'bird_2.webp']);
    expect(assets.map((asset) => asset.sourcePath)).to.deep.equal(['one/bird.png', 'two/bird.jpg']);
    expect(assets.every((asset) => asset.width === 1280 && asset.height === 720)).to.equal(true);
  });
});
