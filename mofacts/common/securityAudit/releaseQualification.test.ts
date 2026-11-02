import { expect } from 'chai';
import fixture from './fixtures/release-record.fixture.json' with { type: 'json' };
import { observeBuildIdentity } from './buildIdentity.ts';
import { classifyReleaseRecordProof, evaluateReleaseIdentity, parseWorkstationReleaseRecord } from './releaseQualification.ts';
import { parsePostBuildImageObservation } from './postBuildImageObservation.ts';
import { canonicalJson } from '../securityAuditReport.ts';

// The ordinary Meteor common-test discovery owns this parity check. Node tests
// exercise the same .ts modules and JSON fixture; no Meteor run is implied.
describe('Phase 0 release proof Node/Meteor contract parity', function() {
  it('imports erasable TypeScript and JSON attributes and preserves the fixture', function() {
    expect(parseWorkstationReleaseRecord(fixture)).to.deep.equal(fixture);
    expect(evaluateReleaseIdentity(fixture)).to.deep.equal({ status: 'PASS' });
  });

  it('matches the Node golden digest under the Meteor test runtime', async function() {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(fixture)));
    const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    expect(hex).to.equal('30d43552435b48f51ae14db7b3fbf6b95ee6a4da52b550f2b62851bedc2446fb');
  });

  it('retains old records and represents missing build proof without throwing', function() {
    const { qualification: _qualification, ...existingRecord } = fixture;
    expect(parseWorkstationReleaseRecord(existingRecord)).to.deep.equal(existingRecord);
    expect(evaluateReleaseIdentity(existingRecord)).to.deep.equal({ status: 'ERROR', reason: 'proof-unavailable' });
    expect(observeBuildIdentity(undefined)).to.deep.equal({ state: 'unavailable', reason: 'not-provided' });
  });

  it('does not make dirty source a deployment or identity-policy denial', function() {
    const dirty = structuredClone(fixture);
    dirty.includedUncommittedLocalChanges = true;
    dirty.qualification.buildIdentity.includedUncommittedLocalChanges = true;
    expect(evaluateReleaseIdentity(dirty)).to.deep.equal({ status: 'PASS' });
  });
});

describe('Phase 0 external CI image observation parity', function() {
  const imageObservation = {
    schema: 'PostBuildImageObservationV1', state: 'observed-unqualified', lane: 'ci-test-image',
    source: fixture.qualification.buildIdentity,
    image: fixture.qualification.builtImage,
    sourceEvidenceDigestSha256: 'e'.repeat(64),
    ci: { repository: 'memphis-iis/MoFaCTS', commit: fixture.baseCommit, runId: '101', runAttempt: '1' },
  };

  it('preserves the shared source/image shapes and remains explicitly unqualified', function() {
    expect(parsePostBuildImageObservation(imageObservation)).to.deep.equal(imageObservation);
  });

  it('rejects a different lane, successful qualification claim or extra evidence payload', function() {
    for (const change of [{ lane: 'workstation-release' }, { state: 'PASS' }, { rawResponse: 'synthetic' }]) {
      expect(() => parsePostBuildImageObservation({ ...imageObservation, ...change })).to.throw();
    }
  });

  it('requires clean matching source and supported image platform', function() {
    for (const change of [
      { ci: { ...imageObservation.ci, commit: 'f'.repeat(40) } },
      { source: { ...imageObservation.source, includedUncommittedLocalChanges: true } },
      { image: { ...imageObservation.image, platform: 'linux/arm64' } },
    ]) {
      expect(() => parsePostBuildImageObservation({ ...imageObservation, ...change })).to.throw();
    }
  });

  it('cannot substitute a CI smoke observation for workstation release qualification', function() {
    expect(() => parseWorkstationReleaseRecord({ ...fixture, qualification: imageObservation })).to.throw();
  });

  it('rejects trailing line terminators in run and attempt identifiers', function() {
    for (const suffix of ['\n', '\r', '\u2028', '\u2029']) {
      for (const field of ['runId', 'runAttempt'] as const) {
        expect(() => parsePostBuildImageObservation({ ...imageObservation,
          ci: { ...imageObservation.ci, [field]: imageObservation.ci[field] + suffix },
        })).to.throw();
      }
    }
  });
});

describe('Phase 0 V2 release evidence parity', function() {
  const { schema: _schema, buildIdentity, ...releaseIdentity } = fixture.qualification;
  const incomplete = () => ({ ...structuredClone(fixture), qualification: {
    schema: 'ReleaseQualificationV2', state: 'unqualified', buildIdentity: structuredClone(buildIdentity),
    evidenceReferences: { sourceAcquisitionDigestSha256: '1'.repeat(64) },
  } });

  it('retains incomplete observations while identity proof remains unavailable', function() {
    const record = incomplete();
    expect(parseWorkstationReleaseRecord(record)).to.deep.equal(record);
    expect(classifyReleaseRecordProof(record)).to.equal('incomplete-unqualified');
    expect(evaluateReleaseIdentity(record)).to.deep.equal({ status: 'ERROR', reason: 'proof-unavailable' });
    expect(Object.hasOwn(record.qualification, 'releaseIdentity')).to.equal(false);
  });

  it('binds versioned evidence to the existing commit and dirty distinction', function() {
    const record = incomplete();
    expect(() => parseWorkstationReleaseRecord({ ...record, baseCommit: 'f'.repeat(40) })).to.throw();
    expect(() => parseWorkstationReleaseRecord({ ...record, includedUncommittedLocalChanges: true })).to.throw();
  });

  it('applies existing consistency checks to a supplied actual workstation tuple', function() {
    const record = incomplete();
    const complete = { ...record, qualification: { ...record.qualification, releaseIdentity: structuredClone(releaseIdentity) } };
    expect(classifyReleaseRecordProof(complete)).to.equal('consistent-unqualified');
    expect(evaluateReleaseIdentity(complete)).to.deep.equal({ status: 'PASS' });
    complete.qualification.releaseIdentity.runningImage.configDigest = 'sha256:' + 'f'.repeat(64);
    expect(() => classifyReleaseRecordProof(complete)).to.throw();
  });
});
