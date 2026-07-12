import { expect } from 'chai';
import {
  buildCanonicalDynamicAssetPath,
  isExternalMediaPath,
} from './dynamicAssetPath';

describe('media resolver canonical asset paths', function() {
  it('builds the application-owned asset route from durable asset identity', function() {
    expect(buildCanonicalDynamicAssetPath({
      _id: 'asset-1',
      name: 'spoken prompt.mp3',
    })).to.equal('/cdn/storage/Assets/asset-1/original/spoken%20prompt.mp3');
  });

  it('uses the requested filename only when the asset record has no filename', function() {
    expect(buildCanonicalDynamicAssetPath({
      _id: 'asset-2',
    }, 'prompt.mp3')).to.equal('/cdn/storage/Assets/asset-2/original/prompt.mp3');
  });

  it('rejects an asset record without durable identity', function() {
    expect(() => buildCanonicalDynamicAssetPath({ name: 'prompt.mp3' }))
      .to.throw('[Media Resolver] Dynamic asset is missing its canonical _id');
  });

  it('keeps authored external media outside the local asset resolver', function() {
    expect(isExternalMediaPath(
      'https://upload.wikimedia.org/wikipedia/commons/f/f1/Somalia_in_its_region.svg',
    )).to.equal(true);
    expect(isExternalMediaPath('/cdn/storage/Assets/asset-1/original/map.svg')).to.equal(false);
  });
});
