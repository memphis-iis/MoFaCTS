import { Random } from 'meteor/random';

type OwnHistoryDownloadToken = {
  userId: string;
  fileName: string;
  expiresAt: number;
};

const TOKEN_TTL_MS = 5 * 60 * 1000;
const tokens = new Map<string, OwnHistoryDownloadToken>();

function purgeExpiredTokens(now = Date.now()): void {
  for (const [token, record] of tokens.entries()) {
    if (record.expiresAt <= now) {
      tokens.delete(token);
    }
  }
}

export function createOwnHistoryDownloadToken(userId: string, fileName: string): { url: string; expiresAt: number } {
  purgeExpiredTokens();
  const token = Random.secret();
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  tokens.set(token, { userId, fileName, expiresAt });
  return {
    url: `/data-download/own-history/${encodeURIComponent(token)}/${encodeURIComponent(fileName)}`,
    expiresAt,
  };
}

export function consumeOwnHistoryDownloadToken(token: string): OwnHistoryDownloadToken | null {
  purgeExpiredTokens();
  const record = tokens.get(token);
  if (!record) {
    return null;
  }
  tokens.delete(token);
  return record;
}
