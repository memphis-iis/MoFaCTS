import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHostObservations } from '../../../common/securityAudit/hostObservations.ts';
import { parseReleaseReceiptV2 } from '../../../common/securityAudit/releaseReceipt.mjs';
import { proofRecord, proofString } from '../../../common/securityAudit/proofFields.ts';
import { parseAuditFileV2, readAuditFileV2, writeAuditFileV2 } from '../core/producerFilesV2.mjs';

const invalid = () => { throw new Error('Host V2 acquisition is invalid'); };
export async function parseHostAuditAcquisitionV2(bytes, now = new Date()) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > 65536) invalid();
  const row = proofRecord(parseAuditFileV2(bytes), ['schema', 'hostObservations', 'releaseReceipt']);
  if (row.schema !== 'MoFaCTSHostAuditAcquisitionV2') invalid();
  const hostObservations = await parseHostObservations(row.hostObservations, now);
  let releaseReceipt;
  if (row.releaseReceipt?.state === 'observed') {
    const observation = proofRecord(row.releaseReceipt, ['state', 'result', 'receipt']);
    if (!['MATCH', 'MISMATCH'].includes(observation.result)) invalid();
    releaseReceipt = { state: 'observed', result: observation.result, receipt: parseReleaseReceiptV2(observation.receipt) };
  } else {
    const observation = proofRecord(row.releaseReceipt, ['state', 'reason']);
    if (observation.state !== 'unavailable') invalid();
    proofString(observation.reason, /^[a-z][a-z0-9-]*$/, 80);
    // Do not project arbitrary host diagnostic text into retained evidence.
    releaseReceipt = { state: 'unavailable', reason: 'release-unavailable' };
  }
  return { schema: row.schema, hostObservations, releaseReceipt };
}

// One SSH response, two existing file contracts. The frozen measurement
// descriptor is unchanged; neither V1 verdicts nor V1 receipts are accepted.
export async function writeHostAcquisitionFilesV2({ acquisitionPath, hostObservationPath, releaseReceiptPath, now = new Date() }) {
  const observation = await parseHostAuditAcquisitionV2(await readAuditFileV2(acquisitionPath), now);
  const outputs = [path.resolve(hostObservationPath), path.resolve(releaseReceiptPath)];
  if (new Set([...outputs, path.resolve(acquisitionPath)]).size !== 3) invalid();
  for (const file of outputs) {
    try { await fs.lstat(file); invalid(); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await writeAuditFileV2(outputs[0], observation.hostObservations);
  await writeAuditFileV2(outputs[1], observation.releaseReceipt);
  return { receiptMatched: observation.releaseReceipt.state === 'observed' && observation.releaseReceipt.result === 'MATCH' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [acquisitionPath, hostObservationPath, releaseReceiptPath, ...extra] = process.argv.slice(2);
    if (!acquisitionPath || !hostObservationPath || !releaseReceiptPath || extra.length) invalid();
    await writeHostAcquisitionFilesV2({ acquisitionPath, hostObservationPath, releaseReceiptPath });
    process.stdout.write('Validated V2 host observations and receipt carriage written; inspect their outcomes.\n');
  } catch {
    process.stderr.write('V2 host acquisition validation failed; no acceptance is claimed.\n'); process.exitCode = 1;
  }
}
