import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { source, bindings } from '../../../../../mofacts/scripts/security-audit/tests/recovery-fixtures.mjs';
import { prepareRecoveryBundle } from '../../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { recoveryVersionId } from '../store.mjs';
import { retentionCloud } from './retention-cloud.mjs';
import { target, credentials } from './sdk-fixtures.mjs';

export const clock = new Date('2026-11-08T20:00:00.000Z');
export function operatorFixture() {
  const prepared = prepareRecoveryBundle(bindings(), source);
  const baseline = { ClientRequestToken: recoveryVersionId(source), SecretString: prepared.serialized };
  const runId = '98765', candidateId = 'c'.repeat(64);
  const cloud = retentionCloud({ baseline, runId, sessionKind: 'inventory' });
  cloud.versions.set(candidateId, { text: prepared.serialized, labels: ['AWSPREVIOUS'] });
  const env = {
    PATH: process.env.PATH, NODE_OPTIONS: '', AWS_EXECUTION_ENV: 'CloudShell',
    AWS_REGION: 'us-east-2', AWS_DEFAULT_REGION: 'us-east-2',
    AWS_CONTAINER_CREDENTIALS_FULL_URI: 'http://localhost:1338/credential-provider',
    AWS_CONTAINER_AUTHORIZATION_TOKEN: 'PRIVATE-container-token',
    RECOVERY_ACCOUNT_ID: target.accountId, RECOVERY_ROLE_ARN: target.roleArn.replace('transfer', 'restore'),
    RECOVERY_SECRET_ARN: target.secretArn, RECOVERY_BASELINE_COMMIT: source.commit,
    RECOVERY_BASELINE_RUN_ID: source.runId, RECOVERY_BASELINE_RUN_ATTEMPT: source.runAttempt,
    RECOVERY_VERSION_ID: baseline.ClientRequestToken, RECOVERY_EXPECTED_BYTES: String(prepared.bytes),
    RECOVERY_CANDIDATE_VERSION_ID: candidateId, RECOVERY_EXPECTED_COMMIT: 'b'.repeat(40),
    RECOVERY_OPERATION_ID: runId, RECOVERY_ACCESS_DEADLINE: '2026-11-08T21:00:00.000Z',
  };
  const calls = [];
  const command = async (name, args, maximum, environment) => {
    calls.push({ name, args, maximum, environment });
    if (name === 'git') return Buffer.from(args.includes('rev-parse') ? env.RECOVERY_EXPECTED_COMMIT + '\n' : '');
    if (args[0] === '--version') return Buffer.from('aws-cli/2.39.6 Python/3.14.8 Linux exec-env/CloudShell\n');
    return Buffer.from(JSON.stringify(args[1] === 'get-caller-identity'
      ? { Account: target.accountId, Arn: `arn:aws:iam::${target.accountId}:user/mofacts-recovery-operator` }
      : { AssumedRoleUser: { Arn: `arn:aws:sts::${target.accountId}:assumed-role/mofacts-recovery-restore/mofacts-inventory-${runId}` },
        Credentials: { ...credentials, Expiration: '2026-11-08T20:15:00.000Z' } }));
  };
  return { env, prepared, cloud, calls, command, runtime: { platform: 'linux', node: 'v24.22.1' }, now: () => new Date(clock) };
}
export async function operatorWorkspace(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-operator-'));
  await fs.chmod(directory, 0o700);
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}
