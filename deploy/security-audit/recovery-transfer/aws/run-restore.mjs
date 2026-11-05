import { pathToFileURL } from 'node:url';
import { RecoveryTransferError } from '../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { assertRecoveryRunner, assumeRecoverySession } from './runner.mjs';
import { makeAwsReadClient } from './sdk-client.mjs';
import { restoreRecoveryBaseline, validateRestoreExpected, validateRestoreTarget } from './restore.mjs';
const fail = category => { throw new RecoveryTransferError(category); };

export async function runRecoveryRestore(env, { fetchToken = fetch, client = makeAwsReadClient, platform = process.platform } = {}) {
  assertRecoveryRunner(env, 'recovery-restore.yml', platform);
  if (Object.keys(env).some(key => /^(AUDIT_|TS_)/.test(key)
    || ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_PROFILE',
      'AWS_DEFAULT_PROFILE', 'AWS_WEB_IDENTITY_TOKEN_FILE'].includes(key))) fail('restore-input-isolation');
  if (!/^[1-9][0-9]*$/.test(env.RECOVERY_EXPECTED_BYTES ?? '')) fail('baseline-identity');
  const expected = validateRestoreExpected({
    commit: env.RECOVERY_BASELINE_COMMIT, runId: env.RECOVERY_BASELINE_RUN_ID,
    runAttempt: env.RECOVERY_BASELINE_RUN_ATTEMPT, versionId: env.RECOVERY_VERSION_ID,
    bytes: Number(env.RECOVERY_EXPECTED_BYTES),
  });
  const target = validateRestoreTarget({
    accountId: env.RECOVERY_ACCOUNT_ID, roleArn: env.RECOVERY_ROLE_ARN, secretArn: env.RECOVERY_SECRET_ARN,
  });
  const credentials = await assumeRecoverySession(env, target, `mofacts-restore-${env.GITHUB_RUN_ID}`, fetchToken, client);
  return restoreRecoveryBaseline({ target, expected, runId: env.GITHUB_RUN_ID, aws: client(credentials) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify(await runRecoveryRestore(process.env))}\n`); }
  catch (error) {
    const category = error instanceof RecoveryTransferError ? error.category : 'unexpected';
    process.stderr.write(`Recovery restore stopped: ${category}; reconcile before retry\n`);
    process.exitCode = 1;
  }
}
