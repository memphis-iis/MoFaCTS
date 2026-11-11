import { AUTHORIZATION_VERIFICATIONS } from '../../../common/securityAudit/verificationCatalog.ts';
import { methodAuthorizationOutcome, publicationAuthorizationOutcome, downloadReplayAuthorizationOutcome } from '../../../common/securityAudit/authorizationOutcomes.ts';
import { evaluateAuthorizationVerifications } from '../../../common/securityAudit/authorizationVerification.ts';
import { proofBoolean, proofRecord } from '../../../common/securityAudit/proofFields.ts';

function classify(entry, observation) {
  if (!observation || typeof observation !== 'object') return 'INCONCLUSIVE';
  if (observation.state === 'transport-error') { proofRecord(observation, ['state']); return 'TRANSPORT_OR_RUNNER_ERROR'; }
  if (observation.state === 'domain-error') { proofRecord(observation, ['state']); return 'DOMAIN_REJECTION'; }
  if (observation.state === 'inconclusive') { proofRecord(observation, ['state']); return 'INCONCLUSIVE'; }
  if (entry.family === 'method') return methodAuthorizationOutcome(observation, entry.policyDenialCodes);
  if (entry.family === 'publication') return publicationAuthorizationOutcome(observation, entry.expectedPolicy);
  if (entry.family === 'download') {
    if (entry.expectedPolicy === 'deny') return downloadReplayAuthorizationOutcome(observation);
    const row = proofRecord(observation, ['allowedObservationMatched']);
    return proofBoolean(row.allowedObservationMatched) ? 'ALLOWED' : 'INCONCLUSIVE';
  }
  const row = proofRecord(observation, ['authReady', 'connected', 'identityMatched', 'requestedRendered', 'deniedRendered']);
  const flags = Object.fromEntries(Object.entries(row).map(([key, flag]) => [key, proofBoolean(flag)]));
  if (!flags.authReady || !flags.connected || !flags.identityMatched || flags.requestedRendered === flags.deniedRendered) return 'INCONCLUSIVE';
  return flags.requestedRendered ? 'ALLOWED' : 'DENIED_BY_POLICY';
}

// The adapter owns live acquisition and private sessions. Only source IDs and
// five finite outcome categories leave this boundary. Allowed cases run first;
// the evaluator independently requires every referenced successful baseline.
export async function runSelectedAuthorizationV2(adapter) {
  const results = [], completed = new Map();
  const ordered = [...AUTHORIZATION_VERIFICATIONS.filter(row => row.expectedPolicy === 'allow'),
    ...AUTHORIZATION_VERIFICATIONS.filter(row => row.expectedPolicy === 'deny')];
  for (const entry of ordered) {
    let outcome;
    try {
      const observation = await adapter[entry.family](entry, entry.allowedBaselineIds.map(id => ({
        verificationId: id, passed: completed.get(id) === 'ALLOWED',
      })));
      outcome = classify(entry, observation);
    } catch {
      // No exception text or arbitrary adapter object can enter evidence. A
      // thrown acquisition/parsing failure can never become a policy denial.
      outcome = 'TRANSPORT_OR_RUNNER_ERROR';
    }
    completed.set(entry.verificationId, outcome);
    results.push({ verificationId: entry.verificationId, outcome });
  }
  return evaluateAuthorizationVerifications(results);
}
