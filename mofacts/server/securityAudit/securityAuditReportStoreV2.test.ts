import { expect } from 'chai';
import crypto from 'node:crypto';
import { Mongo } from 'meteor/mongo';
import { auditDigest } from '../../common/securityAudit/canonicalReport.ts';
import { AUDIT_SECTION_IDS } from '../../common/securityAudit/catalogRegistry.ts';
import type { SecurityAuditReportV2 } from '../../common/securityAudit/reportV2.ts';
import { canonicalJson, parseSecurityAuditReport } from '../../common/securityAuditReport';
import membership from '../../scripts/security-audit/tests/fixtures/v1-membership.json' with { type: 'json' };
import { errorReport, ingestionContext } from '../../scripts/security-audit/tests/fixtures/v2Fixtures.mjs';
import { createAuditReportStoreV2 } from './securityAuditReportStoreV2.ts';

// Fresh test-owned namespace, no application collection or learner records.
const namespace = `mofactsV2AuditContract${crypto.randomBytes(6).toString('hex')}`;
const reports = new Mongo.Collection<Record<string, unknown>>(namespace);
const store = createAuditReportStoreV2(reports, () => new Date());
const fixtureIds: string[] = [];
const missing = { state: 'unavailable', reason: 'not-provided' } as const;
const context = { ...ingestionContext, purpose: 'ingestion' as const, receiverRevision: missing, receiverImage: missing };
let sequence = 0;
async function fixture() {
  const report: SecurityAuditReportV2 = await errorReport();
  report.reportId = `synthetic-mongo-v2-${++sequence}`;
  fixtureIds.push(report.reportId);
  // Preserve a real finding with unavailable host evidence through the actual
  // collection, projected summary and read-time validation; never add host facts.
  const udp = report.sections.external.controls.find(row => row.controlId === 'external.public-udp-ports');
  if (!udp) throw new Error('Missing synthetic UDP control');
  udp.status = 'FAIL';
  udp.evidence = { summary: 'A synthetic public UDP service response was confirmed.',
    metrics: { observedResultCount: 1, expectedResultCount: 7, openSelectedUdpPortCount: 1 } };
  report.counts.error--; report.counts.fail++; report.counts.high++;
  const { digestSha256: _old, ...payload } = report;
  report.digestSha256 = await auditDigest(payload);
  return report;
}

describe('V2 audit real Mongo storage contracts', function() {
  before(async function() { await store.ensureIndexes(); });
  after(async function() {
    if (!/^mofactsV2AuditContract[0-9a-f]{12}$/.test(namespace)) throw new Error('Unknown test collection owner');
    await reports.removeAsync({ reportId: { $in: fixtureIds } });
  });

  it('round-trips the signed envelope and enforces a real unique nonce index', async function() {
    const first = await fixture();
    await store.store(first, 'synthetic-mongo-nonce-0001', context);
    expect(await store.get(first.reportId)).to.deep.equal(first);
    const listed = (await store.list()).reports.find(row => row.reportId === first.reportId);
    expect(listed?.counts.high).to.equal(1);
    expect(listed?.counts.error).to.equal(69);
    expect(listed?.sectionStatuses.internal).to.equal('ERROR');
    const second = await fixture();
    let rejected = false;
    try { await store.store(second, 'synthetic-mongo-nonce-0001', context); }
    catch (error) { rejected = (error as { code?: number }).code === 11000; }
    expect(rejected).to.equal(true);
    expect(await reports.findOneAsync({ reportId: second.reportId })).to.equal(undefined);
  });

  it('excludes a valid retained V1 fixture without rewriting its bytes', async function() {
    const sections = Object.fromEntries(AUDIT_SECTION_IDS.map(sectionId => [sectionId, {
      sectionId, status: 'ERROR', controls: membership[sectionId].map(controlId => ({ controlId,
        title: 'Synthetic retained V1 control', status: 'ERROR', severity: 'HIGH',
        evidence: { summary: 'Synthetic fixture is not security evidence.' } })),
    }]));
    const id = `synthetic-mongo-v1-${++sequence}`; fixtureIds.push(id);
    const payload = { schema: 'SecurityAuditReportV1', reportId: id, reportType: 'full',
      startedAt: '2026-11-05T12:00:00.000Z', completedAt: '2026-11-05T12:01:00.000Z',
      target: 'https://audit.example', sourceRevision: 'a'.repeat(40), productionImage: 'unknown',
      toolVersions: {}, sections, executionErrors: [],
      counts: { pass: 0, fail: 0, error: 52, notApplicable: 0, info: 0, low: 0, medium: 0, high: 0, critical: 0 } };
    const retained = parseSecurityAuditReport({ ...payload,
      digestSha256: crypto.createHash('sha256').update(canonicalJson(payload)).digest('hex') });
    await reports.insertAsync({ ...retained, ingestNonce: 'synthetic-mongo-v1-nonce-0001',
      ingestedAt: new Date(), expiresAt: new Date(Date.now() + 90 * 86400000) });
    const before = await reports.findOneAsync({ reportId: id });
    expect((await store.list()).reports.some(row => row.reportId === id)).to.equal(false);
    expect(await store.get(id)).to.equal(null);
    expect(await reports.findOneAsync({ reportId: id })).to.deep.equal(before);
  });
});
