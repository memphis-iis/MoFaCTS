import assert from 'node:assert/strict';
import test from 'node:test';
import { fixtureStorageEnvironmentV2 as environment, launchFixtureStorageV2 as launch } from '../../../../deploy/security-audit/launch-staging2-fixture.mjs';
const parent = () => ({ PATH: '/usr/bin', ROOT_URL: 'https://staging2.optimallearning.org', MONGO_URL: 'mongodb://synthetic.invalid/test',
  EXPECTED_MONGO_DB_NAME: 'test', METEOR_SETTINGS: 'PRIVATE-provider-settings', AUDIT_REPORT_INGEST_SECRET: 'PRIVATE-signer', NODE_OPTIONS: '--max-old-space-size=4096' });
test('trusted entrypoint projects only required storage coordinates into the fixture child', () => {
  const value = environment(parent());
  assert.deepEqual(Object.keys(value).sort(), ['EXPECTED_MONGO_DB_NAME', 'MONGO_URL', 'NODE_OPTIONS', 'PATH', 'ROOT_URL']);
  assert.equal(value.NODE_OPTIONS, ''); assert.ok(!JSON.stringify(value).includes('PRIVATE'));
  let args;
  launch('passwordless-inspect', parent(), (...value) => { args = value; return {}; });
  assert.equal(args[0], process.execPath); assert.ok(args[1][0].endsWith('/staging2-fixture-runtime.mjs') || args[1][0].endsWith('\\staging2-fixture-runtime.mjs'));
  assert.equal(args[1][1], 'passwordless-inspect'); assert.equal(args[2].shell, false); assert.deepEqual(args[2].env, value);
});
test('unknown actions and substituted/missing storage scope reject before child creation', () => {
  let called = false; const spawn = () => { called = true; };
  assert.throws(() => launch('unrelated', parent(), spawn));
  assert.throws(() => launch('passwordless-seed', { ...parent(), ROOT_URL: 'https://production.invalid' }, spawn));
  assert.throws(() => launch('passwordless-seed', { ...parent(), MONGO_URL: '' }, spawn));
  assert.equal(called, false);
});
