import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { AUTHORIZATION_VERIFICATIONS, auditVerification, AUDIT_VERIFICATIONS, AUTHENTICATION_CONTROL_CASES,
  AUTHENTICATION_PROTOCOL_MUTATIONS, AUTHORIZATION_MUTATIONS } from '../../../common/securityAudit/verificationCatalog.ts';

import { FILES_DDP_VERIFICATIONS, HTTP_FILE_VERIFICATIONS, HTTP_MIDDLEWARE_VERIFICATIONS } from '../../../common/securityAudit/verificationCatalog.ts';
import { registerHttpMiddleware, registerProtocolHttpMount, registeredHttpSurfaces } from '../../../server/securitySurfaces/registerHttpRoutes.ts';
import { observeAssetUploadSurfaces } from '../../../server/securitySurfaces/bindAssetUploadSurfaces.ts';

test('file and unmounted registrations use the original callback and framework call shape', () => {
  const calls = [];
  const stack = name => ({ use(...args) { calls.push([name, this, ...args]); } });
  const stacks = { connectHandlers: stack('normal'), rawConnectHandlers: stack('raw'), handlers: stack('handlers') };
  const handler = () => {};
  registerProtocolHttpMount(stacks, 'rawConnectHandlers', '/cdn/storage/Assets', {
    surfaceId: 'middleware:cdn-public-assets', policy: { kind: 'public-asset-marker' },
    dataEgress: { kind: 'public-asset' }, verification: HTTP_FILE_VERIFICATIONS.cdn,
  }, handler);
  registerHttpMiddleware(stacks, 'handlers', {
    surfaceId: 'middleware:security-headers', policy: { kind: 'response-headers' },
    dataEgress: { kind: 'none' }, verification: HTTP_MIDDLEWARE_VERIFICATIONS.headers,
  }, handler);
  assert.deepEqual(calls, [
    ['raw', stacks.rawConnectHandlers, '/cdn/storage/Assets', handler],
    ['handlers', stacks.handlers, handler],
  ]);
  const captured = registeredHttpSurfaces();
  assert.equal(captured[0]?.verification, HTTP_FILE_VERIFICATIONS.cdn);
  assert.equal(captured[1]?.verification, HTTP_MIDDLEWARE_VERIFICATIONS.headers);
  assert.ok(Object.isFrozen(captured));
});

const manifest = JSON.parse(fs.readFileSync(new URL('../../../security-surface-contract.json', import.meta.url)));
test('Assets ownership requires the exact registered package handlers and disabled client removal', () => {
  const operations = Object.keys(FILES_DDP_VERIFICATIONS);
  const methods = operations.map(operation => ({ operation, name: `_FilesCollection${operation.slice(1)}_Assets`,
    handler() { throw new Error('Observation must not invoke a method'); } }));
  const installed = Object.fromEntries(methods.map(method => [method.name, method.handler]));
  const owner = { observeDdpUploadRegistration: () => ({ collectionName: 'Assets', allowClientCode: false, methods }) };
  const result = observeAssetUploadSurfaces(owner, () => installed);
  assert.equal(result.state, 'observed');
  assert.deepEqual(new Set(result.surfaces.map(row => row.name)), new Set(manifest.methods
    .filter(row => /^_FilesCollection.*_Assets$/.test(row.name)).map(row => row.name)));
  const packageSource = fs.readFileSync(new URL('../../../packages/ostrio-files/package.js', import.meta.url), 'utf8');
  const version = packageSource.match(/\bversion:\s*'([^']+)'/)?.[1];
  assert.ok(version);
  for (const row of result.surfaces) {
    assert.equal(row.owner, `ostrio:files@${version}`);
    assert.equal(row.verification, AUDIT_VERIFICATIONS.find(entry => entry.verificationId === row.verification.verificationId));
    assert.ok(Object.isFrozen(row));
    assert.ok(!('handler' in row));
  }
  assert.equal(observeAssetUploadSurfaces(owner, () => ({})).reason, 'asset-package-handler-mismatch');
  assert.equal(observeAssetUploadSurfaces(owner, () => ({ ...installed, _FilesCollectionStart_Assets() {} })).reason,
    'asset-package-handler-mismatch');
  assert.equal(observeAssetUploadSurfaces({ observeDdpUploadRegistration: () => ({
    collectionName: 'Assets', allowClientCode: true, methods,
  }) }, () => installed).reason, 'asset-package-configuration');
});

test('Phase 2 source intent closes exactly over the 22 catalog controls without claiming executed coverage', () => {
  const catalog = JSON.parse(fs.readFileSync(new URL('../../../common/securityAudit/catalogs/control-catalog.v1.json', import.meta.url)));
  assert.deepEqual(AUTHENTICATION_CONTROL_CASES.map(row => row.controlId).sort(), catalog.controls.filter(row => row.producerId === 'authentication').map(row => row.controlId).sort());
  assert.equal(AUTHENTICATION_CONTROL_CASES.length, 22); assert.equal(AUDIT_VERIFICATIONS.filter(row => row.kind !== 'integrationTest').length, 68);
  const ids = new Set(AUDIT_VERIFICATIONS.filter(row => row.kind !== 'integrationTest').map(row => row.verificationId));
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
