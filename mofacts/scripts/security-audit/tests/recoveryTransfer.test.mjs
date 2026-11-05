import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import { RECOVERY_PUBLIC_VARIABLE, RECOVERY_SECRETS, prepareRecoveryBundle, parseRecoveryBundle } from '../recovery-transfer.mjs';
import { source, bindings, publicKey, category } from './recovery-fixtures.mjs';
import { TEST_INPUTS } from '../qualification/testInputs.mjs';

test('recovery bundle preserves all binding bytes, nested JSON, extra fields and provenance', () => {
  const input = bindings();
  const result = prepareRecoveryBundle(input, source);
  const bundle = JSON.parse(result.serialized);
  assert.deepEqual(bundle.secrets, Object.fromEntries(RECOVERY_SECRETS.map(key => [key, input[key]])));
  assert.equal(bundle.variables[RECOVERY_PUBLIC_VARIABLE], input[RECOVERY_PUBLIC_VARIABLE]);
  assert.equal(bundle.provenance.state, 'github-current-unqualified');
  assert.equal(bundle.provenance.historicalRollbackAvailable, false);
  assert.equal(result.bytes, Buffer.byteLength(result.serialized));
  assert.equal(input.AUDIT_SSH_PRIVATE_KEY.endsWith('\n'), true);
});

test('recovery rejects missing/extra bindings, malformed or duplicate JSON, bad keys and incomplete fixtures', () => {
  const cases = [
    [value => { delete value.TS_OAUTH_SECRET; }, 'binding-inventory'],
    [value => { value.EXTRA_PRIVATE_KEY = 'synthetic'; }, 'binding-inventory'],
    [value => { value.AUDIT_IMAPS_PASSWORD = '\0'; }, 'binding-inventory'],
    [value => { value.AUDIT_AUTH_FIXTURES_JSON = '{"users":{},"users":{}}'; }, 'fixture-json'],
    [value => { value.AUDIT_AUTH_FIXTURES_JSON = '{'; }, 'fixture-json'],
    [value => { value.AUDIT_AUTH_FIXTURES_JSON = '{}'; }, 'fixture-completeness'],
    [value => { value.AUDIT_REPORT_INGEST_SECRET = 'short'; }, 'ingest-key'],
    [value => { value.AUDIT_SSH_PRIVATE_KEY = value.AUDIT_SSH_PRIVATE_KEY.replace('END OPENSSH', 'END OTHER'); }, 'ssh-key-format'],
    [value => { value.AUDIT_SSH_PRIVATE_KEY = value.AUDIT_SSH_PRIVATE_KEY.replaceAll('\n', '\r\n'); }, 'ssh-key-format'],
    [value => { value.AUDIT_SSH_PRIVATE_KEY = value.AUDIT_SSH_PRIVATE_KEY.replaceAll('\n', '\\n'); }, 'ssh-key-format'],
    [value => { value.AUDIT_SSH_PRIVATE_KEY += ' '; }, 'ssh-key-format'],
    [value => { value[RECOVERY_PUBLIC_VARIABLE] = publicKey.replaceAll('PUBLIC KEY', 'PRIVATE KEY'); }, 'report-public-key'],
  ];
  for (const [mutate, expected] of cases) {
    const value = bindings(); mutate(value);
    assert.throws(() => prepareRecoveryBundle(value, source), category(expected));
  }
  for (const [key, mutate, expected] of [
    ['connectionThrottleIdentifiers', list => [...list.slice(1), list[1]], 'fixture-throttles'],
    ['ipThrottleIdentifiers', list => list.slice(1), 'fixture-throttles'],
    ['authorizationProbes', list => [...list, list[0]], 'fixture-probes'],
    ['downloadProbes', () => [], 'fixture-probes'],
  ]) {
    const value = bindings(); const fixture = JSON.parse(value.AUDIT_AUTH_FIXTURES_JSON);
    fixture[key] = mutate(fixture[key]); value.AUDIT_AUTH_FIXTURES_JSON = JSON.stringify(fixture);
    assert.throws(() => prepareRecoveryBundle(value, source), category(expected));
  }
});

test('serialized UTF-8 quota includes JSON overhead and accepts exactly 65536 bytes', () => {
  const value = bindings(); const initial = prepareRecoveryBundle(value, source).bytes;
  value.AUDIT_IMAPS_PASSWORD += 'x'.repeat(65536 - initial);
  assert.equal(prepareRecoveryBundle(value, source).bytes, 65536);
  value.AUDIT_IMAPS_PASSWORD += 'é';
  assert.throws(() => prepareRecoveryBundle(value, source), category('size-limit'));
});

test('portable recovery validates complete recovered JSON without an AWS transport', () => {
  for (const terminalLf of [true, false]) {
    const input = bindings();
    if (!terminalLf) input.AUDIT_SSH_PRIVATE_KEY = input.AUDIT_SSH_PRIVATE_KEY.slice(0, -1);
    const prepared = prepareRecoveryBundle(input, source);
    const recovered = parseRecoveryBundle(prepared.serialized);
    assert.deepEqual(recovered.secrets, Object.fromEntries(RECOVERY_SECRETS.map(key => [key, input[key]])));
    assert.deepEqual(Object.keys(recovered), ['schema', 'provenance', 'secrets', 'variables']);
    assert.equal(recovered.secrets.AUDIT_SSH_PRIVATE_KEY, input.AUDIT_SSH_PRIVATE_KEY);
    for (const mutate of [
      value => { value.schema = 'other'; },
      value => { value.awsRegion = 'us-east-2'; },
      value => { delete value.secrets.TS_OAUTH_SECRET; },
      value => { value.provenance.historicalRollbackAvailable = true; },
    ]) {
      const bad = structuredClone(recovered); mutate(bad);
      assert.throws(() => parseRecoveryBundle(JSON.stringify(bad)), category('bundle-shape'));
    }
    assert.throws(() => parseRecoveryBundle(prepared.serialized.replace('"schema":', '"schema":"duplicate","schema":')), category('bundle-json'));
  }
});

test('AWS recovery dependencies belong solely to the excluded optional tool with complete supplemental capture', () => {
  const root = new URL('../../../../', import.meta.url);
  const app = JSON.parse(fs.readFileSync(new URL('mofacts/package.json', root)));
  const appLock = JSON.parse(fs.readFileSync(new URL('mofacts/package-lock.json', root)));
  const tool = JSON.parse(fs.readFileSync(new URL('deploy/security-audit/recovery-transfer/aws/package.json', root)));
  const expected = ['@aws-sdk/client-secrets-manager', '@aws-sdk/client-sts'];
  assert.equal(tool.private, true);
  assert.deepEqual(Object.keys(tool.dependencies).sort(), expected);
  for (const name of expected) {
    assert.equal(app.dependencies?.[name], undefined);
    assert.equal(app.devDependencies?.[name], undefined);
    assert.equal(appLock.packages[''].dependencies?.[name], undefined);
    assert.equal(appLock.packages[''].devDependencies?.[name], undefined);
  }
  assert.equal(fs.readFileSync(new URL('.dockerignore', root), 'utf8').split(/\r?\n/).includes('deploy/security-audit/recovery-transfer/aws/'), true);
  for (const workflow of ['ci.yml', 'security.yml']) {
    assert.equal(fs.readFileSync(new URL(`.github/workflows/${workflow}`, root), 'utf8').includes('working-directory: deploy/security-audit/recovery-transfer/aws'), false);
  }
  for (const name of ['package.json', 'package-lock.json', 'run.mjs', 'sdk-client.mjs', 'transfer.mjs', 'tests/sdk.test.mjs', 'tests/transfer.test.mjs',
    'runner.mjs', 'store.mjs', 'restore.mjs', 'run-restore.mjs', 'tests/restore.test.mjs', 'tests/sdk-fixtures.mjs',
    'payload.mjs', 'retention.mjs', 'run-retention.mjs', 'tests/retention.test.mjs', 'tests/retention-cloud.mjs']) {
    assert.equal(TEST_INPUTS.some(([entry, type]) => entry === `deploy/security-audit/recovery-transfer/aws/${name}` && type === 'file'), true);
  }
  assert.equal(fs.existsSync(new URL('mofacts/scripts/security-audit/transfer-recovery-baseline.mjs', root)), false);
});

test('cold-restore workflow is inert, binds no deployment credentials and grants only exact-secret reads', () => {
  const root = new URL('../../../../deploy/security-audit/recovery-transfer/', import.meta.url);
  const workflow = yaml.load(fs.readFileSync(new URL('restore-workflow.yml.review', root), 'utf8'));
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.equal(workflow.jobs.restore.environment, 'security-audit-recovery-rehearsal');
  assert.deepEqual(workflow.jobs.restore.permissions, { contents: 'read', 'id-token': 'write' });
  assert.equal(/secrets\.|vars\.|production-security-audit|upload-artifact/.test(JSON.stringify(workflow)), false);
  assert.equal(workflow.jobs.restore.steps.at(-1).run, 'node deploy/security-audit/recovery-transfer/aws/run-restore.mjs');
  assert.equal(Object.keys(workflow.jobs.restore.steps.at(-1).env).every(name => name.startsWith('RECOVERY_')), true);
  const policy = JSON.parse(fs.readFileSync(new URL('restore-permissions-policy.example.json', root)));
  assert.deepEqual(policy.Statement[0].Action, ['secretsmanager:DescribeSecret', 'secretsmanager:ListSecretVersionIds', 'secretsmanager:GetSecretValue']);
  assert.equal(policy.Statement[0].Resource, '<EXACT_PRECREATED_RECOVERY_SECRET_ARN>');
  const trust = JSON.parse(fs.readFileSync(new URL('restore-trust-policy.example.json', root)));
  assert.equal(trust.Statement[0].Condition.StringEquals['token.actions.githubusercontent.com:sub'],
    'repo:memphis-iis/MoFaCTS:environment:security-audit-recovery-rehearsal');
  assert.deepEqual(policy.Statement[0].Condition.DateLessThan, trust.Statement[0].Condition.DateLessThan);
});

test('review workflow remains inert and policies bind exact source environment and one secret', () => {
  const root = new URL('../../../../deploy/security-audit/recovery-transfer/', import.meta.url);
  const workflow = yaml.load(fs.readFileSync(new URL('workflow.yml.review', root), 'utf8'));
  assert.equal(new URL('workflow.yml.review', root).pathname.includes('/.github/workflows/'), false);
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.equal(workflow.jobs.transfer.environment, source.environment);
  assert.equal(workflow.jobs.transfer.permissions['id-token'], 'write');
  assert.equal(workflow.jobs.transfer.steps.some(step => step.uses?.includes('upload-artifact')), false);
  const transferStep = workflow.jobs.transfer.steps.at(-1);
  assert.deepEqual(Object.keys(transferStep.env).filter(key => !key.startsWith('RECOVERY_')).sort(),
    [...RECOVERY_SECRETS, RECOVERY_PUBLIC_VARIABLE].sort());
  const policy = JSON.parse(fs.readFileSync(new URL('permissions-policy.example.json', root)));
  assert.deepEqual(policy.Statement[0].Action, ['secretsmanager:DescribeSecret', 'secretsmanager:ListSecretVersionIds', 'secretsmanager:PutSecretValue', 'secretsmanager:GetSecretValue']);
  assert.equal(policy.Statement[0].Resource, '<EXACT_PRECREATED_RECOVERY_SECRET_ARN>');
  const trust = JSON.parse(fs.readFileSync(new URL('trust-policy.example.json', root)));
  assert.equal(trust.Statement[0].Condition.StringEquals['token.actions.githubusercontent.com:sub'],
    `repo:${source.repository}:environment:${source.environment}`);
  assert.equal(trust.Statement[0].Condition.DateLessThan['aws:CurrentTime'], '<APPROVED_UTC_DEADLINE>');
  assert.deepEqual(policy.Statement[0].Condition.DateLessThan, trust.Statement[0].Condition.DateLessThan);
});


test('retention workflow is inert and isolated; exact-secret stage grant excludes the baseline pin', () => {
  const root = new URL('../../../../deploy/security-audit/recovery-transfer/', import.meta.url);
  const workflow = yaml.load(fs.readFileSync(new URL('retention-workflow.yml.review', root), 'utf8'));
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.equal(workflow.jobs.retention.environment, 'security-audit-recovery-rehearsal');
  assert.equal(/secrets\.|vars\.|production-security-audit|upload-artifact/.test(JSON.stringify(workflow)), false);
  assert.equal(workflow.jobs.retention.steps.at(-1).run, 'node deploy/security-audit/recovery-transfer/aws/run-retention.mjs');
  assert.equal(Object.keys(workflow.jobs.retention.steps.at(-1).env).every(name => name.startsWith('RECOVERY_')), true);
  const policy = JSON.parse(fs.readFileSync(new URL('retention-permissions-policy.example.json', root)));
  assert.deepEqual(policy.Statement[0].Action, ['secretsmanager:DescribeSecret', 'secretsmanager:ListSecretVersionIds',
    'secretsmanager:GetSecretValue', 'secretsmanager:PutSecretValue']);
  assert.deepEqual(policy.Statement[1].Action, ['secretsmanager:UpdateSecretVersionStage']);
  assert.deepEqual(policy.Statement[1].Condition.StringEquals, {
    'secretsmanager:VersionStage': ['AWSCURRENT', 'MOFACTS_RECOVERY_CANDIDATE'],
  });
  const trust = JSON.parse(fs.readFileSync(new URL('retention-trust-policy.example.json', root)));
  for (const statement of policy.Statement) {
    assert.equal(statement.Resource, '<EXACT_PRECREATED_RECOVERY_SECRET_ARN>');
    assert.deepEqual(statement.Condition.DateLessThan, trust.Statement[0].Condition.DateLessThan);
  }
  for (const name of ['retention-workflow.yml.review', 'retention-permissions-policy.example.json', 'retention-trust-policy.example.json']) {
    assert.equal(TEST_INPUTS.some(([entry, type]) => entry === `deploy/security-audit/recovery-transfer/${name}` && type === 'file'), true);
  }
});
