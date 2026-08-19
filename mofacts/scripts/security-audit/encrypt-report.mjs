import fs from 'node:fs/promises';
import { encryptReportBuffer } from './report-crypto.mjs';

const [reportPath, outputPath] = process.argv.slice(2);
const publicKeyPem = process.env.AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY || '';
if (!reportPath || !outputPath || !publicKeyPem) {
  throw new Error('Report path, output path, and the configured report-encryption public key are required');
}

const reportBuffer = await fs.readFile(reportPath);
const envelope = encryptReportBuffer(reportBuffer, publicKeyPem);
await fs.writeFile(outputPath, `${JSON.stringify(envelope)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
process.stdout.write('The sanitized security report was encrypted for retention.\n');
