import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { dockerImageFixture } from './helpers/dockerImageArchiveFixture.mjs';
import { readDockerArchiveIdentity } from '../qualification/imageArchiveIdentity.mjs';
import { observeDeploymentImage } from '../qualification/observeDeploymentImage.mjs';
async function fixture(t, kind = 'index') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-deployment-observation-'));
  t.after(async () => { assert.equal(path.dirname(root), await fs.realpath(os.tmpdir())); await fs.rm(root, { recursive: true, force: true }); });
  const sshKey = path.join(root, 'key'), knownHosts = path.join(root, 'hosts');
  await fs.writeFile(sshKey, 'synthetic'); await fs.writeFile(knownHosts, 'synthetic');
  const image = dockerImageFixture(kind); let probes = 0;
  const calls = [];
  const dependencies = {
    async command(binary, args, maximum, environment) {
      assert.equal(binary, 'ssh'); assert.equal(maximum, 16384); assert(!Object.hasOwn(environment, 'AUDIT_REPORT_INGEST_SECRET'));
      assert(args.includes('StrictHostKeyChecking=yes')); calls.push(args.at(-1));
      if (args.at(-1).includes('docker inspect mofacts')) { probes++; return Buffer.from(JSON.stringify({ containerId: 'a'.repeat(64), engineImageReference: image.inspection.nativeId, running: true })); }
      return Buffer.from(JSON.stringify({ ...image.inspection, baseCommit: 'b'.repeat(40) }));
    },
    async archive(inspection) { return readDockerArchiveIdentity(Readable.from([image.archive()]), inspection); },
  };
  return { options: { sshHost: 'operator@staging.example', sshKey, knownHosts }, dependencies, image, calls, probes: () => probes };
}
test('remote observation resolves classic and containerd config bytes through the shared archive owner and rechecks the same running container', async t => {
  for (const kind of ['classic', 'index']) {
    const value = await fixture(t, kind), result = await observeDeploymentImage(value.options, value.dependencies);
    assert.deepEqual(result, { configDigest: value.image.configDigest, platform: 'linux/amd64', baseCommit: 'b'.repeat(40) });
    assert.equal(value.probes(), 2); assert.equal(value.calls.length, 3);
    assert(value.calls.every(call => !/exec|env|settings|restart|compose/.test(call)));
  }
});
test('replacement races, missing revision and graph failure cannot create running-image evidence', async t => {
  for (const mutation of ['replaced', 'revision', 'archive']) {
    const value = await fixture(t), original = value.dependencies.command;
    value.dependencies.command = async (...args) => {
      const bytes = await original(...args), object = JSON.parse(bytes);
      if (mutation === 'replaced' && value.probes() === 2) object.containerId = 'c'.repeat(64);
      if (mutation === 'revision' && Object.hasOwn(object, 'baseCommit')) object.baseCommit = 'unknown';
      return Buffer.from(JSON.stringify(object));
    };
    if (mutation === 'archive') value.dependencies.archive = async () => { throw Error('Synthetic graph failure'); };
    await assert.rejects(observeDeploymentImage(value.options, value.dependencies));
  }
});
test('option injection, relative credentials and substituted files fail before SSH', async t => {
  const value = await fixture(t);
  for (const changed of [{ sshHost: '-oProxyCommand=bad' }, { sshHost: 'host;bad' }, { sshKey: 'relative' }]) {
    await assert.rejects(observeDeploymentImage({ ...value.options, ...changed }, value.dependencies));
  }
  assert.equal(value.calls.length, 0);
});
