import { parseBuildIdentity, type BuildIdentityV1 } from './buildIdentity.ts';
import { contentDigest, imageDigest, proofBoolean, proofRecord, proofString, sourceCommit } from './proofFields.ts';
import { parsePublishedImage } from './releaseReceipt.mjs';

// Draft extension of the existing workstation record, not a new release file.
// Native proof acquisition and runtime enforcement remain separate. Opt-in
// storage/projection tooling lives under scripts/security-audit/qualification.
export const RELEASE_PROOF_COMMANDS = ['build', 'smoke', 'push', 'deploy', 'verify'] as const;
type CommandName = typeof RELEASE_PROOF_COMMANDS[number];
export type CommandObservation =
  | { state: 'completed'; exitCode: number }
  | { state: 'unavailable'; reason: 'not-run' | 'spawn-failed' | 'timed-out' };

export type ImageObservation = { configDigest: string; platform: string };
type PublishedImage = ReturnType<typeof parsePublishedImage>;
type SourceVerification =
  | { state: 'observed'; sourceSnapshotDigestSha256: string; result: 'PASS' | 'FAIL' | 'ERROR' }
  | { state: 'unavailable' };

export type ReleaseQualificationV1 = {
  schema: 'ReleaseQualificationV1';
  buildIdentity: BuildIdentityV1;
  sourceVerification: SourceVerification;
  builtImage: ImageObservation;
  publishedImage: PublishedImage;
  runningImage: ImageObservation & { baseCommit: string };
  commands: Record<CommandName, CommandObservation>;
};

// References retain acquired observations without inventing the still-missing
// workstation image tuple. CI test-image observations remain a separate lane.
export type ReleaseIdentityTuple = Omit<ReleaseQualificationV1, 'schema' | 'buildIdentity'>;
export type ReleaseQualificationV2 = {
  schema: 'ReleaseQualificationV2';
  state: 'unqualified';
  buildIdentity: BuildIdentityV1;
  evidenceReferences: {
    sourceAcquisitionDigestSha256: string;
    ciImageObservationDigestSha256?: string;
    // Acquisition bytes locate the retained provenance bundle; observation
    // bytes identify its exact image statement. Neither digest authenticates it.
    ciImageAcquisitionDigestSha256?: string;
  };
  releaseIdentity?: ReleaseIdentityTuple;
};

export type ReleaseQualification = ReleaseQualificationV1 | ReleaseQualificationV2;
export type ReleaseRecordProofState = 'unavailable' | 'incomplete-unqualified' | 'consistent-unqualified';

export type WorkstationReleaseRecord = {
  deployedAtUtc: string;
  baseCommit: string;
  includedUncommittedLocalChanges: boolean;
  image: string;
  tag: string;
  // Keep the existing registry digest: it may identify an index or a manifest.
  digest: string;
  // Current command-sheet fields; historical six-field records omit both.
  imageId?: string;
  acceptance?: 'operator-confirmed readiness and participant smoke checks';
  qualification?: ReleaseQualification;
};

export type ReleaseIdentityResult =
  | { status: 'PASS' }
  | { status: 'ERROR'; reason:
    'proof-unavailable' | 'malformed-proof' | 'command-unavailable' | 'command-failed'
    | 'source-unverified' | 'source-mismatch' | 'image-mismatch' };

const platform = (value: unknown): string => proofString(value, /^[a-z0-9]+\/[a-z0-9]+(?:\/v[0-9]+)?$/, 40);

function parseCommand(value: unknown): CommandObservation {
  if (value && typeof value === 'object' && 'state' in value && value.state === 'completed') {
    const record = proofRecord(value, ['state', 'exitCode']);
    if (typeof record.exitCode !== 'number' || !Number.isSafeInteger(record.exitCode)
      || record.exitCode < -2147483648 || record.exitCode > 2147483647) {
      throw new Error('Invalid command exit code');
    }
    return { state: 'completed', exitCode: record.exitCode };
  }
  const record = proofRecord(value, ['state', 'reason']);
  if (record.state !== 'unavailable' || typeof record.reason !== 'string'
    || !['not-run', 'spawn-failed', 'timed-out'].includes(record.reason)) {
    throw new Error('Invalid unavailable command observation');
  }
  return { state: 'unavailable', reason: record.reason as 'not-run' | 'spawn-failed' | 'timed-out' };
}

function parseSourceVerification(value: unknown): SourceVerification {
  if (value && typeof value === 'object' && 'state' in value && value.state === 'unavailable') {
    proofRecord(value, ['state']);
    return { state: 'unavailable' };
  }
  const record = proofRecord(value, ['state', 'sourceSnapshotDigestSha256', 'result']);
  if (record.state !== 'observed' || typeof record.result !== 'string' || !['PASS', 'FAIL', 'ERROR'].includes(record.result)) {
    throw new Error('Invalid source verification observation');
  }
  return {
    state: 'observed',
    sourceSnapshotDigestSha256: contentDigest(record.sourceSnapshotDigestSha256),
    result: record.result as 'PASS' | 'FAIL' | 'ERROR',
  };
}

export function parseImageObservation(value: unknown): ImageObservation {
  const record = proofRecord(value, ['configDigest', 'platform']);
  return { configDigest: imageDigest(record.configDigest), platform: platform(record.platform) };
}

export function parseRunningImageObservation(value: unknown): ImageObservation & { baseCommit: string } {
  const record = proofRecord(value, ['configDigest', 'platform', 'baseCommit']);
  return { configDigest: imageDigest(record.configDigest), platform: platform(record.platform), baseCommit: sourceCommit(record.baseCommit) };
}

function parseReleaseIdentityTuple(value: unknown): ReleaseIdentityTuple {
  const record = proofRecord(value, ['sourceVerification', 'builtImage', 'publishedImage', 'runningImage', 'commands']);
  const publishedImage = parsePublishedImage(record.publishedImage);
  const commandRecord = proofRecord(record.commands, RELEASE_PROOF_COMMANDS);
  const commands = Object.fromEntries(
    RELEASE_PROOF_COMMANDS.map((name) => [name, parseCommand(commandRecord[name])]),
  ) as Record<CommandName, CommandObservation>;
  return {
    sourceVerification: parseSourceVerification(record.sourceVerification),
    builtImage: parseImageObservation(record.builtImage),
    publishedImage,
    runningImage: parseRunningImageObservation(record.runningImage),
    commands,
  };
}

export function parseReleaseQualification(value: unknown): ReleaseQualification {
  if (value && typeof value === 'object' && 'schema' in value && value.schema === 'ReleaseQualificationV2') {
    const hasIdentity = Object.hasOwn(value, 'releaseIdentity');
    const keys = ['schema', 'state', 'buildIdentity', 'evidenceReferences'];
    if (hasIdentity) keys.push('releaseIdentity');
    const record = proofRecord(value, keys);
    if (record.state !== 'unqualified') throw new Error('Invalid release qualification state');
    const referenceKeys = ['sourceAcquisitionDigestSha256'];
    const hasCiImage = Boolean(record.evidenceReferences && typeof record.evidenceReferences === 'object'
      && Object.hasOwn(record.evidenceReferences, 'ciImageObservationDigestSha256'));
    const hasCiImageAcquisition = Boolean(record.evidenceReferences && typeof record.evidenceReferences === 'object'
      && Object.hasOwn(record.evidenceReferences, 'ciImageAcquisitionDigestSha256'));
    if (hasCiImage) referenceKeys.push('ciImageObservationDigestSha256');
    if (hasCiImageAcquisition) {
      if (!hasCiImage) throw new Error('Image acquisition requires its observation reference');
      referenceKeys.push('ciImageAcquisitionDigestSha256');
    }
    const references = proofRecord(record.evidenceReferences, referenceKeys);
    const result: ReleaseQualificationV2 = {
      schema: 'ReleaseQualificationV2', state: 'unqualified',
      buildIdentity: parseBuildIdentity(record.buildIdentity),
      evidenceReferences: { sourceAcquisitionDigestSha256: contentDigest(references.sourceAcquisitionDigestSha256) },
    };
    if (hasCiImage) result.evidenceReferences.ciImageObservationDigestSha256 = contentDigest(references.ciImageObservationDigestSha256);
    if (hasCiImageAcquisition) result.evidenceReferences.ciImageAcquisitionDigestSha256 = contentDigest(references.ciImageAcquisitionDigestSha256);
    if (hasIdentity) result.releaseIdentity = parseReleaseIdentityTuple(record.releaseIdentity);
    return result;
  }
  const record = proofRecord(value, [
    'schema', 'buildIdentity', 'sourceVerification', 'builtImage', 'publishedImage', 'runningImage', 'commands',
  ]);
  if (record.schema !== 'ReleaseQualificationV1') throw new Error('Unsupported release qualification schema');
  const { schema: _schema, buildIdentity, ...tuple } = record;
  return {
    schema: 'ReleaseQualificationV1', buildIdentity: parseBuildIdentity(buildIdentity),
    ...parseReleaseIdentityTuple(tuple),
  };
}

export function parseWorkstationReleaseRecord(value: unknown): WorkstationReleaseRecord {
  const keys = ['deployedAtUtc', 'baseCommit', 'includedUncommittedLocalChanges', 'image', 'tag', 'digest'];
  const hasQualification = Boolean(value && typeof value === 'object' && Object.hasOwn(value, 'qualification'));
  const hasAcceptance = Boolean(value && typeof value === 'object'
    && (Object.hasOwn(value, 'imageId') || Object.hasOwn(value, 'acceptance')));
  if (hasAcceptance) keys.push('imageId', 'acceptance');
  if (hasQualification) keys.push('qualification');
  const record = proofRecord(value, keys);
  // PowerShell's existing DateTime.ToString('o') uses seven fractional digits.
  // Accept that exact current representation as well as JS's millisecond ISO.
  const deployedAtUtc = proofString(record.deployedAtUtc, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}(?:\d{4})?Z$/, 32);
  const millisecondTime = deployedAtUtc.replace(/(\.\d{3})\d{4}Z$/, '$1Z');
  if (!Number.isFinite(Date.parse(millisecondTime)) || new Date(millisecondTime).toISOString() !== millisecondTime) {
    throw new Error('Invalid release timestamp');
  }
  const tag = proofString(record.tag, /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/, 128);
  const image = proofString(record.image, /^[a-z0-9][a-z0-9._:/-]*:[A-Za-z0-9_][A-Za-z0-9_.-]*$/, 300);
  if (image.includes('://') || !image.endsWith(`:${tag}`)) throw new Error('Invalid tagged release image');
  const result: WorkstationReleaseRecord = {
    deployedAtUtc,
    baseCommit: sourceCommit(record.baseCommit),
    includedUncommittedLocalChanges: proofBoolean(record.includedUncommittedLocalChanges),
    image, tag, digest: imageDigest(record.digest),
  };
  if (hasAcceptance) {
    result.imageId = imageDigest(record.imageId);
    if (record.acceptance !== 'operator-confirmed readiness and participant smoke checks') {
      throw new Error('Invalid release acceptance observation');
    }
    // An operator assertion stays an assertion. It cannot create source tests,
    // command outcomes or an authenticated independent running-image observation.
    result.acceptance = record.acceptance;
  }
  if (hasQualification) {
    result.qualification = parseReleaseQualification(record.qualification);
    if (result.qualification.schema === 'ReleaseQualificationV2'
      && (result.qualification.buildIdentity.baseCommit !== result.baseCommit
        || result.qualification.buildIdentity.includedUncommittedLocalChanges !== result.includedUncommittedLocalChanges)) {
      throw new Error('Release qualification source identity mismatch');
    }
  }
  return result;
}

// Checks consistency of acquired proof, NOT authenticity, complete verification
// coverage, application safety, or authority to deploy. No code calls this from
// startup, /health, authorization, the command sheet, or the active V1 scanner.
export function evaluateReleaseIdentity(value: unknown): ReleaseIdentityResult {
  let record: WorkstationReleaseRecord;
  try { record = parseWorkstationReleaseRecord(value); }
  catch { return { status: 'ERROR', reason: 'malformed-proof' }; }
  return evaluateParsedReleaseIdentity(record);
}

function evaluateParsedReleaseIdentity(record: WorkstationReleaseRecord): ReleaseIdentityResult {
  const qualification = record.qualification;
  if (!qualification) return { status: 'ERROR', reason: 'proof-unavailable' };
  const proof = qualification.schema === 'ReleaseQualificationV2' ? qualification.releaseIdentity : qualification;
  if (!proof) return { status: 'ERROR', reason: 'proof-unavailable' };
  const buildIdentity = qualification.buildIdentity;
  if (Object.values(proof.commands).some((result) => result.state === 'unavailable')) {
    return { status: 'ERROR', reason: 'command-unavailable' };
  }
  if (Object.values(proof.commands).some((result) => result.state === 'completed' && result.exitCode !== 0)) {
    return { status: 'ERROR', reason: 'command-failed' };
  }
  if (proof.sourceVerification.state !== 'observed' || proof.sourceVerification.result !== 'PASS') {
    return { status: 'ERROR', reason: 'source-unverified' };
  }
  if (record.baseCommit !== buildIdentity.baseCommit || record.baseCommit !== proof.runningImage.baseCommit
    || record.includedUncommittedLocalChanges !== buildIdentity.includedUncommittedLocalChanges
    || proof.sourceVerification.sourceSnapshotDigestSha256 !== buildIdentity.sourceSnapshotDigestSha256) {
    return { status: 'ERROR', reason: 'source-mismatch' };
  }
  if (record.digest !== proof.publishedImage.digest
    || (record.imageId !== undefined && record.imageId !== proof.runningImage.configDigest)
    || proof.builtImage.configDigest !== proof.publishedImage.configDigest
    || proof.builtImage.configDigest !== proof.runningImage.configDigest
    || proof.builtImage.platform !== proof.publishedImage.platform
    || proof.builtImage.platform !== proof.runningImage.platform) {
    return { status: 'ERROR', reason: 'image-mismatch' };
  }
  return { status: 'PASS' };
}

// Storage admission is distinct from release qualification. Valid incomplete
// observations may be retained, while any supplied actual tuple must agree.
// Digest syntax does not prove that referenced bytes exist or are authentic;
// acquisition/binding and complete qualification remain separate owners.
export function classifyReleaseRecordProof(value: unknown): ReleaseRecordProofState {
  const record = parseWorkstationReleaseRecord(value);
  const proof = record.qualification;
  if (!proof) return 'unavailable';
  if (proof.schema === 'ReleaseQualificationV2' && !proof.releaseIdentity) return 'incomplete-unqualified';
  if (evaluateParsedReleaseIdentity(record).status !== 'PASS') {
    throw new Error('Release record proof is inconsistent');
  }
  return 'consistent-unqualified';
}
