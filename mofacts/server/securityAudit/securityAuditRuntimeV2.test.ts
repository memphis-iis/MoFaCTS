import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import { auditReportsV2Fixture as reports } from '../../tests/fixtures/securityAuditReportsV2.ts';
import http from 'node:http';
import { once } from 'node:events';
import crypto from 'node:crypto';
import { canonicalAuditJson, auditDigest } from '../../common/securityAudit/canonicalReport.ts';
import { errorReport } from '../../scripts/security-audit/tests/fixtures/v2Fixtures.mjs';
import { signAuditRequestV2 } from './securityAuditIngestionV2.ts';
import { createSecurityAuditRuntimeV2 } from './securityAuditRuntimeV2.ts';

describe('V2 inert HTTP/admin runtime on real MongoDB', function() {
  const owned: string[] = [], clock = new Date('2026-11-05T12:02:00.000Z'), secret = 'synthetic-runtime-http-signing-material';
  let authorized = true;
  const runtime = createSecurityAuditRuntimeV2({ createReports: () => reports,
    async requireAdminUser(userId) { if (!authorized || userId !== 'synthetic-admin') throw new Meteor.Error('not-authorized', 'Synthetic denial'); },
    now: () => new Date(clock), targetOrigin: () => 'https://audit.example', ingestSecret: () => secret });
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

  it('binds only V2 in an isolated HTTP fixture and shares guarded Mongo summary/download methods', async function() {
    const report = await errorReport(); report.reportId = 'synthetic-http-runtime-' + crypto.randomBytes(8).toString('hex'); owned.push(report.reportId);
    const { digestSha256: _old, ...payload } = report; void _old; report.digestSha256 = await auditDigest(payload);
    const body = Buffer.from(canonicalAuditJson(report)), timestamp = String(clock.getTime() / 1000), nonce = crypto.randomBytes(24).toString('base64url');
    const headers = { 'content-type': 'application/json', 'x-mofacts-audit-timestamp': timestamp,
      'x-mofacts-audit-nonce': nonce, 'x-mofacts-audit-signature': signAuditRequestV2(secret, timestamp, nonce, body) };
    expect((await fetch(origin + '/internal/security-audits/v1', { method: 'POST', headers, body })).status).to.equal(404);
    expect((await fetch(origin + prefix, { method: 'POST', headers, body })).status).to.equal(201);
    expect((await fetch(origin + prefix, { method: 'POST', headers, body })).status).to.equal(409);
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
});
