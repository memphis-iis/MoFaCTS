import { Random } from 'meteor/random';
import type { OwnedHistoryScopeRequest } from './ownedHistoryDownloadScope';

export type OwnedHistoryDownloadToken = {
  actorId: string;
  request: OwnedHistoryScopeRequest;
  tdfIds: string[];
  fileName: string;
  expiresAt: number;
};

const TOKEN_TTL_MS = 5 * 60 * 1000;
const tokens = new Map<string, OwnedHistoryDownloadToken>();

function purgeExpiredTokens(now = Date.now()): void {
  for (const [token, record] of tokens) if (record.expiresAt <= now) tokens.delete(token);
}

export function createOwnedHistoryDownloadToken(
  actorId: string,
  request: OwnedHistoryScopeRequest,
  tdfIds: readonly string[],
  fileName: string,
): { url: string; expiresAt: number } {
  purgeExpiredTokens();
  const token = Random.secret();
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  tokens.set(token, { actorId, request: { ...request }, tdfIds: [...tdfIds], fileName, expiresAt });
  return { url: `/data-download/owned-history/${encodeURIComponent(token)}/${encodeURIComponent(fileName)}`, expiresAt };
}

export function consumeOwnedHistoryDownloadToken(token: string): OwnedHistoryDownloadToken | null {
  purgeExpiredTokens();
  const record = tokens.get(token);
  if (!record) return null;
  tokens.delete(token);
  return record;
}
