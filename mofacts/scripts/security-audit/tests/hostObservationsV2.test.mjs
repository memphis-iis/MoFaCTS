import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { ACTIVE_AUDIT_CATALOG, profileControls, readAuditCatalog } from '../../../common/securityAudit/catalogRegistry.ts';
import { auditDigest, canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { parseAuditEvidence } from '../../../common/securityAudit/evidenceContracts.ts';
import { HOST_EVIDENCE_FIELDS, HOST_MEASUREMENT_DESCRIPTOR, hostGroupFields, hostMeasurementsOutcome, hostUnavailableObservations } from '../../../common/securityAudit/hostAuditPolicy.ts';
import { hostObservationContractDigest, parseHostObservations, parseHostObservationBytes } from '../../../common/securityAudit/hostObservations.ts';
import { authenticateAuditRequestV2, signAuditRequestV2 } from '../../../server/securityAudit/securityAuditIngestionV2.ts';
import { auditDownloadBytesV2 } from '../../../server/securityAudit/securityAuditPresentationV2.ts';
import { evaluateHostObservations, hostUdpMeasurements } from '../internal/evaluateHost.mjs';
import { evaluateUdpExposure } from '../composite/udpExposure.mjs';
import { assembleAuditReportV2 } from '../core/assembleV2.mjs';
import { envelope, errorArtifacts, ingestionContext } from './fixtures/v2Fixtures.mjs';
import { hostFixture, hostNow, safeHostMeasurements, unavailableFact } from './fixtures/hostFixtures.mjs';

const catalog = () => readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
const row = (artifact, id) => artifact.controls.find(control => control.controlId === id);
const evidence = (id, metrics) => ({ summary: 'Synthetic bounded host measurements.', metrics,
  ...(hostUnavailableObservations(id, metrics).length ? { observations: hostUnavailableObservations(id, metrics) } : {}) });
const allUnavailable = fixture => {
  for (const [group, facts] of Object.entries(fixture.observations)) for (const key of Object.keys(facts)) unavailableFact(fixture, group, key);
};

test('host observation descriptor: one frozen measurement owner and no evaluated metadata', async () => {
  assert.equal(Object.keys(HOST_EVIDENCE_FIELDS).length, 10);
  assert.equal(Object.keys(HOST_MEASUREMENT_DESCRIPTOR.groups).length, 10);
  assert.equal(Object.isFrozen(hostGroupFields('redis')), true);
  assert.throws(() => { hostGroupFields('redis').rawSecret = 'count'; });
  assert.throws(() => hostGroupFields('__proto__'));
  assert.equal(await hostObservationContractDigest(), await auditDigest(HOST_MEASUREMENT_DESCRIPTOR));
  assert.equal(await hostObservationContractDigest(), 'a49086834e0b4fa32885aa43117a58ddf5b9bcfd73e3f61b3931bbba7a1bdf28');
  for (const forbidden of ['controlId', 'failureSeverity', 'reportType', 'title', 'status']) {
    assert.equal(canonicalAuditJson(HOST_MEASUREMENT_DESCRIPTOR).includes(`"${forbidden}"`), false);
  }
});

test('host observations: exact current envelope, canonical bytes, explicit unavailable facts and independent copies', async () => {
  const fixture = await hostFixture(); unavailableFact(fixture, 'redis', 'applicationConnectivity', 'timeout');
  const parsed = await parseHostObservations(fixture, hostNow);
  assert.deepEqual(parsed, fixture);
  assert.deepEqual(await parseHostObservationBytes(Buffer.from(canonicalAuditJson(fixture) + '\n'), hostNow), fixture);
  parsed.observations.redis.applicationConnectivity.reason = 'transport';
  assert.equal(fixture.observations.redis.applicationConnectivity.reason, 'timeout');
});

test('host observations: malformed groups, facts, types, relations, versions and clocks reject the whole envelope', async () => {
  const c = await catalog(), fixture = await hostFixture();
  const mutations = [
    f => { f.observationSchema = 'MoFaCTSSecurityAuditHostObservationsV0'; },
    f => { f.contractDigestSha256 = 'f'.repeat(64); },
    f => { f.extra = 'synthetic private detail'; },
    f => { delete f.observations.redis; },
    f => { f.observations.unknown = {}; },
    f => { delete f.observations.redis.auditConnectivity; },
    f => { f.observations.redis.auditConnectivity = { state: 'observed', value: 'true' }; },
    f => { f.observations.redis.auditConnectivity = { state: 'unavailable', reason: 'raw private reason' }; },
    f => { f.observations.redis.auditConnectivity = { state: 'unavailable', reason: 'timeout', value: false }; },
    f => { f.observations.configuration.presentSettingCount.value = 19; },
    f => { f.observations.listeners.unexpectedStandardUdpListenerCount.value = 1; },
    f => { f.observations.listeners.unexpectedStandardListenerCount.value = 3; f.observations.listeners.unexpectedSensitiveListenerCount.value = 3; },
    f => { f.observations.firewall.unexpectedUdpAllowRuleCount.value = 1; },
    f => { f.observations.docker.privateNetworkModeCount.value = -1; },
    f => { f.observedAt = '2026-11-05T11:46:59.999Z'; },
    f => { f.observedAt = '2026-11-05T12:07:00.001Z'; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(fixture); mutate(changed);
    await assert.rejects(parseHostObservations(changed, hostNow));
    const artifact = await evaluateHostObservations(c, 'full', changed, hostNow);
    assert.equal(artifact.controls.length, 11);
    assert(artifact.controls.every(control => control.status === 'ERROR'));
    assert.equal(JSON.stringify(artifact).includes('synthetic private detail'), false);
  }
  await assert.rejects(parseHostObservations(fixture, new Date(NaN)));
  assert((await evaluateHostObservations(c, 'full', undefined, hostNow)).controls.every(r => r.evidence.category === 'producer-missing'));
  assert((await evaluateHostObservations(c, 'full', { ...fixture, observationSchema: 'old' }, hostNow)).controls.every(r => r.evidence.category === 'observation-version'));
});

test('host wire bytes: duplicate keys, oversized/invalid UTF-8, BOM, whitespace and extra documents cannot hide facts', async () => {
  const fixture = await hostFixture(), canonical = canonicalAuditJson(fixture);
  const duplicate = canonical.replace('"unauthenticatedCommandAccepted":{"state":"observed","value":false}',
    '"unauthenticatedCommandAccepted":{"state":"observed","value":true},"unauthenticatedCommandAccepted":{"state":"observed","value":false}');
  assert.notEqual(duplicate, canonical);
  assert.deepEqual(JSON.parse(duplicate), fixture);
  for (const bytes of [Buffer.alloc(65537), Buffer.from([255]), Buffer.from('\uFEFF' + canonical),
    Buffer.from(canonical + '\n\n'), Buffer.from(canonical + '{}'), Buffer.from(JSON.stringify(fixture, null, 2)),
    Buffer.from(duplicate)]) {
    await assert.rejects(parseHostObservationBytes(bytes, hostNow));
  }
  const c = await catalog();
  assert((await evaluateHostObservations(c, 'full', Buffer.from(canonical + '\n'), hostNow)).controls.every(r => r.status === 'PASS'));
  assert((await evaluateHostObservations(c, 'full', Buffer.from(canonical + '{}'), hostNow)).controls.every(r => r.status === 'ERROR'));
});

test('host internal evaluator: exact catalog subsets PASS with complete safe facts in both profiles', async () => {
  const c = await catalog(), fixture = await hostFixture();
  for (const profile of ['exposure', 'full']) {
    const artifact = await evaluateHostObservations(c, profile, fixture, hostNow);
    assert.deepEqual(artifact.controls.map(r => r.controlId), profileControls(c, profile).filter(r => r.producerId === 'internal').map(r => r.controlId));
    assert(artifact.controls.every(r => r.status === 'PASS'));
    assert(artifact.controls.every(r => !Object.hasOwn(r, 'title') && !Object.hasOwn(r, 'failureSeverity')));
  }
});

test('host proofs: every supported family has an explicit minimal failure proof, never arbitrary partial evidence', () => {
  const minimal = {
    'host-configuration-v1': { rootOnly: false },
    'host-listeners-v1': { unexpectedListenerCount: 1 },
    'application-listener-v1': { expectedListenerPresent: false },
    'sidecar-policy-v1': { absenceRequired: true, helperContainerCount: 1 },
    'docker-publications-v1': { unexpectedPublicationCount: 1 },
    'firewall-policy-v1': { defaultDenyInbound: false },
    'reverse-proxy-v1': { httpLoopbackOnly: false },
    'mongodb-unauthenticated-v1': { unauthenticatedReadAccepted: true },
    'mongodb-scoped-roles-v1': { applicationGrantsMatched: false },
    'redis-policy-v1': { unauthenticatedCommandAccepted: true },
  };
  for (const [id, metrics] of Object.entries(minimal)) {
    const proof = evidence(id, metrics);
    assert.deepEqual(parseAuditEvidence(id, 'FAIL', proof), proof);
    assert.throws(() => parseAuditEvidence(id, 'PASS', proof));
    if (proof.observations) {
      assert.throws(() => parseAuditEvidence(id, 'FAIL', { ...proof, observations: [] }));
      assert.throws(() => parseAuditEvidence(id, 'FAIL', { ...proof, observations: [...proof.observations, proof.observations[0]] }));
    }
    assert.throws(() => parseAuditEvidence(id, 'FAIL', evidence(id, {})));
    assert.throws(() => parseAuditEvidence(id, 'FAIL', evidence(id, { ...metrics, invented: false })));
    for (const key of ['constructor', '__proto__', 'toString']) {
      const hostile = { ...metrics, ...JSON.parse(`{"${key}":1}`) };
      assert.throws(() => parseAuditEvidence(id, 'FAIL', { ...proof, metrics: hostile }));
    }
  }
});

test('host outcomes: connectivity/query failures and incomplete coverage never become vulnerability findings or PASS', () => {
  for (const [id, metrics] of [
    ['redis-policy-v1', { ...safeHostMeasurements.redis, applicationConnectivity: false }],
    ['redis-policy-v1', { ...safeHostMeasurements.redis, auditConnectivity: false }],
    ['mongodb-scoped-roles-v1', { ...safeHostMeasurements.mongoRoles, authenticatedConnectivity: false }],
    ['docker-publications-v1', { ...safeHostMeasurements.docker, inspectedContainerCount: 2 }],
    ['reverse-proxy-v1', { ...safeHostMeasurements.proxy, inspectedUpstreamCount: 0 }],
    ['sidecar-policy-v1', { helperContainerCount: 1 }],
    ['host-listeners-v1', { inspectedListenerCount: 1 }],
  ]) {
    assert.equal(hostMeasurementsOutcome(id, metrics), 'ERROR');
    for (const status of ['PASS', 'FAIL']) assert.throws(() => parseAuditEvidence(id, status, evidence(id, metrics)));
  }
});

test('host evaluator: conclusive Redis/Mongo findings survive unavailable facts and other controls keep their own errors', async () => {
  const c = await catalog(), fixture = await hostFixture(); allUnavailable(fixture);
  assert((await evaluateHostObservations(c, 'full', fixture, hostNow)).controls.every(r => r.status === 'ERROR'));
  fixture.observations.redis.unauthenticatedCommandAccepted = { state: 'observed', value: true };
  fixture.observations.mongoRoles.applicationGrantsMatched = { state: 'observed', value: false };
  const artifact = await evaluateHostObservations(c, 'full', fixture, hostNow);
  assert.equal(artifact.controls.filter(r => r.status === 'FAIL').length, 2);
  assert.equal(artifact.controls.filter(r => r.status === 'ERROR').length, 9);
  const redis = row(artifact, 'internal.redis-auth');
  assert.deepEqual(redis.evidence.metrics, { unauthenticatedCommandAccepted: true });
  assert.deepEqual(redis.evidence.observations, ['unavailable measurement: applicationConnectivity', 'unavailable measurement: auditConnectivity', 'unavailable measurement: hostPublicationCount']);
  assert.equal(row(artifact, 'internal.mongodb-auth.scoped-roles').status, 'FAIL');
});

test('host listeners: one acquisition feeds fixed-impact tiers without duplicating or downgrading a finding', async () => {
  const fixture = await hostFixture(); fixture.observations.listeners.unexpectedSensitiveListenerCount.value = 1;
  fixture.observations.listeners.unexpectedSensitiveUdpListenerCount.value = 1;
  const artifact = await evaluateHostObservations(await catalog(), 'full', fixture, hostNow);
  assert.equal(row(artifact, 'internal.listening-sockets.standard').status, 'PASS');
  assert.equal(row(artifact, 'internal.listening-sockets.sensitive').status, 'FAIL');
  assert.deepEqual(row(artifact, 'internal.listening-sockets.sensitive').evidence.metrics,
    { inspectedListenerCount: 4, unexpectedListenerCount: 1, unexpectedUdpListenerCount: 1 });
});

test('host/composite boundary: revalidate version and freshness, sum real UDP facts, and never invent missing counts', async () => {
  const fixture = await hostFixture();
  const safe = await hostUdpMeasurements(fixture, hostNow);
  assert.deepEqual(safe, { unexpectedUdpListenerCount: 0, firewallActive: true, defaultDenyInbound: true, unexpectedUdpAllowRuleCount: 0, unexpectedUdpPublicationCount: 0 });
  unavailableFact(fixture, 'listeners', 'unexpectedSensitiveUdpListenerCount');
  const partial = await hostUdpMeasurements(fixture, hostNow);
  assert.equal(Object.hasOwn(partial, 'unexpectedUdpListenerCount'), false);
  const external = { observedResultCount: 7, expectedResultCount: 7, openSelectedUdpPortCount: 0 };
  assert.equal(evaluateUdpExposure(await catalog(), 'full', external, partial).controls[0].status, 'ERROR');
  await assert.rejects(hostUdpMeasurements({ ...fixture, observationSchema: 'old' }, hostNow));
});

test('host report end to end: preserve fixed severities, unavailable facts, signed ingestion and validated exports', async () => {
  const c = await catalog(), fixture = await hostFixture(); allUnavailable(fixture);
  fixture.observations.redis.unauthenticatedCommandAccepted = { state: 'observed', value: true };
  fixture.observations.mongoRoles.applicationGrantsMatched = { state: 'observed', value: false };
  const slots = await errorArtifacts(); slots.find(slot => slot.producerId === 'internal').artifact = await evaluateHostObservations(c, 'full', fixture, hostNow);
  const report = await assembleAuditReportV2({ ...envelope, artifacts: slots });
  assert.equal(report.counts.fail, 2); assert.equal(report.counts.critical, 1); assert.equal(report.counts.high, 1); assert.equal(report.counts.error, 68);
  const body = Buffer.from(canonicalAuditJson(report)), secret = 'synthetic-only-'.repeat(4), timestamp = '1793880120', nonce = 'synthetic-host-proof-nonce-0001';
  assert.deepEqual((await authenticateAuditRequestV2({ body, secret, now: hostNow, headers: { timestamp, nonce, signature: signAuditRequestV2(secret, timestamp, nonce, body) },
    receiver: { targetOrigin: ingestionContext.targetOrigin, receiverRevision: ingestionContext.receiverRevision, receiverImage: ingestionContext.receiverImage } })).report, report);
  for (const format of ['json', 'html']) {
    const download = await auditDownloadBytesV2(report, format);
    assert.equal(download.sha256, crypto.createHash('sha256').update(download.body).digest('hex'));
    assert(download.body.toString().includes('unavailable measurement: auditConnectivity'));
  }
  const target = report.sections.internal.controls.find(r => r.controlId === 'internal.redis-auth');
  target.evidence.observations = [];
  const { digestSha256: _old, ...payload } = report; report.digestSha256 = await auditDigest(payload);
  const forged = Buffer.from(canonicalAuditJson(report));
  await assert.rejects(authenticateAuditRequestV2({ body: forged, secret, now: hostNow,
    headers: { timestamp, nonce, signature: signAuditRequestV2(secret, timestamp, nonce, forged) },
    receiver: { targetOrigin: ingestionContext.targetOrigin, receiverRevision: ingestionContext.receiverRevision, receiverImage: ingestionContext.receiverImage } }));
});
