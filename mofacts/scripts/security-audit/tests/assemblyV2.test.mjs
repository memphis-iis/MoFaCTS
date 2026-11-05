import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIVE_AUDIT_CATALOG, profileControls, readAuditCatalog } from '../../../common/securityAudit/catalogRegistry.ts';
import { parseAuditProducerArtifact } from '../../../common/securityAudit/producerArtifact.ts';
import { assembleAuditReportV2 } from '../core/assembleV2.mjs';
import { evaluateFindingTiers } from '../repository/findingTiers.mjs';
import { envelope, errorArtifacts, errorReport } from './fixtures/v2Fixtures.mjs';

test('V2 producers: exact ownership, membership, evidence and status without copied metadata', async () => {
  const catalog = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
  const { artifact } = (await errorArtifacts()).find(slot => slot.producerId === 'external');
  assert.deepEqual(parseAuditProducerArtifact(artifact, catalog, 'full', 'external'), artifact);
  for (const mutate of [
    a => { a.controls[1] = structuredClone(a.controls[0]); },
    a => { a.controls[0].controlId = 'external.unknown'; },
    a => { a.controls[0].controlId = 'external.public-udp-ports'; },
    a => { a.sectionId = 'internal'; },
    a => { a.producerId = 'internal'; },
    a => { a.controls[0].title = 'Producer-owned title'; },
    a => { a.controls[0].status = 'NOT_APPLICABLE'; },
    a => { a.controls[0].evidence.extra = true; },
    a => a.controls.pop(),
  ]) {
    const candidate = structuredClone(artifact); mutate(candidate);
    assert.throws(() => parseAuditProducerArtifact(candidate, catalog, 'full', 'external'));
  }
  const repository = (await errorArtifacts()).find(slot => slot.producerId === 'repository').artifact;
  assert.throws(() => parseAuditProducerArtifact(repository, catalog, 'exposure', 'repository'));
});

test('V2 assembly: exact profiles, catalog order/metadata and zero-control not-applicable sections', async () => {
  for (const profile of ['full', 'exposure']) {
    const report = await errorReport(profile);
    assert.equal(report.counts.error, profile === 'full' ? 70 : 23);
    assert.equal(report.counts.pass, 0);
    assert.equal(report.counts.notApplicable, 0);
    assert.equal(report.sections.authentication.status, profile === 'exposure' ? 'NOT_APPLICABLE' : 'ERROR');
    const catalog = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
    assert.deepEqual(Object.values(report.sections).flatMap(section => section.controls.map(row => row.controlId)),
      profileControls(catalog, profile).map(row => row.controlId));
  }
});

test('V2 assembly: missing, duplicate, unknown or malformed raw controls invalidate the complete owning subset only', async () => {
  for (const mutate of [
    slots => slots.splice(slots.findIndex(slot => slot.producerId === 'external'), 1),
    slots => { const a = slots.find(slot => slot.producerId === 'external').artifact; a.controls[1] = structuredClone(a.controls[0]); },
    slots => { slots.find(slot => slot.producerId === 'external').artifact.controls[0].controlId = 'external.unexpected'; },
    slots => { slots.find(slot => slot.producerId === 'external').artifact = null; },
    slots => { slots.push(structuredClone(slots.find(slot => slot.producerId === 'external'))); },
  ]) {
    const slots = await errorArtifacts();
    const external = slots.find(slot => slot.producerId === 'external');
    external.artifact.controls[0] = { controlId: 'external.dns-addresses', status: 'PASS',
      evidence: { summary: 'Resolved the configured address.', metrics: { addressCount: 1 } } };
    mutate(slots);
    const report = await assembleAuditReportV2({ ...envelope, artifacts: slots });
    const owned = report.sections.external.controls.filter(row => row.controlId !== 'external.public-udp-ports');
    assert.ok(owned.every(row => row.status === 'ERROR' && ['producer-missing', 'producer-malformed'].includes(row.evidence.category)));
    assert.equal(report.sections.external.controls.find(row => row.controlId === 'external.public-udp-ports').evidence.category,
      'synthetic-contract-qualification');
    assert.ok(report.sections.internal.controls.every(row => row.evidence.category === 'synthetic-contract-qualification'));
    assert.equal(JSON.stringify(report).includes('external.unexpected'), false);
  }
});

test('V2 assembly: all absent slots recover to a complete error report; unknown configured slots fail explicitly', async () => {
  const report = await assembleAuditReportV2({ ...envelope, artifacts: [] });
  assert.equal(report.counts.error, 70);
  assert.deepEqual(report.executionErrors, ['producer-missing']);
  await assert.rejects(assembleAuditReportV2({ ...envelope, artifacts: [{ producerId: 'foreign', artifact: null }] }));
});

test('V2 repository tiers preserve coexisting low/high/critical findings and never emit producer metadata', async () => {
  const catalog = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
  const rows = evaluateFindingTiers(catalog, 'full', 'application-runtime', [{ severity: 'low' }, { severity: 'high' }, { severity: 'critical' }]);
  assert.deepEqual(rows.map(row => row.status), ['FAIL', 'PASS', 'FAIL', 'FAIL']);
  for (const row of rows) assert.deepEqual(Object.keys(row), ['controlId', 'status', 'evidence']);
  assert.ok(evaluateFindingTiers(catalog, 'full', 'application-development', []).every(row => row.status === 'PASS'));
  assert.equal(evaluateFindingTiers(catalog, 'full', 'application-development', [{ severity: 'info' }])[0].status, 'FAIL');
  assert.equal(evaluateFindingTiers(catalog, 'full', 'application-runtime', [{ severity: 'info' }])[0].status, 'FAIL');
  assert.throws(() => evaluateFindingTiers(catalog, 'exposure', 'application-runtime', []));
  assert.throws(() => evaluateFindingTiers(catalog, 'full', 'runtime-image', [{ severity: 'low' }]));
  assert.throws(() => evaluateFindingTiers(catalog, 'full', 'application-runtime', [{ severity: 'unknown' }]));
});
