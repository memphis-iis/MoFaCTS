import crypto from 'node:crypto';
import { RECOVERY_PUBLIC_VARIABLE, RecoveryTransferError, parseRecoveryBundle, prepareRecoveryBundle } from '../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
const fail = category => { throw new RecoveryTransferError(category); };

export const exactLabels = (actual, expected) => Array.isArray(actual)
  && actual.length === expected.length && new Set(actual).size === actual.length
  && expected.every(label => actual.includes(label));

export function validateRecoveredPayload(read, target, expected, versionId, labels) {
  if (read?.ARN !== target.secretArn || read.VersionId !== versionId
    || typeof read.SecretString !== 'string' || read.SecretBinary !== undefined
    || !exactLabels(read.VersionStages, labels) || Buffer.byteLength(read.SecretString, 'utf8') !== expected.bytes) fail('read-back');
  const bundle = parseRecoveryBundle(read.SecretString);
  for (const key of ['commit', 'runId', 'runAttempt']) {
    if (bundle.provenance[key] !== expected[key]) fail('baseline-identity');
  }
  const { state: _state, historicalRollbackAvailable: _history, ...source } = bundle.provenance;
  const original = prepareRecoveryBundle({ ...bundle.secrets, ...bundle.variables }, source);
  if (original.serialized !== read.SecretString) fail('read-back');
  return bundle;
}

export function encryptedDocumentDigest(serialized, bundle) {
  const documentDigest = crypto.createHash('sha256').update(serialized).digest('hex');
  return crypto.publicEncrypt({ key: bundle.variables[RECOVERY_PUBLIC_VARIABLE],
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256',
  }, Buffer.from(documentDigest, 'ascii')).toString('base64');
}
