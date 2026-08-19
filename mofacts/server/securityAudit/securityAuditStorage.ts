import { Mongo } from 'meteor/mongo';
import { collectionMongoName } from '../../common/collectionOwnership';
import type { SecurityAuditReportV1 } from '../../common/securityAuditReport';

export type StoredSecurityAuditReport = SecurityAuditReportV1 & {
  _id?: string;
  ingestedAt: Date;
  expiresAt: Date;
  ingestNonce: string;
};

export const SecurityAuditReports = new Mongo.Collection<StoredSecurityAuditReport>(
  collectionMongoName('SecurityAuditReports'),
);

type SecurityAuditRawCollection = {
  createIndex(keys: Record<string, number>, options?: Record<string, unknown>): Promise<unknown>;
};

export async function ensureSecurityAuditIndexes(
  raw: SecurityAuditRawCollection = SecurityAuditReports.rawCollection(),
): Promise<void> {
  await raw.createIndex({ reportId: 1 }, { unique: true });
  await raw.createIndex({ digestSha256: 1 }, { unique: true });
  await raw.createIndex({ ingestNonce: 1 }, { unique: true });
  await raw.createIndex({ reportType: 1, completedAt: -1 });
  await raw.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

export async function storeSecurityAuditReport(
  report: SecurityAuditReportV1,
  ingestNonce: string,
  now = new Date(),
): Promise<void> {
  const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  await SecurityAuditReports.insertAsync({
    ...report,
    ingestNonce,
    ingestedAt: now,
    expiresAt,
  });
}
