import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIVE_AUDIT_CATALOG, readAuditCatalog } from '../../../common/securityAudit/catalogRegistry.ts';
import { AUTHENTICATION_CONTROL_CASES } from '../../../common/securityAudit/verificationCatalog.ts';
import { authenticationQualificationCatalogV2 } from '../authentication/qualificationV2.mjs';

test('qualification catalog covers all authentication contracts while preserving released catalog bytes and membership', async () => {
  const released = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
  const snapshot = JSON.stringify(released);
  const candidate = authenticationQualificationCatalogV2(released);
  assert.equal(candidate.catalogVersion, 2);
  assert.equal(JSON.stringify(released), snapshot);
  assert.deepEqual(candidate.profiles.exposure, released.profiles.exposure);
  assert.deepEqual(candidate.controls.filter(row => row.sectionId !== 'authentication'),
    released.controls.filter(row => row.sectionId !== 'authentication'));
  const byId = new Map(candidate.controls.map(row => [row.controlId, row]));
  assert.equal(candidate.profiles.full.authentication.length, 22);
  for (const definition of AUTHENTICATION_CONTROL_CASES) {
    const id = definition.controlId === 'authentication.passwordless.experiment-flag'
      ? 'authentication.passwordless.experiment-eligibility' : definition.controlId;
    assert.equal(byId.get(id).evidenceContract, definition.evidenceContract);
  }
  assert.equal(byId.has('authentication.passwordless.experiment-flag'), false);
  assert.equal(released.profiles.full.authentication.includes('authentication.passwordless.experiment-flag'), true);
  const coordinates = { catalogId: candidate.catalogId, catalogVersion: candidate.catalogVersion,
    catalogDigestSha256: '00825a1d183e3b1b3d1014273e49c3f1de17c3bd0a8207299e5778d4c44e5ac4' };
  assert.deepEqual(await readAuditCatalog(coordinates, 'retained'), candidate);
  await assert.rejects(readAuditCatalog(coordinates, 'ingestion'));
});
