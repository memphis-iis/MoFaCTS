import crypto from 'node:crypto';
import { assertUniqueSemanticProbeIds } from './authentication-probes.mjs';
import { parseCiEvidenceJson } from './qualification/ciEvidence.mjs';

export const RECOVERY_SECRETS = Object.freeze([
  'AUDIT_AUTH_FIXTURES_JSON', 'AUDIT_IMAPS_PASSWORD', 'AUDIT_REPORT_INGEST_SECRET',
  'AUDIT_SSH_HOST', 'AUDIT_SSH_USER', 'AUDIT_SSH_PRIVATE_KEY', 'AUDIT_SSH_KNOWN_HOSTS',
  'TS_OAUTH_CLIENT_ID', 'TS_OAUTH_SECRET',
]);
export const RECOVERY_PUBLIC_VARIABLE = 'AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY';
const repository = 'memphis-iis/MoFaCTS';
const environment = 'production-security-audit';
const maxBytes = 65536;

export class RecoveryTransferError extends Error {
  constructor(category) {
    super(`Recovery transfer stopped: ${category}`);
    this.category = category;
  }
}
const stop = category => { throw new RecoveryTransferError(category); };
const text = value => typeof value === 'string' && value.trim().length > 0 && !value.includes('\0');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => object(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

// Reuse the existing bounded, duplicate-key-rejecting JSON parser for syntax
// only. This does not acquire CI evidence or qualify the fixture's behavior.
function parseFixture(raw) {
  let fixture;
  try { fixture = parseCiEvidenceJson(Buffer.from(raw), maxBytes); }
  catch { stop('fixture-json'); }
  const actors = ['learnerA', 'learnerB', 'teacherA', 'teacherB', 'admin', 'reset', 'expiry', 'lockout'];
  if (!object(fixture) || !actors.every(actor => text(fixture.users?.[actor]?.username)
    && text(fixture.users?.[actor]?.password)) || !text(fixture.users.reset.newPassword)
    || !text(fixture.runNamespace) || !text(fixture.imaps?.host) || !text(fixture.imaps?.username)
    || !text(fixture.imaps?.mailbox)
    || !['experimentTarget', 'otherExperimentTarget', 'participantId'].every(key => text(fixture.passwordless?.[key]))
    || fixture.passwordless.experimentTarget === fixture.passwordless.otherExperimentTarget
    || !Array.isArray(fixture.canaries) || !fixture.canaries.length || !fixture.canaries.every(text)) stop('fixture-completeness');
  const groups = {};
  const coverage = new Set();
  for (const [kind, key, subject] of [
    ['method', 'authorizationProbes', 'method'], ['publication', 'publicationProbes', 'publication'],
    ['route', 'routeProbes', 'path'], ['download', 'downloadProbes', 'path'],
  ]) {
    const probes = fixture[key];
    if (!Array.isArray(probes) || !probes.length || !probes.every(probe => object(probe)
      && ['anonymous', ...actors].includes(probe.actor) && text(probe[subject]))) stop('fixture-probes');
    groups[kind] = probes;
    probes.forEach(probe => coverage.add(probe.actor));
  }
  if (!assertUniqueSemanticProbeIds(groups)
    || !['anonymous', ...actors.slice(0, 5)].every(actor => coverage.has(actor))) stop('fixture-probes');
  for (const [key, minimum] of [['connectionThrottleIdentifiers', 12], ['ipThrottleIdentifiers', 21]]) {
    const identifiers = fixture[key];
    if (!Array.isArray(identifiers) || identifiers.length < minimum || !identifiers.every(text)
      || new Set(identifiers).size !== identifiers.length) stop('fixture-throttles');
  }
}

export function prepareRecoveryBundle(bindings, source) {
  if (!exactKeys(bindings, [...RECOVERY_SECRETS, RECOVERY_PUBLIC_VARIABLE])
    || !Object.values(bindings).every(text)) stop('binding-inventory');
  if (!exactKeys(source, ['repository', 'environment', 'commit', 'runId', 'runAttempt'])
    || source.repository !== repository || source.environment !== environment
    || !text(source.commit) || !/^[a-f0-9]{40}$/.test(source.commit)
    || !text(source.runId) || !/^[1-9][0-9]*$/.test(source.runId)
    || !text(source.runAttempt) || !/^[1-9][0-9]*$/.test(source.runAttempt)) stop('source-identity');
  // Preserve every binding string, including embedded JSON, PEM and final LF.
  // Extra fixture fields remain in the original string; none are normalized.
  const bundle = {
    schema: 'MoFactsRecoveryBundleV1',
    provenance: { ...source, state: 'github-current-unqualified', historicalRollbackAvailable: false },
    secrets: Object.fromEntries(RECOVERY_SECRETS.map(key => [key, bindings[key]])),
    variables: { [RECOVERY_PUBLIC_VARIABLE]: bindings[RECOVERY_PUBLIC_VARIABLE] },
  };
  const serialized = JSON.stringify(bundle);
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > maxBytes) stop('size-limit');
  parseFixture(bindings.AUDIT_AUTH_FIXTURES_JSON);
  if (bindings.AUDIT_REPORT_INGEST_SECRET.length < 32) stop('ingest-key');
  const sshKey = bindings.AUDIT_SSH_PRIVATE_KEY;
  const sshKeyType = 'OPENSSH PRIVATE KEY';
  const sshFooter = `\n-----END ${sshKeyType}-----`;
  // This archives the GitHub binding, not a materialized SSH key file. The
  // production consumer owns its final LF via printf '%s\n'. Accept either
  // stored representation and preserve its exact bytes in the recovery bundle.
  if (!sshKey.startsWith(`-----BEGIN ${sshKeyType}-----\n`)
    || !(sshKey.endsWith(sshFooter) || sshKey.endsWith(`${sshFooter}\n`))
    || sshKey.includes('\r')) stop('ssh-key-format');
  const pem = bindings[RECOVERY_PUBLIC_VARIABLE];
  if (!pem.trim().startsWith('-----BEGIN PUBLIC KEY-----') || pem.includes('PRIVATE KEY')) stop('report-public-key');
  try {
    const key = crypto.createPublicKey(pem);
    if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 3072) stop('report-public-key');
  } catch { stop('report-public-key'); }
  return { serialized, bytes, source: bundle.provenance };
}

// Validate a recovered portable document without acquiring credentials or storage.
export function parseRecoveryBundle(serialized) {
  let bundle;
  try { bundle = parseCiEvidenceJson(Buffer.from(serialized, 'utf8'), maxBytes); }
  catch { stop('bundle-json'); }
  if (!exactKeys(bundle, ['schema', 'provenance', 'secrets', 'variables'])
    || bundle.schema !== 'MoFactsRecoveryBundleV1'
    || !exactKeys(bundle.provenance, ['repository', 'environment', 'commit', 'runId', 'runAttempt', 'state', 'historicalRollbackAvailable'])
    || bundle.provenance.state !== 'github-current-unqualified'
    || bundle.provenance.historicalRollbackAvailable !== false
    || !exactKeys(bundle.secrets, RECOVERY_SECRETS)
    || !exactKeys(bundle.variables, [RECOVERY_PUBLIC_VARIABLE])) stop('bundle-shape');
  const { state: _state, historicalRollbackAvailable: _historical, ...source } = bundle.provenance;
  prepareRecoveryBundle({ ...bundle.secrets, ...bundle.variables }, source);
  return bundle;
}
