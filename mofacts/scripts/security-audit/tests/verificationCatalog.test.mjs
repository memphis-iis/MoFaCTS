import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { AUTHORIZATION_VERIFICATIONS, auditVerification, AUDIT_VERIFICATIONS, AUTHENTICATION_CONTROL_CASES,
  AUTHENTICATION_PROTOCOL_MUTATIONS, AUTHORIZATION_MUTATIONS } from '../../../common/securityAudit/verificationCatalog.ts';

const manifest = JSON.parse(fs.readFileSync(new URL('../../../security-surface-contract.json', import.meta.url)));
test('Phase 2 source intent closes exactly over the 22 catalog controls without claiming executed coverage', () => {
  const catalog = JSON.parse(fs.readFileSync(new URL('../../../common/securityAudit/catalogs/control-catalog.v1.json', import.meta.url)));
  assert.deepEqual(AUTHENTICATION_CONTROL_CASES.map(row => row.controlId).sort(), catalog.controls.filter(row => row.producerId === 'authentication').map(row => row.controlId).sort());
  assert.equal(AUTHENTICATION_CONTROL_CASES.length, 22); assert.equal(AUDIT_VERIFICATIONS.length, 68);
  const ids = new Set(AUDIT_VERIFICATIONS.map(row => row.verificationId));
  assert.equal(ids.size, 68);
  for (const control of AUTHENTICATION_CONTROL_CASES) {
    assert.ok(Object.isFrozen(control)); assert.ok(control.verificationIds.every(id => ids.has(id)));
  }
  for (const entry of AUDIT_VERIFICATIONS) assert.ok(Object.hasOwn({ ...AUTHORIZATION_MUTATIONS, ...AUTHENTICATION_PROTOCOL_MUTATIONS }, entry.mutation));
});
test('selected authorization catalog has exact subjects and explicit successful baselines', () => {
  assert.equal(AUTHORIZATION_VERIFICATIONS.length, 29);
  assert.equal(new Set(AUTHORIZATION_VERIFICATIONS.map(row => row.verificationId)).size, 29);
  const privacy = AUTHORIZATION_VERIFICATIONS.filter(row => row.verificationId.startsWith('authz.publication.progress-private.'));
  assert.equal(privacy.length, 5);
  assert.deepEqual(privacy.map(row => row.actor), ['anonymous', 'learnerA', 'learnerB', 'teacherA', 'teacherB']);
  for (const row of privacy) {
    assert.equal(row.surfaceId, 'publication:userExperimentState'); assert.equal(row.expectedPolicy, 'deny');
    assert.notEqual(row.actor, row.subjectActor);
  }
  for (const row of AUTHORIZATION_VERIFICATIONS) {
    assert.equal(auditVerification(row.verificationId), row);
    assert.equal(row.kind, 'authorizationScenario'); assert.equal(row.lane, 'remote');
    if (row.expectedPolicy === 'deny') assert(row.allowedBaselineIds.length > 0);
    for (const id of row.allowedBaselineIds) assert.equal(auditVerification(id).expectedPolicy, 'allow');
    assert(Object.isFrozen(row)); assert(Object.isFrozen(row.bindingAliases));
  }
  assert.throws(() => auditVerification('unreviewed.fixture.subject'));
});
test('every selected server subject resolves to the current reviewed security-surface manifest', () => {
  const names = key => new Set(manifest[key].map(row => row.name));
  const methods = names('methods'), publications = names('publications'), routes = names('httpRoutes');
  for (const row of AUTHORIZATION_VERIFICATIONS) {
    const name = row.surfaceId.slice(row.surfaceId.indexOf(':') + 1);
    if (row.family === 'method') assert(methods.has(name), row.verificationId);
    if (row.family === 'publication') assert(publications.has(name), row.verificationId);
    if (row.family === 'download') assert(routes.has(name), row.verificationId);
  }
  assert.deepEqual(auditVerification('authz.method.own-settings.anonymous').policyDenialCodes, ['401']);
  assert.deepEqual(auditVerification('authz.method.foreign-performance.learnerA').policyDenialCodes, ['403']);
  assert.deepEqual(auditVerification('authz.method.audit-list.teacherA').policyDenialCodes, ['not-authorized']);
});
