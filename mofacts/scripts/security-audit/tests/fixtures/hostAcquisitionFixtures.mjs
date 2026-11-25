import { hostFixture } from './hostFixtures.mjs';

export async function hostAcquisitionFixture() {
  return { schema: 'MoFaCTSHostAuditAcquisitionV2', hostObservations: await hostFixture(),
    releaseReceipt: { state: 'observed', result: 'MATCH', receipt: {
      schema: 'MoFaCTSReleaseReceiptV2', recordDigestSha256: 'a'.repeat(64),
      deployedAtUtc: '2026-11-04T12:00:00.000Z', baseCommit: 'b'.repeat(40),
      includedUncommittedLocalChanges: false, image: 'ppavlikmemphis/mofacts-staging2:test', tag: 'test',
      digest: 'sha256:' + 'c'.repeat(64), imageId: 'sha256:' + 'd'.repeat(64),
      publishedImage: { kind: 'manifest', digest: 'sha256:' + 'c'.repeat(64), configDigest: 'sha256:' + 'd'.repeat(64), platform: 'linux/amd64' },
    } } };
}
