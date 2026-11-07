import { expect } from 'chai';
import crypto from 'node:crypto';
import { Mongo } from 'meteor/mongo';
import { collectionMongoName } from '../../common/collectionOwnership.ts';
import { auditDigest, canonicalAuditJson } from '../../common/securityAudit/canonicalReport.ts';
import { errorReport } from '../../scripts/security-audit/tests/fixtures/v2Fixtures.mjs';
import { signAuditRequestV2 } from './securityAuditIngestionV2.ts';
import { createSecurityAuditReceiverV2 } from './securityAuditReceiverV2.ts';

const reports = new Mongo.Collection<Record<string, unknown>>(collectionMongoName('SecurityAuditReportsV2'));
const ownedIds: string[] = [];
const clock = new Date('2026-11-05T12:02:00.000Z');
const unavailable = { state: 'unavailable', reason: 'not-provided' } as const;
const secret = 'synthetic-Meteor-receiver-signing-material';
let identityReads = 0;
const receiver = createSecurityAuditReceiverV2({
  createReports(name) {
    expect(name).to.equal('security_audit_reports_v2');
    expect(name).not.to.equal(collectionMongoName('SecurityAuditReports'));
    return reports;
  },
  async requireAdminUser(userId) { if (userId !== 'synthetic-admin') throw new Error('Synthetic admin denial'); },
  platformIdentity: async () => { identityReads++; return unavailable; },
  loadBuildIdentity: async () => unavailable,
  targetOrigin: () => 'https://audit.example', ingestSecret: () => secret, now: () => new Date(clock),
});

describe('V2 isolated receiver composition on real MongoDB', function() {
  before(async function() { await receiver.initialize(); });
  after(async function() { await reports.removeAsync({ reportId: { $in: ownedIds } }); });

  it('keeps the selected namespace, authenticates first, persists/errors/replays, projects summaries and consumes verified downloads', async function() {
    const report = await errorReport();
    report.reportId = `synthetic-receiver-runtime-${crypto.randomBytes(8).toString('hex')}`;
    ownedIds.push(report.reportId);
    const { digestSha256: _old, ...payload } = report; void _old;
    report.digestSha256 = await auditDigest(payload);
    const body = Buffer.from(canonicalAuditJson(report));
    const timestamp = String(clock.getTime() / 1000), nonce = crypto.randomBytes(24).toString('base64url');
    const beforeReads = identityReads;
    let denied = false;
    try { await receiver.receive(body, { timestamp, nonce, signature: 'f'.repeat(64) }); }
    catch { denied = true; }
    expect(denied).to.equal(true);
    expect(identityReads).to.equal(beforeReads);
    const headers = { timestamp, nonce, signature: signAuditRequestV2(secret, timestamp, nonce, body) };
    await receiver.receive(body, headers);
    const listed = await receiver.list('synthetic-admin');
    const summary = await receiver.getSummary('synthetic-admin', report.reportId);
    expect(summary).to.deep.equal(listed.reports.find(row => row.reportId === report.reportId));
    expect(summary.counts.error).to.equal(70);
    expect(Object.hasOwn(summary, 'sections')).to.equal(false);
    let replayRejected = false;
    try { await receiver.receive(body, headers); }
    catch (error) { replayRejected = (error as { code?: number }).code === 11000; }
    expect(replayRejected).to.equal(true);
    const issued = await receiver.issueDownload('synthetic-admin', report.reportId, 'json');
    const path = issued.url.split('/');
    const download = await receiver.download(path.at(-2), path.at(-1));
    expect(JSON.parse(download.body.toString('utf8'))).to.deep.equal(report);
    expect(download.sha256).to.equal(crypto.createHash('sha256').update(download.body).digest('hex'));
    let consumed = false;
    try { await receiver.download(path.at(-2), path.at(-1)); }
    catch (error) { consumed = (error as { category?: string }).category === 'not-found'; }
    expect(consumed).to.equal(true);
    const stored = await reports.findOneAsync({ reportId: report.reportId });
    expect(stored?.schema).to.equal('SecurityAuditReportV2');
  });
});
