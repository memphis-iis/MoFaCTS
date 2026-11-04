import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { dockerImageFixture, dockerTar } from './helpers/dockerImageArchiveFixture.mjs';
import { readDockerArchiveIdentity, parseDockerImageInspection, IMAGE_ARCHIVE_LIMITS } from '../qualification/imageArchiveIdentity.mjs';
import { observeDockerImage } from '../qualification/observeDockerImage.mjs';
const read = (fixture, bytes = fixture.archive(), limits) => readDockerArchiveIdentity(Readable.from([bytes]), fixture.inspection, limits);

test('classic, OCI manifest and OCI index native references resolve to actual config bytes', async () => {
  for (const kind of ['classic', 'manifest', 'index']) {
    const fixture = dockerImageFixture(kind);
    const result = await read(fixture);
    assert.deepEqual(result, { configDigest: fixture.configDigest, platform: 'linux/amd64' });
    if (kind !== 'classic') assert.notEqual(result.configDigest, fixture.inspection.nativeId);
    const bytes = fixture.archive();
    const chunks = Array.from({ length: Math.ceil(bytes.length / 17) }, (_, index) => bytes.subarray(index * 17, index * 17 + 17));
    assert.deepEqual(await readDockerArchiveIdentity(Readable.from(chunks), fixture.inspection), result);
  }
});
test('missing, tampered, duplicate and unsafe metadata never becomes identity', async () => {
  for (const kind of ['classic', 'index', 'manifest']) {
    for (const mutate of [
      fixture => fixture.files.delete('manifest.json'),
      fixture => fixture.files.set('manifest.json', Buffer.from('not-json')),
      fixture => fixture.files.set('manifest.json', Buffer.from('[]')),
      fixture => { const key = [...fixture.files.keys()].find(name => name.endsWith(fixture.configDigest.slice(7)) || name.endsWith(fixture.configDigest.slice(7) + '.json')); fixture.files.set(key, Buffer.from('{}')); },
      fixture => { const rows = JSON.parse(fixture.files.get('manifest.json')); rows[0].Config = '../private'; fixture.files.set('manifest.json', Buffer.from(JSON.stringify(rows))); },
    ]) {
      const fixture = dockerImageFixture(kind); mutate(fixture); await assert.rejects(read(fixture));
    }
    const fixture = dockerImageFixture(kind);
    await assert.rejects(read(fixture, dockerTar([...fixture.files, ['manifest.json', fixture.files.get('manifest.json')]])));
    await assert.rejects(read(fixture, dockerTar([...fixture.files, ['../private', Buffer.from('synthetic-private')]])));
    await assert.rejects(read(fixture, fixture.archive().subarray(0, -513)));
    await assert.rejects(read(fixture, Buffer.concat([fixture.archive(), Buffer.from('x'.repeat(512))])));
  }
});
test('ambiguous roots, broken content links and descriptor substitutions fail closed', async () => {
  for (const mutate of [
    fixture => fixture.files.set('oci-layout', Buffer.from('{"imageLayoutVersion":"2.0"}')),
    fixture => { const root = JSON.parse(fixture.files.get('index.json')); root.manifests.push(root.manifests[0]); fixture.files.set('index.json', Buffer.from(JSON.stringify(root))); },
    fixture => { fixture.inspection.descriptor.size++; },
    fixture => { fixture.inspection.nativeId = 'sha256:' + 'f'.repeat(64); },
    fixture => { fixture.files.delete(`blobs/sha256/${fixture.inspection.nativeId.slice(7)}`); },
  ]) {
    const fixture = dockerImageFixture('index'); mutate(fixture); await assert.rejects(read(fixture));
  }
});
test('two matching platform manifests are ambiguous even with the same config', async () => {
  const fixture = dockerImageFixture('index');
  const rootPath = `blobs/sha256/${fixture.inspection.nativeId.slice(7)}`;
  const index = JSON.parse(fixture.files.get(rootPath));
  index.manifests.push(index.manifests[0]);
  const bytes = Buffer.from(JSON.stringify(index));
  const descriptor = { ...fixture.inspection.descriptor, digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
  fixture.files.set(`blobs/sha256/${descriptor.digest.slice(7)}`, bytes);
  fixture.files.set('index.json', Buffer.from(JSON.stringify({ schemaVersion: 2, manifests: [descriptor] })));
  fixture.inspection = { ...fixture.inspection, nativeId: descriptor.digest, descriptor };
  await assert.rejects(read(fixture));
});
test('archive bounds, checksums, links and duplicate JSON keys are enforced', async () => {
  const fixture = dockerImageFixture();
  for (const limits of [ { ...IMAGE_ARCHIVE_LIMITS, bytes: 512 }, { ...IMAGE_ARCHIVE_LIMITS, entries: 1 },
    { ...IMAGE_ARCHIVE_LIMITS, metadataBytes: 1 }, { ...IMAGE_ARCHIVE_LIMITS, retainedBytes: 1 } ]) await assert.rejects(read(fixture, fixture.archive(), limits));
  const corrupted = fixture.archive(); corrupted[10] ^= 1;
  await assert.rejects(read(fixture, corrupted));
  const linked = fixture.archive(); linked[156] = 50; linked.fill(32,148,156);
  linked.write(linked.subarray(0,512).reduce((sum,byte)=>sum+byte,0).toString(8).padStart(6,'0')+'\0 ',148);
  await assert.rejects(read(fixture, linked));
  fixture.files.set('manifest.json', Buffer.from('[{"Config":"private","Config":"'+fixture.configDigest.slice(7)+'.json","Layers":["layer/layer.tar"]}]'));
  await assert.rejects(read(fixture));
});
test('inspection and orchestration preserve engine-reference versus config identity', async () => {
  const fixture = dockerImageFixture('index');
  const calls = [];
  const result = await observeDockerImage(fixture.inspection.nativeId, {
    command: async (...args) => { calls.push(args); return Buffer.from(JSON.stringify(fixture.inspection)); },
    archive: inspection => { assert.deepEqual(inspection, fixture.inspection); return read(fixture); },
  });
  assert.equal(result.configDigest, fixture.configDigest);
  assert.ok(calls[0][1].includes(fixture.inspection.nativeId));
  for (const value of [null, {}, { ...fixture.inspection, platform: 'linux/arm64' }, { ...fixture.inspection, nativeId: 'tag:latest' },
    { ...fixture.inspection, descriptor: { ...fixture.inspection.descriptor, mediaType: 'unknown' } }]) assert.throws(()=>parseDockerImageInspection(value));
  assert.throws(()=>parseDockerImageInspection({ ...fixture.inspection, nativeId:fixture.inspection.nativeId+'\n' }));
  await assert.rejects(observeDockerImage('latest'));
  await assert.rejects(observeDockerImage('sha256:'+'f'.repeat(64), {command:async()=>Buffer.from(JSON.stringify(fixture.inspection))}));
});

test('inspection and archive failures identify only their fixed stage without leaking raw diagnostics', async () => {
  const fixture = dockerImageFixture();
  for (const [stage, dependencies] of [
    ['inspect', { command: async () => { throw new Error('synthetic-private-diagnostic'); } }],
    ['archive', { command: async () => Buffer.from(JSON.stringify(fixture.inspection)),
      archive: async () => { throw new Error('synthetic-private-diagnostic'); } }],
  ]) {
    await assert.rejects(observeDockerImage(fixture.inspection.nativeId, dependencies), error => {
      assert.equal(error.code, 'DOCKER_IMAGE_OBSERVATION_FAILED');
      assert.equal(error.stage, stage);
      assert.doesNotMatch(error.message + JSON.stringify(error), /synthetic-private/);
      return true;
    });
  }
});

test('config platform mismatches cannot borrow the inspected platform', async () => {
  const fixture = dockerImageFixture();
  const config = Buffer.from('{"os":"linux","architecture":"arm64"}');
  const hash = createHash('sha256').update(config).digest('hex');
  fixture.inspection.nativeId = 'sha256:' + hash;
  fixture.files.set(hash + '.json', config);
  fixture.files.set('manifest.json', Buffer.from(JSON.stringify([{ Config: hash + '.json', Layers: [] }])));
  await assert.rejects(read(fixture));
});

test('attestation descriptors are excluded while distinct matching platform graphs are ambiguous', async () => {
  const rebuild = (fixture, descriptors) => {
    const bytes = Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.index.v1+json', manifests: descriptors }));
    const descriptor = { mediaType: 'application/vnd.oci.image.index.v1+json', digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
    fixture.files.set('blobs/sha256/' + descriptor.digest.slice(7), bytes);
    fixture.files.set('index.json', Buffer.from(JSON.stringify({ schemaVersion: 2, manifests: [descriptor] })));
    fixture.inspection = { ...fixture.inspection, nativeId: descriptor.digest, descriptor };
  };
  const fixture = dockerImageFixture('manifest');
  const selected = fixture.inspection.descriptor;
  rebuild(fixture, [selected, { ...selected, digest: 'sha256:' + 'f'.repeat(64), platform: { os: 'unknown', architecture: 'unknown' } }]);
  assert.equal((await read(fixture)).configDigest, fixture.configDigest);
  const second = dockerImageFixture('manifest', 'other-config');
  for (const [name, value] of second.files) if (name.startsWith('blobs/')) fixture.files.set(name, value);
  const rows = [...JSON.parse(fixture.files.get('manifest.json')), ...JSON.parse(second.files.get('manifest.json'))];
  fixture.files.set('manifest.json', Buffer.from(JSON.stringify(rows)));
  rebuild(fixture, [selected, second.inspection.descriptor]);
  await assert.rejects(read(fixture));
});
