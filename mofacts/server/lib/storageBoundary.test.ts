import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import {
  assertStorageRelativePathSafe,
  getStorageBackend,
  createStorageBoundary,
  validateStorageBoundary,
} from './storageBoundary';

describe('storageBoundary', function() {
  it('opens an S3 object as a Node stream through the actual SDK', async function() {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': '6' });
      res.end('source');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address() as { port: number };
      const storage = createStorageBoundary({ storage: { backend: 's3', s3: {
        endpoint: `http://127.0.0.1:${address.port}`, bucket: 'synthetic', region: 'us-east-1', accessKeyId: 'synthetic', secretAccessKey: 'synthetic',
      } } });
      const object = await storage.openObject('source.zip');
      expect(object.body).to.be.instanceOf(Readable);
      expect(object.contentLength).to.equal(6);
      let text = '';
      for await (const chunk of object.body) text += chunk.toString();
      expect(text).to.equal('source');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
  it('rejects storage-relative paths that escape the configured root', function() {
    const root = path.resolve(os.tmpdir(), 'mofacts-storage-root');

    expect(() => assertStorageRelativePathSafe(root, '../outside.txt'))
      .to.throw(/escapes storage root/);
  });

  it('resolves safe storage-relative paths inside the configured root', function() {
    const root = path.resolve(os.tmpdir(), 'mofacts-storage-root');
    const resolved = assertStorageRelativePathSafe(root, 'assets/file.txt');

    expect(resolved).to.equal(path.join(root, 'assets', 'file.txt'));
  });

  it('fails local storage readiness when a configured directory is missing', async function() {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-storage-test-'));
    const dynamicAssetsPath = path.join(base, 'dynamic-assets-missing');

    const checks = await validateStorageBoundary({
      storage: {
        backend: 'local',
        local: {
          dynamicAssetsPath,
        },
      },
    });

    const missingCheck = checks.find((check) => check.name === 'storage.local.dynamicAssetsPath');
    expect(missingCheck?.status).to.equal('fail');
  });

  it('rejects unknown storage backends clearly', function() {
    expect(() => getStorageBackend({ storage: { backend: 'memory' } }))
      .to.throw('storage.backend must be local or s3');
  });
});
