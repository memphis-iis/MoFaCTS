import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createFixtureAccountV2, grantFixtureTeacherV2, removeFixtureAccountV2, removePasswordlessFixtureParticipantV2 } from '../authentication/fixtureBrowserV2.mjs';
import { createFixtureCredentialsV2 } from '../authentication/stagingFixturesV2.mjs';

const namespace = 'mofacts_audit_fixture_0123456789ab', target = 'https://audit.example', adminUserId = 'SyntheticFixtureAdmin';
function fixture(options = {}) {
  const activeTarget = options.target ?? target;
  const calls = [], current = { id: options.wrongIdentity ? 'OtherActor' : adminUserId };
  const page = { url: () => options.foreignOrigin ? 'https://foreign.example' : activeTarget,
    async evaluate(fn, args) {
      const saved = new Map(['Meteor', 'Session', 'location'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
      Object.assign(globalThis, { location: { origin: activeTarget },
        Meteor: { userId: () => current.id, status: () => ({ connected: true }), async callAsync(name, ...args) {
          calls.push({ name, args });
          if (options.failCall) throw new Error('private-credential-shaped-diagnostic');
          if (name === 'createUser') { current.id = 'SyntheticCreatedActor'; return { id: current.id, token: 'not-retained' }; }
          if (name === 'userAdminRoleChange') return { RESULT: 'SUCCESS', targetUserId: args[0], targetRoles: { teacher: true, admin: options.adminGranted === true } };
          if (name === 'userAdminDeleteUser') return { RESULT: 'SUCCESS', targetUserId: args[0] };
          throw new Error('Unexpected fixture method');
        } },
        Session: { get(key) { return key === 'authRoles' ? { admin: !options.nonAdmin, teacher: false }
          : key === 'authRolesSyncedUserId' ? current.id : true; } },
      });
      try { return await fn(args); }
      finally { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } }
    } };
  return { page, calls };
}
const actor = alias => ({ alias, userId: 'SyntheticCreatedActor', username: `${namespace}-${alias.toLowerCase()}@localhost.invalid` });
const args = page => ({ page, target, adminUserId, namespace });

test('fixture creation uses native insert-only creation, a digest and a separate creator identity without email/reset calls', async () => {
  const value = fixture(), credential = createFixtureCredentialsV2(namespace).learnerA;
  const created = await createFixtureAccountV2({ ...args(value.page), alias: 'learnerA', credential });
  assert.deepEqual(created, actor('learnerA')); assert.equal(value.calls.length, 1);
  assert.equal(value.calls[0].name, 'createUser');
  const payload = value.calls[0].args[0]; assert.equal(payload.email, undefined);
  assert.deepEqual(payload.password, { algorithm: 'sha-256', digest: createHash('sha256').update(credential.password).digest('hex') });
  assert.deepEqual(payload.profile, { experiment: false, createdBy: adminUserId });
  assert(!JSON.stringify(value.calls).includes(credential.password));
});

test('passwordless participant cleanup uses its recorded owner and verifies absence without requiring experiment markers', async () => {
  const target = 'https://staging2.optimallearning.org', value = fixture({ target });
  const participant = { userId: `${namespace}-participant`, username: 'AUDIT_0123456789AB' };
  let reads = 0;
  const result = await removePasswordlessFixtureParticipantV2({ page: value.page, target, adminUserId, namespace, participant,
    ownership: async () => ++reads === 1 ? 'owned' : 'absent' });
  assert.equal(result.state, 'fixture-participant-removed'); assert.equal(reads, 2);
  assert.deepEqual(value.calls, [{ name: 'userAdminDeleteUser', args: [participant.userId] }]);
});
test('absent, foreign and unverified passwordless ownership never authorizes a delete', async () => {
  const target = 'https://staging2.optimallearning.org', value = fixture({ target });
  const input = { page: value.page, target, adminUserId, namespace, participant: { userId: `${namespace}-participant`, username: 'AUDIT_0123456789AB' } };
  assert.equal((await removePasswordlessFixtureParticipantV2({ ...input, ownership: async () => 'absent' })).state, 'fixture-participant-already-absent');
  await assert.rejects(removePasswordlessFixtureParticipantV2({ ...input, ownership: async () => 'unverified' }));
  await assert.rejects(removePasswordlessFixtureParticipantV2({ ...input, participant: { ...input.participant, userId: 'existing-user' }, ownership: async () => 'owned' }));
  assert.equal(value.calls.length, 0);
});
test('fixture teacher grants require exact owned teacher identity and never grant admin or mutate learners', async () => {
  const value = fixture(); let checked = false;
  const request = { ...args(value.page), actor: actor('teacherA'), requireOwnedActor: async row => { checked = true; assert.equal(row.userId, 'SyntheticCreatedActor'); return true; } };
  await grantFixtureTeacherV2(request); assert(checked);
  assert.deepEqual(value.calls, [{ name: 'userAdminRoleChange', args: ['SyntheticCreatedActor', 'add', 'teacher'] }]);
  await assert.rejects(grantFixtureTeacherV2({ ...request, actor: actor('learnerA') }));
  await assert.rejects(grantFixtureTeacherV2({ ...request, requireOwnedActor: async () => false }));
  assert.equal(value.calls.length, 1);
  const elevated = fixture({ adminGranted: true });
  await assert.rejects(grantFixtureTeacherV2({ ...request, page: elevated.page }));
});
test('cleanup uses the existing guarded delete method only for confirmed owned actors, never the administrator', async () => {
  const value = fixture(), request = { ...args(value.page), actor: actor('learnerB'), requireOwnedActor: async () => true };
  await removeFixtureAccountV2(request);
  assert.deepEqual(value.calls, [{ name: 'userAdminDeleteUser', args: ['SyntheticCreatedActor'] }]);
  await assert.rejects(removeFixtureAccountV2({ ...request, requireOwnedActor: async () => false }));
  await assert.rejects(removeFixtureAccountV2({ ...request, actor: { ...actor('learnerB'), userId: adminUserId } }));
  assert.equal(value.calls.length, 1);
});
test('foreign targets, expired/non-admin identities and rejected calls cannot create or grant fixture access', async () => {
  const credential = createFixtureCredentialsV2(namespace).learnerA;
  for (const options of [{ foreignOrigin: true }, { wrongIdentity: true }, { nonAdmin: true }]) {
    const value = fixture(options);
    await assert.rejects(createFixtureAccountV2({ ...args(value.page), alias: 'learnerA', credential }));
    assert.equal(value.calls.length, 0);
  }
  const failed = fixture({ failCall: true });
  await assert.rejects(createFixtureAccountV2({ ...args(failed.page), alias: 'learnerA', credential }), error => !error.message.includes('private-credential'));
});
