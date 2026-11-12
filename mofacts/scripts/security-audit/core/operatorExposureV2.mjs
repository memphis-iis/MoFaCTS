import fs from 'node:fs/promises';
import path from 'node:path';
import { writeHostAcquisitionFilesV2 } from '../internal/hostAcquisitionV2.mjs';
import { writeExternalProducerFilesV2 } from '../external/producerFilesV2.mjs';
import { writeHostProducerFilesV2 } from '../internal/producerFilesV2.mjs';
import { writeAuditMetadataV2 } from './metadataV2.mjs';
import { runAssemblyCommandV2 } from '../assemble-report-v2.mjs';
import { encryptAuditReportFileV2, assertAuditExecutionCompleteFileV2 } from './reportFilesV2.mjs';
import { uploadAuditReportFileV2 } from './uploadV2.mjs';
import { parseSecurityAuditReportV2 } from '../../../common/securityAudit/reportV2.ts';
import { parseAuditFileV2, readAuditFileV2, writeAuditFileV2 } from './producerFilesV2.mjs';

const target = 'https://staging2.optimallearning.org';

// Host SSH is owned by the existing restricted operator command. This coordinator
// consumes its freshly obtained carriage, not an operator shell or new grant.
// No signer, private encryption key or fixture credential enters acquisition.
export async function acquireOperatorExposureV2({ acquisitionPath, directory, env = process.env }, dependencies = {}) {
  const {
    splitHost = writeHostAcquisitionFilesV2, external = writeExternalProducerFilesV2,
    host = writeHostProducerFilesV2, metadata = writeAuditMetadataV2,
    assemble = runAssemblyCommandV2,
  } = dependencies;
  if (env.AUDIT_TARGET !== target || env.AUDIT_TYPE !== 'exposure'
      || !path.isAbsolute(directory) || !path.isAbsolute(acquisitionPath)) throw new Error('Invalid staging2 exposure inputs');
  // Construct the acquisition environment explicitly. Secret-bearing parent
  // variables cannot reach a producer through the options object.
  const acquisitionEnv = {
    PATH: env.PATH, SystemRoot: env.SystemRoot, AUDIT_TARGET: target,
    AUDIT_TYPE: 'exposure', AUDIT_REPORT_ID: env.AUDIT_REPORT_ID,
    AUDIT_STARTED_AT: new Date().toISOString(),
  };
  await fs.mkdir(directory, { mode: 0o700 });
  const artifacts = path.join(directory, 'producers');
  await fs.mkdir(artifacts, { mode: 0o700 });
  const observation = path.join(directory, 'host-observations.json');
  const receipt = path.join(directory, 'receipt.json');
  const udp = path.join(directory, 'udp.json');
  const metadataPath = path.join(directory, 'metadata.json');
  const report = path.join(directory, 'report.json');
  const steps = [];
  async function collect(name, action) {
    try { await action(); steps.push({ name, completed: true }); }
    catch { steps.push({ name, completed: false }); }
  }
  // The catalog assembler owns complete ERROR rows for absent/malformed evidence.
  // An acquisition error is recorded and cannot prevent the other producer.
  await collect('host-acquisition', () => splitHost({ acquisitionPath, hostObservationPath: observation, releaseReceiptPath: receipt }));
  await collect('external', () => external({ profile: 'exposure', artifactDirectory: artifacts, udpObservationPath: udp, env: acquisitionEnv }));
  await collect('host-composite', () => host({ profile: 'exposure', artifactDirectory: artifacts,
    hostObservationPath: observation, udpObservationPath: udp }));
  await metadata({ releaseReceiptPath: receipt, metadataPath, env: acquisitionEnv });
  await assemble([metadataPath, artifacts, report], acquisitionEnv);
  await writeAuditFileV2(path.join(directory, 'acquisition-outcome.json'), { steps });
  return { reportPath: report, steps };
}

// This phase alone receives the existing staging2 signer, after acquisition ends.
// Encrypt first, then submit once. The same complete-execution assertion used by
// the hosted workflow runs last, after accepted storage and retained encryption.
export async function finishOperatorExposureV2({ reportPath, encryptedPath, receiptPath, env = process.env }, dependencies = {}) {
  const { encrypt = encryptAuditReportFileV2, upload = uploadAuditReportFileV2,
    assertComplete = assertAuditExecutionCompleteFileV2 } = dependencies;
  if (env.AUDIT_TARGET !== target) throw new Error('Invalid staging2 report target');
  const report = await parseSecurityAuditReportV2(parseAuditFileV2(await readAuditFileV2(reportPath)), { purpose: 'retained' });
  if (report.target !== target || report.reportType !== 'exposure') throw new Error('Invalid staging2 exposure report');
  try { await fs.lstat(receiptPath); throw new Error('Operator receipt already exists'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await encrypt({ reportPath, encryptedPath, env: { AUDIT_TARGET: target,
    AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY: env.AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY } });
  await upload({ reportPath, env: { AUDIT_TARGET: target, AUDIT_REPORT_INGEST_SECRET: env.AUDIT_REPORT_INGEST_SECRET } });
  let executionComplete = false;
  try { await assertComplete({ reportPath, env: { AUDIT_TARGET: target } }); executionComplete = true; }
  catch (error) {
    if (report.counts.error === 0 && report.executionErrors.length === 0) throw error;
  }
  const outcome = { reportId: report.reportId, digestSha256: report.digestSha256,
    counts: report.counts, encrypted: true, storageAccepted: true, executionComplete };
  await writeAuditFileV2(receiptPath, outcome);
  return outcome;
}
