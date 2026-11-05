import crypto from 'node:crypto';
import { RecoveryTransferError } from '../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';

export const BASELINE_LABEL = 'MOFACTS_RECOVERY_BASELINE';
const region = 'us-east-2';
const stop = category => { throw new RecoveryTransferError(category); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => object(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

export function validateRecoveryStoreTarget(target, roleName) {
  if (!['mofacts-recovery-transfer', 'mofacts-recovery-restore'].includes(roleName)
    || !exactKeys(target, ['accountId', 'roleArn', 'secretArn']) || !/^[0-9]{12}$/.test(target.accountId)
    || target.roleArn !== `arn:aws:iam::${target.accountId}:role/${roleName}`
    || !new RegExp(`^arn:aws:secretsmanager:${region}:${target.accountId}:secret:mofacts/security-audit/recovery-[A-Za-z0-9]{6}$`).test(target.secretArn)) stop('destination');
  return target;
}

export function checkDescription(description, target) {
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

export async function checkVersions(aws, target, versionId) {
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

export function recoveryVersionId(source) {
  return crypto.createHash('sha256')
    .update(`memphis-iis/MoFaCTS\0${source.commit}\0${source.runId}\0${source.runAttempt}`).digest('hex');
}
