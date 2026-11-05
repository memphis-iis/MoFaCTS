import { pathToFileURL } from 'node:url';
import { RecoveryTransferError } from '../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { assertRecoveryRunner, assumeRecoverySession, recoveryReadInputs } from './runner.mjs';
import { makeAwsReadClient } from './sdk-client.mjs';
import { restoreRecoveryBaseline } from './restore.mjs';

export async function runRecoveryRestore(env, { fetchToken = fetch, client = makeAwsReadClient, platform = process.platform } = {}) {
  assertRecoveryRunner(env, 'recovery-restore.yml', platform);
  const { target, expected } = recoveryReadInputs(env);
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
