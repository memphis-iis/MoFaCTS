import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const [reportPath] = process.argv.slice(2);
if (!reportPath) throw new Error('usage: upload-report.mjs <report.json>');

const target = String(process.env.AUDIT_TARGET || '').trim();
const secret = String(process.env.AUDIT_REPORT_INGEST_SECRET || '');
if (!target.startsWith('https://')) throw new Error('Audit target must be HTTPS');
if (secret.length < 32) throw new Error('Audit report ingestion secret is missing or too short');

const body = await fs.readFile(reportPath);
if (body.length > 2 * 1024 * 1024) throw new Error('Audit report exceeds the ingestion size limit');
const timestamp = String(Math.floor(Date.now() / 1000));
const nonce = crypto.randomBytes(24).toString('base64url');
const bodyDigest = crypto.createHash('sha256').update(body).digest('hex');
const signaturePayload = `${timestamp}.${nonce}.${bodyDigest}`;
const signature = crypto.createHmac('sha256', secret).update(signaturePayload).digest('hex');
const endpoint = new URL('/internal/security-audits/v1', target);

const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-MoFaCTS-Audit-Timestamp': timestamp,
    'X-MoFaCTS-Audit-Nonce': nonce,
    'X-MoFaCTS-Audit-Signature': signature,
  },
  body,
  redirect: 'error',
  signal: AbortSignal.timeout(30_000),
});
if (response.status !== 201) throw new Error(`Audit report ingestion returned HTTP ${response.status}`);
process.stdout.write('Security audit report stored by the application.\n');
