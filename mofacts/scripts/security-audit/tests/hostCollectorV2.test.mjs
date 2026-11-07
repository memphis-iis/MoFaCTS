import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const program = fs.readFileSync(new URL('../../../../deploy/security-audit/host-mongo-connectivity.js', import.meta.url), 'utf8');
function probe(change = {}, behavior = {}) {
  const input = { database: 'fixture', replicaSet: 'fixture-rs', operation: 'unauthenticated',
    username: '', password: '', authenticationDatabase: '', ...change };
  let output, exit, reads = 0, authentications = 0;
  const database = {
    auth() { authentications++; if (behavior.authThrows) throw Error('synthetic-private-marker'); return { ok: behavior.auth === false ? 0 : 1 }; },
    runCommand(command) {
      reads++; assert.deepEqual(JSON.parse(JSON.stringify(command)), { find: 'tdfs', filter: {}, limit: 1 });
      if (behavior.queryThrows) throw Object.assign(Error('synthetic-private-marker'), { code: behavior.queryThrows });
      return behavior.reply ?? { ok: 0, code: 13 };
    },
  };
  vm.runInNewContext(program, { Buffer,
    process: { env: { MOFACTS_AUDIT_MONGO_CONNECTIVITY: JSON.stringify(input) } },
    db: { getSiblingDB: () => database, hello: () => behavior.hello ?? { ok: 1, setName: 'fixture-rs' } },
    print: value => { output = value; }, quit: value => { exit = value; },
  });
  assert.equal(output.includes('synthetic-private-marker'), false);
  return { output: JSON.parse(output), exit, reads, authentications };
}
test('V2 Mongo acquisition distinguishes a demonstrated anonymous read from denial and missing evidence', () => {
  for (const behavior of [{ reply: { ok: 0, code: 13 } }, { queryThrows: 13 }]) {
    const result = probe({}, behavior);
    assert.deepEqual(result.output, { state: 'observed', value: false }); assert.equal(result.exit, 0);
  }
  assert.deepEqual(probe({}, { reply: { ok: 1, cursor: { firstBatch: ['synthetic-private-marker'] } } }).output,
    { state: 'observed', value: true });
  for (const behavior of [{ queryThrows: 6 }, { reply: { ok: 0, code: 6 } }]) {
    assert.deepEqual(probe({}, behavior).output, { state: 'unavailable', reason: 'query-failed' });
    assert.equal(probe({}, behavior).exit, 70);
  }
});
test('V2 Mongo acquisition requires authentication and preserves an observed replica mismatch', () => {
  const credentials = { username: 'fixture-user', password: 'synthetic-private-marker', authenticationDatabase: 'admin' };
  for (const behavior of [{ auth: false }, { authThrows: true }]) {
    const result = probe({ ...credentials, operation: 'replica' }, behavior);
    assert.equal(result.exit, 70); assert.equal(result.reads, 0);
  }
  assert.deepEqual(probe({ ...credentials, operation: 'replica' }, { hello: { ok: 1, setName: 'other' } }).output,
    { state: 'observed', value: false });
  assert.equal(probe({ ...credentials, operation: 'replica' }, { hello: { ok: 0 } }).exit, 70);
  const connected = probe({ ...credentials, operation: 'authenticated' }, { reply: { ok: 1 } });
  assert.equal(connected.authentications, 1); assert.deepEqual(connected.output, { state: 'observed', value: true });
});
test('V2 Mongo acquisition rejects invalid inputs without querying or disclosing input', () => {
  for (const change of [{ database: 'bad.name' }, { database: 'x'.repeat(64) }, { extra: 'synthetic-private-marker' },
    { password: 'synthetic-private-marker' }, { operation: 'dropDatabase' }, { replicaSet: '' }]) {
    const result = probe(change); assert.equal(result.exit, 70); assert.equal(result.reads, 0);
  }
  assert.equal(probe({ database: 'fixture-é' }).exit, 0);
});
const root = process.getuid?.() === 0;
const hostedRoot = process.env.GITHUB_ACTIONS === 'true' && spawnSync('sudo', ['-n', 'true']).status === 0;
const linuxFixtures = process.platform === 'linux' && (root || hostedRoot) && spawnSync('jq', ['--version']).status === 0;
test('V2 host collector emits exact bounded observations from protected synthetic Linux fixtures', {
  skip: linuxFixtures ? false : 'Requires root Linux with existing jq; no dependency is installed by tests.',
}, () => {
  const harness = fileURLToPath(new URL('./helpers/hostCollectorHarness.mjs', import.meta.url));
  const result = spawnSync(root ? process.execPath : 'sudo', root ? [harness] : ['-n', process.execPath, harness],
    { encoding: 'utf8', timeout: 180000, maxBuffer: 8192 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout.trim(), /^V2 host collector fixtures passed \(\d+ cases\)\.$/);
});
