import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { observePublishedImage } from '../qualification/observePublishedImage.mjs';
import { IMAGE_MEDIA_TYPES } from '../qualification/imageArchiveIdentity.mjs';

const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value));
function fixture(kind = 'manifest', change = () => {}) {
  const built = { configDigest: 'sha256:' + 'a'.repeat(64), platform: 'linux/amd64' };
  const manifest = { schemaVersion: 2, mediaType: IMAGE_MEDIA_TYPES.manifests[0],
    config: { mediaType: IMAGE_MEDIA_TYPES.configs[0], digest: built.configDigest, size: 1024 }, layers: [] };
  const state = { built, manifest, index: null }; change(state);
  const bytes = encode(state.manifest), childDigest = hash(bytes);
  const index = state.index ?? { schemaVersion: 2, mediaType: IMAGE_MEDIA_TYPES.indices[0], manifests: [
    { mediaType: IMAGE_MEDIA_TYPES.manifests[0], digest: childDigest, size: bytes.length, platform: { os: 'linux', architecture: 'amd64' } },
    { mediaType: IMAGE_MEDIA_TYPES.manifests[0], digest: 'sha256:' + 'b'.repeat(64), size: 100, platform: { os: 'unknown', architecture: 'unknown' } },
  ] };
  const root = kind === 'index' ? encode(index) : bytes, rootDigest = hash(root), calls = [];
  const reference = 'registry.example/mofacts@' + rootDigest;
  const blobs = new Map([[reference, root], ['registry.example/mofacts@' + childDigest, bytes]]);
  const command = async (program, args, maxBytes) => {
    assert.equal(program, 'docker'); assert.deepEqual(args.slice(0, 6), ['--context', 'default', 'buildx', 'imagetools', 'inspect', '--raw']);
    assert.equal(maxBytes, 1024 ** 2); calls.push(args.at(-1));
    const value = blobs.get(args.at(-1)); assert(value); return value;
  };
  return { built: state.built, manifest, index, root, rootDigest, childDigest, reference, blobs, command, calls };
}
test('published manifest/index mappings bind exact registry bytes to independently observed built configuration', async () => {
  for (const kind of ['manifest', 'index']) {
    const value = fixture(kind), result = await observePublishedImage(value.reference, value.built, value.command);
    assert.equal(result.kind, kind); assert.equal(result.digest, value.rootDigest);
    assert.equal(result.configDigest, value.built.configDigest); assert.equal(result.platform, 'linux/amd64');
    assert.notEqual(result.digest, result.configDigest);
    if (kind === 'index') { assert.equal(result.platformManifestDigest, value.childDigest); assert.notEqual(result.digest, result.platformManifestDigest); }
    assert.equal(value.calls.length, kind === 'index' ? 2 : 1);
  }
});
test('mutable references, foreign schemes and unsupported platforms fail before registry I/O', async () => {
  const value = fixture();
  for (const reference of ['registry.example/mofacts:latest', 'https://' + value.reference, 'operator:private@' + value.reference]) {
    await assert.rejects(observePublishedImage(reference, value.built, value.command));
  }
  await assert.rejects(observePublishedImage(value.reference, { ...value.built, platform: 'linux/arm64' }, value.command));
  assert.equal(value.calls.length, 0);
});
test('wrong root/child bytes, framing changes and unbound configuration cannot produce publication evidence', async () => {
  for (const mutate of [value => value.blobs.set(value.reference, Buffer.concat([value.root, Buffer.from('\n')])),
    value => value.blobs.set('registry.example/mofacts@' + value.childDigest, Buffer.from('{}')),
    value => { value.built.configDigest = 'sha256:' + 'f'.repeat(64); }]) {
    const value = fixture('index'); mutate(value);
    await assert.rejects(observePublishedImage(value.reference, value.built, value.command));
  }
});
test('ambiguous/missing/nested platform mappings and invalid config descriptors fail explicitly', async () => {
  for (const mutate of [value => value.manifests.push(structuredClone(value.manifests[0])),
    value => { value.manifests[0].platform.architecture = 'arm64'; },
    value => { value.manifests[0].mediaType = IMAGE_MEDIA_TYPES.indices[0]; },
    value => { value.manifests[0].size += 1; }]) {
    const base = fixture('index'); mutate(base.index);
    const value = fixture('index', state => { state.index = base.index; });
    await assert.rejects(observePublishedImage(value.reference, value.built, value.command));
  }
  for (const mutate of [state => { state.manifest.config.mediaType = 'unreviewed'; },
    state => { state.manifest.config.size = 0; }, state => { state.manifest.layers = null; }]) {
    const value = fixture('manifest', mutate); await assert.rejects(observePublishedImage(value.reference, value.built, value.command));
  }
});
