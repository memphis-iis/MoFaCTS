import { AUTHENTICATION_MATERIAL_CHANNELS } from '../../../common/securityAudit/verificationCatalog.ts';
import { proofBoolean, proofRecord } from '../../../common/securityAudit/proofFields.ts';
import { parseClientBundleCanariesV2 } from '../repository/clientBundleCanariesV2.mjs';
import { findCanaryLeaks } from '../scanner-parsers.mjs';

const invalid = () => { throw new Error('Authentication material observation is invalid'); };

// These are the unintended-disclosure channels inspected by the original
// scanner. Own session storage and the expected login/reset handoff are not
// channel inputs. The acquisition owner must install/complete each real hook;
// an empty array without that evidence is never a successful scan.
export function observeAuthenticationMaterialV2({ baselineVerified, channels, canaries }) {
  const baseline = proofBoolean(baselineVerified), values = parseClientBundleCanariesV2(canaries);
  const rows = proofRecord(channels, AUTHENTICATION_MATERIAL_CHANNELS);
  let complete = baseline, matchedCaseCount = 0, totalBytes = 0;
  for (const name of AUTHENTICATION_MATERIAL_CHANNELS) {
    const row = proofRecord(rows[name], ['installed', 'complete', 'values']);
    const installed = proofBoolean(row.installed), finished = proofBoolean(row.complete);
    if (!Array.isArray(row.values) || row.values.length > 1000
        || row.values.some(value => typeof value !== 'string' || Buffer.byteLength(value) > 65536)) invalid();
    totalBytes += row.values.reduce((count, value) => count + Buffer.byteLength(value), 0);
    if (totalBytes > 4 * 1024 * 1024) invalid();
    complete = complete && installed && finished;
    if (installed && finished && findCanaryLeaks(row.values, values).length === 0) matchedCaseCount++;
  }
  if (!complete) return { status: 'ERROR', evidence: { category: 'evidence-incomplete', summary: 'Authentication disclosure observation lacks its baseline or complete channel hooks.' } };
  return { status: matchedCaseCount === AUTHENTICATION_MATERIAL_CHANNELS.length ? 'PASS' : 'FAIL', evidence: {
    summary: 'Bounded unintended-disclosure channels inspected with verified private canaries.',
    metrics: { expectedCaseCount: AUTHENTICATION_MATERIAL_CHANNELS.length, completedCaseCount: AUTHENTICATION_MATERIAL_CHANNELS.length,
      matchedCaseCount, domainRejectionCount: 0, transportErrorCount: 0, inconclusiveCaseCount: 0 },
  } };
}
