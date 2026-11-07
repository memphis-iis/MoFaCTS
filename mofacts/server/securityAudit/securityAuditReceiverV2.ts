import { collectionMongoName } from '../../common/collectionOwnership.ts';
import { parseAuditIdentity, type AuditIdentityObservation } from '../../common/securityAudit/reportIdentity.ts';
import type { BuildIdentityObservation } from '../../common/securityAudit/buildIdentity.ts';
import { parseSecurityAuditReportV2 } from '../../common/securityAudit/reportV2.ts';
import { verifyAuditRequestV2 } from './securityAuditIngestionV2.ts';
import { createAuditReportStoreV2, type AuditReportCollectionV2 } from './securityAuditReportStoreV2.ts';
import { auditDownloadBytesV2 } from './securityAuditPresentationV2.ts';
import { consumeSecurityAuditDownloadToken, issueSecurityAuditDownloadToken } from './securityAuditDownloadTokens.ts';
import { auditReceiverRevision, createAuditReceiverIdentityLoader } from './securityAuditReceiverIdentity.ts';

type UserId = string | null | undefined;
type Headers = Parameters<typeof verifyAuditRequestV2>[0]['headers'];
export class AuditReceiverRequestError extends Error {
  readonly category: 'not-found' | 'invalid-download-format';
  constructor(category: 'not-found' | 'invalid-download-format') {
    super('Security audit request was rejected');
    this.category = category;
  }
}

// Inert composition: importing this module constructs no collection, registers
// no route/method and reads no metadata. The coordinated cutover owns activation.
// The platform observation is a required independently owned adapter, never a
// request/report value or a guessed tag/config ID. Its runtime wiring is pending.
export function createSecurityAuditReceiverV2(deps: {
  createReports: (mongoName: string) => AuditReportCollectionV2;
  requireAdminUser: (userId: UserId, message?: string, code?: string | number) => Promise<void>;
  platformIdentity: () => Promise<AuditIdentityObservation>;
  targetOrigin: () => string;
  ingestSecret: () => string;
  now: () => Date;
  loadBuildIdentity?: () => Promise<BuildIdentityObservation>;
}) {
  const store = createAuditReportStoreV2(deps.createReports(collectionMongoName('SecurityAuditReportsV2')), deps.now);
  const loadBuildIdentity = deps.loadBuildIdentity ?? createAuditReceiverIdentityLoader();
  async function requireAdmin(userId: UserId): Promise<string> {
    await deps.requireAdminUser(userId, 'Only admins can view security audits', 'not-authorized');
    if (typeof userId !== 'string' || !userId) throw new Error('Admin authorization returned no authenticated identity');
    return userId;
  }
  return {
    initialize: store.ensureIndexes,
    async receive(body: Buffer, headers: Headers): Promise<void> {
      const now = deps.now();
      const verified = verifyAuditRequestV2({ body, headers, secret: deps.ingestSecret(), now });
      const [build, image] = await Promise.all([loadBuildIdentity(), deps.platformIdentity()]);
      const receiver = { targetOrigin: deps.targetOrigin(), receiverRevision: auditReceiverRevision(build),
        receiverImage: parseAuditIdentity(image, 'platform-image') };
      const context = { ...receiver, purpose: 'ingestion' as const,
        authenticatedAt: verified.authenticatedAt, uploadedAt: verified.uploadedAt };
      const report = await parseSecurityAuditReportV2(verified.value, context);
      await store.store(report, verified.nonce, context);
    },
    async list(userId: UserId) { await requireAdmin(userId); return store.list(); },
    async getSummary(userId: UserId, reportId: unknown) {
      await requireAdmin(userId);
      const result = await store.getSummary(reportId);
      if (!result) throw new AuditReceiverRequestError('not-found');
      return result;
    },
    async issueDownload(userId: UserId, reportId: unknown, format: unknown) {
      const authorized = await requireAdmin(userId);
      if (format !== 'json' && format !== 'html') throw new AuditReceiverRequestError('invalid-download-format');
      // Recompute full integrity before minting a capability, not from a summary.
      const report = await store.get(reportId);
      if (!report) throw new AuditReceiverRequestError('not-found');
      const issued = issueSecurityAuditDownloadToken({ reportId: report.reportId, format,
        createdByUserId: authorized, now: deps.now() });
      return { url: `/admin/security-audits/download/${encodeURIComponent(issued.token)}/${encodeURIComponent(report.reportId)}.${format}`,
        expiresAt: issued.expiresAt.toISOString() };
    },
    async download(token: unknown, requestedName: unknown) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}(?![\s\S])/.test(token)) throw new AuditReceiverRequestError('not-found');
      const record = consumeSecurityAuditDownloadToken(token, deps.now());
      if (!record || requestedName !== `${record.reportId}.${record.format}`) throw new AuditReceiverRequestError('not-found');
      await requireAdmin(record.createdByUserId);
      const report = await store.get(record.reportId);
      if (!report) throw new AuditReceiverRequestError('not-found');
      return auditDownloadBytesV2(report, record.format);
    },
  };
}
