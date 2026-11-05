import crypto from 'node:crypto';
import { RecoveryTransferError } from '../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { BASELINE_LABEL, observeRecoveryPhases as observe, settleRecoveryPhase, validateRecoveryStoreTarget } from './store.mjs';
import { validateRestoreExpected } from './restore.mjs';
import { validateRecoveredPayload, encryptedDocumentDigest } from './payload.mjs';
const fail = category => { throw new RecoveryTransferError(category); };
export const CANDIDATE_LABEL = 'MOFACTS_RECOVERY_CANDIDATE';
export const validateRetentionTarget = target => validateRecoveryStoreTarget(target, 'mofacts-recovery-rehearsal');

export function retentionVersionId(source) {
  if (!/^[a-f0-9]{40}$/.test(source?.commit ?? '')
    || !['runId', 'runAttempt'].every(key => typeof source[key] === 'string' && /^[1-9][0-9]*$/.test(source[key]))) fail('runner-context');
  return crypto.createHash('sha256').update(`memphis-iis/MoFaCTS\0retention\0${source.commit}\0${source.runId}\0${source.runAttempt}`).digest('hex');
}

function phases(baseline, candidate) {
  return {
    initial: { [baseline]: ['AWSCURRENT', BASELINE_LABEL] },
    prepared: { [baseline]: ['AWSCURRENT', BASELINE_LABEL], [candidate]: [CANDIDATE_LABEL] },
    moved: { [baseline]: ['AWSPREVIOUS', BASELINE_LABEL], [candidate]: ['AWSCURRENT', CANDIDATE_LABEL] },
    restored: { [baseline]: ['AWSCURRENT', BASELINE_LABEL], [candidate]: ['AWSPREVIOUS', CANDIDATE_LABEL] },
    final: { [baseline]: ['AWSCURRENT', BASELINE_LABEL], [candidate]: ['AWSPREVIOUS'] },
    retired: { [baseline]: ['AWSCURRENT', BASELINE_LABEL], [candidate]: [] },
  };
}


async function requirePhase(aws, target, states, phase) {
  if (await observe(aws, target, states) !== phase) fail('version-labels');
}

async function readVersion(aws, target, expected, id, labels, stage) {
  const read = await aws('secretsmanager', 'get-secret-value', {
    SecretId: target.secretArn, VersionId: id, VersionStage: stage,
  });
  const bundle = validateRecoveredPayload(read, target, expected, id, labels);
  return { serialized: read.SecretString, bundle };
}

function checkUpdate(result, target) {
  if (result?.ARN !== target.secretArn || result.Name !== 'mofacts/security-audit/recovery') fail('write-back');
}

// Owner: this bounded transaction. Settle the last attempted write's target
// before choosing compensation. Source-only cached metadata never proves that
// an uncertain write did not happen. Every compensation is attempted once.
async function restoreCurrent(aws, target, baselineId, candidateId, requiredPhase, settle) {
  let failed = false;
  let phase;
  if (requiredPhase === 'moved') {
    await settle('prepared', 'moved');
    try {
      checkUpdate(await aws('secretsmanager', 'update-secret-version-stage', {
        SecretId: target.secretArn, VersionStage: 'AWSCURRENT',
        MoveToVersionId: baselineId, RemoveFromVersionId: candidateId,
      }), target);
    } catch { failed = true; }
    phase = await settle('moved', 'restored');
  } else {
    phase = await settle('initial', 'prepared');
  }
  const finalPhase = phase === 'prepared' ? 'retired' : 'final';
  try {
    checkUpdate(await aws('secretsmanager', 'update-secret-version-stage', {
      SecretId: target.secretArn, VersionStage: CANDIDATE_LABEL, RemoveFromVersionId: candidateId,
    }), target);
  } catch { failed = true; }
  await settle(phase, finalPhase);
  return { failed, phase: finalPhase };
}

export async function rehearseRecoveryRetention({ target, expected, source, aws, settlePause }) {
  validateRetentionTarget(target); validateRestoreExpected(expected);
  const candidateId = retentionVersionId(source);
  if (candidateId === expected.versionId) fail('baseline-identity');
  const identity = await aws('sts', 'get-caller-identity', {});
  if (identity?.Account !== target.accountId
    || identity.Arn !== `arn:aws:sts::${target.accountId}:assumed-role/mofacts-recovery-rehearsal/mofacts-retention-${source.runId}`) fail('aws-identity');
  const states = phases(expected.versionId, candidateId);
  await requirePhase(aws, target, states, 'initial');
  const original = await readVersion(aws, target, expected, expected.versionId, states.initial[expected.versionId], BASELINE_LABEL);
  const documentDigestCiphertext = encryptedDocumentDigest(original.serialized, original.bundle);
  await requirePhase(aws, target, states, 'initial');
  let failureCategory = null;
  let reconciliationFailureCategory = null;
  let lastVerifiedPhase = 'initial';
  let requiredPhase = 'prepared';
  const settle = async (from, to) => {
    lastVerifiedPhase = await settleRecoveryPhase(aws, target, states, from, to, { pause: settlePause });
    return lastVerifiedPhase;
  };
  let recoveredBoth = false;
  try {
    const written = await aws('secretsmanager', 'put-secret-value', {
      SecretId: target.secretArn, ClientRequestToken: candidateId,
      SecretString: original.serialized, VersionStages: [CANDIDATE_LABEL],
    });
    if (written?.ARN !== target.secretArn || written.VersionId !== candidateId) fail('write-back');
    await settle('initial', 'prepared');
    const candidate = await readVersion(aws, target, expected, candidateId, states.prepared[candidateId], CANDIDATE_LABEL);
    if (candidate.serialized !== original.serialized) fail('read-back');
    await settle('initial', 'prepared');
    requiredPhase = 'moved';
    checkUpdate(await aws('secretsmanager', 'update-secret-version-stage', {
      SecretId: target.secretArn, VersionStage: 'AWSCURRENT',
      MoveToVersionId: candidateId, RemoveFromVersionId: expected.versionId,
    }), target);
    await settle('prepared', 'moved');
    for (const [id, stage] of [[expected.versionId, BASELINE_LABEL], [candidateId, 'AWSCURRENT']]) {
      const recovered = await readVersion(aws, target, expected, id, states.moved[id], stage);
      if (recovered.serialized !== original.serialized) fail('read-back');
    }
    await settle('prepared', 'moved');
    recoveredBoth = true;
  } catch (error) {
    failureCategory = error instanceof RecoveryTransferError ? error.category : 'unexpected';
  }
  let reconciled;
  try {
    reconciled = await restoreCurrent(aws, target, expected.versionId, candidateId, requiredPhase, settle);
    if (reconciled.failed) failureCategory ??= 'compensation-response';
  } catch (error) {
    reconciliationFailureCategory = error instanceof RecoveryTransferError ? error.category : 'unexpected';
    failureCategory ??= 'reconciliation-required';
  }
  const restored = Boolean(reconciled);
  const success = restored && reconciled.phase === 'final' && recoveredBoth && !failureCategory;
  return {
    state: success ? 'recovery-retention-verified-unqualified'
      : restored ? 'recovery-retention-failed-restored' : 'recovery-retention-reconciliation-required',
    failureCategory, reconciliationFailureCategory, lastVerifiedPhase, baselineVersionId: expected.versionId, candidateVersionId: candidateId,
    bytes: expected.bytes, recoveredBoth, baselineCurrentRestored: restored,
    baselinePinPreserved: restored, candidateMarkerRetired: restored,
    candidateRetained: restored ? true : null,
    digestEncryption: 'RSA-OAEP-SHA256', documentDigestCiphertext,
    historicalRollbackAvailable: false,
  };
}
