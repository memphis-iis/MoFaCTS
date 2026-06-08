import crypto from 'crypto';

export type BackupDownloadTokenRecord = {
  backupJobId: string;
  archiveFileName: string;
  createdByUserId: string;
  expiresAt: Date;
};

const DOWNLOAD_TOKEN_TTL_MS = 5 * 60 * 1000;
const tokens = new Map<string, BackupDownloadTokenRecord>();

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function cleanupExpiredTokens(now = new Date()): void {
  for (const [hash, record] of tokens.entries()) {
    if (record.expiresAt.getTime() <= now.getTime()) {
      tokens.delete(hash);
    }
  }
}

export function issueBackupDownloadToken(args: {
  backupJobId: string;
  archiveFileName: string;
  createdByUserId: string;
  now?: Date;
}): { token: string; expiresAt: Date } {
  const now = args.now || new Date();
  cleanupExpiredTokens(now);
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + DOWNLOAD_TOKEN_TTL_MS);
  tokens.set(tokenHash(token), {
    backupJobId: args.backupJobId,
    archiveFileName: args.archiveFileName,
    createdByUserId: args.createdByUserId,
    expiresAt,
  });
  return { token, expiresAt };
}

export function consumeBackupDownloadToken(token: string, now = new Date()): BackupDownloadTokenRecord | null {
  cleanupExpiredTokens(now);
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    return null;
  }
  const hash = tokenHash(normalizedToken);
  const record = tokens.get(hash);
  tokens.delete(hash);
  if (!record || record.expiresAt.getTime() <= now.getTime()) {
    return null;
  }
  return record;
}
