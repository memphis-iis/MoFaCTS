import fs from 'node:fs/promises';
import path from 'node:path';
import { auditTargetOrigin, parseSecurityAuditReportV2 } from '../../../common/securityAudit/reportV2.ts';
import { canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { AUDIT_V2_MAX_BODY_BYTES } from '../../../server/securityAudit/securityAuditIngestionV2.ts';
import { realDirectory } from '../qualification/collectCiEvidence.mjs';
import { encryptReportBuffer } from '../report-crypto.mjs';
import { readAuditFileV2, parseAuditFileV2 } from './producerFilesV2.mjs';

const maxPublicKeyBytes = 65536;
const maxEncryptedBytes = Math.ceil(AUDIT_V2_MAX_BODY_BYTES / 3) * 4 + 2 * maxPublicKeyBytes + 16384;

async function readReport(reportPath, env) {
  const target = auditTargetOrigin(env.AUDIT_TARGET);
  const bytes = await readAuditFileV2(reportPath);
  const report = await parseSecurityAuditReportV2(parseAuditFileV2(bytes), { purpose: 'retained' });
  if (report.target !== target) throw new Error('V2 audit retention target does not match the protected configuration');
  return { report, bytes };
}

// Shared crypto already supports canonical report bytes independent of schema.
// Strict V2 parsing remains authoritative here; no V1 producer/crypto code is
// edited, and no second encryption scheme is introduced during inert development.
export async function encryptAuditReportFileV2({ reportPath, encryptedPath, env = process.env }) {
  const output = path.resolve(encryptedPath), directory = await realDirectory(path.dirname(output));
  try { await fs.lstat(output); throw new Error('V2 encrypted output already exists'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const key = env.AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY;
  if (typeof key !== 'string' || !key.length || Buffer.byteLength(key) > maxPublicKeyBytes) throw new Error('V2 report encryption configuration is unavailable');
  const { bytes } = await readReport(reportPath, env);
  let encrypted;
  try { encrypted = Buffer.from(canonicalAuditJson(encryptReportBuffer(bytes, key)) + '\n'); }
  catch { throw new Error('V2 report encryption did not complete'); }
  if (encrypted.length > maxEncryptedBytes || await fs.realpath(directory) !== directory) throw new Error('V2 report retention bounds were exceeded');
  const handle = await fs.open(output, 'wx', 0o600);
  try { await handle.writeFile(encrypted); await handle.sync(); }
  finally { await handle.close(); }
}

// This is the final workflow assertion, after storage/encrypted-artifact receipts
// have been checked by their owners. A security FAIL is a finding, not an I/O
// failure. Both independently parsed row counts and execution errors are checked.
export async function assertAuditExecutionCompleteFileV2({ reportPath, env = process.env }) {
  const { report } = await readReport(reportPath, env);
  if (report.executionErrors.length !== 0 || report.counts.error !== 0) throw new Error('V2 audit execution evidence is incomplete');
}
