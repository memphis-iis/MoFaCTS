import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { collectionMongoName } from '../../../common/collectionOwnership.ts';
import { createSecurityAuditReceiverV2 } from '../../../server/securityAudit/securityAuditReceiverV2.ts';
import { signAuditRequestV2 } from '../../../server/securityAudit/securityAuditIngestionV2.ts';
import { auditDigest, canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { errorReport } from './fixtures/v2Fixtures.mjs';

const clock = new Date('2026-11-05T12:02:00.000Z');
const absent = { state: 'unavailable', reason: 'not-provided' };
const secret = 'synthetic-inert-receiver-signing-material';
function fixture({ build = absent, image = absent } = {}) {
  const rows = [], calls = [], names = [];
  const db = {
    find(selector, options) { calls.push({ kind: 'find', selector, options }); return { fetchAsync: async () => select(selector, options) }; },
    async findOneAsync(selector, options) { calls.push({ kind: 'one', selector, options }); return select(selector, options)[0]; },
    async insertAsync(row) {
      if (rows.some(old => old.ingestNonce === row.ingestNonce || old.reportId === row.reportId || old.digestSha256 === row.digestSha256)) {
        const error = new Error('Synthetic unique collision'); error.code = 11000; throw error;
      }
      rows.push(structuredClone(row));
    },
    rawCollection: () => ({ async createIndex() { calls.push({ kind: 'index' }); } }),
  };
  function select(selector, options = {}) {
    let result = rows.filter(row => Object.entries(selector).every(([key, value]) => row[key] === value));
    if (options.sort) result = [...result].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    if (options.limit !== undefined) result = result.slice(0, options.limit);
    return result.map(row => {
      if (!options.fields) return structuredClone(row);
      const value = {};
      for (const [key, include] of Object.entries(options.fields)) {
        if (!include) continue;
        const parts = key.split('.'); let source = row, target = value;
        for (const part of parts.slice(0, -1)) { source = source?.[part]; target[part] ??= {}; target = target[part]; }
        target[parts.at(-1)] = structuredClone(source?.[parts.at(-1)]);
      }
      return value;
    });
  }
  let isAdmin = true, identityCalls = 0;
  const receiver = createSecurityAuditReceiverV2({
    createReports(name) { names.push(name); return db; },
    async requireAdminUser(userId) { if (userId !== 'synthetic-admin' || !isAdmin) throw new Error('Synthetic admin denial'); },
    platformIdentity: async () => { identityCalls++; return image; },
    loadBuildIdentity: async () => build,
    targetOrigin: () => 'https://audit.example', ingestSecret: () => secret, now: () => new Date(clock),
  });
  return { receiver, rows, calls, names, revoke: () => { isAdmin = false; }, identityCalls: () => identityCalls };
}
async function upload(value, report = undefined, nonce = 'synthetic-runtime-nonce-0001') {
  report ??= await errorReport();
  const body = Buffer.from(canonicalAuditJson(report)), timestamp = String(clock.getTime() / 1000);
  await value.receiver.receive(body, { timestamp, nonce, signature: signAuditRequestV2(secret, timestamp, nonce, body) });
  return report;
}
test('V2 receiver selects the delegated isolated namespace without startup metadata reads or an automatic index job', () => {
  const value = fixture();
  assert.deepEqual(value.names, [collectionMongoName('SecurityAuditReportsV2')]);
  assert.notEqual(value.names[0], collectionMongoName('SecurityAuditReports'));
  assert.equal(value.calls.length, 0); assert.equal(value.identityCalls(), 0);
});
test('V2 receiver accepts signed complete ERROR reports with unavailable identity and excludes replay', async () => {
  const value = fixture(), report = await upload(value);
  assert.deepEqual(await value.receiver.getSummary('synthetic-admin', report.reportId), (await value.receiver.list('synthetic-admin')).latestFull);
  assert.equal(value.rows.length, 1);
  await assert.rejects(upload(value, report), error => error.code === 11000);
  assert.equal(value.rows.length, 1);
  assert.equal(value.rows[0].expiresAt - value.rows[0].ingestedAt, 90 * 86400000);
});
test('V2 receiver authenticates before storing and rejects wrong signatures, targets and V1', async () => {
  const value = fixture(), report = await errorReport();
  const body = Buffer.from(canonicalAuditJson(report)), timestamp = String(clock.getTime() / 1000), nonce = 'synthetic-runtime-nonce-0002';
  await assert.rejects(value.receiver.receive(body, { timestamp, nonce, signature: 'f'.repeat(64) }));
  assert.equal(value.identityCalls(), 0);
  const { digestSha256: _old, ...wrongTarget } = { ...report, target: 'https://wrong.example' }; void _old;
  await assert.rejects(upload(value, { ...wrongTarget, digestSha256: await auditDigest(wrongTarget) }));
  await assert.rejects(upload(value, { schema: 'SecurityAuditReportV1' }));
  assert.equal(value.rows.length, 0);
});
test('V2 receiver compares claimed identity with its independent providers before persistence', async () => {
  const build = { state: 'observed', identity: { schema: 'BuildIdentityV1', baseCommit: 'a'.repeat(40),
    includedUncommittedLocalChanges: true, sourceSnapshotDigestSha256: 'b'.repeat(64) } };
  const image = { state: 'observed', value: 'registry.example/mofacts@sha256:' + 'c'.repeat(64) };
  for (const claims of [
    { deployedApplicationRevision: { state: 'observed', value: 'd'.repeat(40) }, deployedImageDigest: image },
    { deployedApplicationRevision: { state: 'observed', value: 'a'.repeat(40) }, deployedImageDigest: { state: 'observed', value: 'registry.example/mofacts@sha256:' + 'e'.repeat(64) } },
  ]) {
    const value = fixture({ build, image }), report = { ...await errorReport(), ...claims };
    const { digestSha256: _old, ...payload } = report; void _old;
    await assert.rejects(upload(value, { ...payload, digestSha256: await auditDigest(payload) }));
    assert.equal(value.rows.length, 0);
  }
});
test('V2 receiver denies admin reads and token minting before any report query', async () => {
  const value = fixture();
  for (const user of [null, 'synthetic-learner']) {
    await assert.rejects(value.receiver.list(user), /admin denial/);
    await assert.rejects(value.receiver.getSummary(user, 'missing'), /admin denial/);
    await assert.rejects(value.receiver.issueDownload(user, 'missing', 'json'), /admin denial/);
  }
  assert.equal(value.calls.length, 0);
});
test('V2 receiver downloads verified JSON/HTML with single-use capability and rejects missing/invalid-format requests', async () => {
  const value = fixture(), report = await upload(value);
  for (const format of ['json', 'html']) {
    const issued = await value.receiver.issueDownload('synthetic-admin', report.reportId, format);
    const parts = issued.url.split('/');
    const download = await value.receiver.download(parts.at(-2), parts.at(-1));
    assert.equal(download.sha256, createHash('sha256').update(download.body).digest('hex'));
    if (format === 'json') assert.deepEqual(JSON.parse(download.body), report);
    else assert(download.body.includes(Buffer.from(report.digestSha256)));
    await assert.rejects(value.receiver.download(parts.at(-2), parts.at(-1)), error => error.category === 'not-found');
  }
  await assert.rejects(value.receiver.getSummary('synthetic-admin', 'missing'), error => error.category === 'not-found');
  await assert.rejects(value.receiver.issueDownload('synthetic-admin', report.reportId, 'pdf'), error => error.category === 'invalid-download-format');
});
test('V2 receiver rechecks admin status and full integrity at download and token mint boundaries', async () => {
  const value = fixture(), report = await upload(value);
  const issued = await value.receiver.issueDownload('synthetic-admin', report.reportId, 'json'), parts = issued.url.split('/');
  value.revoke(); await assert.rejects(value.receiver.download(parts.at(-2), parts.at(-1)), /admin denial/);
  await assert.rejects(value.receiver.download(parts.at(-2), parts.at(-1)), error => error.category === 'not-found');
  const corrupted = fixture(); await upload(corrupted);
  corrupted.rows[0].sections.internal.controls[0].evidence.summary = 'Synthetic corruption';
  await assert.rejects(corrupted.receiver.issueDownload('synthetic-admin', report.reportId, 'json'));
});
