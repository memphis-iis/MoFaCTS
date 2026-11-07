import { ACTIVE_AUDIT_CATALOG, AUDIT_SECTION_IDS, readAuditCatalog, type AuditCatalog, type AuditCatalogCoordinates } from '../../common/securityAudit/catalogRegistry.ts';
import { AUDIT_ERROR_CATEGORIES, evidenceRequiresDeployedIdentity, type AuditErrorCategory } from '../../common/securityAudit/evidenceContracts.ts';
import { parseAuditIdentity } from '../../common/securityAudit/reportIdentity.ts';
import { AUDIT_MAX_DURATION_MS, auditTargetOrigin, auditTimestamp, parseSecurityAuditReportV2, type AuditCounts, type AuditReportReadContext, type AuditSectionStatus, type SecurityAuditReportV2 } from '../../common/securityAudit/reportV2.ts';
import { contentDigest, proofRecord, proofString, sourceCommit } from '../../common/securityAudit/proofFields.ts';
import type { AuditReportSummaryV2 } from '../../common/securityAudit/summaryTypes.ts';

type Document = Record<string, unknown>;
type QueryOptions = { fields?: Record<string, number>; sort?: Record<string, number>; limit?: number };
export type AuditReportCollectionV2 = {
  find(selector: Document, options: QueryOptions): { fetchAsync(): Promise<Document[]> };
  findOneAsync(selector: Document, options?: QueryOptions): Promise<Document | null | undefined>;
  insertAsync(document: Document): Promise<unknown>;
  rawCollection(): { createIndex(keys: Record<string, number>, options?: Document): Promise<unknown> };
};
const SCHEMA = 'SecurityAuditReportV2';
const SUMMARY_FIELDS: Readonly<Record<string, number>> = Object.freeze({
  _id: 0, schema: 1, catalogId: 1, catalogVersion: 1, catalogDigestSha256: 1,
  reportId: 1, reportType: 1, startedAt: 1, completedAt: 1, target: 1,
  scannerSourceRevision: 1, deployedApplicationRevision: 1, deployedImageDigest: 1,
  digestSha256: 1, counts: 1, executionErrors: 1, ingestedAt: 1,
  ...Object.fromEntries(AUDIT_SECTION_IDS.map(id => [`sections.${id}.status`, 1])),
});
const SUMMARY_KEYS = ['schema', 'catalogId', 'catalogVersion', 'catalogDigestSha256', 'reportId', 'reportType',
  'startedAt', 'completedAt', 'target', 'scannerSourceRevision', 'deployedApplicationRevision', 'deployedImageDigest',
  'digestSha256', 'counts', 'executionErrors', 'ingestedAt', 'sections'];
const COUNT_KEYS = ['pass', 'fail', 'error', 'notApplicable', 'info', 'low', 'medium', 'high', 'critical'] as const;
function invalid(): never { throw new Error('Stored V2 audit metadata is invalid'); }
function serverDate(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return value;
}

function summary(record: Document, catalog: AuditCatalog): AuditReportSummaryV2 {
  const row = proofRecord(record, SUMMARY_KEYS);
  if (row.schema !== SCHEMA || (row.reportType !== 'exposure' && row.reportType !== 'full')) invalid();
  const reportType = row.reportType;
  const rawCounts = proofRecord(row.counts, COUNT_KEYS);
  const counts = {} as AuditCounts;
  for (const key of COUNT_KEYS) {
    if (!Number.isSafeInteger(rawCounts[key]) || Number(rawCounts[key]) < 0 || Number(rawCounts[key]) > 10000) invalid();
    counts[key] = Number(rawCounts[key]);
  }
  const requiredCount = Object.values(catalog.profiles[reportType]).reduce((total, ids) => total + ids.length, 0);
  if (counts.pass + counts.fail + counts.error !== requiredCount || counts.notApplicable !== 0
    || counts.info + counts.low + counts.medium + counts.high + counts.critical !== counts.fail) invalid();
  const sections = proofRecord(row.sections, AUDIT_SECTION_IDS);
  const sectionStatuses = {} as AuditReportSummaryV2['sectionStatuses'];
  for (const id of AUDIT_SECTION_IDS) {
    const section = proofRecord(sections[id], ['status']);
    const empty = catalog.profiles[reportType][id].length === 0;
    if (empty ? section.status !== 'NOT_APPLICABLE' : !['PASS', 'FAIL', 'ERROR'].includes(String(section.status))) invalid();
    sectionStatuses[id] = section.status as AuditSectionStatus;
  }
  if (Object.values(sectionStatuses).includes('ERROR') !== (counts.error > 0)) invalid();
  if (!counts.error && Object.values(sectionStatuses).includes('FAIL') !== (counts.fail > 0)) invalid();
  if (!Array.isArray(row.executionErrors) || row.executionErrors.length > 32
    || row.executionErrors.some(category => !AUDIT_ERROR_CATEGORIES.includes(category as AuditErrorCategory))
    || new Set(row.executionErrors).size !== row.executionErrors.length) invalid();
  const startedAt = auditTimestamp(row.startedAt), completedAt = auditTimestamp(row.completedAt);
  const duration = Date.parse(completedAt) - Date.parse(startedAt);
  if (duration < 0 || duration > AUDIT_MAX_DURATION_MS) invalid();
  const revision = parseAuditIdentity(row.deployedApplicationRevision, 'revision');
  const image = parseAuditIdentity(row.deployedImageDigest, 'platform-image');
  if (revision.state !== 'observed' || image.state !== 'observed') {
    const dependent = catalog.controls.filter(control => evidenceRequiresDeployedIdentity(control.evidenceContract)
      && catalog.profiles[reportType][control.sectionId].includes(control.controlId));
    if (counts.error < dependent.length || dependent.some(control => sectionStatuses[control.sectionId] !== 'ERROR')) invalid();
  }
  return { schema: SCHEMA, catalogId: catalog.catalogId, catalogVersion: catalog.catalogVersion,
    catalogDigestSha256: contentDigest(row.catalogDigestSha256),
    reportId: proofString(row.reportId, /^[A-Za-z0-9][A-Za-z0-9._-]*(?![\s\S])/, 160), reportType,
    startedAt, completedAt, target: auditTargetOrigin(row.target), scannerSourceRevision: sourceCommit(row.scannerSourceRevision),
    deployedApplicationRevision: revision,
    deployedImageDigest: image, digestSha256: contentDigest(row.digestSha256),
    counts, sectionStatuses, overallStatus: row.executionErrors.length || counts.error ? 'ERROR' : counts.fail ? 'FAIL' : 'PASS',
    executionErrorCount: row.executionErrors.length, ingestedAt: serverDate(row.ingestedAt).toISOString() };
}

// No collection is created/imported here. Binding stays with the owning app
// composition; the storage model still needs previous-image qualification.
export function createAuditReportStoreV2(reports: AuditReportCollectionV2, now: () => Date) {
  async function project(row: Document, catalogs: Map<string, Promise<AuditCatalog>>) {
    proofRecord(row, SUMMARY_KEYS);
    const coordinates: AuditCatalogCoordinates = {
      catalogId: proofString(row.catalogId, /^[a-z][a-z0-9.-]*(?![\s\S])/, 120),
      catalogVersion: Number(row.catalogVersion), catalogDigestSha256: contentDigest(row.catalogDigestSha256),
    };
    if (typeof row.catalogVersion !== 'number') invalid();
    const key = JSON.stringify(coordinates);
    if (!catalogs.has(key)) catalogs.set(key, readAuditCatalog(coordinates, 'retained'));
    return summary(row, await catalogs.get(key)!);
  }
  return {
    async ensureIndexes(): Promise<void> {
      const raw = reports.rawCollection();
      for (const key of ['reportId', 'digestSha256', 'ingestNonce']) await raw.createIndex({ [key]: 1 }, { unique: true });
      await raw.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await raw.createIndex({ schema: 1, completedAt: -1 });
      await raw.createIndex({ schema: 1, catalogId: 1, catalogVersion: 1, catalogDigestSha256: 1, reportType: 1, completedAt: -1 });
    },
    async store(value: unknown, nonce: unknown, context: Extract<AuditReportReadContext, { purpose: 'ingestion' }>): Promise<void> {
      const report = await parseSecurityAuditReportV2(value, context);
      const ingestNonce = proofString(nonce, /^[A-Za-z0-9_-]{22,128}(?![\s\S])/, 128);
      const ingestedAt = serverDate(now());
      // Preserve the established 90-day TTL; no new retention or pruning policy.
      await reports.insertAsync({ ...report, ingestNonce, ingestedAt,
        expiresAt: new Date(ingestedAt.getTime() + 90 * 24 * 60 * 60 * 1000) });
    },
    async list(): Promise<{ reports: AuditReportSummaryV2[]; latestExposure: AuditReportSummaryV2 | null; latestFull: AuditReportSummaryV2 | null }> {
      const options: QueryOptions = { fields: { ...SUMMARY_FIELDS }, sort: { completedAt: -1 } };
      const [rows, exposure, full] = await Promise.all([
        reports.find({ schema: SCHEMA }, { ...options, limit: 200 }).fetchAsync(),
        reports.findOneAsync({ schema: SCHEMA, ...ACTIVE_AUDIT_CATALOG, reportType: 'exposure' }, options),
        reports.findOneAsync({ schema: SCHEMA, ...ACTIVE_AUDIT_CATALOG, reportType: 'full' }, options),
      ]);
      if (rows.length > 200) invalid();
      const catalogs = new Map<string, Promise<AuditCatalog>>();
      return { reports: await Promise.all(rows.map(row => project(row, catalogs))),
        latestExposure: exposure ? await project(exposure, catalogs) : null,
        latestFull: full ? await project(full, catalogs) : null };
    },
    async get(reportId: unknown): Promise<SecurityAuditReportV2 | null> {
      const id = proofString(reportId, /^[A-Za-z0-9][A-Za-z0-9._-]*(?![\s\S])/, 160);
      const row = await reports.findOneAsync({ schema: SCHEMA, reportId: id });
      if (!row) return null;
      const { _id, ingestNonce, ingestedAt, expiresAt, ...envelope } = row;
      void _id;
      proofString(ingestNonce, /^[A-Za-z0-9_-]{22,128}(?![\s\S])/, 128);
      if (serverDate(expiresAt).getTime() < serverDate(ingestedAt).getTime()) invalid();
      return parseSecurityAuditReportV2(envelope, { purpose: 'retained' });
    },
    async getSummary(reportId: unknown): Promise<AuditReportSummaryV2 | null> {
      const id = proofString(reportId, /^[A-Za-z0-9][A-Za-z0-9._-]*(?![\s\S])/, 160);
      const row = await reports.findOneAsync({ schema: SCHEMA, reportId: id }, { fields: { ...SUMMARY_FIELDS } });
      return row ? project(row, new Map()) : null;
    },
  };
}
