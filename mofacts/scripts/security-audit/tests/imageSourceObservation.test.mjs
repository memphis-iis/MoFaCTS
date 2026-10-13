import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { observeImageSource, writeImageSourceObservation } from '../qualification/imageSourceObservation.mjs';
import { inspectSnapshotTree } from '../qualification/sourceSnapshot.mjs';
import { contextOverride, assertSourceBoundBuildChange } from '../qualification/captureBuildSource.mjs';

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-image-observation-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'source');
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, 'Dockerfile'), 'exact recipe\r\n');
  await fs.mkdir(path.join(root, 'empty'));
  return { root, output: path.join(directory, 'observation.json'),
    digest: (await inspectSnapshotTree(root)).digestSha256 };
}
const commit = 'a'.repeat(40);

test('ordinary builds explicitly record missing comparison without reading or certifying source', async () => {
  assert.deepEqual(await observeImageSource('not-a-directory', '', 'unknown', ''), {
    schema: 'MoFaCTSImageSourceObservationV1', state: 'unavailable', reason: 'not-requested',
  });
});
test('binds exact source bytes and explicit dirty provenance without claiming test or release PASS', async (t) => {
  const { root, output, digest } = await fixture(t);
  const result = await writeImageSourceObservation(root, output, digest, commit, 'true');
  assert.equal(result.state, 'source-matched-unqualified');
  assert.equal(result.identity.includedUncommittedLocalChanges, true);
  assert.equal(result.identity.sourceSnapshotDigestSha256, digest);
  assert.deepEqual(JSON.parse(await fs.readFile(output)), result);
});
test('changed recipe bytes, removed directories and malformed provenance fail without output', async (t) => {
  const { root, output, digest } = await fixture(t);
  await assert.rejects(writeImageSourceObservation(root, output, digest, commit, ''), /validation failed/);
  await fs.writeFile(path.join(root, 'Dockerfile'), 'exact recipe\n');
  await assert.rejects(writeImageSourceObservation(root, output, digest, commit, 'false'), /validation failed/);
  await fs.writeFile(path.join(root, 'Dockerfile'), 'exact recipe\r\n');
  await fs.rmdir(path.join(root, 'empty'));
  await assert.rejects(writeImageSourceObservation(root, output, digest, commit, 'false'), /validation failed/);
  await assert.rejects(fs.stat(output), { code: 'ENOENT' });
});
test('observation never hashes itself or overwrites existing evidence', async (t) => {
  const { root, output, digest } = await fixture(t);
  await assert.rejects(writeImageSourceObservation(root, path.join(root, 'proof.json'), digest, commit, 'false'), /validation failed/);
  await fs.writeFile(output, 'keep');
  await assert.rejects(writeImageSourceObservation(root, output, digest, commit, 'false'), { code: 'EEXIST' });
  assert.equal(await fs.readFile(output, 'utf8'), 'keep');
});
test('Compose binding permits only context and the two captured provenance arguments', () => {
  const identity = { schema: 'BuildIdentityV1', baseCommit: commit,
    includedUncommittedLocalChanges: true, sourceSnapshotDigestSha256: 'b'.repeat(64) };
  const candidate = path.resolve(os.tmpdir(), 'synthetic-bound-source');
  const before = { services: { mofacts: { image: 'keep:tag', build: { context: '/original',
    dockerfile: 'Dockerfile', args: { MOFACTS_SOURCE_REVISION: commit } } } } };
  const after = structuredClone(before);
  const override = contextOverride(candidate, identity).services.mofacts.build;
  Object.assign(after.services.mofacts.build, { context: override.context });
  Object.assign(after.services.mofacts.build.args, override.args);
  assert.doesNotThrow(() => assertSourceBoundBuildChange(before, after, candidate, identity));
  for (const name of ['MOFACTS_SOURCE_SNAPSHOT_DIGEST_SHA256', 'MOFACTS_SOURCE_INCLUDED_UNCOMMITTED_LOCAL_CHANGES']) {
    const changed = structuredClone(after);
    changed.services.mofacts.build.args[name] = 'forged';
    assert.throws(() => assertSourceBoundBuildChange(before, changed, candidate, identity), /validation failed/);
  }
  after.services.mofacts.image = 'changed:tag';
  assert.throws(() => assertSourceBoundBuildChange(before, after, candidate, identity), /validation failed/);
});
