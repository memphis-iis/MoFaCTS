import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { recordDeploymentRelease } from '../qualification/recordDeploymentRelease.mjs';
test('post-acceptance hook records actual configuration, retains authority history and returns the exact accepted receipt', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-release-hook-'));
  t.after(async () => { assert.equal(path.dirname(root), await fs.realpath(os.tmpdir())); await fs.rm(root, { recursive: true, force: true }); });
  const recordPath = path.join(root, 'authority.json'), candidatePath = path.join(root, 'candidate.json'), evidenceDirectory = path.join(root, 'evidence'); await fs.mkdir(evidenceDirectory);
  const candidate = { deployedAtUtc: '2026-11-12T12:00:00.000Z', baseCommit: 'a'.repeat(40), includedUncommittedLocalChanges: true,
    image: 'registry.example/mofacts:accepted', tag: 'accepted', digest: 'sha256:' + 'b'.repeat(64) };
  await fs.writeFile(candidatePath, JSON.stringify(candidate));
  const running = { configDigest: 'sha256:' + 'c'.repeat(64), platform: 'linux/amd64', baseCommit: candidate.baseCommit };
  const publication = { kind: 'index', digest: candidate.digest, platformManifestDigest: 'sha256:' + 'd'.repeat(64), configDigest: running.configDigest, platform: running.platform };
  const options = { recordPath, candidatePath, evidenceDirectory, sshHost: 'operator@host', sshKey: path.join(root, 'key'), knownHosts: path.join(root, 'hosts'), participantChecksPassed: true };
  let requests = 0;
  const dependencies = { observe: async input => {
    assert.deepEqual(input, { sshHost: options.sshHost, sshKey: options.sshKey, knownHosts: options.knownHosts,
      streamOptions: { timeoutMs: 600000 } });
    requests++; return running;
  }, publication: async (ref, image) => {
    assert.equal(ref, 'registry.example/mofacts@' + candidate.digest); assert.deepEqual(image, { configDigest: running.configDigest, platform: running.platform }); return publication;
  } };
  await assert.rejects(recordDeploymentRelease({ ...options, participantChecksPassed: false }, dependencies)); assert.equal(requests, 0);
  await assert.rejects(recordDeploymentRelease(options, { ...dependencies, observe: async () => ({ ...running, baseCommit: 'e'.repeat(40) }) }));
  await assert.rejects(fs.stat(recordPath), { code: 'ENOENT' });
  const result = await recordDeploymentRelease(options, dependencies); assert.equal(result.state, 'deployment-release-recorded-unqualified');
  const record = JSON.parse(await fs.readFile(recordPath)), receipt = JSON.parse(await fs.readFile(path.join(evidenceDirectory, 'release-receipt.json')));
  assert.equal(record.imageId, running.configDigest); assert.equal(record.includedUncommittedLocalChanges, true); assert(!Object.hasOwn(record, 'qualification'));
  assert.equal(receipt.recordDigestSha256, result.recordDigestSha256); assert.deepEqual(receipt.publishedImage, publication);
  assert((await fs.readdir(recordPath + '.history')).some(name => name.endsWith('.json')));
  await assert.rejects(recordDeploymentRelease(options, dependencies));
});
