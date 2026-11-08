import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { acquireRepositorySourceObservationsV2, observeSensitiveLoggingV2, parseSurfaceCoverageObservationV2 } from '../repository/sourceV2.mjs';
import { runRepositoryCommandV2 } from '../repository/commandV2.mjs';
import { fileURLToPath } from 'node:url';

const raw = value => ({ exitCode: 0, stdout: Buffer.from(value) });
const inventory = { methods: ['method-one'], publications: ['publication-one'], httpRoutes: [], exports: [], managementRoutes: [] };
const discovery = () => raw(JSON.stringify(inventory)), checked = () => raw('Security surface contract covers 2 surfaces.\n');
const environment = { PATH: process.env.PATH, NODE_OPTIONS: '' };
const complete = value => ({ state: 'observed', value: { expectedCaseCount: value, completedCaseCount: value,
  matchedCaseCount: value, domainRejectionCount: 0, transportErrorCount: 0, inconclusiveCaseCount: 0 } });
async function directory(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-source-observation-'));
  t.after(() => fs.rm(root, { recursive: true, force: true })); return root;
}

test('V2 surface coverage counts actual discovered facets against the unchanged checker completion protocol', () => {
  assert.deepEqual(parseSurfaceCoverageObservationV2(discovery(), checked()), complete(2));
  for (const input of [{ ...inventory, methods: ['duplicate', 'duplicate'] }, { ...inventory, methods: 'not-an-array' },
    { ...inventory, methods: ['invalid\nname'] }, { ...inventory, newFacet: [] }, { ...inventory, methods: [], publications: [] }]) {
    assert.equal(parseSurfaceCoverageObservationV2(raw(JSON.stringify(input)), checked()).state, 'unavailable');
  }
  for (const result of [raw(''), raw('Security surface contract covers 3 surfaces.\n'),
    { ...checked(), exitCode: 1 }, { exitCode: -1, failure: 'timeout' }, raw('PRIVATE unrelated crash')]) {
    const parsed = parseSurfaceCoverageObservationV2(discovery(), result);
    assert.equal(parsed.state, 'unavailable'); assert.equal(JSON.stringify(parsed).includes('PRIVATE'), false);
  }
  const duplicate = raw('{"methods":[],"methods":["hidden"],"publications":[],"httpRoutes":[],"exports":[],"managementRoutes":[]}');
  assert.equal(parseSurfaceCoverageObservationV2(duplicate, checked()).reason, 'producer-malformed');
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
  const observations = await acquireRepositorySourceObservationsV2({ repositoryDirectory: root, environment }, {
    run: async spec => {
      calls.push(spec); assert.equal(spec.command, process.execPath); assert.deepEqual(spec.environment, environment);
      if (spec.args.includes('--discover')) return discovery();
      if (spec.args[0] === '--test') return { exitCode: -1, failure: 'timeout', stdout: Buffer.from('PRIVATE partial') };
      return checked();
    },
  });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.at(-1).args, ['--test', '--test-reporter=tap', path.join(root, 'mofacts', 'scripts', 'security-audit', 'source-security-v2.test.mjs')]);
  assert.deepEqual(observations['repository.security-surface-contract'], complete(2));
  assert.equal(observations['repository.sensitive-logging'].state, 'observed');
  assert.equal(observations['repository.source-security-tests'].reason, 'timeout');
  assert.equal(JSON.stringify(observations).includes('PRIVATE'), false);
});

test('V2 surface coverage consumes the actual current checker without an alternate policy implementation', async () => {
  const app = fileURLToPath(new URL('../../../', import.meta.url));
  const checker = path.join(app, 'scripts', 'security-audit', 'check-security-surfaces.mjs');
  const run = args => runRepositoryCommandV2({ command: process.execPath, args, cwd: app, environment, timeoutMs: 60000 });
  const result = parseSurfaceCoverageObservationV2(await run([checker, '--discover']), await run([checker]));
  assert.equal(result.state, 'observed'); assert.ok(result.value.expectedCaseCount > 0);
  assert.equal(result.value.completedCaseCount, result.value.expectedCaseCount);
});
