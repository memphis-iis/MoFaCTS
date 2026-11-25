import { pathToFileURL } from 'node:url';
import { RecoveryTransferError } from '../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { assertRecoveryRunner, assumeRecoverySession, recoveryReadInputs } from './runner.mjs';
import { validateConfirmationCandidate } from './confirm.mjs';
import { makeAwsReadClient } from './sdk-client.mjs';
import { inspectRecoveryProbeInventory } from './probe-inventory.mjs';

export async function runRecoveryProbeInventory(env, { fetchToken = fetch, client = makeAwsReadClient, platform = process.platform } = {}) {
  assertRecoveryRunner(env, 'recovery-probe-inventory.yml', platform);
  const { target, expected } = recoveryReadInputs(env);
  const candidateId = validateConfirmationCandidate(env.RECOVERY_CANDIDATE_VERSION_ID, expected);
  const credentials = await assumeRecoverySession(env, target, `mofacts-inventory-${env.GITHUB_RUN_ID}`, fetchToken, client);
  return inspectRecoveryProbeInventory({ target, expected, candidateId, runId: env.GITHUB_RUN_ID, aws: client(credentials) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify(await runRecoveryProbeInventory(process.env))}\n`); }
  catch (error) {
    const category = error instanceof RecoveryTransferError ? error.category : 'unexpected';
    process.stderr.write(`Probe inventory stopped: ${category}; no protected values were emitted.\n`);
    process.exitCode = 1;
  }
}
