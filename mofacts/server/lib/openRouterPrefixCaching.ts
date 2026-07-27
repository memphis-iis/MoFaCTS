import { createHash } from 'crypto';

export function openRouterSessionCorrelationId(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex').slice(0, 16);
}
