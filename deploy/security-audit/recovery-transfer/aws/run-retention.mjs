import { pathToFileURL } from 'node:url';
import { RecoveryTransferError } from '../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { assertRecoveryRunner, assumeRecoverySession } from './runner.mjs';
import { makeAwsRetentionClient } from './sdk-client.mjs';
import { validateRestoreExpected } from './restore.mjs';
import { rehearseRecoveryRetention, validateRetentionTarget } from './retention.mjs';
const fail = category => { throw new RecoveryTransferError(category); };

export async function runRecoveryRetention(env, { fetchToken = fetch, client = makeAwsRetentionClient, platform = process.platform } = {}) {
  assertRecoveryRunner(env, 'recovery-retention.yml', platform);
  if (Object.keys(env).some(key => /^(AUDIT_|TS_)/.test(key)
    || ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_PROFILE',
      'AWS_DEFAULT_PROFILE', 'AWS_WEB_IDENTITY_TOKEN_FILE'].includes(key))) fail('retention-input-isolation');
  if (!/^[1-9][0-9]*$/.test(env.RECOVERY_EXPECTED_BYTES ?? '')) fail('baseline-identity');
  const expected = validateRestoreExpected({
    commit: env.RECOVERY_BASELINE_COMMIT, runId: env.RECOVERY_BASELINE_RUN_ID,
    runAttempt: env.RECOVERY_BASELINE_RUN_ATTEMPT, versionId: env.RECOVERY_VERSION_ID,
    bytes: Number(env.RECOVERY_EXPECTED_BYTES),
  });
  const target = validateRetentionTarget({
    accountId: env.RECOVERY_ACCOUNT_ID, roleArn: env.RECOVERY_ROLE_ARN, secretArn: env.RECOVERY_SECRET_ARN,
  });
  const credentials = await assumeRecoverySession(env, target, `mofacts-retention-${env.GITHUB_RUN_ID}`, fetchToken, client);
  return rehearseRecoveryRetention({ target, expected, source: { commit: env.GITHUB_SHA,
    runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT }, aws: client(credentials) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runRecoveryRetention(process.env);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.state !== 'recovery-retention-verified-unqualified') process.exitCode = 1;
  }
  catch (error) {
    const category = error instanceof RecoveryTransferError ? error.category : 'unexpected';
    process.stderr.write(`Recovery retention stopped: ${category}; reconcile before retry\n`);
    process.exitCode = 1;
  }
}
