import { proofMeasurements as auditMeasurements, proofRecord, type ProofMeasurementKind } from './proofFields.ts';
import { HOST_EVIDENCE_FIELDS, hasHostEvidenceContract, parseHostEvidenceMeasurements } from './hostAuditPolicy.ts';
import { AUTHENTICATION_COMPARISON_POLICY as comparisonPolicy } from './verificationCatalog.ts';
import { authenticationTimingMetricStatus, authenticationTimingStatus, type AuthenticationTimingMetric } from './authenticationTiming.ts';

export type AuditControlStatus = 'PASS' | 'FAIL' | 'ERROR';
export const AUDIT_ERROR_CATEGORIES = Object.freeze([
  'producer-missing', 'producer-malformed', 'configuration', 'transport', 'timeout',
  'tool-unavailable', 'evidence-incomplete', 'identity-unavailable', 'identity-conflict',
  'observation-version', 'synthetic-contract-qualification',
] as const);
export type AuditErrorCategory = typeof AUDIT_ERROR_CATEGORIES[number];
export type AuditEvidence = {
  summary: string;
  category?: AuditErrorCategory;
  observations?: string[];
  metrics?: Record<string, number | boolean>;
};

// Released entries are append-only. These are proof-shape requirements, not
// acquisition or a claim that the producer classified the observations correctly.
type Field = ProofMeasurementKind;
const comparisonFields = { loginPairCount: 'count', resetPairCount: 'count', baselineVerified: 'boolean',
  bindingsVerified: 'boolean', environmentLeaseHeld: 'boolean', rateLimitedAttemptCount: 'count',
  domainRejectionCount: 'count', transportErrorCount: 'count', inconclusiveCaseCount: 'count' } as const;
const timingMetricKeys = ['existingMedianMs', 'missingMedianMs', 'differentialMs', 'approvedBoundMs',
  'dominantDirectionCount', 'requiredDirectionCount'] as const;
const timingComparisonFields: Record<string, Field> = Object.fromEntries((['login', 'reset'] as const).flatMap(family =>
  timingMetricKeys.map(key => [`${family}${key[0]!.toUpperCase()}${key.slice(1)}`,
    key.endsWith('Count') ? 'count' : 'number'] as const)));
const udpExternalFields = { observedResultCount: 'count', expectedResultCount: 'count', openSelectedUdpPortCount: 'count' } as const;
const udpHostFields = { unexpectedUdpListenerCount: 'count', unexpectedUdpAllowRuleCount: 'count', unexpectedUdpPublicationCount: 'count', firewallActive: 'boolean', defaultDenyInbound: 'boolean' } as const;
export type UdpExternalMeasurements = { observedResultCount: number; expectedResultCount: number; openSelectedUdpPortCount: number };
export type UdpHostMeasurements = { unexpectedUdpListenerCount: number; unexpectedUdpAllowRuleCount: number; unexpectedUdpPublicationCount: number; firewallActive: boolean; defaultDenyInbound: boolean };
const contracts: Readonly<Record<string, Readonly<Record<string, Field>>>> = {
  'address-inventory-v1': { addressCount: 'count' },
  'finding-inventory-v1': { evaluatedCount: 'count', findingCount: 'count' },
  'image-findings-v1': { evaluatedCount: 'count', findingCount: 'count' },
  'tcp-policy-v1': { addressCount: 'count', testedEndpointCount: 'count', unexpectedPortCount: 'count', missingRequiredPortCount: 'count' },
  'udp-exposure-v1': { ...udpExternalFields, ...udpHostFields },
  'http-redirect-v1': { testedPathCount: 'count', passingPathCount: 'count' },
  'tls-protocols-v1': { addressCount: 'count', testedProtocolCount: 'count', acceptedLegacyCount: 'count', rejectedModernCount: 'count' },
  'certificate-policy-v1': { addressCount: 'count', validatedCertificateCount: 'count', minimumValidityDays: 'number' },
  'tls-ciphers-v1': { cipherCount: 'count', weakCipherCount: 'count' },
  'websocket-policy-v1': { addressCount: 'count', secureUpgradeCount: 'count', insecureUpgradeCount: 'count' },
  'header-policy-v1': { requiredRestrictionCount: 'count', matchingRestrictionCount: 'count' },
  'enumeration-observations-v1': { loginCodeMatch: 'boolean', resetShapeMatch: 'boolean', rateLimitedAttemptCount: 'count', comparedAttemptCount: 'count' },
  'timing-observations-v1': { loginDifferentialMs: 'number', loginApprovedBoundMs: 'number', resetDifferentialMs: 'number', resetApprovedBoundMs: 'number', sampleCountPerIdentifier: 'count' },
  'reset-expiration-v1': { ageMinutes: 'number', configuredLifetimeMinutes: 'number', accepted: 'boolean' },
  'session-lifetime-v1': { lifetimeDays: 'number', authenticated: 'boolean' },
  'enumeration-observations-v2': { ...comparisonFields, loginResponseMatch: 'boolean', resetResponseMatch: 'boolean' },
  'timing-observations-v2': { ...comparisonFields, ...timingComparisonFields },
  'verification-observations-v1': { expectedCaseCount: 'count', completedCaseCount: 'count', matchedCaseCount: 'count', domainRejectionCount: 'count', transportErrorCount: 'count', inconclusiveCaseCount: 'count' },
  ...HOST_EVIDENCE_FIELDS,
};

export const AUDIT_EVIDENCE_CONTRACT_IDS = Object.freeze(Object.keys(contracts));
export function hasEvidenceContract(id: string): boolean { return Object.hasOwn(contracts, id); }
export function evidenceRequiresDeployedIdentity(id: string): boolean { return id === 'image-findings-v1'; }

// Bounded transient acquisition inputs, not V1 evaluated controls. Acquisition
// must establish the unique selected endpoint inventory before deriving counts.
export function parseUdpExternalMeasurements(value: unknown): UdpExternalMeasurements {
  const metrics = auditMeasurements(value, udpExternalFields) as UdpExternalMeasurements;
  if (metrics.expectedResultCount < 1 || metrics.observedResultCount > metrics.expectedResultCount
    || metrics.openSelectedUdpPortCount > metrics.observedResultCount) throw new Error('Contradictory UDP measurements');
  return metrics;
}

export function parseUdpHostMeasurements(value: unknown): UdpHostMeasurements {
  return auditMeasurements(value, udpHostFields) as UdpHostMeasurements;
}

export function udpHostPolicySatisfied(metrics: UdpHostMeasurements): boolean {
  return metrics.unexpectedUdpListenerCount === 0 && metrics.unexpectedUdpAllowRuleCount === 0
    && metrics.unexpectedUdpPublicationCount === 0 && metrics.firewallActive && metrics.defaultDenyInbound;
}

function udpEvidenceMeasurements(status: AuditControlStatus, value: unknown): Record<string, number | boolean> {
  // Approved P1-D3 exception in the unreleased candidate contract: a positive
  // response is conclusive without host facts. Only its three real counts are
  // retained; absent host values are never invented or made optional for PASS.
  const positiveOnly = Boolean(value && typeof value === 'object' && Object.keys(value).length === 3);
  const metrics = auditMeasurements(value, positiveOnly ? udpExternalFields : contracts['udp-exposure-v1']!);
  const external = parseUdpExternalMeasurements(Object.fromEntries(Object.keys(udpExternalFields).map(key => [key, metrics[key]])));
  if (positiveOnly) {
    if (status !== 'FAIL' || external.openSelectedUdpPortCount < 1) throw new Error('UDP positive proof requires a confirmed failure');
  } else {
    const host = parseUdpHostMeasurements(Object.fromEntries(Object.keys(udpHostFields).map(key => [key, metrics[key]])));
    if (external.openSelectedUdpPortCount > 0) {
      if (status !== 'FAIL') throw new Error('Confirmed public UDP response cannot pass');
    } else if (external.observedResultCount !== external.expectedResultCount
      || status !== (udpHostPolicySatisfied(host) ? 'PASS' : 'FAIL')) {
      throw new Error('UDP evidence cannot establish the claimed status');
    }
  }
  return metrics;
}

export function auditText(value: unknown, limit: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > limit
    || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value)
    || /\b(?:authorization|cookie|set-cookie)\s*:/i.test(value)
    || /\b(?:password|passwd|secret|token|session|credential)["']?\s*[=:]/i.test(value)
    || /^\s*[[{]/.test(value)
    || /\b[A-Za-z0-9_-]{48,}\b/.test(value)) throw new Error('Audit text is unbounded or unsanitized');
  return value;
}

export function parseAuditEvidence(id: string, status: AuditControlStatus, value: unknown): AuditEvidence {
  if (!hasEvidenceContract(id)) throw new Error('Unknown audit evidence contract');
  const fields = contracts[id];
  if (!fields) throw new Error('Unknown audit evidence contract');
  if (status === 'ERROR') {
    const record = proofRecord(value, ['summary', 'category']);
    if (!AUDIT_ERROR_CATEGORIES.includes(record.category as AuditErrorCategory)) throw new Error('Invalid audit error category');
    return { summary: auditText(record.summary, 500), category: record.category as AuditErrorCategory };
  }
  if (status !== 'PASS' && status !== 'FAIL') throw new Error('Invalid included-control status');
  const hasObservations = Boolean(value && typeof value === 'object' && Object.hasOwn(value, 'observations'));
  const record = proofRecord(value, hasObservations ? ['summary', 'metrics', 'observations'] : ['summary', 'metrics']);
  const metrics = id === 'udp-exposure-v1' ? udpEvidenceMeasurements(status, record.metrics)
    : hasHostEvidenceContract(id) ? parseHostEvidenceMeasurements(id, status, record.metrics, record.observations)
      : auditMeasurements(record.metrics, fields);
  const result: AuditEvidence = { summary: auditText(record.summary, 500), metrics };
  if (id === 'enumeration-observations-v2' || id === 'timing-observations-v2') {
    if (metrics.loginPairCount !== comparisonPolicy.login.sampleCount || metrics.resetPairCount !== comparisonPolicy.reset.sampleCount
        || metrics.baselineVerified !== true || metrics.bindingsVerified !== true || metrics.environmentLeaseHeld !== true
        || ['rateLimitedAttemptCount', 'domainRejectionCount', 'transportErrorCount', 'inconclusiveCaseCount'].some(key => metrics[key] !== 0)) {
      throw new Error('Incomplete authentication comparison proof');
    }
    let expected: AuditControlStatus;
    if (id === 'enumeration-observations-v2') {
      expected = metrics.loginResponseMatch === true && metrics.resetResponseMatch === true ? 'PASS' : 'FAIL';
    } else {
      const states = (['login', 'reset'] as const).map(family => {
        const metric = Object.fromEntries(timingMetricKeys.map(key => [key,
          Number(metrics[`${family}${key[0]!.toUpperCase()}${key.slice(1)}`])])) as unknown as AuthenticationTimingMetric;
        if (metric.existingMedianMs > comparisonPolicy.maximumAttemptMs || metric.missingMedianMs > comparisonPolicy.maximumAttemptMs) {
          throw new Error('Authentication timing proof exceeds the operation bound');
        }
        return authenticationTimingMetricStatus(metric, family, comparisonPolicy[family].sampleCount);
      });
      expected = authenticationTimingStatus(states[0]!, states[1]!);
    }
    if (status !== expected) throw new Error('Authentication comparison proof contradicts status');
  }
  if ((id === 'finding-inventory-v1' || id === 'image-findings-v1')
    && (Number(metrics.findingCount) > Number(metrics.evaluatedCount)
      || (status === 'PASS' ? metrics.findingCount !== 0 : metrics.findingCount === 0))) {
    throw new Error('Audit finding evidence contradicts its status');
  }
  if (id === 'verification-observations-v1') {
    const expected = Number(metrics.expectedCaseCount), completed = Number(metrics.completedCaseCount);
    const matched = Number(metrics.matchedCaseCount);
    const errors = Number(metrics.domainRejectionCount) + Number(metrics.transportErrorCount) + Number(metrics.inconclusiveCaseCount);
    if (expected < 1 || completed !== expected || matched > completed || errors !== 0
      || (status === 'PASS' ? matched !== expected : matched === expected)) {
      throw new Error('Audit verification evidence cannot establish the claimed status');
    }
  }
  if (hasObservations) {
    if (!Array.isArray(record.observations) || record.observations.length > 12) throw new Error('Invalid audit observations');
    result.observations = record.observations.map(entry => auditText(entry, 500));
  }
  return result;
}
