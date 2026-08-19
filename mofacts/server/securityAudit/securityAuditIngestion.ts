import crypto from 'node:crypto';
import {
  canonicalJson,
  parseSecurityAuditReport,
  reportPayloadForDigest,
  type SecurityAuditReportV1,
} from '../../common/securityAuditReport';

export const SECURITY_AUDIT_MAX_BODY_BYTES = 2 * 1024 * 1024;
export const SECURITY_AUDIT_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

export function acceptsSecurityAuditContentType(value: unknown): boolean {
  return typeof value === 'string' && value.toLowerCase() === 'application/json';
}

type HeaderValues = Readonly<{
  timestamp: unknown;
  nonce: unknown;
  signature: unknown;
}>;

function sha256Hex(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function securityAuditSignaturePayload(timestamp: string, nonce: string, bodyDigest: string): string {
  return `${timestamp}.${nonce}.${bodyDigest}`;
}

export function signSecurityAuditRequest(secret: string, timestamp: string, nonce: string, body: Buffer): string {
  const bodyDigest = sha256Hex(body);
  return crypto.createHmac('sha256', secret)
    .update(securityAuditSignaturePayload(timestamp, nonce, bodyDigest))
    .digest('hex');
}

function constantTimeHexEqual(received: string, expected: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = /^[a-f0-9]{64}$/i.test(received)
    ? Buffer.from(received, 'hex')
    : Buffer.alloc(expectedBuffer.length);
  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer) && /^[a-f0-9]{64}$/i.test(received);
}

export function authenticateSecurityAuditRequest(args: {
  body: Buffer;
  headers: HeaderValues;
  secret: string;
  now?: Date;
}): { report: SecurityAuditReportV1; nonce: string } {
  if (!args.secret || args.secret.length < 32) throw new Error('Security audit ingestion is not configured');
  if (args.body.length > SECURITY_AUDIT_MAX_BODY_BYTES) throw new Error('Security audit request body is too large');

  const timestamp = typeof args.headers.timestamp === 'string' ? args.headers.timestamp.trim() : '';
  const nonce = typeof args.headers.nonce === 'string' ? args.headers.nonce.trim() : '';
  const signature = typeof args.headers.signature === 'string' ? args.headers.signature.trim().toLowerCase() : '';
  if (!/^\d{10}$/.test(timestamp) || !/^[A-Za-z0-9_-]{22,128}$/.test(nonce)) {
    throw new Error('Security audit authentication headers are invalid');
  }
  const requestTimeMs = Number(timestamp) * 1000;
  const nowMs = (args.now || new Date()).getTime();
  if (!Number.isSafeInteger(requestTimeMs) || Math.abs(nowMs - requestTimeMs) > SECURITY_AUDIT_TIMESTAMP_TOLERANCE_MS) {
    throw new Error('Security audit request timestamp is outside the accepted window');
  }
  const expected = signSecurityAuditRequest(args.secret, timestamp, nonce, args.body);
  if (!constantTimeHexEqual(signature, expected)) throw new Error('Security audit request signature is invalid');

  let value: unknown;
  try {
    value = JSON.parse(args.body.toString('utf8'));
  } catch {
    throw new Error('Security audit request body is invalid JSON');
  }
  const report = parseSecurityAuditReport(value);
  const digest = sha256Hex(canonicalJson(reportPayloadForDigest(report)));
  if (!constantTimeHexEqual(report.digestSha256, digest)) throw new Error('Security audit report digest is invalid');
  return { report, nonce };
}
