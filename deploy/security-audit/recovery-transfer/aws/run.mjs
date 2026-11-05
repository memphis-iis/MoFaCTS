import { pathToFileURL } from 'node:url';
import { RECOVERY_PUBLIC_VARIABLE, RECOVERY_SECRETS, RecoveryTransferError, prepareRecoveryBundle } from '../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { transferRecoveryBaseline, validateRecoveryTarget } from './transfer.mjs';
import { makeAwsClient } from './sdk-client.mjs';
import { assertRecoveryRunner, assumeRecoverySession } from './runner.mjs';

export async function runRecoveryTransfer(env, { fetchToken = fetch, client = makeAwsClient, platform = process.platform } = {}) {
  assertRecoveryRunner(env, 'recovery-transfer.yml', platform);
  const source = {
    repository: env.GITHUB_REPOSITORY, environment: 'production-security-audit',
    commit: env.GITHUB_SHA, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
  };
  const bindings = Object.fromEntries([...RECOVERY_SECRETS, RECOVERY_PUBLIC_VARIABLE].map(key => [key, env[key]]));
  const target = validateRecoveryTarget({
    accountId: env.RECOVERY_ACCOUNT_ID, roleArn: env.RECOVERY_ROLE_ARN, secretArn: env.RECOVERY_SECRET_ARN,
  });
  prepareRecoveryBundle(bindings, source); // No token or AWS request before validation.
  const credentials = await assumeRecoverySession(env, target, `mofacts-recovery-${source.runId}`, fetchToken, client);
  return transferRecoveryBaseline({ bindings, source, target, aws: client(credentials) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify(await runRecoveryTransfer(process.env))}\n`); }
  catch (error) {
    // Never log upstream exceptions, AWS stderr, OIDC responses or binding values.
    const category = error instanceof RecoveryTransferError ? error.category : 'unexpected';
    process.stderr.write(`Recovery transfer stopped: ${category}; reconcile before retry\n`);
    process.exitCode = 1;
  }
}
