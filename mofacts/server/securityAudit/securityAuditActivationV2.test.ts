import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { Roles } from 'meteor/alanning:roles';
import { randomBytes } from 'node:crypto';
import { collectionMongoName } from '../../common/collectionOwnership.ts';
import { auditDigest } from '../../common/securityAudit/canonicalReport.ts';
import { errorReport, ingestionContext } from '../../scripts/security-audit/tests/fixtures/v2Fixtures.mjs';
import { SecurityAuditReportsV2 } from './securityAuditCollectionsV2.ts';
import { createAuditReportStoreV2 } from './securityAuditReportStoreV2.ts';

describe('activated V2 audit application boundaries', function() {
  for (const name of ['admin.securityAudits.list', 'admin.securityAudits.get', 'admin.securityAudits.downloadToken']) {
    for (const userId of [null, 'synthetic-missing-audit-learner', 'synthetic-missing-audit-teacher']) {
      it(`keeps the registered ${name} admin guarded for ${userId ?? 'anonymous'}`, async function() {
        const handler = (Meteor as any).server.method_handlers[name];
        expect(handler, 'actual application method registration').to.be.a('function');
        let error: any;
        try { await handler.call({ userId, unblock() {} }, 'synthetic-absent-report', 'json'); }
        catch (caught) { error = caught; }
        expect(error?.error).to.equal('not-authorized');
      });
    }
  }
  it('serves the V2 HTTP boundary and excludes V1 on the actual application listener', async function() {
    const address = WebApp.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Application TCP listener is unavailable');
    const origin = `http://127.0.0.1:${address.port}`;
    const options = { signal: AbortSignal.timeout(5000) };
    expect((await fetch(`${origin}/internal/security-audits/v2`, options)).status).to.equal(405);
    expect((await fetch(`${origin}/internal/security-audits/v2`, { ...options,
      method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status).to.equal(415);
    // Unregistered POSTs reach Meteor's default method response, not a V1
    // authentication/parser path. WebApp is Express-backed in Meteor 3.5.
    const retired = await fetch(`${origin}/internal/security-audits/v1`, { ...options,
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(retired.status).to.equal(405);
    expect(retired.headers.get('allow')).to.equal('OPTIONS, GET, HEAD');
    expect((await fetch(`${origin}/admin/security-audits/download/invalid/name.json`, options)).status).to.equal(404);
  });

  it('serves V2 through registered admin methods without reading or changing retained V1 records', async function() {
    const suffix = randomBytes(8).toString('hex');
    const v1Id = `synthetic-retained-v1-${suffix}`, v2Id = `synthetic-activated-v2-${suffix}`;
    const legacy = SecurityAuditReportsV2.rawDatabase().collection<{ _id: string; schema: string; retained: boolean }>(
      collectionMongoName('SecurityAuditReports'),
    );
    const admin = await Meteor.users.insertAsync({ username: `synthetic-audit-admin-${suffix}` });
    try {
      await Roles.createRoleAsync('admin', { unlessExists: true });
      await Roles.addUsersToRolesAsync(admin, 'admin');
      await legacy.insertOne({ _id: v1Id, schema: 'SecurityAuditReportV1', retained: true });
      const before = await legacy.findOne({ _id: v1Id });
      const report = await errorReport(); report.reportId = v2Id;
      const { digestSha256: _old, ...payload } = report; void _old;
      report.digestSha256 = await auditDigest(payload);
      const unavailable = { state: 'unavailable', reason: 'not-provided' } as const;
      await createAuditReportStoreV2(SecurityAuditReportsV2, () => new Date()).store(report,
        `synthetic-activated-nonce-${suffix}`, { ...ingestionContext, purpose: 'ingestion',
          receiverRevision: unavailable, receiverImage: unavailable });
      const handlers = (Meteor as any).server.method_handlers;
      const result = await handlers['admin.securityAudits.list'].call({ userId: admin, unblock() {} });
      expect(result.reports.some((row: { reportId: string }) => row.reportId === v2Id)).to.equal(true);
      expect(result.reports.every((row: { schema: string }) => row.schema === 'SecurityAuditReportV2')).to.equal(true);
      const summary = await handlers['admin.securityAudits.get'].call({ userId: admin, unblock() {} }, v2Id);
      expect(summary.schema).to.equal('SecurityAuditReportV2');
      for (const name of ['admin.securityAudits.get', 'admin.securityAudits.downloadToken']) {
        let error: any;
        try { await handlers[name].call({ userId: admin, unblock() {} }, v1Id, 'json'); }
        catch (caught) { error = caught; }
        expect(error?.error).to.equal('not-found');
      }
      expect(await legacy.findOne({ _id: v1Id })).to.deep.equal(before);
    } finally {
      await SecurityAuditReportsV2.removeAsync({ reportId: v2Id });
      await legacy.deleteOne({ _id: v1Id });
      await Roles.removeUsersFromRolesAsync(admin, 'admin');
      await Meteor.users.removeAsync({ _id: admin });
    }
  });
});
