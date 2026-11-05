import { RECOVERY_SECRETS, RecoveryTransferError } from '../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { BASELINE_LABEL, observeRecoveryPhases } from './store.mjs';
import { validateRestoreExpected, validateRestoreTarget } from './restore.mjs';
import { validateRecoveredPayload, encryptedDocumentDigest } from './payload.mjs';
const fail = category => { throw new RecoveryTransferError(category); };

export function validateConfirmationCandidate(candidateId, expected) {
  if (typeof candidateId !== 'string' || !/^[a-f0-9]{64}$/.test(candidateId)
    || candidateId === expected.versionId) fail('candidate-identity');
  return candidateId;
}

// The settled final state only. No version creation, label edits or retries.
// Trust coordinates come from the separately retained transfer/rehearsal receipts.
export async function confirmRecoveryVersions({ target, expected, candidateId, runId, aws }) {
  validateRestoreTarget(target); validateRestoreExpected(expected);
  validateConfirmationCandidate(candidateId, expected);
  if (typeof runId !== 'string' || !/^[1-9][0-9]*$/.test(runId)) fail('runner-context');
  const identity = await aws('sts', 'get-caller-identity', {});
  if (identity?.Account !== target.accountId
    || identity.Arn !== `arn:aws:sts::${target.accountId}:assumed-role/mofacts-recovery-restore/mofacts-confirm-${runId}`) fail('aws-identity');
  const versions = { [expected.versionId]: ['AWSCURRENT', BASELINE_LABEL], [candidateId]: ['AWSPREVIOUS'] };
  const check = () => observeRecoveryPhases(aws, target, { confirmed: versions });
  await check();
  const reads = [];
  let originalBundle;
  for (const [id, stage] of [[expected.versionId, BASELINE_LABEL], [candidateId, 'AWSPREVIOUS']]) {
    const read = await aws('secretsmanager', 'get-secret-value', {
      SecretId: target.secretArn, VersionId: id, VersionStage: stage,
    });
    const bundle = validateRecoveredPayload(read, target, expected, id, versions[id]);
    originalBundle ??= bundle;
    reads.push(read.SecretString);
  }
  if (reads[0] !== reads[1]) fail('read-back');
  await check();
  return {
    state: 'recovery-existing-versions-confirmed-unqualified',
    baselineVersionId: expected.versionId, candidateVersionId: candidateId,
    bytes: expected.bytes, recoveredBoth: true, bytesEqual: true, finalLabelsVerified: true,
    secretBindings: RECOVERY_SECRETS.length, publicBindings: 1,
    digestEncryption: 'RSA-OAEP-SHA256', documentDigestCiphertext: encryptedDocumentDigest(reads[0], originalBundle),
    historicalRollbackAvailable: false,
  };
}
