import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { auditReportsV2Fixture as reports } from '../../tests/fixtures/securityAuditReportsV2.ts';
import http from 'node:http';
import { once } from 'node:events';
import crypto from 'node:crypto';
import { canonicalAuditJson } from '../../common/securityAudit/canonicalReport.ts';
import { ACTIVE_AUDIT_CATALOG, AUDIT_CATALOG_V1, AUDIT_CATALOG_V2, type AuditCatalogCoordinates } from '../../common/securityAudit/catalogRegistry.ts';
import type { SecurityAuditReportV2 } from '../../common/securityAudit/reportV2.ts';
import { fullReportFixture } from '../../scripts/security-audit/tests/fixtures/v2Fixtures.mjs';
import { signAuditRequestV2 } from './securityAuditIngestionV2.ts';
import { createSecurityAuditRuntimeV2 } from './securityAuditRuntimeV2.ts';
import type { AuditReportCollectionV2 } from './securityAuditReportStoreV2.ts';

describe('V2 inert HTTP/admin runtime on real MongoDB', function() {
  const owned: string[] = [], clock = new Date(), secret = 'synthetic-runtime-http-signing-material';
  let authorized = true;
  function createRuntime(catalog: AuditCatalogCoordinates, collection: AuditReportCollectionV2) {
    return createSecurityAuditRuntimeV2({ catalog, createReports: () => collection,
      async requireAdminUser(userId) { if (!authorized || userId !== 'synthetic-admin') throw new Meteor.Error('not-authorized', 'Synthetic denial'); },
      now: () => new Date(clock), targetOrigin: () => 'https://audit.example', ingestSecret: () => secret });
  }
  let runtime = createRuntime(ACTIVE_AUDIT_CATALOG, reports);
  const prefix = '/internal/security-audits/v2', downloads = '/admin/security-audits/download';
  const server = http.createServer((req, res) => {
    const path = req.url || ''; let pending: Promise<void>;
    if (path.startsWith(prefix)) { req.url = path.slice(prefix.length); pending = runtime.http.ingest(req, res); }
    else if (path.startsWith(downloads)) { req.url = path.slice(downloads.length); pending = runtime.http.download(req, res); }
    else { res.writeHead(404); res.end(); return; }
    pending.catch(() => res.destroy());
  });
  let origin: string;
  before(async function() {
    await runtime.initialize(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Synthetic HTTP listener unavailable');
    origin = `http://127.0.0.1:${address.port}`;
  });
  after(async function() {
    server.closeAllConnections(); const closed = once(server, 'close'); server.close(); await closed;
    await reports.removeAsync({ reportId: { $in: owned } });
  });

  function signedRequest(report: SecurityAuditReportV2) {
    const body = Buffer.from(canonicalAuditJson(report));
    const timestamp = String(Math.floor(clock.getTime() / 1000)), nonce = crypto.randomBytes(24).toString('base64url');
    const headers = { 'content-type': 'application/json', 'x-mofacts-audit-timestamp': timestamp,
      'x-mofacts-audit-nonce': nonce, 'x-mofacts-audit-signature': signAuditRequestV2(secret, timestamp, nonce, body) };
    return { method: 'POST', headers, body };
  }

  it('binds only V2 in an isolated HTTP fixture and shares guarded Mongo summary/download methods', async function() {
    const report = await fullReportFixture(ACTIVE_AUDIT_CATALOG, 'synthetic-http-runtime-' + crypto.randomBytes(8).toString('hex'), clock);
    owned.push(report.reportId);
    const request = signedRequest(report);
    expect((await fetch(origin + '/internal/security-audits/v1', request)).status).to.equal(404);
    expect((await fetch(origin + prefix, request)).status).to.equal(201);
    expect((await fetch(origin + prefix, request)).status).to.equal(409);
    const summary = await runtime.methods['admin.securityAudits.get'].call({ userId: 'synthetic-admin' }, ` ${report.reportId} `);
    expect(summary.reportId).to.equal(report.reportId); expect(Object.hasOwn(summary, 'sections')).to.equal(false);
    const latest = await runtime.methods['admin.securityAudits.list'].call({ userId: 'synthetic-admin' });
    expect(latest.reports.some(row => row.reportId === report.reportId)).to.equal(true);
    const issued = await runtime.methods['admin.securityAudits.downloadToken'].call({ userId: 'synthetic-admin' }, report.reportId, 'json');
    const response = await fetch(origin + issued.url), downloaded = Buffer.from(await response.arrayBuffer());
    expect(response.status).to.equal(200); expect(JSON.parse(downloaded.toString('utf8'))).to.deep.equal(report);
    expect(response.headers.get('x-content-sha256')).to.equal(crypto.createHash('sha256').update(downloaded).digest('hex'));
    expect((await fetch(origin + issued.url)).status).to.equal(404);
    for (const userId of [null, 'synthetic-learner', 'synthetic-teacher']) {
      let error: unknown;
      try { await runtime.methods['admin.securityAudits.get'].call({ userId }, 'invalid/path'); } catch (caught) { error = caught; }
      expect(error).to.be.instanceOf(Meteor.Error); expect((error as Meteor.Error).error).to.equal('not-authorized');
    }
    let invalid: unknown;
    try { await runtime.methods['admin.securityAudits.get'].call({ userId: 'synthetic-admin' }, 'invalid/path'); } catch (error) { invalid = error; }
    expect((invalid as Meteor.Error).error).to.equal('invalid-report-id');
    const revoked = await runtime.methods['admin.securityAudits.downloadToken'].call({ userId: 'synthetic-admin' }, report.reportId, 'html');
    authorized = false; expect((await fetch(origin + revoked.url)).status).to.equal(403);
  });

  it('receives catalog v2 over loopback and preserves catalog v1 report readback in MongoDB', async function() {
    const suffix = crypto.randomBytes(8).toString('hex');
    const collection = new Mongo.Collection<Record<string, unknown>>('mofactsAuditReceiverCatalog' + suffix);
    const savedRuntime = runtime;
    authorized = true;
    try {
      runtime = createRuntime(AUDIT_CATALOG_V1, collection);
      await runtime.initialize();
      const older = await fullReportFixture(AUDIT_CATALOG_V1, 'synthetic-catalog-1-' + suffix, clock);
      const candidate = await fullReportFixture(AUDIT_CATALOG_V2, 'synthetic-catalog-2-' + suffix, clock);
      expect((await fetch(origin + prefix, signedRequest(older))).status).to.equal(201);
      expect((await fetch(origin + prefix, signedRequest(candidate))).status).to.equal(400);
      const savedOlder = await collection.findOneAsync({ reportId: older.reportId });

      runtime = createRuntime(AUDIT_CATALOG_V2, collection);
      const admin = { userId: 'synthetic-admin' };
      expect((await runtime.methods['admin.securityAudits.list'].call(admin)).latestFull).to.equal(null);
      const wrongCatalog = await fullReportFixture(AUDIT_CATALOG_V1, 'synthetic-catalog-mismatch-' + suffix, clock);
      expect((await fetch(origin + prefix, signedRequest(wrongCatalog))).status).to.equal(400);
      expect((await fetch(origin + prefix, signedRequest(candidate))).status).to.equal(201);

      const summaries = await runtime.methods['admin.securityAudits.list'].call(admin);
      expect(summaries.latestFull?.reportId).to.equal(candidate.reportId);
      expect(summaries.reports.map(row => row.reportId)).to.have.members([older.reportId, candidate.reportId]);
      expect(candidate.counts.error).to.equal(70);
      for (const report of [older, candidate]) {
        const issued = await runtime.methods['admin.securityAudits.downloadToken'].call(admin, report.reportId, 'json');
        const response = await fetch(origin + issued.url);
        expect(response.status).to.equal(200);
        expect(await response.json()).to.deep.equal(report);
      }
      expect(await collection.findOneAsync({ reportId: older.reportId })).to.deep.equal(savedOlder);
    } finally {
      runtime = savedRuntime;
      await collection.rawCollection().drop();
    }
  });
});
