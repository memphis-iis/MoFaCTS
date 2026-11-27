import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { Roles } from 'meteor/alanning:roles';
import { randomBytes } from 'node:crypto';
import { collectionMongoName } from '../../common/collectionOwnership.ts';
import { AUDIT_ADMIN_METHOD_VERIFICATIONS, HTTP_AUDIT_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog.ts';
import { registeredHttpSurfaces } from '../securitySurfaces/registerHttpRoutes.ts';
import { registeredMeteorMethodSurfaces } from '../securitySurfaces/registerMeteorMethods.ts';
import { auditDigest, canonicalAuditJson } from '../../common/securityAudit/canonicalReport.ts';
import { ACTIVE_AUDIT_CATALOG, AUDIT_CATALOG_V1, AUDIT_CATALOG_V3 } from '../../common/securityAudit/catalogRegistry.ts';
import type { SecurityAuditReportV2 } from '../../common/securityAudit/reportV2.ts';
import { errorReport, fullReportFixture, ingestionContext } from '../../scripts/security-audit/tests/fixtures/v2Fixtures.mjs';
import { SecurityAuditReportsV2 } from './securityAuditCollectionsV2.ts';
import { signAuditRequestV2 } from './securityAuditIngestionV2.ts';
import { createAuditReportStoreV2 } from './securityAuditReportStoreV2.ts';

function applicationOrigin(): string {
  const address = WebApp.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Application TCP listener is unavailable');
  return `http://127.0.0.1:${address.port}`;
}

describe('activated V2 audit application boundaries', function() {
  it('registers the signed receiver and single-use download on the normal HTTP stack', function() {
    const mounts = registeredHttpSurfaces();
    const ingest = mounts.filter(entry => entry.mount === '/internal/security-audits/v2');
    const download = mounts.filter(entry => entry.mount === '/admin/security-audits/download');
    expect(ingest).to.have.length(1);
    expect(download).to.have.length(1);
    expect(ingest[0]).to.include({ stack: 'connectHandlers', dispatch: 'mounted-prefix' });
    expect(download[0]).to.include({ stack: 'connectHandlers', dispatch: 'mounted-prefix' });
    expect(ingest[0]?.policy).to.deep.equal({ kind: 'signed-ingestion', protocol: 'security-audit-v2-hmac' });
    expect(download[0]?.policy).to.deep.equal({ kind: 'single-use-capability', issuerAuthorization: 'current-admin' });
    expect(download[0]?.dataEgress).to.deep.equal({ kind: 'security-audit-report' });
    expect(ingest[0]?.verification).to.equal(HTTP_AUDIT_VERIFICATIONS.ingest);
    expect(download[0]?.verification).to.equal(HTTP_AUDIT_VERIFICATIONS.download);
  });
  it('binds the three audit descriptors to the registered Meteor handlers', function() {
    const observation = registeredMeteorMethodSurfaces();
    if (observation.state !== 'observed') throw new Error(observation.reason);
    const egress = {
      'admin.securityAudits.list': 'audit-report-list',
      'admin.securityAudits.get': 'audit-report-summary',
      'admin.securityAudits.downloadToken': 'audit-download-capability',
    } as const;
    for (const name of Object.keys(egress) as (keyof typeof egress)[]) {
      const entries = observation.surfaces.filter(entry => entry.name === name);
      expect(entries).to.have.length(1);
      expect(entries[0]?.surfaceId).to.equal(`method:${name}`);
      expect(entries[0]?.verification).to.equal(AUDIT_ADMIN_METHOD_VERIFICATIONS[name]);
      expect(entries[0]?.policy).to.deep.equal({ kind: 'role', role: 'admin' });
      expect(entries[0]?.dataEgress).to.equal(egress[name]);
    }
  });
  for (const name of Object.keys(AUDIT_ADMIN_METHOD_VERIFICATIONS)) {
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
    const origin = applicationOrigin();
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
    expect((await fetch(`${origin}/internal/security-audits/v2/extra`, options)).status).to.equal(404);
    const wrongMethod = await fetch(`${origin}/admin/security-audits/download/invalid/name.json`, { ...options, method: 'POST' });
    expect(wrongMethod.status).to.equal(405);
    expect(wrongMethod.headers.get('allow')).to.equal(null);
    expect((await fetch(`${origin}/admin/security-audits/download/invalid/name.json`, options)).status).to.equal(404);
  });

  it('uses catalog v3 for signed uploads on the installed staging receiver', async function() {
    this.timeout(10000);
    const suffix = randomBytes(8).toString('hex'), clock = new Date();
    const priorCatalog = await fullReportFixture(AUDIT_CATALOG_V1, 'synthetic-staging-v1-' + suffix, clock);
    const current = await fullReportFixture(AUDIT_CATALOG_V3, 'synthetic-staging-v3-' + suffix, clock);
    const signingFixture = 'synthetic-staging-receiver-signing-fixture';
    const priorEnvironment = {
      ROOT_URL: process.env.ROOT_URL,
      MOFACTS_SECURITY_AUDIT_INGEST_SECRET: process.env.MOFACTS_SECURITY_AUDIT_INGEST_SECRET,
    };
    const url = applicationOrigin() + '/internal/security-audits/v2';
    async function submit(report: SecurityAuditReportV2) {
      const body = Buffer.from(canonicalAuditJson(report));
      const timestamp = String(Math.floor(clock.getTime() / 1000));
      const nonce = randomBytes(24).toString('base64url');
      return fetch(url, {
        method: 'POST', body, signal: AbortSignal.timeout(5000),
        headers: { 'content-type': 'application/json', 'x-mofacts-audit-timestamp': timestamp,
          'x-mofacts-audit-nonce': nonce, 'x-mofacts-audit-signature': signAuditRequestV2(signingFixture, timestamp, nonce, body) },
      });
    }
    try {
      process.env.ROOT_URL = current.target;
      process.env.MOFACTS_SECURITY_AUDIT_INGEST_SECRET = signingFixture;
      const rejected = await submit(priorCatalog);
      expect(rejected.status).to.equal(400);
      await rejected.text();
      const accepted = await submit(current);
      expect(accepted.status).to.equal(201);
      expect(await accepted.json()).to.deep.equal({ stored: true });
      const store = createAuditReportStoreV2(SecurityAuditReportsV2, () => new Date(), AUDIT_CATALOG_V3);
      expect(await store.get(priorCatalog.reportId)).to.equal(null);
      expect(await store.get(current.reportId)).to.deep.equal(current);
    } finally {
      for (const [name, value] of Object.entries(priorEnvironment)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      await SecurityAuditReportsV2.removeAsync({ reportId: { $in: [priorCatalog.reportId, current.reportId] } });
    }
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
      await createAuditReportStoreV2(SecurityAuditReportsV2, () => new Date(), ACTIVE_AUDIT_CATALOG).store(report,
        `synthetic-activated-nonce-${suffix}`, { ...ingestionContext, purpose: 'ingestion',
          receiverRevision: unavailable, receiverImage: unavailable });
      const handlers = (Meteor as any).server.method_handlers;
      const result = await handlers['admin.securityAudits.list'].call({ userId: admin, unblock() {} });
      expect(result.reports.some((row: { reportId: string }) => row.reportId === v2Id)).to.equal(true);
      expect(result.reports.every((row: { schema: string }) => row.schema === 'SecurityAuditReportV2')).to.equal(true);
      const summary = await handlers['admin.securityAudits.get'].call({ userId: admin, unblock() {} }, v2Id);
      expect(summary.schema).to.equal('SecurityAuditReportV2');
      const issued = await handlers['admin.securityAudits.downloadToken'].call({ userId: admin, unblock() {} }, v2Id, 'json');
      const url = applicationOrigin() + issued.url;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      expect(response.status).to.equal(200);
      expect(response.headers.get('cache-control')).to.equal('no-store');
      expect(await response.json()).to.deep.equal(report);
      const replay = await fetch(url, { signal: AbortSignal.timeout(5000) });
      expect(replay.status).to.equal(404);
      await replay.text();
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
