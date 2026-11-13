import { AUTHENTICATION_SESSION_POLICY } from './verificationCatalog.ts';
import { AUTHORIZATION_OUTCOME_CATEGORIES } from './authorizationOutcomes.ts';
import { proofBoolean, proofRecord } from './proofFields.ts';

export function sessionLifetimeStatus(lifetimeDays: number) {
  if (!Number.isFinite(lifetimeDays) || Math.abs(lifetimeDays) > 1e12) throw new Error('Invalid session lifetime observation');
  return lifetimeDays > 0 && lifetimeDays <= AUTHENTICATION_SESSION_POLICY.maximumLifetimeDays ? 'PASS' as const : 'FAIL' as const;
}

// Require a newly issued, identity-verified successful session. Epochs remain
// transient inputs; retained metrics carry only the duration and verified flags.
export function evaluateSessionLifetime(value: unknown) {
  const row = proofRecord(value, ['baselineOutcome', 'freshSessionVerified', 'issuedAtMs', 'expiresAtMs']);
  if (!AUTHORIZATION_OUTCOME_CATEGORIES.includes(row.baselineOutcome as typeof AUTHORIZATION_OUTCOME_CATEGORIES[number])
      || !Number.isSafeInteger(row.issuedAtMs) || Number(row.issuedAtMs) < 0
      || !Number.isSafeInteger(row.expiresAtMs) || Number(row.expiresAtMs) < 0) throw new Error('Invalid session lifetime observation');
  const fresh = proofBoolean(row.freshSessionVerified);
  if (row.baselineOutcome !== 'ALLOWED' || !fresh) return { status: 'ERROR' as const };
  const lifetimeDays = (Number(row.expiresAtMs) - Number(row.issuedAtMs)) / 86400000;
  return { status: sessionLifetimeStatus(lifetimeDays), metrics: { lifetimeDays, authenticated: true, freshSessionVerified: true } };
}
