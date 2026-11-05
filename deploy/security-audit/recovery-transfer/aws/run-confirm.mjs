import { pathToFileURL } from 'node:url';
import { RecoveryTransferError } from '../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { assertRecoveryRunner, assumeRecoverySession, recoveryReadInputs } from './runner.mjs';
import { makeAwsReadClient } from './sdk-client.mjs';
import { confirmRecoveryVersions, validateConfirmationCandidate } from './confirm.mjs';

export async function runRecoveryConfirmation(env, { fetchToken = fetch, client = makeAwsReadClient, platform = process.platform } = {}) {
  assertRecoveryRunner(env, 'recovery-confirm.yml', platform);
  const { target, expected } = recoveryReadInputs(env);
  const candidateId = validateConfirmationCandidate(env.RECOVERY_CANDIDATE_VERSION_ID, expected);
  const credentials = await assumeRecoverySession(env, target, `mofacts-confirm-${env.GITHUB_RUN_ID}`, fetchToken, client);
  return confirmRecoveryVersions({ target, expected, candidateId, runId: env.GITHUB_RUN_ID, aws: client(credentials) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify(await runRecoveryConfirmation(process.env))}\n`); }
  catch (error) {
    const category = error instanceof RecoveryTransferError ? error.category : 'unexpected';
    process.stderr.write(`Recovery confirmation stopped: ${category}; reconcile before retry\n`);
    process.exitCode = 1;
  }
}
