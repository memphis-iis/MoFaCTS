import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { recoveryOperatorBootstrapPolicy, recoveryOperatorPolicies, verifyRecoveryOperatorCleanup } from '../operator-policies.mjs';
import { recoveryOperatorInputs, acquireRecoveryOperatorSession } from '../operator-session.mjs';
import { runRecoveryOperatorInventory } from '../run-operator-inventory.mjs';
import { makeAwsReadClient } from '../sdk-client.mjs';
import { operatorFixture, operatorWorkspace, clock } from './operator-fixtures.mjs';
const environmentId = '12345678-1234-1234-1234-123456789012';

test('temporary operator policies bind one principal, MFA, exact session, three reads and one-hour expiry', () => {
  const f = operatorFixture(), input = recoveryOperatorInputs(f.env, f.runtime, clock);
  const args = { target: input.target, deadline: input.window.deadline, runId: input.window.runId, environmentId };
  const value = recoveryOperatorPolicies(args, clock);
  assert.equal(value.trustPolicy.Statement[0].Principal.AWS, value.operatorArn);
  assert.deepEqual(value.trustPolicy.Statement[0].Condition, { DateLessThan: { 'aws:CurrentTime': input.window.deadline },
    Bool: { 'aws:MultiFactorAuthPresent': 'true' }, StringEquals: { 'sts:RoleSessionName': input.window.sessionName } });
  assert.deepEqual(value.rolePolicy.Statement[0].Action, ['secretsmanager:DescribeSecret', 'secretsmanager:ListSecretVersionIds', 'secretsmanager:GetSecretValue']);
  assert.equal(value.rolePolicy.Statement[0].Resource, input.target.secretArn);
  assert.equal(value.userPolicy.Statement[2].Resource, input.target.roleArn);
  assert.equal(value.userPolicy.Statement[0].Resource, `arn:aws:cloudshell:us-east-2:${input.target.accountId}:environment/${environmentId}`);
  assert.equal(JSON.stringify(value.userPolicy).includes('secretsmanager:'), false);
  assert.equal(value.userPolicy.Statement[0].Action.some(action => action === 'cloudshell:*'), false);
  for (const deadline of ['2026-11-08T20:10:00.000Z', '2026-11-08T21:00:01.000Z', 'bad']) {
    assert.throws(() => recoveryOperatorPolicies({ ...args, deadline, runId: '1' }, clock));
  }
  assert.throws(() => recoveryOperatorPolicies({ ...args, environmentId: '*' }, clock));
  const bootstrap = recoveryOperatorBootstrapPolicy(args, clock);
  assert.equal(JSON.stringify(bootstrap).includes('sts:'), false);
  assert.equal(JSON.stringify(bootstrap).includes('DeleteEnvironment'), false);
  assert.equal(JSON.stringify(bootstrap).includes('secretsmanager:'), false);
});

test('operator context excludes static/profile/GHA/debug/foreign metadata providers before any credential request', () => {
  const f = operatorFixture();
  for (const change of [{ AWS_PROFILE: 'PRIVATE' }, { AWS_ACCESS_KEY_ID: 'PRIVATE' }, { AUDIT_AUTH_FIXTURES_JSON: 'PRIVATE' },
    { GITHUB_ACTIONS: 'true' }, { NODE_OPTIONS: '--inspect' }, { AWS_REGION: 'elsewhere' },
    { AWS_CONTAINER_CREDENTIALS_FULL_URI: 'https://foreign.invalid/private' },
    { AWS_CONTAINER_CREDENTIALS_FULL_URI: 'http://localhost:1338/path?token=PRIVATE' },
    { AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE: '/PRIVATE' }, { RECOVERY_OPERATION_ID: 'abc' }]) {
    assert.throws(() => recoveryOperatorInputs({ ...f.env, ...change }, f.runtime, clock));
  }
  assert.throws(() => recoveryOperatorInputs(f.env, { ...f.runtime, node: 'v20.20.2' }, clock));
  assert.throws(() => recoveryOperatorInputs(f.env, { ...f.runtime, platform: 'win32' }, clock));
});

test('operator session uses clean committed source and a narrow container-only CLI environment with bounded in-memory credentials', async () => {
  const f = operatorFixture(), input = recoveryOperatorInputs({ ...f.env, UNRELATED_SECRET: 'PRIVATE-unrelated' }, f.runtime, clock);
  const result = await acquireRecoveryOperatorSession(input, f);
  assert.equal(result.AccessKeyId, 'synthetic-access');
  assert.deepEqual(f.calls.map(({ name, args }) => name === 'git' ? args[2] : args[0] === '--version' ? 'version' : args[1]),
    ['rev-parse', 'status', 'version', 'get-caller-identity', 'assume-role']);
  const aws = f.calls.filter(call => call.name === 'aws' && call.args[0] !== '--version');
  assert.equal(aws.length, 2);
  for (const call of aws) {
    assert.equal(call.environment.UNRELATED_SECRET, undefined); assert.equal(call.environment.HOME, undefined);
    assert.equal(call.environment.AWS_CONFIG_FILE, '/dev/null'); assert.equal(call.environment.AWS_SHARED_CREDENTIALS_FILE, '/dev/null');
    assert.equal(call.environment.AWS_EC2_METADATA_DISABLED, 'true'); assert.equal(call.maximum, 32768);
    assert.equal(call.args.includes('https://sts.us-east-2.amazonaws.com'), true);
    assert.equal(JSON.stringify(call.args).includes('PRIVATE'), false);
  }
  assert.equal(aws[1].args.at(aws[1].args.indexOf('--duration-seconds') + 1), '900');
});

test('CloudShell CLI v2 patch updates preserve the session contract and other versions stop before credentials', async () => {
  for (const version of ['aws-cli/2.39.3 Python/3.14 Linux\n', 'aws-cli/2.39.6 Python/3.14 Linux\n']) {
    const f = operatorFixture(), input = recoveryOperatorInputs(f.env, f.runtime, clock);
    const command = (name, args, ...rest) => args[0] === '--version'
      ? Buffer.from(version) : f.command(name, args, ...rest);
    assert.equal((await acquireRecoveryOperatorSession(input, { command, now: f.now })).AccessKeyId, 'synthetic-access');
  }
  for (const version of ['aws-cli/1.39.6 Python/3.14 Linux\n', 'aws-cli/3.0.0 Python/3.14 Linux\n', 'aws-cli/2.x.y Linux\n', 'prefix aws-cli/2.39.6 Linux\n']) {
    const f = operatorFixture(), input = recoveryOperatorInputs(f.env, f.runtime, clock);
    const command = (name, args, ...rest) => args[0] === '--version'
      ? Buffer.from(version) : f.command(name, args, ...rest);
    await assert.rejects(acquireRecoveryOperatorSession(input, { command, now: f.now }));
    assert.equal(f.calls.some(call => call.name === 'aws'), false);
  }
});

test('root, foreign principal/source, expired session and wrong assumed role stop before a backup request', async () => {
  for (const kind of ['root', 'foreign', 'dirty', 'revision', 'expired', 'wrong-role']) {
    const f = operatorFixture(), input = recoveryOperatorInputs(f.env, f.runtime, clock);
    const command = async (...args) => {
      const bytes = await f.command(...args), [name, argv] = args;
      if (name === 'git' && kind === 'dirty' && argv.includes('status')) return Buffer.from(' M unexpected\n');
      if (name === 'git' && kind === 'revision' && argv.includes('rev-parse')) return Buffer.from('c'.repeat(40));
      if (name !== 'aws' || argv[0] === '--version') return bytes;
      const value = JSON.parse(bytes);
      if (argv[1] === 'get-caller-identity' && ['root', 'foreign'].includes(kind)) value.Arn = kind === 'root' ? `arn:aws:iam::${input.target.accountId}:root` : value.Arn + '-other';
      if (argv[1] === 'assume-role' && kind === 'expired') value.Credentials.Expiration = '2026-11-08T19:00:00.000Z';
      if (argv[1] === 'assume-role' && kind === 'wrong-role') value.AssumedRoleUser.Arn += '-other';
      return Buffer.from(JSON.stringify(value));
    };
    await assert.rejects(acquireRecoveryOperatorSession(input, { command, now: f.now }));
    assert.equal(f.cloud.calls.length, 0);
    if (['root', 'foreign', 'dirty', 'revision'].includes(kind)) assert.equal(f.calls.some(call => call.args[1] === 'assume-role'), false);
  }
});

test('operator reader uses the real read-only SDK once, preserves labels and writes a private single-use receipt', async t => {
  const f = operatorFixture(), workspace = await operatorWorkspace(t), before = structuredClone([...f.cloud.versions]);
  const options = { ...f, client: credentials => makeAwsReadClient(credentials, { requestHandler: f.cloud.handler }) };
  const result = await runRecoveryOperatorInventory(f.env, workspace, options);
  assert.equal(result.finalLabelsVerified, true); assert.deepEqual([...f.cloud.versions], before);
  assert.equal(f.cloud.calls.filter(call => call.operation === 'GetSecretValue').length, 1);
  const receipt = path.join(workspace, `inventory-${f.env.RECOVERY_OPERATION_ID}.json`);
  assert.deepEqual(JSON.parse(await fs.readFile(receipt, 'utf8')), result);
  assert.equal((await fs.stat(receipt)).mode & 0o777, 0o600);
  assert.equal(JSON.stringify(result).includes('synthetic-secret'), false);
  const count = f.calls.length;
  await assert.rejects(runRecoveryOperatorInventory(f.env, workspace, options), { code: 'EEXIST' });
  assert.equal(f.calls.length, count); assert.equal(f.cloud.calls.filter(call => call.operation === 'GetSecretValue').length, 1);
});

test('operator failed attempt is retained and cannot be retried through the same receipt file', async t => {
  const f = operatorFixture(), workspace = await operatorWorkspace(t);
  const options = { ...f, command: async () => { throw Error('PRIVATE not a diagnostic'); } };
  await assert.rejects(runRecoveryOperatorInventory(f.env, workspace, options));
  const receipt = path.join(workspace, `inventory-${f.env.RECOVERY_OPERATION_ID}.json`);
  assert.deepEqual(JSON.parse(await fs.readFile(receipt, 'utf8')), { state: 'operator-inventory-attempt-started' });
  await assert.rejects(runRecoveryOperatorInventory(f.env, workspace, options), { code: 'EEXIST' });
  assert.equal(f.cloud.calls.length, 0);
});

test('operator expiry between metadata requests prevents the payload read and leaves an incomplete receipt', async t => {
  const f = operatorFixture(), workspace = await operatorWorkspace(t);
  let time = clock.getTime();
  const client = credentials => {
    const aws = makeAwsReadClient(credentials, { requestHandler: f.cloud.handler });
    return async (...args) => {
      const result = await aws(...args);
      if (args[1] === 'list-secret-version-ids') time += 3600000;
      return result;
    };
  };
  await assert.rejects(runRecoveryOperatorInventory(f.env, workspace, { ...f, client, now: () => new Date(time) }), /operator-expired/);
  assert.equal(f.cloud.calls.some(call => call.operation === 'GetSecretValue'), false);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(workspace, `inventory-${f.env.RECOVERY_OPERATION_ID}.json`), 'utf8')),
    { state: 'operator-inventory-attempt-started' });
});

test('cleanup remains possible after expiry but refuses replaced objects, extra credentials, MFA and policy drift', () => {
  const f = operatorFixture(), input = recoveryOperatorInputs(f.env, f.runtime, clock);
  const policies = recoveryOperatorPolicies({ target: input.target, deadline: input.window.deadline, runId: input.window.runId, environmentId }, clock);
  const created = { operatorArn: policies.operatorArn, roleArn: input.target.roleArn, activatedAt: clock.toISOString(),
    userId: 'AIDA' + 'A'.repeat(17), roleId: 'AROA' + 'B'.repeat(17), environmentId,
    mfaSerial: `arn:aws:iam::${input.target.accountId}:u2f/user/mofacts-recovery-operator/mofacts-recovery-operator-key-EXAMPLEBN5FHTECLFG7EXAMPLE` };
  const current = { ...policies, userArn: created.operatorArn, userId: created.userId, roleArn: created.roleArn, roleId: created.roleId,
    accessKeyCount: 0, groupCount: 0, attachedUserPolicyCount: 0, attachedRolePolicyCount: 0,
    userInlinePolicyNames: ['mofacts-recovery-operator'], roleInlinePolicyNames: ['mofacts-recovery-restore'], mfaSerials: [created.mfaSerial] };
  const args = { target: input.target, deadline: input.window.deadline, runId: input.window.runId, created, current };
  assert.equal(verifyRecoveryOperatorCleanup(args, new Date('2026-11-09T20:00:00.000Z')).userName, 'mofacts-recovery-operator');
  for (const change of [{ userId: 'AIDA' + 'Z'.repeat(17) }, { roleId: 'AROA' + 'Z'.repeat(17) }, { accessKeyCount: 1 },
    { groupCount: 1 }, { mfaSerials: ['unrelated-root-key'] }, { rolePolicy: { Statement: [] } },
    { userInlinePolicyNames: ['unrelated-policy'] }, { roleInlinePolicyNames: ['unrelated-policy'] }]) {
    assert.throws(() => verifyRecoveryOperatorCleanup({ ...args, current: { ...current, ...change } }));
  }
  for (const mfaSerial of [
    `arn:aws:iam::${input.target.accountId}:mfa/mofacts-recovery-operator-key`,
    created.mfaSerial.replace(':u2f/user/', ':u2f/root/'),
    created.mfaSerial.replace('/mofacts-recovery-operator/', '/another-user/'),
    created.mfaSerial.replace('-key-', '-other-'),
    created.mfaSerial.replace(input.target.accountId, '999999999999'),
    created.mfaSerial + '/another-registration',
    created.mfaSerial + 'A'.repeat(256),
  ]) {
    assert.throws(() => verifyRecoveryOperatorCleanup({ ...args,
      created: { ...created, mfaSerial }, current: { ...current, mfaSerials: [mfaSerial] } }));
  }
  assert.throws(() => verifyRecoveryOperatorCleanup({ ...args,
    current: { ...current, mfaSerials: [created.mfaSerial.replace('-EXAMPLE', '-REPLACED')] } }));
});
