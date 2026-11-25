import assert from 'node:assert/strict';
import test from 'node:test';
import { digestVerificationBundle, parseVerificationBundle, requireMatchingSourceVerification } from '../../../common/securityAudit/verificationBundle.ts';

import { createVerificationBundleLoader } from '../../../server/securitySurfaces/verificationBundle.ts';
import { auditDigest } from '../../../common/securityAudit/canonicalReport.ts';

const profile = { mode: 'production', meteorRelease: 'METEOR@3.5.4' };
const profileSha256 = await auditDigest(profile);

const buildIdentity = {
  schema: 'BuildIdentityV1', baseCommit: 'a'.repeat(40),
  includedUncommittedLocalChanges: false, sourceSnapshotDigestSha256: 'b'.repeat(64),
};
const bundle = {
  schema: 'VerificationBundleV1', variant: 'source-evidence', buildIdentity,
  profile, profileSha256, expectedRegistrySha256: 'd'.repeat(64), verificationCatalogSha256: 'e'.repeat(64),
  executions: ['method.beta', 'method.alpha'].map(verificationId => ({
    verificationId, lane: 'isolated-meteor', outcome: 'PASS', runEvidenceSha256: 'f'.repeat(64), resultEvidenceSha256: '0'.repeat(64),
  })),
};
const expected = {
  buildIdentity, profileSha256: bundle.profileSha256, expectedRegistrySha256: bundle.expectedRegistrySha256,
  verificationCatalogSha256: bundle.verificationCatalogSha256,
  sourceVerificationIds: new Set(['method.alpha', 'method.beta']),
};

test('normalizes the executed verification set and hashes its exact source and profile', async () => {
  const reversed = [...bundle.executions].reverse();
  assert.deepEqual(parseVerificationBundle(bundle).executions, reversed);
  assert.equal(await digestVerificationBundle(bundle), await digestVerificationBundle({ ...bundle, executions: reversed }));
  assert.notEqual(await digestVerificationBundle(bundle), await digestVerificationBundle({ ...bundle, profileSha256: '1'.repeat(64) }));
  assert.deepEqual(await requireMatchingSourceVerification(bundle, expected), parseVerificationBundle(bundle));
});

test('rejects fixture proof, dirty-source mismatch, foreign profiles, and incomplete or failing executions', async () => {
  for (const value of [
    { ...bundle, variant: 'test-fixture', profile: { ...profile, mode: 'test' } },
    { ...bundle, profile: { ...profile, mode: 'development' } },
    { ...bundle, buildIdentity: { ...buildIdentity, includedUncommittedLocalChanges: true } },
    { ...bundle, expectedRegistrySha256: '1'.repeat(64) },
    { ...bundle, verificationCatalogSha256: '1'.repeat(64) },
    { ...bundle, executions: bundle.executions.slice(1) },
    { ...bundle, executions: [{ ...bundle.executions[0], outcome: 'FAIL' }, bundle.executions[1]] },
  ]) await assert.rejects(requireMatchingSourceVerification(value, expected));
});

test('observes canonical embedded evidence and reports absence or malformed bytes explicitly', async () => {
  let reads = 0;
  const read = createVerificationBundleLoader(async () => { reads++; return Buffer.from(JSON.stringify(bundle)); });
  const observed = await read();
  assert.equal(observed.state, 'observed');
  assert.equal(observed.digestSha256, await digestVerificationBundle(bundle));
  observed.bundle.executions.pop();
  assert.equal((await read()).bundle.executions.length, 2);
  assert.equal(reads, 1);
  assert.deepEqual(await createVerificationBundleLoader(async () => undefined)(), { state: 'unavailable', reason: 'not-embedded' });
  for (const bytes of [Buffer.from('bad JSON'), Buffer.alloc(256 * 1024 + 1), Buffer.from(JSON.stringify({
    ...bundle, profileSha256: '1'.repeat(64),
  }))]) {
    assert.deepEqual(await createVerificationBundleLoader(async () => bytes)(), { state: 'unavailable', reason: 'malformed' });
  }
});

test('rejects duplicate, remote, and unbounded execution evidence and extra raw fields', () => {
  const first = bundle.executions[0];
  for (const executions of [
    [first, first], [{ ...first, lane: 'staging2' }], [{ ...first, resultEvidenceSha256: 'inline response' }],
    [{ ...first, rawResponse: 'extra field' }], Array(1025).fill(first), Array(1),
  ]) assert.throws(() => parseVerificationBundle({ ...bundle, executions }));
  assert.throws(() => parseVerificationBundle({ ...bundle, registryToken: 'unexpected' }));
  assert.throws(() => parseVerificationBundle({ ...bundle, variant: 'test-fixture' }));
  const large = Array.from({ length: 1024 }, (_, index) => ({
    ...first, verificationId: 'method.' + 'x'.repeat(140) + index,
  }));
  assert.throws(() => parseVerificationBundle({ ...bundle, executions: large }), /byte limit/);
});
