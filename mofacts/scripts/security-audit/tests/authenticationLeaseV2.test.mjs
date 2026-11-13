import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { withAuthenticationLeaseV2 as acquire, recoverAuthenticationLeaseV2 as recover } from '../authentication/leaseV2.mjs';
const namespace = 'mofacts_audit_fixture_0123456789ab';
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'mofacts-auth-lease-'));
  t.after(async () => { for (const entry of await fs.readdir(directory)) await fs.unlink(path.join(directory, entry)); await fs.rmdir(directory); });
  return { directory, namespace, now: 1000, deadlineMs: 2000, verifyClean: async () => true, confirmOwnerStopped: async () => true };
}
test('one environment lease excludes a competing protocol owner until independently verified cleanup', async t => {
  const scope = await fixture(t); let started, finish;
  const ready = new Promise(resolve => { started = resolve; });
  const first = acquire({ ...scope, run: async () => { started(); return new Promise(resolve => { finish = resolve; }); } });
  await ready;
  await assert.rejects(acquire({ ...scope, namespace: 'mofacts_audit_fixture_abcdefabcdef', run: async () => assert.fail('competing run') }), { code: 'EEXIST' });
  finish('done'); assert.equal(await first, 'done'); assert.deepEqual(await fs.readdir(scope.directory), []);
});
test('failed scenario still verifies cleanup; an unverified cleanup pins the original namespace', async t => {
  const scope = await fixture(t);
  await assert.rejects(acquire({ ...scope, run: async () => { throw Error('synthetic-run-failed'); } }), /synthetic-run-failed/);
  assert.deepEqual(await fs.readdir(scope.directory), []);
  await assert.rejects(acquire({ ...scope, run: async () => 'done', verifyClean: async () => false }), /lease retained/);
  await assert.rejects(acquire({ ...scope, now: 3000, deadlineMs: 4000, run: async () => assert.fail('stale takeover') }), { code: 'EEXIST' });
  await assert.rejects(recover({ ...scope, namespace: 'mofacts_audit_fixture_abcdefabcdef' }));
  await assert.rejects(recover({ ...scope, confirmOwnerStopped: async () => false }));
  assert.equal((await recover(scope)).state, 'owned-authentication-recovery-verified');
});
test('replacement or malformed leases cannot release access based on the previous owner', async t => {
  const scope = await fixture(t), file = path.join(scope.directory, 'staging2-authentication.lock.json');
  await assert.rejects(acquire({ ...scope, run: async () => { await fs.writeFile(file, '{}'); }, verifyClean: async () => assert.fail('untrusted recovery') }), /lease retained/);
  await assert.rejects(recover(scope)); assert.equal((await fs.readdir(scope.directory)).length, 1);
});
test('invalid windows, target directories and cleanup callbacks fail before run', async t => {
  const scope = await fixture(t); let ran = false;
  for (const patch of [{ deadlineMs: 1000 }, { deadlineMs: 7201001 }, { verifyClean: null }, { namespace: 'existing-user' }]) {
    await assert.rejects(acquire({ ...scope, ...patch, run: async () => { ran = true; } }));
  }
  assert.equal(ran, false); assert.deepEqual(await fs.readdir(scope.directory), []);
});
