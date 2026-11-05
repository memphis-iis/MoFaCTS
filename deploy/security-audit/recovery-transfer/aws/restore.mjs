import crypto from 'node:crypto';
import { RECOVERY_PUBLIC_VARIABLE, RECOVERY_SECRETS, RecoveryTransferError, parseRecoveryBundle, prepareRecoveryBundle } from '../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { BASELINE_LABEL, checkDescription, checkVersions, recoveryVersionId, validateRecoveryStoreTarget } from './store.mjs';
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

function exactLabels(actual) {
  return Array.isArray(actual) && actual.length === labels.length && labels.every(label => actual.includes(label));
}

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
  if (read?.ARN !== target.secretArn || read.VersionId !== expected.versionId
    || typeof read.SecretString !== 'string' || read.SecretBinary !== undefined
    || !exactLabels(read.VersionStages) || Buffer.byteLength(read.SecretString, 'utf8') !== expected.bytes) fail('read-back');
  const bundle = parseRecoveryBundle(read.SecretString);
  for (const key of ['commit', 'runId', 'runAttempt']) {
    if (bundle.provenance[key] !== expected[key]) fail('baseline-identity');
  }
  const { state: _state, historicalRollbackAvailable: _history, ...source } = bundle.provenance;
  const original = prepareRecoveryBundle({ ...bundle.secrets, ...bundle.variables }, source);
  if (original.serialized !== read.SecretString) fail('read-back');
  await describeBaseline(aws, target, expected);
  // Public Actions logs may retain only an encrypted digest, never its plaintext.
  // The 64-byte ASCII digest fits RSA-OAEP with the already validated >=3072-bit key.
  const documentDigest = crypto.createHash('sha256').update(read.SecretString).digest('hex');
  const documentDigestCiphertext = crypto.publicEncrypt({
    key: bundle.variables[RECOVERY_PUBLIC_VARIABLE],
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256',
  }, Buffer.from(documentDigest, 'ascii')).toString('base64');
  return {
    state: 'recovery-baseline-cold-read-unqualified', versionId: expected.versionId,
    bytes: expected.bytes, digestEncryption: 'RSA-OAEP-SHA256', documentDigestCiphertext,
    secretBindings: RECOVERY_SECRETS.length, publicBindings: 1, historicalRollbackAvailable: false,
  };
}
