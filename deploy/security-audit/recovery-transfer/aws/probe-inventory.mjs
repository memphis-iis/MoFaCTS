import { RecoveryTransferError } from '../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { legacyProbeInventory } from '../../../../mofacts/scripts/security-audit/verification/legacyProbeInventory.mjs';
import { validateRestoreTarget, validateRestoreExpected } from './restore.mjs';
import { validateConfirmationCandidate } from './confirm.mjs';
import { BASELINE_LABEL, observeRecoveryPhases } from './store.mjs';
import { validateRecoveredPayload, encryptedDocumentDigest } from './payload.mjs';

const fail = category => { throw new RecoveryTransferError(category); };

// One existing baseline version, in memory. No restore, writes, label changes,
// provider/application requests or new verification intent is produced here.
export async function inspectRecoveryProbeInventory({ target, expected, candidateId, runId, aws, manifest }) {
  validateRestoreTarget(target); validateRestoreExpected(expected); validateConfirmationCandidate(candidateId, expected);
  if (typeof runId !== 'string' || !/^[1-9][0-9]*$/.test(runId)) fail('runner-context');
  const identity = await aws('sts', 'get-caller-identity', {});
  if (identity?.Account !== target.accountId
    || identity.Arn !== `arn:aws:sts::${target.accountId}:assumed-role/mofacts-recovery-restore/mofacts-inventory-${runId}`) fail('aws-identity');
  const versions = { [expected.versionId]: ['AWSCURRENT', BASELINE_LABEL], [candidateId]: ['AWSPREVIOUS'] };
  const check = () => observeRecoveryPhases(aws, target, { confirmed: versions });
  await check();
  const read = await aws('secretsmanager', 'get-secret-value', {
    SecretId: target.secretArn, VersionId: expected.versionId, VersionStage: BASELINE_LABEL,
  });
  const bundle = validateRecoveredPayload(read, target, expected, expected.versionId, versions[expected.versionId]);
  let inventory;
  try { inventory = legacyProbeInventory(Buffer.from(bundle.secrets.AUDIT_AUTH_FIXTURES_JSON), manifest); }
  catch { fail('probe-inventory'); }
  await check();
  return { state: 'recovery-authentication-probe-inventory-unqualified', versionId: expected.versionId,
    bytes: expected.bytes, finalLabelsVerified: true, inventory,
    digestEncryption: 'RSA-OAEP-SHA256', documentDigestCiphertext: encryptedDocumentDigest(read.SecretString, bundle) };
}
