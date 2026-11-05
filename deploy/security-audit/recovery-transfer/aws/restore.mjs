import { RECOVERY_SECRETS, RecoveryTransferError } from '../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { BASELINE_LABEL, checkDescription, checkVersions, recoveryVersionId, validateRecoveryStoreTarget } from './store.mjs';
import { exactLabels as matchesLabels, validateRecoveredPayload, encryptedDocumentDigest } from './payload.mjs';
const fail = category => { throw new RecoveryTransferError(category); };
const labels = ['AWSCURRENT', BASELINE_LABEL];

export function validateRestoreExpected(expected) {
  const keys = ['commit', 'runId', 'runAttempt', 'versionId', 'bytes'];
  if (!expected || Object.keys(expected).length !== keys.length || !keys.every(key => Object.hasOwn(expected, key))
    || !/^[a-f0-9]{40}$/.test(expected.commit) || typeof expected.commit !== 'string'
    || !['runId', 'runAttempt'].every(key => typeof expected[key] === 'string' && /^[1-9][0-9]*$/.test(expected[key]))
    || !Number.isSafeInteger(expected.bytes) || expected.bytes < 1 || expected.bytes > 65536
    || expected.versionId !== recoveryVersionId(expected)) fail('baseline-identity');
  return expected;
}

export const validateRestoreTarget = target => validateRecoveryStoreTarget(target, 'mofacts-recovery-restore');

const exactLabels = actual => matchesLabels(actual, labels);

async function describeBaseline(aws, target, expected) {
  const description = await aws('secretsmanager', 'describe-secret', { SecretId: target.secretArn });
  checkDescription(description, target);
  const versions = description.VersionIdsToStages;
  if (!versions || Object.keys(versions).length !== 1 || !exactLabels(versions[expected.versionId])) fail('version-labels');
  await checkVersions(aws, target, expected.versionId);
}

// Cold read only: no GitHub deployment bindings, writes, labels or target logins.
export async function restoreRecoveryBaseline({ target, expected, runId, aws }) {
  validateRestoreTarget(target); validateRestoreExpected(expected);
  if (typeof runId !== 'string' || !/^[1-9][0-9]*$/.test(runId)) fail('runner-context');
  const identity = await aws('sts', 'get-caller-identity', {});
  if (identity?.Account !== target.accountId
    || identity.Arn !== `arn:aws:sts::${target.accountId}:assumed-role/mofacts-recovery-restore/mofacts-restore-${runId}`) fail('aws-identity');
  await describeBaseline(aws, target, expected);
  const read = await aws('secretsmanager', 'get-secret-value', {
    SecretId: target.secretArn, VersionId: expected.versionId, VersionStage: BASELINE_LABEL,
  });
  const bundle = validateRecoveredPayload(read, target, expected, expected.versionId, labels);
  await describeBaseline(aws, target, expected);
  const documentDigestCiphertext = encryptedDocumentDigest(read.SecretString, bundle);
  return {
    state: 'recovery-baseline-cold-read-unqualified', versionId: expected.versionId,
    bytes: expected.bytes, digestEncryption: 'RSA-OAEP-SHA256', documentDigestCiphertext,
    secretBindings: RECOVERY_SECRETS.length, publicBindings: 1, historicalRollbackAvailable: false,
  };
}
