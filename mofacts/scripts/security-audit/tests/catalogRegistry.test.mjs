import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import raw from '../../../common/securityAudit/catalogs/control-catalog.v1.json' with { type: 'json' };
import legacy from './fixtures/v1-membership.json' with { type: 'json' };
import { ACTIVE_AUDIT_CATALOG, parseAuditCatalog, profileControls, readAuditCatalog } from '../../../common/securityAudit/catalogRegistry.ts';
import { auditDigest, canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { AUDIT_EVIDENCE_CONTRACT_IDS, parseAuditEvidence } from '../../../common/securityAudit/evidenceContracts.ts';

const golden = '6a9cd0c985bdec14b0d78d2b731975005ed8cd69e76bb7597c8ada2564ba688d';
test('V2 catalog: pinned runtime JSON/TypeScript imports match the independently reviewed golden digest', async () => {
  const parsed = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
  assert.equal(await auditDigest(raw), golden);
  assert.equal(createHash('sha256').update(canonicalAuditJson(raw)).digest('hex'), golden);
  assert.equal(await auditDigest(parsed), golden);
  assert.equal(ACTIVE_AUDIT_CATALOG.catalogDigestSha256, golden);
  assert.equal(profileControls(parsed, 'full').length, 70);
  assert.equal(profileControls(parsed, 'exposure').length, 23);
  assert.deepEqual(parsed.profiles.exposure.authentication, []);
  assert.deepEqual(parsed.profiles.exposure.repository, []);
  assert.ok(Object.isFrozen(parsed.controls[0]));
  assert.ok(Object.isFrozen(parsed.profiles.full.external));
  assert.throws(() => { parsed.controls[0].title = 'Mutated title'; });
  assert.deepEqual(await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'retained'), parsed);
});

test('V2 catalog: approved splits preserve 44 original identities and never repurpose the eight aggregate IDs', () => {
  const ids = new Set(raw.controls.map(row => row.controlId));
  const original = Object.values(legacy).flat();
  const replaced = original.filter(id => !ids.has(id));
  assert.equal(replaced.length, 8);
  assert.equal(original.filter(id => ids.has(id)).length, 44);
  for (const id of replaced) assert.ok(raw.controls.filter(row => row.controlId.startsWith(`${id}.`)).length >= 2);
  const levels = prefix => raw.controls.filter(row => row.controlId.startsWith(prefix)).map(row => row.failureSeverity);
  assert.deepEqual(levels('repository.dependencies-application-runtime.'), ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
  assert.deepEqual(levels('repository.dependencies-application-development.'), ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
});

test('V2 catalog: reject unresolved/duplicate/wrong-section metadata and profile mutations', () => {
  for (const mutate of [
    c => c.controls.push(structuredClone(c.controls[0])),
    c => { c.controls[0].sectionId = 'repository'; },
    c => { c.controls[0].failureSeverity = 'urgent'; },
    c => { c.controls[0].evidenceContract = 'unknown-v1'; },
    c => { c.controls[0].producerId = 'repository'; },
    c => { c.controls[0].unexpected = true; },
    c => { c.catalogVersion = '1'; },
    c => c.profiles.full.external.pop(),
    c => c.profiles.full.external.push(c.profiles.full.external[0]),
    c => c.profiles.exposure.external.push('external.unknown'),
    c => c.profiles.exposure.external.push(c.profiles.full.repository[0]),
    c => { c.profiles.full.extra = []; },
    c => { c.controls[0].standardsReferences = ['authorization: synthetic']; },
  ]) {
    const candidate = structuredClone(raw); mutate(candidate);
    assert.throws(() => parseAuditCatalog(candidate));
  }
});

test('V2 catalog: retained coordinates are exact and semantic edits cannot retain the approved digest', async () => {
  for (const change of [{ catalogId: 'another-catalog' }, { catalogVersion: 2 },
    { catalogDigestSha256: '1'.repeat(64) }, { unexpected: true }]) {
    await assert.rejects(readAuditCatalog({ ...ACTIVE_AUDIT_CATALOG, ...change }, 'retained'));
  }
  const changed = structuredClone(raw); changed.controls[0].title = 'A different security property';
  assert.notEqual(await auditDigest(parseAuditCatalog(changed)), golden);
  const reordered = Object.fromEntries(Object.entries(raw).reverse());
  assert.equal(await auditDigest(reordered), golden);
});

test('V2 evidence: every catalog reference resolves and every ERROR is categorized and value-independent', () => {
  for (const id of AUDIT_EVIDENCE_CONTRACT_IDS) {
    assert.deepEqual(parseAuditEvidence(id, 'ERROR', { summary: 'Acquisition was unavailable.', category: 'transport' }),
      { summary: 'Acquisition was unavailable.', category: 'transport' });
    assert.throws(() => parseAuditEvidence(id, 'ERROR', { summary: 'Missing category.' }));
    assert.throws(() => parseAuditEvidence(id, 'ERROR', { summary: 'Acquisition failed.', category: 'raw-private-value' }));
    assert.throws(() => parseAuditEvidence(id, 'NOT_APPLICABLE', { summary: 'Skipped.' }));
  }
  for (const row of raw.controls) assert.ok(AUDIT_EVIDENCE_CONTRACT_IDS.includes(row.evidenceContract));
});

test('V2 evidence: required observation facts, finite bounds and status-specific finding proof cannot be omitted', () => {
  const evidence = { summary: 'Reviewed inventory completed.', metrics: { evaluatedCount: 3, findingCount: 0 } };
  assert.deepEqual(parseAuditEvidence('finding-inventory-v1', 'PASS', evidence), evidence);
  assert.throws(() => parseAuditEvidence('finding-inventory-v1', 'FAIL', evidence));
  assert.throws(() => parseAuditEvidence('finding-inventory-v1', 'PASS', { ...evidence, metrics: { evaluatedCount: 3, findingCount: 1 } }));
  assert.equal(parseAuditEvidence('finding-inventory-v1', 'FAIL', { ...evidence, metrics: { evaluatedCount: 3, findingCount: 1 } }).metrics.findingCount, 1);
  for (const metric of [-1, 0.5, NaN, Infinity, 1e13, '0', false]) {
    assert.throws(() => parseAuditEvidence('finding-inventory-v1', 'PASS', { ...evidence, metrics: { evaluatedCount: metric, findingCount: 0 } }));
  }
  assert.throws(() => parseAuditEvidence('address-inventory-v1', 'PASS', { summary: 'Only prose.' }));
  assert.throws(() => parseAuditEvidence('address-inventory-v1', 'PASS', { summary: 'Inventory complete.', metrics: { addressCount: 1, rawResponse: 1 } }));
  for (const summary of ['line\nbreak', 'authorization: synthetic', 'person@example.test', 'x'.repeat(501)]) {
    assert.throws(() => parseAuditEvidence('finding-inventory-v1', 'PASS', { ...evidence, summary }));
  }
});

test('V2 canonicalization rejects non-JSON, sparse arrays and nonfinite numbers', () => {
  for (const value of [undefined, NaN, Infinity, new Date(), { missing: undefined }, Array(2)]) {
    assert.throws(() => canonicalAuditJson(value));
  }
  assert.equal(canonicalAuditJson({ b: 1, a: ['x', null] }), '{"a":["x",null],"b":1}');
});

test('V2 evidence: every released proof shape accepts complete observations and rejects omitted or coerced facts', () => {
  const samples = {
    'address-inventory-v1': { addressCount: 1 },
    'finding-inventory-v1': { evaluatedCount: 1, findingCount: 0 },
    'image-findings-v1': { evaluatedCount: 1, findingCount: 0 },
    'tcp-policy-v1': { addressCount: 1, testedEndpointCount: 2, unexpectedPortCount: 0, missingRequiredPortCount: 0 },
    'udp-exposure-v1': { observedResultCount: 7, expectedResultCount: 7, openSelectedUdpPortCount: 0, unexpectedUdpListenerCount: 0, unexpectedUdpAllowRuleCount: 0, unexpectedUdpPublicationCount: 0, firewallActive: true, defaultDenyInbound: true },
    'http-redirect-v1': { testedPathCount: 3, passingPathCount: 3 },
    'tls-protocols-v1': { addressCount: 1, testedProtocolCount: 4, acceptedLegacyCount: 0, rejectedModernCount: 0 },
    'certificate-policy-v1': { addressCount: 1, validatedCertificateCount: 1, minimumValidityDays: 60 },
    'tls-ciphers-v1': { cipherCount: 5, weakCipherCount: 0 },
    'websocket-policy-v1': { addressCount: 1, secureUpgradeCount: 1, insecureUpgradeCount: 0 },
    'header-policy-v1': { requiredRestrictionCount: 4, matchingRestrictionCount: 4 },
    'enumeration-observations-v1': { loginCodeMatch: true, resetShapeMatch: true, rateLimitedAttemptCount: 0, comparedAttemptCount: 10 },
    'timing-observations-v1': { loginDifferentialMs: 5, loginApprovedBoundMs: 50, resetDifferentialMs: 8, resetApprovedBoundMs: 50, sampleCountPerIdentifier: 10 },
    'reset-expiration-v1': { ageMinutes: 65, configuredLifetimeMinutes: 60, accepted: false },
    'session-lifetime-v1': { lifetimeDays: 30, authenticated: true },
    'session-lifetime-v2': { lifetimeDays: 30, authenticated: true, freshSessionVerified: true },
    'verification-observations-v1': { expectedCaseCount: 2, completedCaseCount: 2, matchedCaseCount: 2, domainRejectionCount: 0, transportErrorCount: 0, inconclusiveCaseCount: 0 },
    'host-configuration-v1': { requiredSettingCount: 3, presentSettingCount: 3, rootOwned: true, rootOnly: true },
    'host-listeners-v1': { inspectedListenerCount: 5, unexpectedListenerCount: 0, unexpectedUdpListenerCount: 0 },
    'application-listener-v1': { expectedListenerPresent: true },
    'sidecar-policy-v1': { absenceRequired: true, listenerCount: 0, helperContainerCount: 0, endpointDeclarationCount: 0, publicationCount: 0, loopbackOnly: true },
    'docker-publications-v1': { inspectedContainerCount: 3, expectedApplicationPublicationCount: 1, unexpectedPublicationCount: 0, unexpectedUdpPublicationCount: 0, privateNetworkModeCount: 0 },
    'firewall-policy-v1': { firewallActive: true, defaultDenyInbound: true, publicWebAllowed: true, scopedSshOnly: true, unexpectedAllowRuleCount: 0, unexpectedUdpAllowRuleCount: 0 },
    'reverse-proxy-v1': { configuredHostMatched: true, apacheActive: true, apacheConfigValid: true, httpLoopbackOnly: true, websocketLoopbackOnly: true, inspectedUpstreamCount: 2 },
    'mongodb-unauthenticated-v1': { unauthenticatedReadAccepted: false },
    'mongodb-scoped-roles-v1': { authenticatedConnectivity: true, replicaSetMatched: true, applicationGrantsMatched: true, readConcernRoleMatched: true, sidecarAccountStateMatched: true },
    'redis-policy-v1': { unauthenticatedCommandAccepted: false, auditConnectivity: true, applicationConnectivity: true, hostPublicationCount: 0 },
  };
  const comparison = { loginPairCount: 5, resetPairCount: 2, baselineVerified: true, bindingsVerified: true,
    environmentLeaseHeld: true, rateLimitedAttemptCount: 0, domainRejectionCount: 0,
    transportErrorCount: 0, inconclusiveCaseCount: 0 };
  samples['enumeration-observations-v2'] = { ...comparison, loginResponseMatch: true, resetResponseMatch: true };
  samples['timing-observations-v2'] = { ...comparison, loginExistingMedianMs: 900, loginMissingMedianMs: 900,
    loginDifferentialMs: 0, loginApprovedBoundMs: 450, loginDominantDirectionCount: 0, loginRequiredDirectionCount: 4,
    resetExistingMedianMs: 300, resetMissingMedianMs: 300, resetDifferentialMs: 0,
    resetApprovedBoundMs: 250, resetDominantDirectionCount: 0, resetRequiredDirectionCount: 2 };
  assert.deepEqual(Object.keys(samples).sort(), [...AUDIT_EVIDENCE_CONTRACT_IDS].sort());
  for (const [id, metrics] of Object.entries(samples)) {
    const evidence = { summary: 'Complete bounded observations.', metrics };
    assert.deepEqual(parseAuditEvidence(id, 'PASS', evidence), evidence);
    for (const key of Object.keys(metrics)) {
      const missing = structuredClone(evidence); delete missing.metrics[key];
      assert.throws(() => parseAuditEvidence(id, 'PASS', missing));
      const coerced = structuredClone(evidence); coerced.metrics[key] = String(metrics[key]);
      assert.throws(() => parseAuditEvidence(id, 'PASS', coerced));
    }
  }
  for (const id of ['__proto__', 'constructor', 'not-a-contract']) {
    assert.throws(() => parseAuditEvidence(id, 'ERROR', { summary: 'No raw response.', category: 'transport' }));
  }
  for (const key of ['domainRejectionCount', 'transportErrorCount', 'inconclusiveCaseCount']) {
    const metrics = { ...samples['verification-observations-v1'], [key]: 1 };
    assert.throws(() => parseAuditEvidence('verification-observations-v1', 'PASS', { summary: 'Incomplete verification.', metrics }));
  }
});
