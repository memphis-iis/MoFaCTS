import crypto from 'node:crypto';
import { parseSecurityAuditReportV2, type AuditReportReadContext, type SecurityAuditReportV2 } from '../../common/securityAudit/reportV2.ts';

// Inert V2 transport boundary, not imported by the V1 route. At coordinated
// cutover this replaces the V1 authenticator/uploader; do not register both routes.
export const AUDIT_V2_MAX_BODY_BYTES = 2 * 1024 * 1024;
export const AUDIT_V2_REQUEST_SKEW_MS = 5 * 60 * 1000;
type AuditHeaders = Readonly<{ timestamp: unknown; nonce: unknown; signature: unknown }>;
type AuditV2TransportInput = { body: Buffer; headers: AuditHeaders; secret: string; now: Date };

// Transport callers use a closed category, never infer HTTP policy from an
// exception message or disclose rejected request/configuration values.
export class AuditV2RequestError extends Error {
  readonly category: 'unavailable' | 'authentication' | 'report';
  constructor(category: 'unavailable' | 'authentication' | 'report', message: string) {
    super(message);
    this.category = category;
  }
}

export function signAuditRequestV2(secret: string, timestamp: string, nonce: string, body: Buffer): string {
  const digest = crypto.createHash('sha256').update(body).digest('hex');
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${nonce}.${digest}`).digest('hex');
}

// Shared transport verification runs before receiver metadata acquisition. It
// returns untrusted JSON; report validation still belongs to the server/store.
export function verifyAuditRequestV2(args: AuditV2TransportInput): {
  value: unknown; nonce: string; authenticatedAt: string; uploadedAt: string;
} {
  if (typeof args.secret !== 'string' || args.secret.length < 32) throw new AuditV2RequestError('unavailable', 'Audit V2 transport input is invalid');
  if (!Buffer.isBuffer(args.body) || args.body.length > AUDIT_V2_MAX_BODY_BYTES) throw new AuditV2RequestError('report', 'Audit V2 transport input is invalid');
  const timestamp = typeof args.headers.timestamp === 'string' ? args.headers.timestamp.trim() : '';
  const nonce = typeof args.headers.nonce === 'string' ? args.headers.nonce.trim() : '';
  const signature = typeof args.headers.signature === 'string' ? args.headers.signature.trim().toLowerCase() : '';
  if (!/^\d{10}(?![\s\S])/.test(timestamp) || !/^[A-Za-z0-9_-]{22,128}(?![\s\S])/.test(nonce)) {
    throw new AuditV2RequestError('authentication', 'Audit V2 authentication headers are invalid');
  }
  const requestTime = Number(timestamp) * 1000;
  if (!Number.isSafeInteger(requestTime) || !Number.isFinite(args.now.getTime())
    || Math.abs(args.now.getTime() - requestTime) > AUDIT_V2_REQUEST_SKEW_MS) throw new AuditV2RequestError('authentication', 'Audit V2 timestamp is outside the accepted window');
  const expected = Buffer.from(signAuditRequestV2(args.secret, timestamp, nonce, args.body), 'hex');
  const validSignature = /^[a-f0-9]{64}(?![\s\S])/.test(signature);
  const received = validSignature ? Buffer.from(signature, 'hex') : Buffer.alloc(expected.length);
  if (!crypto.timingSafeEqual(received, expected) || !validSignature) throw new AuditV2RequestError('authentication', 'Audit V2 request signature is invalid');
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(args.body)); }
  catch { throw new AuditV2RequestError('report', 'Audit V2 request body is invalid JSON'); }
  return { value, nonce, authenticatedAt: new Date(requestTime).toISOString(), uploadedAt: args.now.toISOString() };
}

export async function authenticateAuditRequestV2(args: AuditV2TransportInput & {
  receiver: Omit<Extract<AuditReportReadContext, { purpose: 'ingestion' }>, 'purpose' | 'authenticatedAt' | 'uploadedAt'>;
}): Promise<{ report: SecurityAuditReportV2; nonce: string }> {
  const verified = verifyAuditRequestV2(args);
  const report = await parseSecurityAuditReportV2(verified.value, { ...args.receiver, purpose: 'ingestion',
    authenticatedAt: verified.authenticatedAt, uploadedAt: verified.uploadedAt });
  // Storage owns replay exclusion through the existing unique nonce/report/digest
  // indexes. Authentication alone never claims a nonce has been consumed.
  return { report, nonce: verified.nonce };
}
