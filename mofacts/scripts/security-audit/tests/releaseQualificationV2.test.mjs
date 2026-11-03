import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import fixture from '../../../common/securityAudit/fixtures/release-record.fixture.json' with { type: 'json' };
import { canonicalJson } from '../../../common/securityAuditReport.ts';
import {
  classifyReleaseRecordProof,
  evaluateReleaseIdentity,
  parseReleaseQualification,
  parseWorkstationReleaseRecord,
} from '../../../common/securityAudit/releaseQualification.ts';

const digest = value => createHash('sha256').update(canonicalJson(value)).digest('hex');
function v2Record(withIdentity = false) {
  const value = structuredClone(fixture);
  const { schema: _schema, buildIdentity, ...releaseIdentity } = value.qualification;
  value.qualification = {
    schema: 'ReleaseQualificationV2', state: 'unqualified', buildIdentity,
    evidenceReferences: { sourceAcquisitionDigestSha256: '1'.repeat(64) },
  };
  if (withIdentity) value.qualification.releaseIdentity = releaseIdentity;
  return value;
}

test('V2 does not change historical six/eight-field records or the existing V1 fixture', () => {
  const original = structuredClone(fixture);
  const parsed = parseWorkstationReleaseRecord(fixture);
  assert.deepEqual(parsed, original);
  assert.equal(digest(parsed), digest(original));
  assert.equal(classifyReleaseRecordProof(fixture), 'consistent-unqualified');
  assert.deepEqual(evaluateReleaseIdentity(fixture), { status: 'PASS' });
  const { qualification: _qualification, ...six } = fixture;
  const eight = { ...six, imageId: fixture.qualification.runningImage.configDigest,
    acceptance: 'operator-confirmed readiness and participant smoke checks' };
  for (const value of [six, eight]) {
    assert.deepEqual(parseWorkstationReleaseRecord(value), value);
    assert.equal(classifyReleaseRecordProof(value), 'unavailable');
    assert.deepEqual(evaluateReleaseIdentity(value), { status: 'ERROR', reason: 'proof-unavailable' });
    assert.equal(parseWorkstationReleaseRecord(value).deployedAtUtc, fixture.deployedAtUtc);
  }
});

test('valid incomplete V2 retains bounded references and cannot manufacture identity PASS', () => {
  const value = v2Record();
  assert.deepEqual(parseReleaseQualification(value.qualification), value.qualification);
  assert.deepEqual(parseWorkstationReleaseRecord(value), value);
  assert.equal(classifyReleaseRecordProof(value), 'incomplete-unqualified');
  assert.deepEqual(evaluateReleaseIdentity(value), { status: 'ERROR', reason: 'proof-unavailable' });
  const withCiImage = structuredClone(value);
  withCiImage.qualification.evidenceReferences.ciImageObservationDigestSha256 = '2'.repeat(64);
  assert.deepEqual(parseWorkstationReleaseRecord(withCiImage), withCiImage);
  assert.equal(classifyReleaseRecordProof(withCiImage), 'incomplete-unqualified');
  assert.deepEqual(evaluateReleaseIdentity(withCiImage), { status: 'ERROR', reason: 'proof-unavailable' });
  assert.equal(Object.hasOwn(parseWorkstationReleaseRecord(withCiImage).qualification, 'releaseIdentity'), false);
});

test('V2 image acquisition references locate retained provenance and require their exact observation reference', () => {
  const value = v2Record();
  value.qualification.evidenceReferences.ciImageObservationDigestSha256 = '2'.repeat(64);
  // The previously accepted raw-observation-only form stays unchanged.
  assert.deepEqual(parseWorkstationReleaseRecord(value), value);
  const withAcquisition = structuredClone(value);
  withAcquisition.qualification.evidenceReferences.ciImageAcquisitionDigestSha256 = '3'.repeat(64);
  assert.deepEqual(parseWorkstationReleaseRecord(withAcquisition), withAcquisition);
  assert.equal(classifyReleaseRecordProof(withAcquisition), 'incomplete-unqualified');
  assert.deepEqual(evaluateReleaseIdentity(withAcquisition), { status: 'ERROR', reason: 'proof-unavailable' });

  const missingObservation = structuredClone(withAcquisition);
  delete missingObservation.qualification.evidenceReferences.ciImageObservationDigestSha256;
  assert.throws(() => parseWorkstationReleaseRecord(missingObservation), /requires its observation reference/);
  for (const invalidDigest of [undefined, null, '', '3'.repeat(65), 'A'.repeat(64), '3'.repeat(64) + '\n', 'private canary']) {
    const malformed = structuredClone(withAcquisition);
    malformed.qualification.evidenceReferences.ciImageAcquisitionDigestSha256 = invalidDigest;
    assert.throws(() => classifyReleaseRecordProof(malformed), error => {
      assert.doesNotMatch(error.message, /private canary/);
      return true;
    });
    assert.deepEqual(evaluateReleaseIdentity(malformed), { status: 'ERROR', reason: 'malformed-proof' });
  }
});

test('incomplete V2 binds the actual top-level commit and dirty distinction during parsing', () => {
  for (const mutate of [
    value => { value.baseCommit = 'f'.repeat(40); },
    value => { value.includedUncommittedLocalChanges = true; },
    value => { value.qualification.buildIdentity.baseCommit = 'f'.repeat(40); },
    value => { value.qualification.buildIdentity.includedUncommittedLocalChanges = true; },
  ]) {
    const value = v2Record();
    mutate(value);
    assert.throws(() => parseWorkstationReleaseRecord(value));
    assert.throws(() => classifyReleaseRecordProof(value));
    assert.deepEqual(evaluateReleaseIdentity(value), { status: 'ERROR', reason: 'malformed-proof' });
  }
  const dirty = v2Record();
  dirty.includedUncommittedLocalChanges = true;
  dirty.qualification.buildIdentity.includedUncommittedLocalChanges = true;
  assert.deepEqual(parseWorkstationReleaseRecord(dirty), dirty);
  assert.equal(classifyReleaseRecordProof(dirty), 'incomplete-unqualified');
  assert.deepEqual(evaluateReleaseIdentity(dirty), { status: 'ERROR', reason: 'proof-unavailable' });
});

test('a supplied actual V2 workstation tuple uses the same consistency rules as V1', () => {
  const value = v2Record(true);
  assert.deepEqual(parseWorkstationReleaseRecord(value), value);
  assert.equal(classifyReleaseRecordProof(value), 'consistent-unqualified');
  assert.deepEqual(evaluateReleaseIdentity(value), { status: 'PASS' });
  assert.equal(value.qualification.state, 'unqualified');
  const eight = { ...value, imageId: fixture.qualification.runningImage.configDigest,
    acceptance: 'operator-confirmed readiness and participant smoke checks' };
  assert.deepEqual(parseWorkstationReleaseRecord(eight), eight);
  assert.equal(classifyReleaseRecordProof(eight), 'consistent-unqualified');
  assert.equal(Object.hasOwn(value.qualification.releaseIdentity, 'buildIdentity'), false);
});

test('inconsistent supplied tuples cannot be admitted as merely incomplete observations', () => {
  const mutations = [
    [value => { value.qualification.releaseIdentity.builtImage.configDigest = `sha256:${'f'.repeat(64)}`; }, 'image-mismatch'],
    [value => { value.qualification.releaseIdentity.publishedImage.configDigest = `sha256:${'f'.repeat(64)}`; }, 'image-mismatch'],
    [value => { value.qualification.releaseIdentity.runningImage.configDigest = `sha256:${'f'.repeat(64)}`; }, 'image-mismatch'],
    [value => { value.qualification.releaseIdentity.runningImage.baseCommit = 'f'.repeat(40); }, 'source-mismatch'],
    [value => { value.qualification.releaseIdentity.sourceVerification.sourceSnapshotDigestSha256 = 'f'.repeat(64); }, 'source-mismatch'],
    [value => { value.qualification.releaseIdentity.sourceVerification = { state: 'unavailable' }; }, 'source-unverified'],
    [value => { value.qualification.releaseIdentity.sourceVerification.result = 'FAIL'; }, 'source-unverified'],
    [value => { value.qualification.releaseIdentity.commands.build.exitCode = 1; }, 'command-failed'],
    [value => { value.qualification.releaseIdentity.commands.smoke = { state: 'unavailable', reason: 'not-run' }; }, 'command-unavailable'],
    [value => { value.imageId = `sha256:${'f'.repeat(64)}`; value.acceptance = 'operator-confirmed readiness and participant smoke checks'; }, 'image-mismatch'],
  ];
  for (const [mutate, reason] of mutations) {
    const value = v2Record(true);
    mutate(value);
    assert.deepEqual(evaluateReleaseIdentity(value), { status: 'ERROR', reason });
    assert.throws(() => classifyReleaseRecordProof(value), /Release record proof is inconsistent/);
  }
});

test('V2 references, state and optional tuple have exact bounded shapes without retained private values', () => {
  const mutations = [
    value => { value.qualification.state = 'qualified'; },
    value => { value.qualification.state = 'PASS'; },
    value => { value.qualification.schema = 'ReleaseQualificationV3'; },
    value => { value.qualification.rawResponse = 'private canary'; },
    value => { value.qualification.evidenceReferences.rawResponse = 'private canary'; },
    value => { value.qualification.evidenceReferences = {}; },
    value => { value.qualification.evidenceReferences.sourceAcquisitionDigestSha256 = 'private canary'; },
    value => { value.qualification.evidenceReferences.sourceAcquisitionDigestSha256 = '1'.repeat(65); },
    value => { value.qualification.evidenceReferences.sourceAcquisitionDigestSha256 = 'A'.repeat(64); },
    value => { value.qualification.evidenceReferences.sourceAcquisitionDigestSha256 = '1'.repeat(64) + '\n'; },
    value => { value.qualification.evidenceReferences.sourceAcquisitionDigestSha256 = undefined; },
    value => { value.qualification.evidenceReferences.ciImageObservationDigestSha256 = null; },
    value => { value.qualification.evidenceReferences.ciImageObservationDigestSha256 = ''; },
    value => { value.qualification.evidenceReferences.ciImageObservationDigestSha256 = '2'.repeat(65); },
    value => { value.qualification.evidenceReferences.ciImageObservationDigestSha256 = 'private canary'; },
    value => { value.qualification.releaseIdentity = null; },
    value => { value.qualification.releaseIdentity = undefined; },
    value => { value.qualification.releaseIdentity = {}; },
  ];
  for (const mutate of mutations) {
    const value = v2Record();
    mutate(value);
    assert.throws(() => classifyReleaseRecordProof(value), error => {
      assert.doesNotMatch(error.message, /private canary/);
      return true;
    });
    assert.deepEqual(evaluateReleaseIdentity(value), { status: 'ERROR', reason: 'malformed-proof' });
  }
});

test('V2 never accepts CI image observations or duplicate identity owners as a workstation tuple', () => {
  const variants = [
    { schema: 'PostBuildImageObservationV1', state: 'observed-unqualified', lane: 'ci-test-image',
      image: fixture.qualification.builtImage },
    { ...v2Record(true).qualification.releaseIdentity, buildIdentity: fixture.qualification.buildIdentity },
    { ...v2Record(true).qualification.releaseIdentity, schema: 'ReleaseQualificationV1' },
    { ...v2Record(true).qualification.releaseIdentity, rawResponse: 'private canary' },
  ];
  for (const releaseIdentity of variants) {
    const value = v2Record();
    value.qualification.releaseIdentity = releaseIdentity;
    assert.throws(() => classifyReleaseRecordProof(value));
  }
});
