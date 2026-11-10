import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RecoveryTransferError } from '../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { realDirectory, readCiFile } from '../../../../mofacts/scripts/security-audit/qualification/collectCiEvidence.mjs';
import { parseCiEvidenceJson } from '../../../../mofacts/scripts/security-audit/qualification/ciEvidence.mjs';
import { recoveryOperatorInputs, acquireRecoveryOperatorSession } from './operator-session.mjs';
import { inspectRecoveryProbeInventory } from './probe-inventory.mjs';
import { makeAwsReadClient } from './sdk-client.mjs';

export async function runRecoveryOperatorInventory(env, workspace, { command, client = makeAwsReadClient,
  runtime, now = () => new Date() } = {}) {
  const input = recoveryOperatorInputs(env, runtime, now());
  const directory = await realDirectory(workspace), stat = await fs.stat(directory);
  if ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) throw new RecoveryTransferError('operator-workspace');
  const manifest = parseCiEvidenceJson(await readCiFile(fileURLToPath(new URL('../../../../mofacts/security-surface-contract.json', import.meta.url)), 65536), 65536);
  // Reserve before requesting credentials. A failure leaves the same closed
  // attempt file; neither the wrapper nor the reader retries a protected read.
  const attempt = await fs.open(path.join(directory, `inventory-${input.window.runId}.json`), 'wx', 0o600);
  try {
    await attempt.writeFile('{"state":"operator-inventory-attempt-started"}\n'); await attempt.sync();
    const credentials = await acquireRecoveryOperatorSession(input, { command, now });
    const aws = client(credentials);
    const bounded = async (...args) => {
      const time = now().getTime();
      if (!Number.isFinite(time) || time >= Math.min(Date.parse(credentials.Expiration), Date.parse(input.window.deadline))) throw new RecoveryTransferError('operator-expired');
      return aws(...args);
    };
    const result = await inspectRecoveryProbeInventory({ ...input, runId: input.window.runId, aws: bounded, manifest });
    const bytes = Buffer.from(JSON.stringify(result) + '\n');
    if (bytes.length > 98304) throw new RecoveryTransferError('operator-output');
    await attempt.truncate(0); await attempt.write(bytes, 0, bytes.length, 0); await attempt.sync();
    return result;
  } finally { await attempt.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new RecoveryTransferError('operator-context');
    await runRecoveryOperatorInventory(process.env, process.argv[2]);
    process.stdout.write('Operator inventory complete; inspect its private metadata receipt.\n');
  } catch (error) {
    const category = error instanceof RecoveryTransferError ? error.category : 'unexpected';
    process.stderr.write(`Operator inventory stopped: ${category}; preserve the attempt file, no retry is authorized.\n`);
    process.exitCode = 1;
  }
}
