import { RECOVERY_SECRETS, RecoveryTransferError, prepareRecoveryBundle } from '../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { BASELINE_LABEL, checkDescription, checkVersions, recoveryVersionId, validateRecoveryStoreTarget } from './store.mjs';
export { BASELINE_LABEL } from './store.mjs';
const stop = category => { throw new RecoveryTransferError(category); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const roleName = 'mofacts-recovery-transfer';
export const validateRecoveryTarget = target => validateRecoveryStoreTarget(target, roleName);

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
  const versionId = recoveryVersionId(source);
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
