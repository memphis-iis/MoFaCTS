import crypto from 'node:crypto';
import { auditTargetOrigin, parseSecurityAuditReportV2,
  AUDIT_MAX_COMPLETION_AHEAD_MS, AUDIT_MAX_UPLOAD_DELAY_MS } from '../../../common/securityAudit/reportV2.ts';
import { signAuditRequestV2 } from '../../../server/securityAudit/securityAuditIngestionV2.ts';
import { readAuditFileV2, parseAuditFileV2 } from './producerFilesV2.mjs';

// This Node caller reuses the actual runtime-neutral V2 HMAC implementation.
// It makes one request; no redirect, retry, alternate endpoint or target input.
export async function uploadAuditReportFileV2({ reportPath, env = process.env, now = new Date(), fetchImpl = globalThis.fetch }) {
  const target = auditTargetOrigin(env.AUDIT_TARGET);
  const secret = env.AUDIT_REPORT_INGEST_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('V2 audit signing configuration is unavailable');
  const body = await readAuditFileV2(reportPath);
  const report = await parseSecurityAuditReportV2(parseAuditFileV2(body), { purpose: 'retained' });
  const time = now.getTime(), completed = Date.parse(report.completedAt);
  const timestamp = String(Math.floor(time / 1000));
  if (report.target !== target || !Number.isFinite(time) || !/^\d{10}$/.test(timestamp)
    || completed - time > AUDIT_MAX_COMPLETION_AHEAD_MS || time - completed > AUDIT_MAX_UPLOAD_DELAY_MS) {
    throw new Error('V2 audit report does not match the protected upload target or time window');
  }
  const nonce = crypto.randomBytes(24).toString('base64url');
  let response;
  try {
    response = await fetchImpl(new URL('/internal/security-audits/v2', target), {
      method: 'POST', headers: { 'Content-Type': 'application/json',
        'X-MoFaCTS-Audit-Timestamp': timestamp, 'X-MoFaCTS-Audit-Nonce': nonce,
        'X-MoFaCTS-Audit-Signature': signAuditRequestV2(secret, timestamp, nonce, body) },
      body, redirect: 'error', signal: AbortSignal.timeout(30_000),
    });
  } catch { throw new Error('V2 audit upload transport failed'); }
  try {
    if (response.status !== 201) throw new Error('V2 audit upload was not accepted');
  } finally {
    // Response bodies are never report/credential diagnostics or retained data.
    try { await response.body?.cancel(); } catch { /* Disposal cannot establish acceptance. */ }
  }
}
