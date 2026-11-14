import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { uploadPackageMedia } from './mediaUploader';
import { packagedSimulationMediaScopes } from './packageSimulations';
import { hashFile, storePackageFile } from './packageFileStorage';
import type { UploadedPackageFile } from './packageParser';

describe('package media efficiency', () => {
  it('stores combined simulation dependencies only in declaring lessons, including shared attachments', async () => {
    const files: UploadedPackageFile[] = [];
    const owners = new Map<string, Set<string | number>>();
    for (const name of ['one', 'two', 'three']) {
      const reference = (url: string) => ({ url, sha256: '0'.repeat(64) });
      const asset = { ...reference(`${name}.html?accessibility`), catalog: reference(`${name}.json`), attachments: [reference(`${name}-source.zip`), reference('shared-notices.txt')] };
      const stimulus = { setspec: { sparcPages: [{ display: { nodes: [{ atomType: 'simulation', simulation: { asset } }] } }] } };
      files.push({ name: `${name}-stims.json`, path: '', extension: 'json', type: 'stim', contents: stimulus, packageFile: '' });
      owners.set(`${name}-stims.json`, new Set([name]));
      for (const filename of [`${name}.html`, `${name}.json`, `${name}-source.zip`]) {
        files.push({ name: filename, path: '', extension: '', type: 'media', contents: undefined, packageFile: '' });
      }
    }
    files.push({ name: 'shared-notices.txt', path: '', extension: '', type: 'media', contents: undefined, packageFile: '' });
    const writes: Array<[string, unknown]> = [];
    const maps = await uploadPackageMedia({
      mediaFiles: files.filter(file => file.type === 'media'), mediaScopesByName: packagedSimulationMediaScopes(files, owners),
      uploadStimSetIds: new Set(['one', 'two', 'three']), fallbackStimSetId: undefined, owner: 'synthetic',
      async saveMediaFile(media, _owner, scope) { writes.push([media.name, scope]); return { _id: `${scope}-${media.name}` }; },
      toCanonicalDynamicAssetPath: asset => String(asset?._id), normalizeUploadedMediaLookupKey: value => String(value).toLowerCase(), serverConsole() {},
    });
    assert.equal(writes.length, 12); // Nine private dependencies plus three references to one shared notice.
    for (const scope of ['one', 'two', 'three']) {
      assert.equal(maps.get(scope)?.size, 4);
      assert.ok(writes.filter(([, owner]) => owner === scope).every(([name]) => name.startsWith(scope) || name === 'shared-notices.txt'));
    }
    assert.throws(() => packagedSimulationMediaScopes(files, new Map()), /no persisted scope/);
  });

  it('adopts a durable filesystem copy and preserves it after temporary-source cleanup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mofacts-media-test-'));
    try {
      const source = join(directory, 'source');
      await writeFile(source, 'corresponding source and notices');
      const expectedHash = await hashFile(source);
      const record = await storePackageFile({ async addFile(path, options) { return { path, options }; } }, join(directory, 'storage'), source, { fileName: 'source.zip' });
      await rm(source);
      assert.equal(await hashFile(record.path), expectedHash);
      assert.equal(await readFile(record.path, 'utf8'), 'corresponding source and notices');
      assert.equal(record.options.fileName, 'source.zip');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('cleans a failed asset-registration copy without removing the caller source', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mofacts-media-test-'));
    let destination = '';
    try {
      const source = join(directory, 'source');
      await writeFile(source, 'retain on failure');
      await assert.rejects(storePackageFile({ async addFile(path) { destination = path; throw Error('registration failed'); } }, join(directory, 'storage'), source, { fileName: 'source.zip' }), /registration failed/);
      await access(source);
      await assert.rejects(access(destination));
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
