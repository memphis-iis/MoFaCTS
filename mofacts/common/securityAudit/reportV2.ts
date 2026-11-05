import { auditDigest, canonicalAuditJson } from './canonicalReport.ts';
import { AUDIT_SECTION_IDS, readAuditCatalog, type AuditCatalogCoordinates, type AuditFailureSeverity,
  type AuditReportType, type AuditSectionId } from './catalogRegistry.ts';
import { AUDIT_ERROR_CATEGORIES, auditText, evidenceRequiresDeployedIdentity, parseAuditEvidence,
  type AuditControlStatus, type AuditErrorCategory, type AuditEvidence } from './evidenceContracts.ts';
import { parseAuditIdentity, type AuditIdentityObservation } from './reportIdentity.ts';
import { contentDigest, proofRecord, proofString, sourceCommit } from './proofFields.ts';

export const AUDIT_MAX_DURATION_MS = 180 * 60 * 1000;
export const AUDIT_MAX_COMPLETION_AHEAD_MS = 5 * 60 * 1000;
export const AUDIT_MAX_UPLOAD_DELAY_MS = 15 * 60 * 1000;
export type AuditSectionStatus = AuditControlStatus | 'NOT_APPLICABLE';
export type AuditReportControl = {
  controlId: string; title: string; failureSeverity: AuditFailureSeverity;
  status: AuditControlStatus; evidence: AuditEvidence;
};
export type AuditReportSection = { sectionId: AuditSectionId; status: AuditSectionStatus; controls: AuditReportControl[] };
export type AuditCounts = {
  pass: number; fail: number; error: number; notApplicable: number;
  info: number; low: number; medium: number; high: number; critical: number;
};
export type SecurityAuditReportV2 = AuditCatalogCoordinates & {
  schema: 'SecurityAuditReportV2'; reportId: string; reportType: AuditReportType;
  startedAt: string; completedAt: string; target: string; scannerSourceRevision: string;
  deployedApplicationRevision: AuditIdentityObservation; deployedImageDigest: AuditIdentityObservation;
  toolVersions: Record<string, string>; sections: Record<AuditSectionId, AuditReportSection>;
  executionErrors: AuditErrorCategory[]; counts: AuditCounts; digestSha256: string;
};
export type AuditReportReadContext = { purpose: 'retained' } | {
  purpose: 'ingestion'; targetOrigin: string; authenticatedAt: string; uploadedAt: string;
  receiverRevision: AuditIdentityObservation; receiverImage: AuditIdentityObservation;
};

const TOOL_NAMES = ['node', 'nmap', 'openssl', 'gitleaks', 'trivy', 'playwright', 'curl', 'ssh', 'docker', 'apache', 'mongosh', 'redis-cli'];
function invalid(): never { throw new Error('Invalid security audit V2 report'); }
export function auditTimestamp(value: unknown): string {
  const text = proofString(value, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z(?![\s\S])/, 24);
  const date = new Date(text);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== text) invalid();
  return text;
}
export function auditTargetOrigin(value: unknown): string {
  if (typeof value !== 'string' || value.length > 300) invalid();
  let url: URL;
  try { url = new URL(value); } catch { return invalid(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.origin !== value) invalid();
  return url.origin;
}
export function auditSectionStatus(controls: readonly { status: AuditControlStatus }[]): AuditSectionStatus {
  return controls.some(control => control.status === 'ERROR') ? 'ERROR'
    : controls.some(control => control.status === 'FAIL') ? 'FAIL' : controls.length ? 'PASS' : 'NOT_APPLICABLE';
}
export function auditReportCounts(sections: Record<AuditSectionId, AuditReportSection>): AuditCounts {
  const counts: AuditCounts = { pass: 0, fail: 0, error: 0, notApplicable: 0, info: 0, low: 0, medium: 0, high: 0, critical: 0 };
  for (const sectionId of AUDIT_SECTION_IDS) {
    for (const control of sections[sectionId].controls) {
      counts[control.status.toLowerCase() as 'pass' | 'fail' | 'error']++;
      if (control.status === 'FAIL') counts[control.failureSeverity.toLowerCase() as 'info' | 'low' | 'medium' | 'high' | 'critical']++;
    }
  }
  return counts;
}
export async function finalizeAuditReport(value: Omit<SecurityAuditReportV2, 'counts' | 'digestSha256'>): Promise<SecurityAuditReportV2> {
  const payload = { ...value, counts: auditReportCounts(value.sections) };
  return { ...payload, digestSha256: await auditDigest(payload) };
}

export async function parseSecurityAuditReportV2(value: unknown, context: AuditReportReadContext): Promise<SecurityAuditReportV2> {
  const record = proofRecord(value, ['schema', 'catalogId', 'catalogVersion', 'catalogDigestSha256', 'reportId', 'reportType',
    'startedAt', 'completedAt', 'target', 'scannerSourceRevision', 'deployedApplicationRevision', 'deployedImageDigest',
    'toolVersions', 'sections', 'executionErrors', 'counts', 'digestSha256']);
  if (record.schema !== 'SecurityAuditReportV2' || !['exposure', 'full'].includes(String(record.reportType))
    || (context.purpose !== 'ingestion' && context.purpose !== 'retained')) invalid();
  const reportType = record.reportType as AuditReportType;
  const catalog = await readAuditCatalog({ catalogId: record.catalogId, catalogVersion: record.catalogVersion,
    catalogDigestSha256: record.catalogDigestSha256 }, context.purpose);
  const startedAt = auditTimestamp(record.startedAt), completedAt = auditTimestamp(record.completedAt);
  const duration = Date.parse(completedAt) - Date.parse(startedAt);
  if (duration < 0 || duration > AUDIT_MAX_DURATION_MS) invalid();
  const target = auditTargetOrigin(record.target);
  const revision = parseAuditIdentity(record.deployedApplicationRevision, 'revision');
  const image = parseAuditIdentity(record.deployedImageDigest, 'platform-image');
  let identityEstablished = revision.state === 'observed' && image.state === 'observed';
  if (context.purpose === 'ingestion') {
    const authenticatedAt = Date.parse(auditTimestamp(context.authenticatedAt));
    const uploadedAt = Date.parse(auditTimestamp(context.uploadedAt));
    if (target !== auditTargetOrigin(context.targetOrigin) || Date.parse(completedAt) - authenticatedAt > AUDIT_MAX_COMPLETION_AHEAD_MS
      || uploadedAt - Date.parse(completedAt) > AUDIT_MAX_UPLOAD_DELAY_MS) invalid();
    const knownRevision = parseAuditIdentity(context.receiverRevision, 'revision');
    const knownImage = parseAuditIdentity(context.receiverImage, 'platform-image');
    for (const [claimed, known] of [[revision, knownRevision], [image, knownImage]]) {
      if (claimed!.state === 'observed' && known!.state === 'observed' && claimed!.value !== known!.value) invalid();
    }
    identityEstablished &&= knownRevision.state === 'observed' && knownImage.state === 'observed';
  }
  const rawTools = record.toolVersions;
  if (!rawTools || typeof rawTools !== 'object' || Array.isArray(rawTools) || Object.keys(rawTools).some(key => !TOOL_NAMES.includes(key))) invalid();
  const toolVersions: Record<string, string> = {};
  for (const [name, version] of Object.entries(rawTools)) toolVersions[name] = auditText(version, 100);
  const rawSections = proofRecord(record.sections, AUDIT_SECTION_IDS);
  const sections = {} as Record<AuditSectionId, AuditReportSection>;
  const definitions = new Map(catalog.controls.map(control => [control.controlId, control]));
  for (const sectionId of AUDIT_SECTION_IDS) {
    const rawSection = proofRecord(rawSections[sectionId], ['sectionId', 'status', 'controls']);
    const expected = catalog.profiles[reportType][sectionId];
    if (rawSection.sectionId !== sectionId || !Array.isArray(rawSection.controls) || rawSection.controls.length !== expected.length) invalid();
    const controls = rawSection.controls.map((value, index): AuditReportControl => {
      const row = proofRecord(value, ['controlId', 'title', 'failureSeverity', 'status', 'evidence']);
      const definition = definitions.get(expected[index]!)!;
      if (row.controlId !== definition.controlId || row.title !== definition.title || row.failureSeverity !== definition.failureSeverity
        || !['PASS', 'FAIL', 'ERROR'].includes(String(row.status))
        || (!identityEstablished && evidenceRequiresDeployedIdentity(definition.evidenceContract) && row.status !== 'ERROR')) invalid();
      const status = row.status as AuditControlStatus;
      return { controlId: definition.controlId, title: definition.title, failureSeverity: definition.failureSeverity,
        status, evidence: parseAuditEvidence(definition.evidenceContract, status, row.evidence) };
    });
    const status = auditSectionStatus(controls);
    if (rawSection.status !== status) invalid();
    sections[sectionId] = { sectionId, status, controls };
  }
  if (!Array.isArray(record.executionErrors) || record.executionErrors.length > 32
    || record.executionErrors.some(category => !AUDIT_ERROR_CATEGORIES.includes(category))
    || new Set(record.executionErrors).size !== record.executionErrors.length) invalid();
  const counts = auditReportCounts(sections);
  if (canonicalAuditJson(record.counts) !== canonicalAuditJson(counts)) invalid();
  const result: SecurityAuditReportV2 = {
    schema: 'SecurityAuditReportV2', catalogId: catalog.catalogId, catalogVersion: catalog.catalogVersion,
    catalogDigestSha256: contentDigest(record.catalogDigestSha256),
    reportId: proofString(record.reportId, /^[A-Za-z0-9][A-Za-z0-9._-]*(?![\s\S])/, 160), reportType,
    startedAt, completedAt, target, scannerSourceRevision: sourceCommit(record.scannerSourceRevision),
    deployedApplicationRevision: revision, deployedImageDigest: image, toolVersions, sections,
    executionErrors: [...record.executionErrors] as AuditErrorCategory[], counts, digestSha256: contentDigest(record.digestSha256),
  };
  const { digestSha256, ...payload } = result;
  if (digestSha256 !== await auditDigest(payload)) invalid();
  return result;
}
