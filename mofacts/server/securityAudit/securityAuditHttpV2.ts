import type { IncomingMessage, ServerResponse } from 'node:http';
import { AUDIT_V2_MAX_BODY_BYTES, AuditV2RequestError } from './securityAuditIngestionV2.ts';
import { AuditReceiverRequestError, type createSecurityAuditReceiverV2 } from './securityAuditReceiverV2.ts';

class AuditBodyError extends Error {
  readonly status: 400 | 413;
  constructor(status: 400 | 413) { super('Security audit request body was rejected'); this.status = status; }
}

function text(res: ServerResponse, status: number, message: string): void {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(message);
}

export function readAuditBodyV2(req: IncomingMessage): Promise<Buffer> {
  if (req.destroyed || req.readableEnded) return Promise.reject(new AuditBodyError(400));
  const declared = req.headers['content-length'];
  if (declared !== undefined && (!/^[0-9]+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) {
    req.resume(); return Promise.reject(new AuditBodyError(400));
  }
  if (declared !== undefined && Number(declared) > AUDIT_V2_MAX_BODY_BYTES) {
    req.resume(); return Promise.reject(new AuditBodyError(413));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let size = 0;
    function cleanup() { req.off('data', data); req.off('end', end); req.off('error', failed); req.off('aborted', failed); req.off('close', closed); }
    function failed() { cleanup(); chunks.length = 0; reject(new AuditBodyError(400)); }
    function closed() { if (!req.complete) failed(); }
    function data(chunk: Buffer | string) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length;
      if (size > AUDIT_V2_MAX_BODY_BYTES) { cleanup(); chunks.length = 0; req.resume(); reject(new AuditBodyError(413)); }
      else chunks.push(bytes);
    }
    function end() { cleanup(); resolve(Buffer.concat(chunks, size)); }
    req.on('data', data); req.once('end', end); req.once('error', failed); req.once('aborted', failed); req.once('close', closed);
  });
}

// Inert callbacks with Connect's mount-stripped URL contract. Importing or
// constructing registers nothing; the application composition owns registration.
export function createSecurityAuditHttpV2(deps: {
  receiver: Pick<ReturnType<typeof createSecurityAuditReceiverV2>, 'receive' | 'download'>;
  ingestionConfigured: () => boolean;
}) {
  return {
    async ingest(req: IncomingMessage, res: ServerResponse): Promise<void> {
      if (!['', '/'].includes(String(req.url || '').split('?')[0] || '')) { text(res, 404, 'Not found'); return; }
      if (req.method !== 'POST') { text(res, 405, 'Method not allowed'); return; }
      if (typeof req.headers['content-type'] !== 'string' || req.headers['content-type'].toLowerCase() !== 'application/json') {
        text(res, 415, 'Content type must be application/json'); return;
      }
      try {
        if (!deps.ingestionConfigured()) { text(res, 503, 'Security audit ingestion is unavailable'); return; }
        const body = await readAuditBodyV2(req);
        await deps.receiver.receive(body, { timestamp: req.headers['x-mofacts-audit-timestamp'],
          nonce: req.headers['x-mofacts-audit-nonce'], signature: req.headers['x-mofacts-audit-signature'] });
        if (res.destroyed || res.writableEnded) return;
        res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end('{"stored":true}\n');
      } catch (error) {
        const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
        const status = code === 11000 ? 409 : error instanceof AuditBodyError ? error.status
          : error instanceof AuditV2RequestError ? error.category === 'authentication' ? 401 : error.category === 'unavailable' ? 503 : 400 : 500;
        text(res, status, 'Security audit report was rejected');
      }
    },
    async download(req: IncomingMessage, res: ServerResponse): Promise<void> {
      if (req.method !== 'GET') { text(res, 405, 'Method not allowed'); return; }
      const match = /^\/([A-Za-z0-9_-]{43})\/([^/?#]+)$/.exec(String(req.url || '').split('?')[0] || '');
      if (!match) { text(res, 404, 'Security audit report not found'); return; }
      let name;
      try { name = decodeURIComponent(match[2]!); } catch { text(res, 404, 'Security audit report not found'); return; }
      try {
        const result = await deps.receiver.download(match[1], name);
        if (res.destroyed || res.writableEnded) return;
        res.writeHead(200, { 'Content-Type': result.contentType, 'Content-Disposition': `attachment; filename="${result.fileName}"`,
          'Content-Length': String(result.body.length), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox", 'Digest': `sha-256=${Buffer.from(result.sha256, 'hex').toString('base64')}`,
          'X-Content-SHA256': result.sha256 });
        res.end(result.body);
      } catch (error) {
        const forbidden = error && typeof error === 'object' && (error as { error?: unknown }).error === 'not-authorized';
        text(res, forbidden ? 403 : error instanceof AuditReceiverRequestError ? 404 : 500, 'Security audit download failed');
      }
    },
  };
}
