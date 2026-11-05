import crypto from 'node:crypto';
import { RECOVERY_SECRETS, RecoveryTransferError, prepareRecoveryBundle } from '../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';

export const BASELINE_LABEL = 'MOFACTS_RECOVERY_BASELINE';
const repository = 'memphis-iis/MoFaCTS';
const region = 'us-east-2';
const roleName = 'mofacts-recovery-transfer';
const stop = category => { throw new RecoveryTransferError(category); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => object(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

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
