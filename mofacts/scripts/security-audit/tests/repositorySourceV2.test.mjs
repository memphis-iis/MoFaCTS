import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { acquireRepositorySourceObservationsV2, observeSensitiveLoggingV2, parseSurfaceCoverageObservationV2 } from '../repository/sourceV2.mjs';
import { runRepositoryCommandV2 } from '../repository/commandV2.mjs';
import { requiredMeteorVerificationIds } from '../qualification/verificationCatalogProof.mjs';
import { fileURLToPath } from 'node:url';

const raw = value => ({ exitCode: 0, stdout: Buffer.from(value) });
const commit = 'a'.repeat(40), digest = 'sha256:' + 'b'.repeat(64);
const target = 'https://staging2.optimallearning.org';
const proof = { revision: raw(commit + '\n'), changes: raw(''), check: raw('Application registration owners verified.\n'),
  target, binding: { state: 'matched', target, buildIdentity: { baseCommit: commit, includedUncommittedLocalChanges: false },
    publishedImage: { kind: 'manifest', digest } },
  imageContext: { deployedApplicationRevision: { state: 'observed', value: commit },
    deployedImageDigest: { state: 'observed', value: 'ppavlikmemphis/mofacts-staging2@' + digest } } };
const environment = { PATH: process.env.PATH, NODE_OPTIONS: '' };
const complete = value => ({ state: 'observed', value: { expectedCaseCount: value, completedCaseCount: value,
  matchedCaseCount: value, domainRejectionCount: 0, transportErrorCount: 0, inconclusiveCaseCount: 0 } });
async function directory(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-source-observation-'));
  t.after(() => fs.rm(root, { recursive: true, force: true })); return root;
}

test('V2 surface coverage requires matched runtime evidence, exact clean source and the standalone ownership check', () => {
  assert.deepEqual(parseSurfaceCoverageObservationV2(proof), complete(requiredMeteorVerificationIds.length));
  for (const change of [{ binding: undefined }, { imageContext: undefined }, { target: 'https://elsewhere.example' }, { changes: raw(' M changed.ts\n') },
    { revision: raw('0'.repeat(40) + '\n') }, { check: raw('Security surface contract covers 272 surfaces.\n') },
    { check: { ...proof.check, exitCode: 1 } }, { check: { failure: 'timeout' } }, { check: raw('PRIVATE unrelated crash') }]) {
    const parsed = parseSurfaceCoverageObservationV2({ ...proof, ...change });
    assert.equal(parsed.state, 'unavailable'); assert.equal(JSON.stringify(parsed).includes('PRIVATE'), false);
  }
  const wrongManifest = { ...proof.binding, publishedImage: { kind: 'index', digest, platformManifestDigest: 'sha256:' + 'c'.repeat(64) } };
  assert.equal(parseSurfaceCoverageObservationV2({ ...proof, binding: wrongManifest }).reason, 'evidence-incomplete');
});

test('V2 sensitive-log observations use the existing selection and classifier, counting files without content', async t => {
  const root = await directory(t); await fs.mkdir(path.join(root, 'nested'));
  await fs.writeFile(path.join(root, 'safe.ts'), 'console.log("password is a label, not an expression");');
  await fs.writeFile(path.join(root, 'nested', 'PRIVATE.svelte'), 'console.log(password);console.warn(username);');
  await fs.writeFile(path.join(root, 'ignored.test.ts'), 'console.log(token);');
  await fs.writeFile(path.join(root, 'ignored.json'), 'console.log(cookie);');
  const observed = await observeSensitiveLoggingV2(root);
  assert.deepEqual(observed, { state: 'observed', value: { evaluatedCount: 2, findingCount: 1 } });
  assert.equal(JSON.stringify(observed).includes('PRIVATE'), false);
});

test('V2 sensitive-log observations reject incomplete, empty, linked and malformed source inventories', async t => {
  const root = await directory(t);
  assert.equal((await observeSensitiveLoggingV2(root)).state, 'unavailable');
  const file = path.join(root, 'module.ts'); await fs.writeFile(file, 'console.log("safe");');
  assert.deepEqual((await observeSensitiveLoggingV2(root)).value, { evaluatedCount: 1, findingCount: 0 });
  await fs.symlink(file, path.join(root, 'linked.ts'));
  assert.equal((await observeSensitiveLoggingV2(root)).state, 'unavailable'); await fs.unlink(path.join(root, 'linked.ts'));
  await fs.writeFile(file, Buffer.from([255, 128]));
  assert.equal((await observeSensitiveLoggingV2(root)).state, 'unavailable');
  assert.equal((await observeSensitiveLoggingV2(path.join(root, 'missing'))).state, 'unavailable');
});

test('V2 source acquisition wires exact Node invocations and preserves independent observations after failure', async t => {
  const root = await directory(t), server = path.join(root, 'mofacts', 'server');
  await fs.mkdir(server, { recursive: true }); await fs.writeFile(path.join(server, 'module.ts'), 'console.log("safe");');
  const calls = [];
  const inputs = { repositoryDirectory: root, environment, imageContext: proof.imageContext, registryEvidence: {}, target };
  const observations = await acquireRepositorySourceObservationsV2(inputs, {
    bindRegistry: async value => { assert.equal(value, inputs.registryEvidence); return proof.binding; },
    run: async spec => {
      calls.push(spec); assert.deepEqual(spec.environment, environment);
      if (spec.command === 'git') return spec.args[0] === 'rev-parse' ? proof.revision : proof.changes;
      assert.equal(spec.command, process.execPath);
      if (spec.args[0] === '--test') return { exitCode: -1, failure: 'timeout', stdout: Buffer.from('PRIVATE partial') };
      assert.equal(path.basename(spec.args[0]), 'checkRegistrationBypasses.mjs');
      return proof.check;
    },
  });
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.at(-1).args, ['--test', '--test-reporter=tap', path.join(root, 'mofacts', 'scripts', 'security-audit', 'source-security-v2.test.mjs')]);
  assert.deepEqual(observations['repository.security-surface-contract'], complete(requiredMeteorVerificationIds.length));
  assert.equal(observations['repository.sensitive-logging'].state, 'observed');
  assert.equal(observations['repository.source-security-tests'].reason, 'timeout');
  assert.equal(JSON.stringify(observations).includes('PRIVATE'), false);
});

test('V2 surface coverage consumes the actual standalone registration check', async () => {
  const app = fileURLToPath(new URL('../../../', import.meta.url));
  const checker = path.join(app, 'scripts', 'security-audit', 'checkRegistrationBypasses.mjs');
  const check = await runRepositoryCommandV2({ command: process.execPath, args: [checker], cwd: app, environment, timeoutMs: 60000 });
  const result = parseSurfaceCoverageObservationV2({ ...proof, check });
  assert.equal(result.state, 'observed'); assert.ok(result.value.expectedCaseCount > 0);
  assert.equal(result.value.completedCaseCount, result.value.expectedCaseCount);
});
