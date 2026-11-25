import { auditDigest } from '../../../common/securityAudit/canonicalReport.ts';
import { AUDIT_VERIFICATIONS } from '../../../common/securityAudit/verificationCatalog.ts';

export const requiredMeteorVerificationIds = Object.freeze(AUDIT_VERIFICATIONS
  .filter(row => row.kind === 'integrationTest' && row.lane === 'meteor').map(row => row.verificationId));

// The portable catalog omits absent optional fields, just as its JSON export does.
export function digestVerificationCatalog() {
  return auditDigest(JSON.parse(JSON.stringify(AUDIT_VERIFICATIONS)));
}
