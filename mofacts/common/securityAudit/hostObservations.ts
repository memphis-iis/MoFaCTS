import { auditDigest, canonicalAuditJson } from './canonicalReport.ts';
import { AUDIT_ERROR_CATEGORIES, type AuditErrorCategory } from './evidenceContracts.ts';
import { HOST_MEASUREMENT_DESCRIPTOR, hostGroupFields, validateHostMeasurementRelations } from './hostAuditPolicy.ts';
import { contentDigest, proofMeasurements, proofRecord } from './proofFields.ts';
import { AUDIT_MAX_COMPLETION_AHEAD_MS, AUDIT_MAX_UPLOAD_DELAY_MS, auditTimestamp } from './reportV2.ts';

export const HOST_OBSERVATION_MAX_BYTES = HOST_MEASUREMENT_DESCRIPTOR.maximumBytes;
export const HOST_OBSERVATION_SCHEMA = HOST_MEASUREMENT_DESCRIPTOR.observationSchema;
export type HostFact = { state: 'observed'; value: number | boolean }
  | { state: 'unavailable'; reason: AuditErrorCategory };
export type HostObservations = {
  observationSchema: typeof HOST_OBSERVATION_SCHEMA;
  contractDigestSha256: string; observedAt: string;
  observations: Record<string, Record<string, HostFact>>;
};
const reasons = HOST_MEASUREMENT_DESCRIPTOR.unavailableReasons as readonly AuditErrorCategory[];
if (reasons.some(reason => !AUDIT_ERROR_CATEGORIES.includes(reason))) throw new Error('Invalid host fact reasons');
const groups = HOST_MEASUREMENT_DESCRIPTOR.groups as Record<string, string>;
let digest: Promise<string> | undefined;
export function hostObservationContractDigest(): Promise<string> { return digest ??= auditDigest(HOST_MEASUREMENT_DESCRIPTOR); }
export class HostObservationVersionError extends Error {
  constructor() { super('Host observation contract version mismatch'); }
}
function invalid(): never { throw new Error('Invalid host observation envelope'); }

export function observedHostMeasurements(facts: Record<string, HostFact>): Record<string, number | boolean> {
  return Object.fromEntries(Object.entries(facts).filter(([, fact]) => fact.state === 'observed')
    .map(([key, fact]) => [key, (fact as Extract<HostFact, { state: 'observed' }>).value]));
}

export async function parseHostObservations(value: unknown, now: Date): Promise<HostObservations> {
  const record = proofRecord(value, ['observationSchema', 'contractDigestSha256', 'observedAt', 'observations']);
  if (record.observationSchema !== HOST_OBSERVATION_SCHEMA
    || contentDigest(record.contractDigestSha256) !== await hostObservationContractDigest()) throw new HostObservationVersionError();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) invalid();
  const observedAt = auditTimestamp(record.observedAt), age = now.getTime() - Date.parse(observedAt);
  if (age > AUDIT_MAX_UPLOAD_DELAY_MS || age < -AUDIT_MAX_COMPLETION_AHEAD_MS) invalid();
  const raw = proofRecord(record.observations, Object.keys(groups));
  const observations: HostObservations['observations'] = {};
  for (const group of Object.keys(groups)) {
    const fields = hostGroupFields(group), row = proofRecord(raw[group], Object.keys(fields));
    const facts: Record<string, HostFact> = {};
    for (const [key, kind] of Object.entries(fields)) {
      const input = row[key];
      if (input && typeof input === 'object' && (input as Record<string, unknown>).state === 'observed') {
        const fact = proofRecord(input, ['state', 'value']);
        facts[key] = { state: 'observed', value: proofMeasurements({ [key]: fact.value }, { [key]: kind })[key]! };
      } else {
        const fact = proofRecord(input, ['state', 'reason']);
        if (fact.state !== 'unavailable' || !reasons.includes(fact.reason as AuditErrorCategory)) invalid();
        facts[key] = { state: 'unavailable', reason: fact.reason as AuditErrorCategory };
      }
    }
    const measured = observedHostMeasurements(facts);
    if (group === 'listeners') {
      for (const tier of ['Standard', 'Sensitive']) {
        validateHostMeasurementRelations('host-listeners-v1', {
          ...(Object.hasOwn(measured, 'inspectedListenerCount') ? { inspectedListenerCount: measured.inspectedListenerCount! } : {}),
          ...(Object.hasOwn(measured, `unexpected${tier}ListenerCount`) ? { unexpectedListenerCount: measured[`unexpected${tier}ListenerCount`]! } : {}),
          ...(Object.hasOwn(measured, `unexpected${tier}UdpListenerCount`) ? { unexpectedUdpListenerCount: measured[`unexpected${tier}UdpListenerCount`]! } : {}),
        });
      }
      if (typeof measured.inspectedListenerCount === 'number' && typeof measured.unexpectedStandardListenerCount === 'number'
        && typeof measured.unexpectedSensitiveListenerCount === 'number'
        && measured.unexpectedStandardListenerCount + measured.unexpectedSensitiveListenerCount > measured.inspectedListenerCount) invalid();
    } else validateHostMeasurementRelations(groups[group]!, measured);
    observations[group] = facts;
  }
  const parsed: HostObservations = { observationSchema: HOST_OBSERVATION_SCHEMA,
    contractDigestSha256: await hostObservationContractDigest(), observedAt, observations };
  if (new TextEncoder().encode(canonicalAuditJson(parsed)).length > HOST_OBSERVATION_MAX_BYTES) invalid();
  return parsed;
}

// New host wire format is canonical JSON plus at most one final LF. Comparison
// rejects duplicate keys/noncanonical encodings without adding another parser.
// Future Bash acquisition must emit jq -cS and verify the installed descriptor.
export async function parseHostObservationBytes(bytes: Uint8Array, now: Date): Promise<HostObservations> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > HOST_OBSERVATION_MAX_BYTES) invalid();
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const raw: unknown = JSON.parse(text);
  const canonical = canonicalAuditJson(raw);
  if (text !== canonical && text !== canonical + '\n') invalid();
  return parseHostObservations(raw, now);
}
