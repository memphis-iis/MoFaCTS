import { contentDigest, proofBoolean, proofRecord, sourceCommit } from './proofFields.ts';

// Unreleased Phase 0 contract. No production entry point loads this metadata.
// baseCommit/dirty preserve the existing workstation release-record meaning.
export type BuildIdentityV1 = {
  schema: 'BuildIdentityV1';
  baseCommit: string;
  includedUncommittedLocalChanges: boolean;
  sourceSnapshotDigestSha256: string;
};

export type BuildIdentityObservation =
  | { state: 'observed'; identity: BuildIdentityV1 }
  | { state: 'unavailable'; reason: 'not-provided' | 'malformed' };

export function parseBuildIdentity(value: unknown): BuildIdentityV1 {
  const record = proofRecord(value, [
    'schema', 'baseCommit', 'includedUncommittedLocalChanges', 'sourceSnapshotDigestSha256',
  ]);
  if (record.schema !== 'BuildIdentityV1') throw new Error('Unsupported build identity schema');
  return {
    schema: 'BuildIdentityV1',
    baseCommit: sourceCommit(record.baseCommit),
    includedUncommittedLocalChanges: proofBoolean(record.includedUncommittedLocalChanges),
    sourceSnapshotDigestSha256: contentDigest(record.sourceSnapshotDigestSha256),
  };
}

// Missing identity is an explicit observation, not a startup failure or an
// invented clean commit. Only acquisition's absent value (undefined) is absent.
export function observeBuildIdentity(value: unknown): BuildIdentityObservation {
  if (value === undefined) return { state: 'unavailable', reason: 'not-provided' };
  try {
    return { state: 'observed', identity: parseBuildIdentity(value) };
  } catch {
    return { state: 'unavailable', reason: 'malformed' };
  }
}

// The existing Docker source-observation carrier. A matched source snapshot is
// provenance, never a claim that tests, publication or deployment were accepted.
export function observeEmbeddedBuildIdentity(value: unknown): BuildIdentityObservation {
  if (value === undefined) return { state: 'unavailable', reason: 'not-provided' };
  try {
    if (!value || typeof value !== 'object') throw new Error('Invalid source observation');
    const state = (value as Record<string, unknown>).state;
    if (state === 'unavailable') {
      const row = proofRecord(value, ['schema', 'state', 'reason']);
      if (row.schema !== 'MoFaCTSImageSourceObservationV1' || row.reason !== 'not-requested') {
        throw new Error('Invalid source observation');
      }
      return { state: 'unavailable', reason: 'not-provided' };
    }
    const row = proofRecord(value, ['schema', 'state', 'identity']);
    if (row.schema !== 'MoFaCTSImageSourceObservationV1' || state !== 'source-matched-unqualified') {
      throw new Error('Invalid source observation');
    }
    return { state: 'observed', identity: parseBuildIdentity(row.identity) };
  } catch {
    return { state: 'unavailable', reason: 'malformed' };
  }
}
