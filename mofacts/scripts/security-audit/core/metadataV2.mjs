import { auditTargetOrigin, auditReportId } from '../../../common/securityAudit/reportV2.ts';
import { parseReleaseReceiptV2, receiptPlatformImage } from '../../../common/securityAudit/releaseReceipt.mjs';
import { proofRecord } from '../../../common/securityAudit/proofFields.ts';
import { readAuditFileV2, parseAuditFileV2, writeAuditFileV2 } from './producerFilesV2.mjs';

export async function readAuditImageContextV2(releaseReceiptPath) {
  let receipt;
  try {
    const row = proofRecord(parseAuditFileV2(await readAuditFileV2(releaseReceiptPath)), ['state', 'result', 'receipt']);
    if (row.state !== 'observed' || row.result !== 'MATCH') throw new Error();
    receipt = parseReleaseReceiptV2(row.receipt);
  } catch { /* No report, tag, CI proof or environment revision substitutes for missing host identity. */ }
  const deployedApplicationRevision = receipt ? { state: 'observed', value: receipt.baseCommit } : { state: 'unavailable', reason: 'unresolved' };
  const deployedImageDigest = receipt ? { state: 'observed', value: receiptPlatformImage(receipt) } : { state: 'unavailable', reason: 'unresolved' };
  return { deployedApplicationRevision, deployedImageDigest,
    ...(receipt ? { AUDIT_RUNTIME_IMAGE: receiptPlatformImage(receipt) } : {}) };
}
export async function writeAuditMetadataV2({ releaseReceiptPath, metadataPath, env = process.env, now = new Date() }) {
  auditTargetOrigin(env.AUDIT_TARGET);
  if (!['exposure', 'full'].includes(env.AUDIT_TYPE) || !Number.isFinite(now.getTime())) throw new Error('Invalid V2 metadata input');
  const { deployedApplicationRevision, deployedImageDigest } = await readAuditImageContextV2(releaseReceiptPath);
  const metadata = { reportId: auditReportId(env.AUDIT_REPORT_ID), reportType: env.AUDIT_TYPE, startedAt: env.AUDIT_STARTED_AT,
    completedAt: now.toISOString(), deployedApplicationRevision, deployedImageDigest, toolVersions: { node: process.version } };
  await writeAuditFileV2(metadataPath, metadata);
  return metadata;
}
