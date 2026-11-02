import { parseBuildIdentity, type BuildIdentityV1 } from './buildIdentity.ts';
import { parseImageObservation, type ImageObservation } from './releaseQualification.ts';
import { contentDigest, proofRecord, proofString, sourceCommit } from './proofFields.ts';

// External observation of the unpublished CI smoke image. It never supplies a
// workstation release's built/published/running image proof by source SHA alone.
export type CiRunReference = {
  repository: 'memphis-iis/MoFaCTS'; commit: string; runId: string; runAttempt: string;
};

export type PostBuildImageObservationV1 = {
  schema: 'PostBuildImageObservationV1';
  state: 'observed-unqualified';
  lane: 'ci-test-image';
  source: BuildIdentityV1;
  image: ImageObservation;
  sourceEvidenceDigestSha256: string;
  ci: CiRunReference;
};

export function parseCiRunReference(value: unknown, expectedCommit: string): CiRunReference {
  const record = proofRecord(value, ['repository', 'commit', 'runId', 'runAttempt']);
  const commit = sourceCommit(record.commit);
  if (record.repository !== 'memphis-iis/MoFaCTS' || commit !== expectedCommit) {
    throw new Error('CI run reference identity mismatch');
  }
  // `$` can match before a final newline; require the actual end of the value.
  const decimalId = /^[1-9][0-9]*(?![\s\S])/;
  return { repository: 'memphis-iis/MoFaCTS', commit,
    runId: proofString(record.runId, decimalId, 20),
    runAttempt: proofString(record.runAttempt, decimalId, 6) };
}

export function parsePostBuildImageObservation(value: unknown): PostBuildImageObservationV1 {
  const record = proofRecord(value, [
    'schema', 'state', 'lane', 'source', 'image', 'sourceEvidenceDigestSha256', 'ci',
  ]);
  if (record.schema !== 'PostBuildImageObservationV1' || record.state !== 'observed-unqualified'
    || record.lane !== 'ci-test-image') throw new Error('Invalid post-build image observation');
  const source = parseBuildIdentity(record.source);
  const image = parseImageObservation(record.image);
  const ci = parseCiRunReference(record.ci, source.baseCommit);
  if (source.includedUncommittedLocalChanges || image.platform !== 'linux/amd64') {
    throw new Error('Post-build image observation identity mismatch');
  }
  return {
    schema: 'PostBuildImageObservationV1', state: 'observed-unqualified', lane: 'ci-test-image',
    source, image, sourceEvidenceDigestSha256: contentDigest(record.sourceEvidenceDigestSha256),
    ci,
  };
}
