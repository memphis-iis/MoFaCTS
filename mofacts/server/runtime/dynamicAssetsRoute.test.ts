import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import { serveDynamicAssetById } from './dynamicAssetsRoute';

if (Meteor.isServer) describe('dynamic asset download boundary', () => {
  it('retires __upload before looking up an asset or using download storage', async () => {
    let status = 0;
    let body = '';
    await serveDynamicAssetById({
      DynamicAssets: { findOneAsync: async () => { throw new Error('Retired endpoint must not look up assets'); } },
      storageBoundary: {} as any, storageRoot: '', serverConsole() {},
    }, { writeHead(code: number) { status = code; }, end(text: string) { body = text; } } as any, '__upload');
    expect(status).to.equal(410);
    expect(body).to.contain('HTTP uploads are retired');
  });
  for (const asset of [null, { _id: 'private', path: '/ignored', meta: { public: false } }]) {
    it(`denies ${asset ? 'private' : 'missing'} assets before storage access`, async () => {
      let status = 0;
      await serveDynamicAssetById({
        DynamicAssets: { findOneAsync: async () => asset },
        storageBoundary: {} as any, storageRoot: '', serverConsole() {},
      }, { writeHead(code: number) { status = code; }, end() {} } as any, 'private');
      expect(status).to.equal(404);
    });
  }
  it('preserves public S3 asset delivery', async () => {
    let status = 0;
    let body: Buffer | undefined;
    await serveDynamicAssetById({
      DynamicAssets: { findOneAsync: async () => ({ _id: 'public', path: '', name: 'synthetic.txt', meta: { public: true, storageBackend: 's3', storageKey: 'synthetic' } }) },
      storageBoundary: { backend: 's3', getObject: async () => ({ body: Buffer.from('safe'), contentType: 'text/plain' }) } as any,
      storageRoot: '', serverConsole() {},
    }, { writeHead(code: number) { status = code; }, end(bytes: Buffer) { body = bytes; } } as any, 'public');
    expect(status).to.equal(200);
    expect(body!.toString()).to.equal('safe');
  });
});
