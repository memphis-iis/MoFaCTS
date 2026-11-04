import crypto from 'node:crypto';
import { assertUniqueSemanticProbeIds } from './authentication-probes.mjs';
import { parseCiEvidenceJson } from './qualification/ciEvidence.mjs';

export const RECOVERY_SECRETS = Object.freeze([
  'AUDIT_AUTH_FIXTURES_JSON', 'AUDIT_IMAPS_PASSWORD', 'AUDIT_REPORT_INGEST_SECRET',
  'AUDIT_SSH_HOST', 'AUDIT_SSH_USER', 'AUDIT_SSH_PRIVATE_KEY', 'AUDIT_SSH_KNOWN_HOSTS',
  'TS_OAUTH_CLIENT_ID', 'TS_OAUTH_SECRET',
]);
export const RECOVERY_PUBLIC_VARIABLE = 'AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY';
export const BASELINE_LABEL = 'MOFACTS_RECOVERY_BASELINE';
const repository = 'memphis-iis/MoFaCTS';
const environment = 'production-security-audit';
const region = 'us-east-2';
const roleName = 'mofacts-recovery-transfer';
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
  if (!sshKey.startsWith(`-----BEGIN ${sshKeyType}-----\n`)
    || !sshKey.endsWith(`\n-----END ${sshKeyType}-----\n`) || sshKey.includes('\r')) stop('ssh-key-format');
  const pem = bindings[RECOVERY_PUBLIC_VARIABLE];
  if (!pem.trim().startsWith('-----BEGIN PUBLIC KEY-----') || pem.includes('PRIVATE KEY')) stop('report-public-key');
  try {
    const key = crypto.createPublicKey(pem);
    if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 3072) stop('report-public-key');
  } catch { stop('report-public-key'); }
  return { serialized, bytes, source: bundle.provenance };
}

export function validateRecoveryTarget(target) {
  if (!exactKeys(target, ['accountId', 'roleArn', 'secretArn']) || !/^[0-9]{12}$/.test(target.accountId)
    || target.roleArn !== `arn:aws:iam::${target.accountId}:role/${roleName}`
    || !new RegExp(`^arn:aws:secretsmanager:${region}:${target.accountId}:secret:mofacts/security-audit/recovery-[A-Za-z0-9]{6}$`).test(target.secretArn)) stop('destination');
  return target;
}

function checkDescription(description, target) {
  if (description?.ARN !== target.secretArn || description.Name !== 'mofacts/security-audit/recovery'
    || Object.hasOwn(description, 'DeletedDate') || description.RotationEnabled === true
    || (description.RotationEnabled != null && typeof description.RotationEnabled !== 'boolean')
    || (description.ReplicationStatus !== undefined
      && (!Array.isArray(description.ReplicationStatus) || description.ReplicationStatus.length !== 0))
    // The approved empty secret omits KmsKeyId, selecting aws/secretsmanager.
    // A custom or explicitly configured key needs its own review.
    || description.KmsKeyId !== undefined
    || (description.VersionIdsToStages !== undefined && !object(description.VersionIdsToStages))) stop('secret-configuration');
}

async function checkVersions(aws, target, versionId) {
  // DescribeSecret omits deprecated/unlabelled versions. One bounded page is
  // sufficient: anything beyond the expected zero/one versions is a refusal.
  const result = await aws('secretsmanager', 'list-secret-version-ids', {
    SecretId: target.secretArn, IncludeDeprecated: true, MaxResults: 2,
  });
  if (result?.ARN !== target.secretArn || result.Name !== 'mofacts/security-audit/recovery'
    || !Array.isArray(result.Versions) || result.NextToken !== undefined
    || result.Versions.length !== (versionId ? 1 : 0)
    || (versionId && result.Versions[0]?.VersionId !== versionId)) stop('secret-versions');
}

// Bootstrap only: never replaces an existing version. On an ambiguous write or
// read-back failure stop for explicit reconciliation; do not delete or retry.
export async function transferRecoveryBaseline({ bindings, source, target, aws }) {
  validateRecoveryTarget(target);
  const prepared = prepareRecoveryBundle(bindings, source);
  const identity = await aws('sts', 'get-caller-identity', {});
  if (identity?.Account !== target.accountId
    || identity.Arn !== `arn:aws:sts::${target.accountId}:assumed-role/${roleName}/mofacts-recovery-${source.runId}`) stop('aws-identity');
  const before = await aws('secretsmanager', 'describe-secret', { SecretId: target.secretArn });
  checkDescription(before, target);
  // DescribeSecret can omit an empty version map; it never implies ownership.
  if (Object.keys(before.VersionIdsToStages ?? {}).length !== 0) stop('secret-not-empty');
  await checkVersions(aws, target);
  const versionId = crypto.createHash('sha256')
    .update(`${repository}\0${source.commit}\0${source.runId}\0${source.runAttempt}`).digest('hex');
  const stages = ['AWSCURRENT', BASELINE_LABEL];
  const written = await aws('secretsmanager', 'put-secret-value', {
    SecretId: target.secretArn, ClientRequestToken: versionId,
    // AWS adds AWSCURRENT for the first version. Do not request moving it from
    // a concurrently written version; that situation must fail read-back.
    VersionStages: [BASELINE_LABEL], SecretString: prepared.serialized,
  });
  if (written?.ARN !== target.secretArn || written.VersionId !== versionId) stop('write-response');
  const read = await aws('secretsmanager', 'get-secret-value', {
    SecretId: target.secretArn, VersionId: versionId, VersionStage: BASELINE_LABEL,
  });
  if (read?.ARN !== target.secretArn || read.VersionId !== versionId
    || read.SecretString !== prepared.serialized || read.SecretBinary !== undefined
    || !Array.isArray(read.VersionStages) || stages.some(stage => !read.VersionStages.includes(stage))) stop('read-back');
  const after = await aws('secretsmanager', 'describe-secret', { SecretId: target.secretArn });
  checkDescription(after, target);
  if (!object(after.VersionIdsToStages) || Object.keys(after.VersionIdsToStages).length !== 1
    || !Array.isArray(after.VersionIdsToStages[versionId])
    || after.VersionIdsToStages[versionId].length !== stages.length
    || stages.some(stage => !after.VersionIdsToStages[versionId].includes(stage))) stop('version-labels');
  await checkVersions(aws, target, versionId);
  return {
    state: 'recovery-baseline-transferred-unqualified', versionId, bytes: prepared.bytes,
    secretBindings: RECOVERY_SECRETS.length, publicBindings: 1, historicalRollbackAvailable: false,
  };
}
