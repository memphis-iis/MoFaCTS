import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ACTIVE_AUDIT_CATALOG, readAuditCatalog } from '../../../common/securityAudit/catalogRegistry.ts';
import { AUTHORIZATION_VERIFICATIONS } from '../../../common/securityAudit/verificationCatalog.ts';
import { evaluateAuthorizationVerifications } from '../../../common/securityAudit/authorizationVerification.ts';
import { evaluateSelectedAuthenticationV2, writeSelectedAuthenticationProducerFileV2 } from '../authentication/producerFilesV2.mjs';
import { writeAuditFileV2 } from '../core/producerFilesV2.mjs';
const observations = () => AUTHORIZATION_VERIFICATIONS.map(row => ({ verificationId: row.verificationId, outcome: row.expectedPolicy === 'allow' ? 'ALLOWED' : 'DENIED_BY_POLICY' }));
const catalog = () => readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
test('selected Phase 1 proof produces only its authorization PASS; all unacquired Phase 2 controls stay explicit ERROR', async () => {
  const artifact = evaluateSelectedAuthenticationV2(await catalog(), evaluateAuthorizationVerifications(observations()));
  assert.equal(artifact.controls.length, 22);
  const selected = artifact.controls.find(row => row.controlId === 'authentication.authorization');
  assert.equal(selected.status, 'PASS'); assert.equal(selected.evidence.metrics.matchedCaseCount, 29);
  for (const row of artifact.controls.filter(row => row !== selected)) { assert.equal(row.status, 'ERROR'); assert.equal(row.evidence.category, 'evidence-incomplete'); }
});
test('summary tampering, extra diagnostics, incomplete execution and transport failures cannot become passing authorization', async () => {
  const valid = evaluateAuthorizationVerifications(observations());
  const changed = structuredClone(valid); changed.metrics.matchedCaseCount--;
  const failed = observations(); failed[0].outcome = 'TRANSPORT_OR_RUNNER_ERROR';
  for (const input of [undefined, { ...valid, privateDiagnostic: 'discarded' }, changed, evaluateAuthorizationVerifications([]), evaluateAuthorizationVerifications(failed)]) {
    const artifact = evaluateSelectedAuthenticationV2(await catalog(), input);
    assert(artifact.controls.every(row => row.status === 'ERROR'));
    assert(!JSON.stringify(artifact).includes('discarded'));
  }
});
test('a proven policy violation stays FAIL with complete finite counts', async () => {
  const rows = observations(); rows.find(row => row.outcome === 'DENIED_BY_POLICY').outcome = 'ALLOWED';
  const artifact = evaluateSelectedAuthenticationV2(await catalog(), evaluateAuthorizationVerifications(rows));
  assert.equal(artifact.controls.find(row => row.controlId === 'authentication.authorization').status, 'FAIL');
});
test('file owner validates canonical evidence and refuses overwriting a prior producer artifact', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mofacts-auth-producer-'));
  try {
    const artifactDirectory = path.join(root, 'producers'); await mkdir(artifactDirectory);
    const observationPath = path.join(root, 'selected.json'); await writeAuditFileV2(observationPath, evaluateAuthorizationVerifications(observations()));
    assert.equal((await writeSelectedAuthenticationProducerFileV2({ observationPath, artifactDirectory })).controls.length, 22);
    await assert.rejects(writeSelectedAuthenticationProducerFileV2({ observationPath, artifactDirectory }));
  } finally { await rm(root, { recursive: true, force: true }); }
});
