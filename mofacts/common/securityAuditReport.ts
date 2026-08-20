export const SECURITY_AUDIT_SCHEMA = 'SecurityAuditReportV1' as const;
export const SECURITY_AUDIT_SECTION_IDS = ['external', 'authentication', 'internal', 'repository'] as const;
export const SECURITY_AUDIT_STATUSES = ['PASS', 'FAIL', 'ERROR', 'NOT_APPLICABLE'] as const;
export const SECURITY_AUDIT_SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export type SecurityAuditSectionId = typeof SECURITY_AUDIT_SECTION_IDS[number];
export type SecurityAuditStatus = typeof SECURITY_AUDIT_STATUSES[number];
export type SecurityAuditSeverity = typeof SECURITY_AUDIT_SEVERITIES[number];
export type SecurityAuditReportType = 'exposure' | 'full';

export type SecurityAuditEvidence = {
  summary: string;
  observations?: string[];
  metrics?: Record<string, string | number | boolean | null>;
};

export type SecurityAuditControl = {
  controlId: string;
  title: string;
  status: SecurityAuditStatus;
  severity: SecurityAuditSeverity;
  evidence: SecurityAuditEvidence;
};

export type SecurityAuditSection = {
  sectionId: SecurityAuditSectionId;
  status: SecurityAuditStatus;
  controls: SecurityAuditControl[];
};

export type SecurityAuditCounts = {
  pass: number;
  fail: number;
  error: number;
  notApplicable: number;
  info: number;
  low: number;
  medium: number;
  high: number;
  critical: number;
};

export type SecurityAuditReportV1 = {
  schema: typeof SECURITY_AUDIT_SCHEMA;
  reportId: string;
  reportType: SecurityAuditReportType;
  startedAt: string;
  completedAt: string;
  target: string;
  sourceRevision: string;
  productionImage: string;
  toolVersions: Record<string, string>;
  sections: Record<SecurityAuditSectionId, SecurityAuditSection>;
  executionErrors: string[];
  counts: SecurityAuditCounts;
  digestSha256: string;
};

type UnknownRecord = Record<string, unknown>;

const REPORT_KEYS = [
  'schema', 'reportId', 'reportType', 'startedAt', 'completedAt', 'target',
  'sourceRevision', 'productionImage', 'toolVersions', 'sections',
  'executionErrors', 'counts', 'digestSha256',
] as const;
const COUNT_KEYS = ['pass', 'fail', 'error', 'notApplicable', 'info', 'low', 'medium', 'high', 'critical'] as const;
const TOOL_NAMES = new Set([
  'node', 'nmap', 'openssl', 'gitleaks', 'trivy', 'playwright', 'curl', 'ssh',
  'docker', 'apache', 'mongosh', 'redis-cli',
]);

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): UnknownRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireExactKeys(record: UnknownRecord, expected: readonly string[], label: string): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has unexpected or missing fields`);
  }
}

function requireString(value: unknown, label: string, maxLength: number, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value || value.length > maxLength || (pattern && !pattern.test(value))) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function requireSanitizedText(value: unknown, label: string, maxLength: number): string {
  const text = requireString(value, label, maxLength);
  if (/\r|\n|\t/.test(text)
    || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)
    || /\b(?:authorization|cookie|set-cookie)\s*:\s*\S+/i.test(text)
    || /\b(?:password|passwd|secret|token|session)\s*[=:]\s*\S+/i.test(text)
    || /\b[A-Za-z0-9_-]{48,}\b/.test(text)) {
    throw new Error(`${label} contains forbidden sensitive or unsanitized text`);
  }
  return text;
}

function requireIsoDate(value: unknown, label: string): string {
  const text = requireString(value, label, 40);
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== text) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
  return text;
}

function parseEvidence(value: unknown, label: string): SecurityAuditEvidence {
  const record = requireRecord(value, label);
  const allowed = ['summary', 'observations', 'metrics'];
  if (Object.keys(record).some((key) => !allowed.includes(key)) || !Object.hasOwn(record, 'summary')) {
    throw new Error(`${label} has unexpected or missing fields`);
  }
  const result: SecurityAuditEvidence = {
    summary: requireSanitizedText(record.summary, `${label}.summary`, 500),
  };
  if (record.observations !== undefined) {
    if (!Array.isArray(record.observations) || record.observations.length > 12) {
      throw new Error(`${label}.observations is invalid`);
    }
    result.observations = record.observations.map((entry, index) =>
      requireSanitizedText(entry, `${label}.observations[${index}]`, 500));
  }
  if (record.metrics !== undefined) {
    const metrics = requireRecord(record.metrics, `${label}.metrics`);
    if (Object.keys(metrics).length > 32) throw new Error(`${label}.metrics has too many fields`);
    result.metrics = {};
    for (const [key, metric] of Object.entries(metrics)) {
      if (!/^[a-z][A-Za-z0-9.-]{0,79}$/.test(key)
        || /(?:password|secret|token|session|cookie|credential|email)/i.test(key)) {
        throw new Error(`${label}.metrics contains a forbidden key`);
      }
      if (typeof metric === 'string') result.metrics[key] = requireSanitizedText(metric, `${label}.metrics.${key}`, 120);
      else if (typeof metric === 'number' && Number.isFinite(metric)) result.metrics[key] = metric;
      else if (typeof metric === 'boolean' || metric === null) result.metrics[key] = metric;
      else throw new Error(`${label}.metrics.${key} is invalid`);
    }
  }
  return result;
}

function parseControl(value: unknown, label: string): SecurityAuditControl {
  const record = requireRecord(value, label);
  requireExactKeys(record, ['controlId', 'title', 'status', 'severity', 'evidence'], label);
  const status = requireString(record.status, `${label}.status`, 20) as SecurityAuditStatus;
  const severity = requireString(record.severity, `${label}.severity`, 20) as SecurityAuditSeverity;
  if (!SECURITY_AUDIT_STATUSES.includes(status) || !SECURITY_AUDIT_SEVERITIES.includes(severity)) {
    throw new Error(`${label} has an invalid status or severity`);
  }
  return {
    controlId: requireString(record.controlId, `${label}.controlId`, 120, /^[a-z][a-z0-9.-]+$/),
    title: requireSanitizedText(record.title, `${label}.title`, 180),
    status,
    severity,
    evidence: parseEvidence(record.evidence, `${label}.evidence`),
  };
}

function calculateCounts(sections: Record<SecurityAuditSectionId, SecurityAuditSection>): SecurityAuditCounts {
  const counts: SecurityAuditCounts = {
    pass: 0, fail: 0, error: 0, notApplicable: 0,
    info: 0, low: 0, medium: 0, high: 0, critical: 0,
  };
  for (const section of Object.values(sections)) {
    for (const control of section.controls) {
      const statusKey = control.status === 'NOT_APPLICABLE'
        ? 'notApplicable'
        : control.status.toLowerCase() as 'pass' | 'fail' | 'error';
      counts[statusKey] += 1;
      if (control.status === 'FAIL' || control.status === 'ERROR') {
        counts[control.severity.toLowerCase() as 'info' | 'low' | 'medium' | 'high' | 'critical'] += 1;
      }
    }
  }
  return counts;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as UnknownRecord;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

export function reportPayloadForDigest(report: SecurityAuditReportV1): Omit<SecurityAuditReportV1, 'digestSha256'> {
  const { digestSha256: _digestSha256, ...payload } = report;
  return payload;
}

export function parseSecurityAuditReport(value: unknown): SecurityAuditReportV1 {
  const record = requireRecord(value, 'report');
  requireExactKeys(record, REPORT_KEYS, 'report');
  if (record.schema !== SECURITY_AUDIT_SCHEMA) throw new Error('report.schema is invalid');
  if (record.reportType !== 'exposure' && record.reportType !== 'full') throw new Error('report.reportType is invalid');
  const startedAt = requireIsoDate(record.startedAt, 'report.startedAt');
  const completedAt = requireIsoDate(record.completedAt, 'report.completedAt');
  if (new Date(completedAt).getTime() < new Date(startedAt).getTime()) throw new Error('report timestamps are out of order');

  const target = requireString(record.target, 'report.target', 300);
  const targetUrl = new URL(target);
  if (targetUrl.protocol !== 'https:' || targetUrl.username || targetUrl.password) throw new Error('report.target must be an HTTPS URL without credentials');

  const toolVersionsRecord = requireRecord(record.toolVersions, 'report.toolVersions');
  if (Object.keys(toolVersionsRecord).length > 32) throw new Error('report.toolVersions has too many fields');
  const toolVersions: Record<string, string> = {};
  for (const [key, version] of Object.entries(toolVersionsRecord)) {
    if (!TOOL_NAMES.has(key)) throw new Error('report.toolVersions has an invalid key');
    toolVersions[key] = requireSanitizedText(version, `report.toolVersions.${key}`, 120);
  }

  const sectionsRecord = requireRecord(record.sections, 'report.sections');
  requireExactKeys(sectionsRecord, SECURITY_AUDIT_SECTION_IDS, 'report.sections');
  const sections = {} as Record<SecurityAuditSectionId, SecurityAuditSection>;
  const controlIds = new Set<string>();
  for (const sectionId of SECURITY_AUDIT_SECTION_IDS) {
    const sectionRecord = requireRecord(sectionsRecord[sectionId], `report.sections.${sectionId}`);
    requireExactKeys(sectionRecord, ['sectionId', 'status', 'controls'], `report.sections.${sectionId}`);
    if (sectionRecord.sectionId !== sectionId) throw new Error(`report.sections.${sectionId}.sectionId is invalid`);
    const status = requireString(sectionRecord.status, `report.sections.${sectionId}.status`, 20) as SecurityAuditStatus;
    if (!SECURITY_AUDIT_STATUSES.includes(status)) throw new Error(`report.sections.${sectionId}.status is invalid`);
    if (!Array.isArray(sectionRecord.controls) || sectionRecord.controls.length < 1 || sectionRecord.controls.length > 64) {
      throw new Error(`report.sections.${sectionId}.controls is invalid`);
    }
    const controls = sectionRecord.controls.map((control, index) => parseControl(control, `report.sections.${sectionId}.controls[${index}]`));
    for (const control of controls) {
      if (controlIds.has(control.controlId)) throw new Error('report control IDs must be unique');
      controlIds.add(control.controlId);
    }
    const derivedStatus = controls.some((control) => control.status === 'ERROR') ? 'ERROR'
      : controls.some((control) => control.status === 'FAIL') ? 'FAIL'
        : controls.some((control) => control.status === 'PASS') ? 'PASS' : 'NOT_APPLICABLE';
    if (status !== derivedStatus) throw new Error(`report.sections.${sectionId}.status does not match its controls`);
    sections[sectionId] = { sectionId, status, controls };
  }

  if (!Array.isArray(record.executionErrors) || record.executionErrors.length > 64) {
    throw new Error('report.executionErrors is invalid');
  }
  const executionErrors = record.executionErrors.map((entry, index) =>
    requireSanitizedText(entry, `report.executionErrors[${index}]`, 500));

  const countsRecord = requireRecord(record.counts, 'report.counts');
  requireExactKeys(countsRecord, COUNT_KEYS, 'report.counts');
  const counts = {} as SecurityAuditCounts;
  for (const key of COUNT_KEYS) {
    const count = countsRecord[key];
    if (!Number.isSafeInteger(count) || Number(count) < 0 || Number(count) > 10000) throw new Error(`report.counts.${key} is invalid`);
    counts[key] = Number(count);
  }
  if (canonicalJson(counts) !== canonicalJson(calculateCounts(sections))) throw new Error('report.counts does not match its controls');

  return {
    schema: SECURITY_AUDIT_SCHEMA,
    reportId: requireString(record.reportId, 'report.reportId', 160, /^[A-Za-z0-9][A-Za-z0-9._-]+$/),
    reportType: record.reportType,
    startedAt,
    completedAt,
    target,
    sourceRevision: requireString(record.sourceRevision, 'report.sourceRevision', 64, /^(?:unknown|[a-f0-9]{40})$/),
    productionImage: requireString(record.productionImage, 'report.productionImage', 80, /^(?:unknown|sha256:[a-f0-9]{64})$/),
    toolVersions,
    sections,
    executionErrors,
    counts,
    digestSha256: requireString(record.digestSha256, 'report.digestSha256', 64, /^[a-f0-9]{64}$/),
  };
}
