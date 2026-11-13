import assert from 'node:assert/strict';
import test from 'node:test';
import { createProtocolFixtureCredentialsV2 as create, parseProtocolBindingsV2 as parse, selectedBindingsFromProtocolV2 as selected, protocolChildInputV2 as child } from '../authentication/protocolBindingsV2.mjs';
import { auditToolEnvironmentV2 as environment } from '../core/childEnvironmentV2.mjs';
const namespace = 'mofacts_audit_fixture_0123456789ab', context = { connectedMailboxAddress: 'synthetic@gmail.com' };
function fixture() {
  const credentials = create({ namespace, ...context });
  return { schema: 'MoFaCTSAuditProtocolBindingsV1', target: 'https://staging2.optimallearning.org', namespace,
    actors: { admin: { userId: 'admin-owned', username: 'operator@example.test', password: 'PRIVATE-operator-password' },
      ...Object.fromEntries(Object.entries(credentials).map(([name, row]) => [name, { userId: `owned-${name}`, ...row }])) },
    values: { 'lesson.progress': `${namespace}-lesson`, ...Object.fromEntries(['learnerA', 'learnerB', 'teacherA', 'teacherB'].map(name => [`progress.${name}`, `${namespace}-${name}`])),
      'performance.learnerB': { numCorrect: 1, numIncorrect: 0, stimsIntroduced: 1, practiceDuration: 1, totalStimCount: 1 },
      'settings.canary': { documentId: `${namespace}-setting`, key: `${namespace}-key`, value: 'synthetic' },
      'history.learnerA': { sha256: 'a'.repeat(64) }, 'audit.report': { reportId: '12345678-1234-4123-8123-123456789abc', digestSha256: 'b'.repeat(64) },
      'passwordless.experimentTarget': `${namespace}-target-a`, 'passwordless.otherExperimentTarget': `${namespace}-target-b`,
      'passwordless.participantId': 'AUDIT_0123456789AB', 'passwordless.ownProgress': `${namespace}-passwordless-progress` } };
}
test('protocol preparation generates seven distinct credentials and projects the accepted selected contract without duplication', () => {
  const value = fixture(); assert.equal(Object.keys(value.actors).length, 8); assert.deepEqual(parse(value, context), value);
  const projection = selected(value, context); assert.equal(Object.keys(projection.actors).length, 5);
  assert.equal(Object.hasOwn(projection.actors, 'reset'), false);
  assert.ok(!JSON.stringify(projection.values).includes('passwordless'));
  assert.equal(value.actors.reset.username, `synthetic+${namespace}-reset@gmail.com`);
});
test('credential, identity, mailbox and namespace substitutions fail before acquisition', () => {
  for (const change of [value => { value.actors.reset.userId = value.actors.admin.userId; },
    value => { value.actors.expiry.password = value.actors.reset.password; }, value => { value.actors.reset.newPassword = value.actors.reset.password; },
    value => { value.actors.lockout.username = 'existing@example.test'; }, value => { value.actors.expiry.username = 'another@gmail.com'; },
    value => { value.values['passwordless.otherExperimentTarget'] = value.values['passwordless.experimentTarget']; },
    value => { value.target = 'https://optimallearning.org'; }]) {
    const value = fixture(); change(value); assert.throws(() => parse(value, context), error => !error.message.includes('PRIVATE'));
  }
  assert.throws(() => parse(fixture(), { connectedMailboxAddress: 'other@gmail.com' }));
});
test('protected policy arrays, permission flags, unused credential blocks and legacy IMAP settings are rejected', () => {
  for (const change of [value => { value.imaps = { host: 'unused' }; }, value => { value.expectedPolicy = 'allow'; },
    value => { value.actors.learnerA.roles = ['admin']; }, value => { value.values['passwordless.expectDenied'] = true; },
    value => { value.users = value.actors; }, value => { delete value.actors.lockout; }]) {
    const value = fixture(); change(value); assert.throws(() => parse(value, context));
  }
});
test('each child receives only its required actor/value subset and never the connected mailbox authorization', () => {
  const value = fixture();
  for (const [kind, expected] of Object.entries({ comparison: ['learnerA'], reset: ['expiry', 'reset'], passwordless: ['admin', 'learnerA', 'learnerB'], throttle: ['lockout'] })) {
    const input = child(kind, value, context); assert.deepEqual(Object.keys(input.actors).sort(), expected.sort());
    for (const [name, actor] of Object.entries(value.actors)) if (!expected.includes(name)) assert.ok(!JSON.stringify(input).includes(actor.password));
    assert.equal(Object.hasOwn(input.values, 'audit.report'), false);
  }
  assert.equal(child('throttle', value, context).values.ipThrottleIdentifiers.length, 21);
  assert.equal(new Set(child('throttle', value, context).values.connectionThrottleIdentifiers).size, 12);
  assert.throws(() => child('mailbox', value, context));
});
test('explicit OS environments exclude unrelated secrets and Node test/code injection', () => {
  const linux = { PATH: '/usr/bin', NODE_OPTIONS: '' };
  const windows = { PATH: 'C:\\Windows\\System32', SystemRoot: 'C:\\Windows', USERPROFILE: 'C:\\Users\\synthetic', NODE_OPTIONS: '' };
  assert.deepEqual(environment(linux), linux); assert.deepEqual(environment(windows, 'windows-browser'), windows);
  for (const extra of [{ AUDIT_AUTH_FIXTURES_JSON: 'PRIVATE' }, { AWS_SECRET_ACCESS_KEY: 'PRIVATE' }, { NODE_OPTIONS: '--require=PRIVATE' }, { NODE_TEST_CONTEXT: 'child-v8' }]) {
    assert.throws(() => environment({ ...linux, ...extra })); assert.throws(() => environment({ ...windows, ...extra }, 'windows-browser'));
  }
  assert.throws(() => environment(linux, 'unknown'));
});
