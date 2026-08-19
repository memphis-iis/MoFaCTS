import crypto from 'node:crypto';

export type SecurityAuditDownloadFormat = 'json' | 'html';
export type SecurityAuditDownloadTokenRecord = {
  reportId: string;
  format: SecurityAuditDownloadFormat;
  createdByUserId: string;
  expiresAt: Date;
};

const DOWNLOAD_TOKEN_TTL_MS = 5 * 60 * 1000;
const tokens = new Map<string, SecurityAuditDownloadTokenRecord>();

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
function cleanupExpiredTokens(now: Date): void {
  for (const [hash, record] of tokens.entries()) {
    if (record.expiresAt.getTime() <= now.getTime()) tokens.delete(hash);
  }
}

export function issueSecurityAuditDownloadToken(args: {
  reportId: string;
  format: SecurityAuditDownloadFormat;
  createdByUserId: string;
  now?: Date;
}): { token: string; expiresAt: Date } {
  const now = args.now || new Date();
  cleanupExpiredTokens(now);
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + DOWNLOAD_TOKEN_TTL_MS);
  tokens.set(tokenHash(token), {
    reportId: args.reportId,
    format: args.format,
    createdByUserId: args.createdByUserId,
    expiresAt,
  });
  return { token, expiresAt };
}

export function consumeSecurityAuditDownloadToken(
  token: string,
  now = new Date(),
): SecurityAuditDownloadTokenRecord | null {
  cleanupExpiredTokens(now);
  const normalized = String(token || '').trim();
  if (!normalized) return null;
  const hash = tokenHash(normalized);
  const record = tokens.get(hash);
  tokens.delete(hash);
  if (!record || record.expiresAt.getTime() <= now.getTime()) return null;
  return record;
}
