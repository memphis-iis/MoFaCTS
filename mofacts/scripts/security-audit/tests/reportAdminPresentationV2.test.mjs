import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSecurityAuditSnapshotV2, securityAuditIsStaleV2 } from '../../../client/views/adminSecurityAuditsStateV2.ts';
import { database, resign, stored } from './fixtures/reportStorageFixtures.mjs';
import { errorReport, missingIdentity, platformImage, revision } from './fixtures/v2Fixtures.mjs';

async function projectedSnapshot() {
  const exposure = await resign({ ...await errorReport('exposure'), reportId: 'synthetic-exposure' });
  const full = await resign({
    ...await errorReport(), reportId: 'synthetic-full', deployedApplicationRevision: revision,
    deployedImageDigest: platformImage,
  });
  return database([stored(exposure), stored(full)]).store.list();
}

test('V2 admin state consumes the store list response and preserves distinct identity observations', async () => {
  const empty = await database().store.list();
  assert.deepEqual(normalizeSecurityAuditSnapshotV2(empty), { reports: [], latestExposure: null, latestFull: null });

  const response = await projectedSnapshot();
  const snapshot = normalizeSecurityAuditSnapshotV2(response);
  assert.deepEqual(snapshot, response);
  assert.equal(snapshot.latestExposure.reportId, 'synthetic-exposure');
  assert.deepEqual(snapshot.latestExposure.deployedApplicationRevision, missingIdentity);
  assert.equal(snapshot.latestFull.reportId, 'synthetic-full');
  assert.deepEqual(snapshot.latestFull.deployedApplicationRevision, revision);
  assert.deepEqual(snapshot.latestFull.deployedImageDigest, platformImage);
  assert.notEqual(snapshot.latestFull.scannerSourceRevision, revision.value);
});

test('V2 admin state rejects legacy envelopes, full evidence and swapped latest cards', async () => {
  const response = await projectedSnapshot();
  const raw = await errorReport();
  assert.throws(() => normalizeSecurityAuditSnapshotV2({ ...response, generatedAt: raw.completedAt }));
  assert.throws(() => normalizeSecurityAuditSnapshotV2({ ...response, reports: [raw] }));
  assert.throws(() => normalizeSecurityAuditSnapshotV2({ ...response, reports: [{ ...response.reports[0], schema: 'SecurityAuditReportV1' }] }));
  assert.throws(() => normalizeSecurityAuditSnapshotV2({ ...response, latestExposure: response.latestFull }));
  assert.throws(() => normalizeSecurityAuditSnapshotV2({ ...response, latestFull: response.latestExposure }));
});

test('V2 admin state rejects malformed dates, origins, status and deployment metadata', async () => {
  const response = await projectedSnapshot();
  for (const invalid of [
    { completedAt: 'not-a-date' },
    { target: 'https://synthetic-user@audit.example' },
    { deployedImageDigest: { state: 'observed', value: 'synthetic:latest' } },
    { counts: { ...response.latestFull.counts, fail: -1 } },
    { sectionStatuses: { ...response.latestFull.sectionStatuses, internal: 'unknown' } },
  ]) {
    assert.throws(() => normalizeSecurityAuditSnapshotV2({ ...response, latestFull: { ...response.latestFull, ...invalid } }));
  }
});

test('V2 admin freshness retains the separate exposure and full report time windows', async () => {
  const response = await projectedSnapshot();
  for (const [report, hours] of [[response.latestExposure, 36], [response.latestFull, 8 * 24]]) {
    const expires = Date.parse(report.completedAt) + hours * 60 * 60 * 1000;
    assert.equal(securityAuditIsStaleV2(report, expires), false);
    assert.equal(securityAuditIsStaleV2(report, expires + 1), true);
  }
});
