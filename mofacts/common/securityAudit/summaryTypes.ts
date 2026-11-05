import type { AuditCatalogCoordinates, AuditReportType, AuditSectionId } from './catalogRegistry.ts';
import type { AuditIdentityObservation } from './reportIdentity.ts';
import type { AuditCounts, AuditSectionStatus } from './reportV2.ts';

// Client consumers use type-only imports; catalog/validators stay server-side.
export type AuditReportSummaryV2 = AuditCatalogCoordinates & {
  schema: 'SecurityAuditReportV2'; reportId: string; reportType: AuditReportType;
  startedAt: string; completedAt: string; target: string; scannerSourceRevision: string;
  deployedApplicationRevision: AuditIdentityObservation; deployedImageDigest: AuditIdentityObservation;
  digestSha256: string; counts: AuditCounts; sectionStatuses: Record<AuditSectionId, AuditSectionStatus>;
  overallStatus: AuditSectionStatus; executionErrorCount: number; ingestedAt: string;
};
