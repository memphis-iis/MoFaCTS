import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { parseBuildIdentity } from '../../../common/securityAudit/buildIdentity.ts';
import { contentDigest, imageDigest, proofRecord, proofString } from '../../../common/securityAudit/proofFields.ts';
import meteorEvidence from '../../meteorTestEvidence.cjs';
import { parseCiEvidenceJson } from './ciEvidence.mjs';
import { observeMeteorCaseEvidence } from './meteorCaseEvidence.mjs';

const { MAX_BYTES, validateRun } = meteorEvidence;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const timestamp = value => {
  const iso = proofString(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, 20);
  if (new Date(iso).toISOString() !== iso.replace('Z', '.000Z')) throw Error('Invalid native receipt timestamp');
  return iso;
};

function parseTestInputs(value) {
  const row = proofRecord(value, ['state', 'identity', 'testInputContractDigestSha256', 'supplementalDigestSha256']);
  const identity = parseBuildIdentity(row.identity);
  if (row.state !== 'test-inputs-verified-unqualified' || identity.includedUncommittedLocalChanges) {
    throw Error('Native receipt requires verified clean test inputs');
  }
  return { identity, state: row.state, testInputContractDigestSha256: contentDigest(row.testInputContractDigestSha256),
    supplementalDigestSha256: contentDigest(row.supplementalDigestSha256) };
}

// The receipt digest comes from retained operator evidence. The expected test
// inputs come from capture verification for the source being built.
export async function bindNativeCaseEvidence(input, requestedIds) {
  const { receiptBytes, runBytes, startupRegistryBytes, expectedReceiptSha256, expectedTestInputs, expectedModules } = input;
  const decoded = parseCiEvidenceJson(receiptBytes, 16384);
  const receipt = proofRecord(decoded, [
    'schema', 'qualification', 'provider', 'sourceObservation', 'toolImageId', 'mongoImageId',
    'runEvidenceDigestSha256', 'toolSourceManifestDigestSha256', 'isolation', 'startedAt',
    'finishedAt', 'environments', 'limits',
    ...(decoded && Object.hasOwn(decoded, 'startupRegistryDigestSha256') ? ['startupRegistryDigestSha256'] : []),
  ]);
  if (sha256(receiptBytes) !== contentDigest(expectedReceiptSha256) ||
      receipt.schema !== 'NativeMeteorVerificationV1' || receipt.qualification !== 'unqualified' ||
      receipt.provider !== 'operator-linux-docker') throw Error('Native receipt identity mismatch');
  if (!isDeepStrictEqual(parseTestInputs(receipt.sourceObservation), parseTestInputs(expectedTestInputs))) {
    throw Error('Native receipt test inputs differ from the requested source');
  }
  imageDigest(receipt.toolImageId);
  imageDigest(receipt.mongoImageId);
  contentDigest(receipt.toolSourceManifestDigestSha256);
  if (Object.hasOwn(receipt, 'startupRegistryDigestSha256')) contentDigest(receipt.startupRegistryDigestSha256);
  if (startupRegistryBytes !== undefined && (!Buffer.isBuffer(startupRegistryBytes) ||
    sha256(startupRegistryBytes) !== receipt.startupRegistryDigestSha256)) throw Error('Native startup registry does not match the retained receipt');
  if (timestamp(receipt.finishedAt) < timestamp(receipt.startedAt) ||
      !isDeepStrictEqual(receipt.limits, { workerMemoryMiB: 6144, mongoMemoryMiB: 384, workerCpus: 2, mongoCpus: 0.25 }) ||
      !isDeepStrictEqual(receipt.isolation, { schema: 'NativeIntegrationIsolationV1', dockerSocketAbsent: true,
        workerUid: 2000, effectiveCapabilitiesZero: true, readOnlyMountsVerified: 2,
        readOnlyFileOperationsRefused: 4, testCopyWritable: true })) {
    throw Error('Native receipt did not verify the approved execution environment');
  }

  const runDigest = contentDigest(receipt.runEvidenceDigestSha256);
  if (!Buffer.isBuffer(runBytes) || runBytes.length > MAX_BYTES * 2 || sha256(runBytes) !== runDigest) {
    throw Error('Native receipt does not match retained run bytes');
  }
  const run = validateRun(parseCiEvidenceJson(runBytes, MAX_BYTES * 2), expectedModules);
  const summary = run.environments.map(({ side, modules, counts, hookFailures }) =>
    ({ side, moduleCount: modules.length, counts, hookFailures }));
  if (!isDeepStrictEqual(receipt.environments, summary)) throw Error('Native receipt outcome differs from the retained run');
  return observeMeteorCaseEvidence(runBytes, expectedModules, runDigest, requestedIds);
}
