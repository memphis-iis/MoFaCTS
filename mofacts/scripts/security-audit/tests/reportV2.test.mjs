import assert from 'node:assert/strict';
import test from 'node:test';
import { auditDigest } from '../../../common/securityAudit/canonicalReport.ts';
import { AUDIT_MAX_DURATION_MS, auditReportCounts, parseSecurityAuditReportV2 } from '../../../common/securityAudit/reportV2.ts';
import { errorReport, ingestionContext, missingIdentity, platformImage, revision } from './fixtures/v2Fixtures.mjs';

async function resign(report) {
  const { digestSha256: _old, ...payload } = report;
  return { ...payload, digestSha256: await auditDigest(payload) };
}
async function withImageResult(status) {
  const report = await errorReport();
  const row = report.sections.repository.controls.find(control => control.controlId === 'repository.runtime-image-vulnerabilities.high');
  row.status = status;
  row.evidence = { summary: 'The reviewed image finding inventory completed.', metrics: { evaluatedCount: 2, findingCount: status === 'PASS' ? 0 : 1 } };
  report.counts = auditReportCounts(report.sections);
  return report;
}

test('V2 report: exact synthetic ERROR profiles remain recordable without build identity', async () => {
  for (const profile of ['full', 'exposure']) {
    const report = await errorReport(profile);
    assert.deepEqual(await parseSecurityAuditReportV2(report, ingestionContext), report);
    assert.deepEqual(await parseSecurityAuditReportV2(report, { purpose: 'retained' }), report);
    assert.equal(report.counts.error, profile === 'full' ? 70 : 23);
  }
});

test('V2 report: reject membership, order, profile, catalog and metadata mutations even with a recomputed digest', async () => {
  for (const mutate of [
    r => { r.schema = 'SecurityAuditReportV1'; },
    r => { r.catalogVersion = 2; },
    r => { r.catalogDigestSha256 = '1'.repeat(64); },
    r => { r.sections.external.controls[0].controlId = 'external.unexpected'; },
    r => { r.sections.external.controls[1] = structuredClone(r.sections.external.controls[0]); },
    r => { r.sections.external.controls.reverse(); },
    r => { r.sections.external.controls.pop(); r.counts.error--; },
    r => { [r.sections.external.controls[0], r.sections.internal.controls[0]] = [r.sections.internal.controls[0], r.sections.external.controls[0]]; },
    r => { r.reportType = 'exposure'; },
    r => { r.sections.external.controls[0].title = 'Producer replacement title'; },
    r => { r.sections.external.controls[0].failureSeverity = 'INFO'; },
    r => { r.sections.external.controls[0].status = 'NOT_APPLICABLE'; },
    r => { r.sections.external.controls[0].evidence.category = 'unreviewed'; },
    r => { r.sections.external.status = 'PASS'; },
    r => { r.counts.critical++; },
    r => { r.unexpected = true; },
    r => { r.toolVersions.unknown = '1.0'; },
    r => { r.executionErrors.push(r.executionErrors[0]); },
  ]) {
    const report = await errorReport(); mutate(report);
    await assert.rejects(parseSecurityAuditReportV2(await resign(report), ingestionContext));
  }
  const report = await errorReport(); report.digestSha256 = '1'.repeat(64);
  await assert.rejects(parseSecurityAuditReportV2(report, ingestionContext));
});

test('V2 report: enforce duration, completion skew and upload-age boundaries independently', async () => {
  const report = await errorReport();
  const at = value => new Date(value).toISOString();
  report.startedAt = at(Date.parse(report.completedAt) - AUDIT_MAX_DURATION_MS);
  await parseSecurityAuditReportV2(await resign(report), ingestionContext);
  report.startedAt = at(Date.parse(report.startedAt) - 1);
  await assert.rejects(parseSecurityAuditReportV2(await resign(report), ingestionContext));
  report.startedAt = at(Date.parse(report.completedAt) + 1);
  await assert.rejects(parseSecurityAuditReportV2(await resign(report), ingestionContext));
  const future = await errorReport(); future.completedAt = '2026-11-05T12:07:00.000Z';
  await parseSecurityAuditReportV2(await resign(future), ingestionContext);
  future.completedAt = '2026-11-05T12:07:00.001Z';
  await assert.rejects(parseSecurityAuditReportV2(await resign(future), ingestionContext));
  const timely = await errorReport();
  await parseSecurityAuditReportV2(timely, { ...ingestionContext, uploadedAt: '2026-11-05T12:16:00.000Z' });
  await assert.rejects(parseSecurityAuditReportV2(timely, { ...ingestionContext, uploadedAt: '2026-11-05T12:16:00.001Z' }));
});

test('V2 report: target approval is exact HTTPS origin equality, never a URL credential or path', async () => {
  for (const target of ['http://audit.example', 'https://other.example', 'https://audit.example/',
    'https://name:synthetic@audit.example', 'https://audit.example/path', 'https://audit.example?query=1']) {
    const report = await errorReport(); report.target = target;
    await assert.rejects(parseSecurityAuditReportV2(await resign(report), ingestionContext));
  }
});

test('V2 report: image PASS/FAIL needs independent application and platform-image observations', async () => {
  for (const status of ['PASS', 'FAIL']) {
    const report = await withImageResult(status);
    await assert.rejects(parseSecurityAuditReportV2(await resign(report), ingestionContext));
    report.deployedApplicationRevision = revision; report.deployedImageDigest = platformImage;
    const signed = await resign(report);
    await assert.rejects(parseSecurityAuditReportV2(signed, ingestionContext));
    const context = { ...ingestionContext, receiverRevision: revision, receiverImage: platformImage };
    await parseSecurityAuditReportV2(signed, context);
    assert.notEqual(signed.scannerSourceRevision, signed.deployedApplicationRevision.value);
    await assert.rejects(parseSecurityAuditReportV2(signed, { ...context,
      receiverRevision: { state: 'observed', value: 'd'.repeat(40) } }));
    await assert.rejects(parseSecurityAuditReportV2(signed, { ...context,
      receiverImage: { state: 'observed', value: `registry.example/mofacts@sha256:${'d'.repeat(64)}` } }));
  }
});

test('V2 report: missing/conflicting/malformed identity is explicit and cannot be replaced by a tag or config ID', async () => {
  const report = await errorReport();
  report.deployedApplicationRevision = { state: 'conflicting', reason: 'independent-observations-disagree' };
  await parseSecurityAuditReportV2(await resign(report), ingestionContext);
  for (const observation of [{ state: 'observed', value: 'unknown' }, { state: 'observed', value: 'sha256:' + 'b'.repeat(64) },
    { state: 'observed', value: 'registry.example/mofacts:latest' }, { ...missingIdentity, value: 'invented' }]) {
    report.deployedImageDigest = observation;
    await assert.rejects(parseSecurityAuditReportV2(await resign(report), ingestionContext));
  }
});
