import { PASSWORDLESS_PROTOCOL_VERIFICATIONS } from './verificationCatalog.ts';
import { methodAuthorizationOutcome, evaluateAuthorizationOutcome } from './authorizationOutcomes.ts';
import type { AuthorizationOutcomeCategory } from './authorizationOutcomes.ts';
import type { AuditControlStatus } from './evidenceContracts.ts';
import { proofBoolean, proofRecord } from './proofFields.ts';

const invalid = (): never => { throw new Error('Invalid passwordless protocol evidence'); };

// Predicates represent an actually observed identity/flag/binding/channel fact.
// A verified mismatch is FAIL; an unreadable store or uninstalled hook is ERROR.
// Method denials retain the existing exact-code, positive-baseline contract.
export function evaluatePasswordlessProtocol(value: unknown) {
  const row = proofRecord(value, ['bindingsVerified', 'environmentLeaseHeld', 'results']);
  const bindings = proofBoolean(row.bindingsVerified), lease = proofBoolean(row.environmentLeaseHeld);
  const results = row.results;
  if (!Array.isArray(results) || results.length > PASSWORDLESS_PROTOCOL_VERIFICATIONS.length) return invalid();
  const observed = new Map<string, { status: AuditControlStatus; outcome?: AuthorizationOutcomeCategory }>();
  for (const item of results) {
    const entry = proofRecord(item, ['verificationId', 'observation']);
    const definition = PASSWORDLESS_PROTOCOL_VERIFICATIONS.find(candidate => candidate.verificationId === entry.verificationId);
    if (!definition || observed.has(definition.verificationId)) return invalid();
    let status: AuditControlStatus, outcome: AuthorizationOutcomeCategory | undefined;
    if (definition.family === 'method') {
      outcome = methodAuthorizationOutcome(entry.observation, definition.policyDenialCodes);
      status = evaluateAuthorizationOutcome(definition.expectedPolicy!, outcome);
    } else {
      const fact = proofRecord(entry.observation, (entry.observation as Record<string, unknown>)?.state === 'observed'
        ? ['state', 'value'] : ['state']);
      if (fact.state === 'observed') status = proofBoolean(fact.value) ? 'PASS' : 'FAIL';
      else if (['transport-error', 'domain-error', 'inconclusive'].includes(String(fact.state))) status = 'ERROR';
      else return invalid();
    }
    observed.set(definition.verificationId, { status, ...(outcome ? { outcome } : {}) });
  }
  const resolved = new Map<string, AuditControlStatus>();
  // Catalog order is topological. Reject a definition regression instead of
  // interpreting an unexecuted or later baseline as a successful denial.
  for (const definition of PASSWORDLESS_PROTOCOL_VERIFICATIONS) {
    if (definition.allowedBaselineIds.some(id => !resolved.has(id))) invalid();
    const status = !bindings || !lease || definition.allowedBaselineIds.some(id => resolved.get(id) !== 'PASS')
      ? 'ERROR' : observed.get(definition.verificationId)?.status ?? 'ERROR';
    resolved.set(definition.verificationId, status);
  }
  return PASSWORDLESS_PROTOCOL_VERIFICATIONS.filter(definition => definition.controlId !== null).map(definition => ({
    controlId: definition.controlId!, status: resolved.get(definition.verificationId)!,
    evidence: { summary: 'Source-owned passwordless protocol observation with required positive baselines.',
      ...(resolved.get(definition.verificationId) === 'ERROR' ? { category: 'evidence-incomplete' as const }
        : { metrics: { expectedCaseCount: 1, completedCaseCount: 1,
          matchedCaseCount: resolved.get(definition.verificationId) === 'PASS' ? 1 : 0,
          domainRejectionCount: 0, transportErrorCount: 0, inconclusiveCaseCount: 0 } }) },
  }));
}
