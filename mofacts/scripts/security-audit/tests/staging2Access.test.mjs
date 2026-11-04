import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { INTERNAL_CONTROL_DEFINITIONS } from '../internal-audit-contract.mjs';
import { acceptHostObservation } from '../staging2-access-check.mjs';

const expected = 'a'.repeat(64);
const observation = () => ({
  sectionId: 'internal', status: 'PASS',
  controls: INTERNAL_CONTROL_DEFINITIONS.map(([controlId]) => ({ controlId, status: 'PASS' })),
  releaseReceipt: { state: 'observed', result: 'MATCH', receipt: {
    schema: 'MoFaCTSReleaseReceiptV1', recordDigestSha256: expected,
    deployedAtUtc: '2026-11-04T12:00:00.000Z', baseCommit: 'b'.repeat(40),
    includedUncommittedLocalChanges: false,
    image: 'ppavlikmemphis/mofacts-staging2:test', tag: 'test',
    digest: 'sha256:' + 'c'.repeat(64), imageId: 'sha256:' + 'd'.repeat(64),
  } },
});

test('staging2 acceptance requires every control and the explicit accepted receipt', () => {
  const value = observation();
  value.privateDiagnostic = 'must not survive projection';
  const result = acceptHostObservation(value, expected);
  assert.equal(result.controls.length, 9);
  assert.equal(result.receipt.recordDigestSha256, expected);
  assert.deepEqual(Object.keys(result), ['controls', 'receipt']);
  assert(!JSON.stringify(result).includes('must not survive'));
  const changes = [
    value => { value.controls.pop(); },
    value => { value.controls[0].status = 'ERROR'; },
    value => { value.controls[0].status = 'FAIL'; },
    value => { value.controls[0].controlId = value.controls[1].controlId; },
    value => { value.status = 'ERROR'; },
    value => { delete value.releaseReceipt; },
    value => { value.releaseReceipt.result = 'MISMATCH'; },
    value => { value.releaseReceipt.state = 'unavailable'; },
    value => { value.releaseReceipt.receipt.recordDigestSha256 = 'e'.repeat(64); },
    value => { value.releaseReceipt.receipt.includedUncommittedLocalChanges = true; },
    value => { value.releaseReceipt.receipt.image = 'ppavlikmemphis/mofacts-mini:test'; },
  ];
  for (const change of changes) {
    const value = observation();
    change(value);
    assert.throws(() => acceptHostObservation(value, expected));
  }
  assert.throws(() => acceptHostObservation(observation(), undefined));
});

test('staging2 workflow has a manual main-only isolated identity and no release actions', () => {
  const text = fs.readFileSync(new URL('../../../../.github/workflows/staging2-audit-access.yml', import.meta.url), 'utf8');
  assert.match(text, /workflow_dispatch:/);
  assert.match(text, /if: github.ref == 'refs\/heads\/main'/);
  assert.match(text, /environment: staging2-security-audit/);
  assert.match(text, /tags: tag:staging2-audit/);
  assert.match(text, /expected_record_digest:/);
  assert.doesNotMatch(text, /production-security-audit|tags: tag:ci|test:ci|docker build|schedule:|pull_request:/);
});
