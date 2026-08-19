import type { IncomingMessage, ServerResponse } from 'node:http';
import { Roles } from 'meteor/alanning:roles';
import { WebApp } from 'meteor/webapp';
import { acceptsSecurityAuditContentType, authenticateSecurityAuditRequest, SECURITY_AUDIT_MAX_BODY_BYTES } from '../securityAudit/securityAuditIngestion';
import { consumeSecurityAuditDownloadToken } from '../securityAudit/securityAuditDownloadTokens';
import { securityAuditDownloadBytes } from '../securityAudit/securityAuditPresentation';
import { SecurityAuditReports, storeSecurityAuditReport } from '../securityAudit/securityAuditStorage';

function writeText(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(text);
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declaredLength = Number(req.headers['content-length'] || 0);
    if (Number.isFinite(declaredLength) && declaredLength > SECURITY_AUDIT_MAX_BODY_BYTES) {
      reject(new Error('body-too-large'));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    req.on('data', (chunk: Buffer | string) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > SECURITY_AUDIT_MAX_BODY_BYTES) {
        settled = true;
        reject(new Error('body-too-large'));
        return;
      }
      chunks.push(buffer);
    });
    req.on('end', () => {
      if (!settled) resolve(Buffer.concat(chunks));
    });
    req.on('error', (error) => {
      if (!settled) reject(error);
    });
  });
}

function isDuplicateMongoError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 11000);
}

WebApp.connectHandlers.use('/internal/security-audits/v1', async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== 'POST') {
    writeText(res, 405, 'Method not allowed');
    return;
  }
  if (!acceptsSecurityAuditContentType(req.headers['content-type'])) {
    writeText(res, 415, 'Content type must be application/json');
    return;
  }
  const secret = String(process.env.MOFACTS_SECURITY_AUDIT_INGEST_SECRET || '');
  if (secret.length < 32) {
    writeText(res, 503, 'Security audit ingestion is unavailable');
    return;
  }
  try {
    const body = await readBody(req);
    const authenticated = authenticateSecurityAuditRequest({
      body,
      secret,
      headers: {
        timestamp: req.headers['x-mofacts-audit-timestamp'],
        nonce: req.headers['x-mofacts-audit-nonce'],
        signature: req.headers['x-mofacts-audit-signature'],
      },
    });
    const expectedTarget = new URL(String(process.env.ROOT_URL || '')).origin;
    if (new URL(authenticated.report.target).origin !== expectedTarget) {
      throw new Error('target-mismatch');
    }
    await storeSecurityAuditReport(authenticated.report, authenticated.nonce);
    res.writeHead(201, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end('{"stored":true}\n');
  } catch (error) {
    if (isDuplicateMongoError(error)) {
      writeText(res, 409, 'Security audit report was already received');
      return;
    }
    const message = error instanceof Error ? error.message : '';
    const status = message === 'body-too-large' ? 413
      : /authentication headers|timestamp|signature/.test(message) ? 401 : 400;
    writeText(res, status, 'Security audit report was rejected');
  }
});

WebApp.connectHandlers.use('/admin/security-audits/download', async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== 'GET') {
    writeText(res, 405, 'Method not allowed');
    return;
  }
  try {
    const rawPath = String(req.url || '').split('?')[0] || '';
    const parts = rawPath.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
    const token = parts[0] || '';
    const requestedName = parts[1] || '';
    const record = consumeSecurityAuditDownloadToken(token);
    if (!record || requestedName !== `${record.reportId}.${record.format}`) {
      writeText(res, 404, 'Security audit download token is invalid or expired');
      return;
    }
    if (!await Roles.userIsInRoleAsync(record.createdByUserId, ['admin'])) {
      writeText(res, 403, 'Admin access is required');
      return;
    }
    const stored = await SecurityAuditReports.findOneAsync({ reportId: record.reportId });
    if (!stored) {
      writeText(res, 404, 'Security audit report not found');
      return;
    }
    const { _id: _id, ingestedAt: _ingestedAt, expiresAt: _expiresAt, ingestNonce: _ingestNonce, ...report } = stored;
    const download = securityAuditDownloadBytes(report, record.format);
    const digestBase64 = Buffer.from(download.sha256, 'hex').toString('base64');
    res.writeHead(200, {
      'Content-Type': download.contentType,
      'Content-Disposition': `attachment; filename="${download.fileName}"`,
      'Content-Length': String(download.body.length),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Digest': `sha-256=${digestBase64}`,
      'X-Content-SHA256': download.sha256,
    });
    res.end(download.body);
  } catch {
    writeText(res, 500, 'Security audit download failed');
  }
});
