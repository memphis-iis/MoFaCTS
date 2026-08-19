import fs from 'node:fs/promises';
import { decryptReportEnvelope, verifyCanonicalReportDigest } from './report-crypto.mjs';

const [encryptedPath, outputPath, privateKeyPath] = process.argv.slice(2);
if (!encryptedPath || !outputPath || !privateKeyPath) {
  throw new Error('Usage: decrypt-report.mjs <encrypted-report> <new-output-path> <private-key-path>');
}

const envelope = JSON.parse(await fs.readFile(encryptedPath, 'utf8'));
const privateKeyPem = await fs.readFile(privateKeyPath, 'utf8');
const reportBuffer = decryptReportEnvelope(envelope, privateKeyPem);
verifyCanonicalReportDigest(reportBuffer);
await fs.writeFile(outputPath, reportBuffer, { mode: 0o600, flag: 'wx' });
process.stdout.write('The report was decrypted and its canonical digest verified.\n');
