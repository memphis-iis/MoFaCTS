import { expect } from 'chai';
import fixture from '../../common/securityAudit/fixtures/release-record.fixture.json';
import { parseReleaseReceiptV2, receiptPlatformImage } from '../../common/securityAudit/releaseReceipt.mjs';
import { createAuditReceiverPlatformIdentity } from './securityAuditReceiverRelease.ts';

describe('V2 protected release identity shared runtime', function() {
  it('resolves the platform manifest and rejects a contradictory mounted revision', async function() {
    const value = { schema: 'MoFaCTSReleaseReceiptV2', recordDigestSha256: 'b'.repeat(64),
      deployedAtUtc: fixture.deployedAtUtc, baseCommit: fixture.baseCommit,
      includedUncommittedLocalChanges: false, image: fixture.image, tag: fixture.tag,
      digest: fixture.digest, imageId: fixture.qualification.runningImage.configDigest,
      publishedImage: { ...fixture.qualification.publishedImage, kind: 'index', platformManifestDigest: 'sha256:' + 'e'.repeat(64) } };
    expect(receiptPlatformImage(parseReleaseReceiptV2(value))).to.equal('registry.example.test/mofacts@sha256:' + 'e'.repeat(64));
    const load = createAuditReceiverPlatformIdentity(async () => ({ state: 'observed', identity: {
      schema: 'BuildIdentityV1', baseCommit: fixture.baseCommit, includedUncommittedLocalChanges: false,
      sourceSnapshotDigestSha256: 'b'.repeat(64),
    } }), async () => Buffer.from(JSON.stringify(value)), 'linux/amd64');
    expect((await load()).state).to.equal('observed');
    value.baseCommit = 'f'.repeat(40);
    expect(await load()).to.deep.equal({ state: 'conflicting', reason: 'independent-observations-disagree' });
  });
});
