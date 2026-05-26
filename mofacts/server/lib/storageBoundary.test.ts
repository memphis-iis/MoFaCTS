import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import {
  assertStorageRelativePathSafe,
  getStorageBackend,
  validateStorageBoundary,
} from './storageBoundary';

describe('storageBoundary', function() {
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
    const dynamicAssetsPath = path.join(base, 'dynamic-assets');
    const h5pContentPath = path.join(base, 'h5p-content');
    const h5pLibrariesPath = path.join(base, 'h5p-libraries-missing');
    await fs.mkdir(dynamicAssetsPath);
    await fs.mkdir(h5pContentPath);

    const checks = await validateStorageBoundary({
      storage: {
        backend: 'local',
        local: {
          dynamicAssetsPath,
          h5pContentPath,
          h5pLibrariesPath,
        },
      },
    });

    const missingCheck = checks.find((check) => check.name === 'storage.local.h5pLibrariesPath');
    expect(missingCheck?.status).to.equal('fail');
  });

  it('rejects unknown storage backends clearly', function() {
    expect(() => getStorageBackend({ storage: { backend: 'memory' } }))
      .to.throw('storage.backend must be local or s3');
  });
});
