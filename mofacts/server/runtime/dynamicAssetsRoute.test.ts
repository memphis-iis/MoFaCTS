import { Readable, Writable } from 'node:stream';
import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import { serveDynamicAssetById } from './dynamicAssetsRoute';

function response() {
  const chunks: Buffer[] = [];
  let status = 0;
  let headers: Record<string, string> = {};
  const res = Object.assign(new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } }), {
    headersSent: false,
    writeHead(code: number, value: Record<string, string>) { status = code; headers = value; this.headersSent = true; },
  });
  return { res, get status() { return status; }, get headers() { return headers; }, get body() { return Buffer.concat(chunks); } };
}
if (Meteor.isServer) describe('dynamic asset download boundary', () => {
  it('serves uploaded simulation HTML in a network-restricted opaque sandbox on S3', async () => {
    const output = response();
    await serveDynamicAssetById({
      DynamicAssets: { findOneAsync: async () => ({ _id: 'simulation', path: '', name: 'simulation.html', type: 'application/octet-stream', meta: { public: true, storageBackend: 's3', storageKey: 'simulation' } }) },
      storageBoundary: { backend: 's3', openObject: async () => ({ body: Readable.from(['<html></html>']), contentType: 'application/octet-stream' }) } as any,
      storageRoot: '', serverConsole() {},
    }, output.res as any, 'simulation');
    const headers = output.headers;
    expect(headers['Content-Type']).to.equal('text/html; charset=utf-8');
    expect(headers['Content-Security-Policy']).to.contain('sandbox allow-scripts;');
    expect(headers['Content-Security-Policy']).not.to.contain('allow-same-origin');
    expect(headers['Content-Security-Policy']).to.contain("frame-ancestors 'self'");
    expect(headers['Content-Security-Policy']).to.contain("connect-src data: blob:");
  });
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
  it('closes the S3 source when a client disconnects, without reading the whole object', async () => {
    let reads = 0;
    const source = new Readable({ highWaterMark: 1024, read() { reads++; this.push(Buffer.alloc(1024)); } });
    const res = Object.assign(new Writable({ highWaterMark: 1024, write(_chunk, _encoding, callback) { this.destroy(); callback(); } }), { writeHead() {} });
    await serveDynamicAssetById({
      DynamicAssets: { findOneAsync: async () => ({ _id: 'public', path: '', name: 'large.zip', meta: { public: true, storageBackend: 's3', storageKey: 'large' } }) },
      storageBoundary: { backend: 's3', openObject: async () => ({ body: source }) } as any,
      storageRoot: '', serverConsole() {},
    }, res as any, 'public');
    expect(source.destroyed).to.equal(true);
    expect(reads).to.be.lessThan(10);
  });
  it('preserves public S3 asset delivery', async () => {
    const output = response();
    await serveDynamicAssetById({
      DynamicAssets: { findOneAsync: async () => ({ _id: 'public', path: '', name: 'synthetic.txt', meta: { public: true, storageBackend: 's3', storageKey: 'synthetic' } }) },
      storageBoundary: { backend: 's3', openObject: async () => ({ body: Readable.from(['sa', 'fe']), contentType: 'text/plain' }) } as any,
      storageRoot: '', serverConsole() {},
    }, output.res as any, 'public');
    expect(output.status).to.equal(200);
    expect(output.body.toString()).to.equal('safe');
  });
});
