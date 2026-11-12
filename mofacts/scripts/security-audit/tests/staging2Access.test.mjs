import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { hostAcquisitionFixture } from './fixtures/hostAcquisitionFixtures.mjs';
import { hostNow } from './fixtures/hostFixtures.mjs';
import { acceptHostObservation, sshFailureCategory } from '../staging2-access-check.mjs';

const expected = 'a'.repeat(64);
const encoded = value => Buffer.from(canonicalAuditJson(value) + '\n');

test('staging2 acceptance evaluates the complete V2 catalog subset and requires the exact matching V2 receipt', async () => {
  const value = await hostAcquisitionFixture();
  const result = await acceptHostObservation(encoded(value), expected, hostNow);
  assert.equal(result.controls.length, 11);
  assert.equal(result.receipt.recordDigestSha256, expected);
  assert.deepEqual(Object.keys(result), ['controls', 'receipt']);
  assert(!JSON.stringify(result).includes('must not survive'));
  const changes = [
    value => { delete value.hostObservations.observations.redis; },
    value => { value.hostObservations.observations.redis.unauthenticatedCommandAccepted = { state: 'unavailable', reason: 'transport' }; },
    value => { value.hostObservations.observations.redis.unauthenticatedCommandAccepted.value = true; },
    value => { value.privateDiagnostic = 'must not survive'; },
    value => { value.hostObservations.observedAt = '2026-11-04T12:00:00.000Z'; },
    value => { delete value.releaseReceipt; },
    value => { value.releaseReceipt.result = 'MISMATCH'; },
    value => { value.releaseReceipt.state = 'unavailable'; },
    value => { value.releaseReceipt.receipt.recordDigestSha256 = 'e'.repeat(64); },
    value => { value.releaseReceipt.receipt.includedUncommittedLocalChanges = true; },
    value => { value.releaseReceipt.receipt.image = 'ppavlikmemphis/mofacts-mini:test'; },
    value => { value.releaseReceipt.receipt.schema = 'MoFaCTSReleaseReceiptV1'; delete value.releaseReceipt.receipt.publishedImage; },
  ];
  for (const change of changes) {
    const value = await hostAcquisitionFixture();
    change(value);
    await assert.rejects(acceptHostObservation(encoded(value), expected, hostNow));
  }
  await assert.rejects(acceptHostObservation(encoded(value), undefined, hostNow));
});

test('staging2 workflow has a manual main-only isolated identity and no release actions', () => {
  const text = fs.readFileSync(new URL('../../../../.github/workflows/staging2-audit-access.yml', import.meta.url), 'utf8');
  assert.match(text, /workflow_dispatch:/);
  assert.match(text, /if: github.ref == 'refs\/heads\/main'/);
  assert.match(text, /environment: staging2-security-audit/);
  assert.match(text, /tags: tag:staging2-audit/);
  assert.match(text, /expected_record_digest:/);
  assert.doesNotMatch(text, /production-security-audit|tags: tag:ci|test:ci|docker build|schedule:|pull_request:/);
  const selection = text.match(/ref: ([a-f0-9]{40})/)[1];
  assert(text.includes('= ' + selection));
  const retained = execFileSync('git', ['show', `${selection}:mofacts/scripts/security-audit/staging2-access-check.mjs`], { encoding: 'utf8' });
  assert.match(retained, /parseHostAuditAcquisitionV2/);
  assert.match(retained, /evaluateHostObservations/);
  assert.doesNotMatch(retained, /parseReleaseReceipt\(value.releaseReceipt.receipt\)/);
});

test('SSH failure categories expose only fixed labels, never diagnostic contents', () => {
  const cases = [
    ['Load key "/private/name": error in libcrypto', 'key-format'],
    ['WARNING: UNPROTECTED PRIVATE KEY FILE!', 'key-permissions'],
    ['Host key verification failed.', 'host-key'],
    ['Permission denied (publickey).', 'authentication'],
    ['Bad configuration option: invalid', 'ssh-config'],
    ['Connection timed out', 'network'],
    ['private diagnostic with credential-shaped content', 'unclassified'],
  ];
  for (const [input, expected] of cases) assert.equal(sshFailureCategory(input), expected);
});
