import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { scanClientBundleCanariesV2 } from '../repository/clientBundleCanariesV2.mjs';
import { ACTIVE_AUDIT_CATALOG, readAuditCatalog } from '../../../common/securityAudit/catalogRegistry.ts';
import { evaluateRepositoryObservationsV2 } from '../repository/observationsV2.mjs';
import { platformImage, revision } from './fixtures/v2Fixtures.mjs';

const canaries = ['SYNTHETIC-PRIVATE-CANARY', 'OTHER-PRIVATE-CANARY'];
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-client-canary-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const name of ['web.browser', 'web.browser.legacy']) {
    await fs.mkdir(path.join(directory, name));
    await fs.writeFile(path.join(directory, name, 'client.js'), 'safe browser bytes');
  }
  return { directory, scan: changes => scanClientBundleCanariesV2({ programsDirectory: directory, canaries, ...changes }) };
}

test('V2 bundle scanner counts both client inventories and matching files without exposing their contents', async t => {
  const { directory, scan } = await fixture(t);
  assert.deepEqual(await scan(), { evaluatedCount: 2, findingCount: 0 });
  await fs.writeFile(path.join(directory, 'web.browser', 'client.js'), `${canaries[0]} ${canaries[0]} ${canaries[1]}`);
  await fs.mkdir(path.join(directory, 'web.browser.legacy', 'nested'));
  await fs.writeFile(path.join(directory, 'web.browser.legacy', 'nested', 'PRIVATE.js'), canaries[1]);
  const result = await scan();
  assert.deepEqual(result, { evaluatedCount: 3, findingCount: 2 });
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});

test('V2 bundle scanner detects patterns across repeated small chunk boundaries and binary bytes', async t => {
  const { directory, scan } = await fixture(t);
  const value = 'unicode-αβγ-canary';
  await fs.writeFile(path.join(directory, 'web.browser', 'client.js'), Buffer.concat([Buffer.from([0, 255, 0]), Buffer.from(value), Buffer.from([0, 255])]));
  assert.deepEqual(await scan({ canaries: [value], limits: { chunkBytes: 2 } }), { evaluatedCount: 2, findingCount: 1 });
  await fs.writeFile(path.join(directory, 'web.browser.legacy', 'client.js'), canaries[0].slice(0, 10));
  await fs.writeFile(path.join(directory, 'web.browser', 'client.js'), canaries[0].slice(10));
  assert.deepEqual(await scan({ limits: { chunkBytes: 3 } }), { evaluatedCount: 2, findingCount: 0 });
});

test('V2 bundle scanner requires nonempty modern and legacy inventories rather than a partial clean scan', async t => {
  const { directory, scan } = await fixture(t);
  await fs.unlink(path.join(directory, 'web.browser.legacy', 'client.js'));
  await assert.rejects(scan(), /inspection incomplete/);
  await fs.rmdir(path.join(directory, 'web.browser.legacy'));
  await assert.rejects(scan());
  await fs.writeFile(path.join(directory, 'web.browser.legacy'), 'not a directory');
  await assert.rejects(scan());
});

test('V2 bundle scanner bounds file, byte, directory, entry and nesting work without manufacturing a result', async t => {
  const { directory, scan } = await fixture(t);
  for (const limits of [{ files: 1 }, { bytes: 1 }, { entries: 1 }, { directories: 1 }]) await assert.rejects(scan({ limits }));
  await fs.mkdir(path.join(directory, 'web.browser', 'nested'));
  await fs.writeFile(path.join(directory, 'web.browser', 'nested', 'more.js'), 'safe');
  await assert.rejects(scan({ limits: { depth: 1 } }));
  assert.deepEqual(await scan(), { evaluatedCount: 3, findingCount: 0 });
});

test('V2 bundle scanner rejects symbolic links, hard links and special files before reading them', async t => {
  const { directory, scan } = await fixture(t), target = path.join(directory, 'web.browser', 'client.js');
  const link = path.join(directory, 'web.browser.legacy', 'link');
  await fs.symlink(target, link); await assert.rejects(scan()); await fs.unlink(link);
  await fs.link(target, link); await assert.rejects(scan()); await fs.unlink(link);
  const symbolicRoot = path.join(directory, 'linked');
  await fs.symlink(path.join(directory, 'web.browser'), symbolicRoot, 'dir');
  await assert.rejects(scan({ programsDirectory: symbolicRoot }));
  if (process.platform === 'linux') {
    await promisify(execFile)('mkfifo', [link]);
    await assert.rejects(scan());
  }
});

test('V2 bundle scanner validates bounded exact canary strings and options without returning input details', async t => {
  const { scan } = await fixture(t);
  for (const values of [[], ['short'], [canaries[0], canaries[0]], [null], ['x'.repeat(513)], ['abcde\ud800xyz'], Array(65).fill(canaries[0])]) {
    await assert.rejects(scan({ canaries: values }), error => error.message === 'Client bundle inspection incomplete');
  }
  for (const limits of [{ files: 10001 }, { unknown: 1 }, { chunkBytes: 0 }, { depth: 1.5 }]) await assert.rejects(scan({ limits }));
  await assert.rejects(scan({ programsDirectory: 'relative/path' }));
});

test('V2 client-canary measurements feed the existing image-bound contract and cannot erase missing image identity', async t => {
  const { directory, scan } = await fixture(t), catalog = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
  await fs.writeFile(path.join(directory, 'web.browser', 'client.js'), canaries[0]);
  const observations = { 'repository.client-bundle-canaries': { state: 'observed', value: await scan() } };
  const context = { AUDIT_RUNTIME_IMAGE: platformImage.value, deployedApplicationRevision: revision, deployedImageDigest: platformImage };
  const row = evaluateRepositoryObservationsV2(catalog, 'full', observations, context).controls.find(row => row.controlId === 'repository.client-bundle-canaries');
  assert.equal(row.status, 'FAIL'); assert.deepEqual(row.evidence.metrics, { evaluatedCount: 2, findingCount: 1 });
  const missing = evaluateRepositoryObservationsV2(catalog, 'full', observations).controls.find(row => row.controlId === 'repository.client-bundle-canaries');
  assert.equal(missing.status, 'ERROR'); assert.equal(missing.evidence.category, 'identity-unavailable');
});

test('V2 mounted scanner entry point rejects invalid invocation with constant credential-free output', async () => {
  const script = fileURLToPath(new URL('../repository/clientBundleCanariesV2.mjs', import.meta.url));
  const environment = { ...process.env }; delete environment.NODE_OPTIONS; delete environment.NODE_TEST_CONTEXT;
  await assert.rejects(promisify(execFile)(process.execPath, [script, canaries[0]], { env: environment }), error => {
    assert.equal(error.code, 1); assert.equal(error.stderr, '');
    assert.deepEqual(JSON.parse(error.stdout), { state: 'unavailable', reason: 'evidence-incomplete' });
    assert.equal(error.stdout.includes(canaries[0]), false); return true;
  });
});
