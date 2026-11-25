import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { auditTargetOrigin, parseSecurityAuditReportV2 } from '../../../common/securityAudit/reportV2.ts';
import { canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { AUDIT_V2_MAX_BODY_BYTES } from '../../../server/securityAudit/securityAuditIngestionV2.ts';
import { realDirectory } from '../qualification/collectCiEvidence.mjs';
import { encryptReportBuffer } from '../report-crypto.mjs';
import { readAuditFileV2, parseAuditFileV2 } from './producerFilesV2.mjs';

const maxPublicKeyBytes = 65536;
const maxEncryptedBytes = Math.ceil(AUDIT_V2_MAX_BODY_BYTES / 3) * 4 + 2 * maxPublicKeyBytes + 16384;

async function readReport(reportPath, env) {
  const target = auditTargetOrigin(env.AUDIT_TARGET);
  const bytes = await readAuditFileV2(reportPath);
  const report = await parseSecurityAuditReportV2(parseAuditFileV2(bytes), { purpose: 'retained' });
  if (report.target !== target) throw new Error('V2 audit retention target does not match the protected configuration');
  return { report, bytes };
}

// Shared crypto already supports canonical report bytes independent of schema.
// Strict V2 parsing remains authoritative here; no V1 producer/crypto code is
// edited, and no second encryption scheme is introduced during inert development.
export async function encryptAuditReportFileV2({ reportPath, encryptedPath, env = process.env }) {
  const output = path.resolve(encryptedPath), directory = await realDirectory(path.dirname(output));
  try { await fs.lstat(output); throw new Error('V2 encrypted output already exists'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const key = env.AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY;
  if (typeof key !== 'string' || !key.length || Buffer.byteLength(key) > maxPublicKeyBytes) throw new Error('V2 report encryption configuration is unavailable');
  const { report, bytes } = await readReport(reportPath, env);
  let encrypted, publicKeySha256;
  try {
    publicKeySha256 = publicKeyFingerprintV2(key);
    encrypted = Buffer.from(canonicalAuditJson(encryptReportBuffer(bytes, key)) + '\n');
  }
  catch { throw new Error('V2 report encryption did not complete'); }
  if (encrypted.length > maxEncryptedBytes || await fs.realpath(directory) !== directory) throw new Error('V2 report retention bounds were exceeded');
  const handle = await fs.open(output, 'wx+', 0o600);
  try {
    await handle.writeFile(encrypted); await handle.sync();
    const saved = Buffer.alloc(encrypted.length + 1);
    let count = 0;
    while (count < saved.length) {
      const { bytesRead } = await handle.read(saved, count, saved.length - count, count);
      if (!bytesRead) break;
      count += bytesRead;
    }
    const opened = await handle.stat({ bigint: true }), named = await fs.lstat(output, { bigint: true });
    if (!named.isFile() || named.isSymbolicLink() || named.nlink !== 1n || named.size !== BigInt(encrypted.length)
      || opened.dev !== named.dev || opened.ino !== named.ino || count !== encrypted.length
      || !crypto.timingSafeEqual(saved.subarray(0, count), encrypted)) throw new Error('V2 saved encrypted bytes did not verify');
    return { reportId: report.reportId, catalogId: report.catalogId, catalogVersion: report.catalogVersion,
      catalogDigestSha256: report.catalogDigestSha256, digestSha256: report.digestSha256,
      reportBytesSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      encryptedBytesSha256: crypto.createHash('sha256').update(encrypted).digest('hex'),
      publicKeySha256, savedBytesVerified: true };
  }
  finally { await handle.close(); }
}

function publicKeyFingerprintV2(pem) {
  // A private PEM is not an acceptable source even though createPublicKey can
  // derive its public part. The scanner must never receive a private key.
  if (typeof pem !== 'string' || !pem.startsWith('-----BEGIN PUBLIC KEY-----')) throw new Error('V2 public key is unavailable');
  const key = crypto.createPublicKey(pem);
  if (key.asymmetricKeyType !== 'rsa' || Number(key.asymmetricKeyDetails?.modulusLength) < 3072) throw new Error('V2 public key is unavailable');
  return crypto.createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
}

// The unattended owner supplies the accepted fingerprint from its qualification
// profile, independently of the supplied PEM. There is no default-to-current pin.
// The ordinary operator encryption entry point remains useful for key qualification.
export async function retainPinnedAuditArchiveV2({ expectedPublicKeySha256, ...options }) {
  const env = options.env ?? process.env;
  if (typeof expectedPublicKeySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedPublicKeySha256)
    || publicKeyFingerprintV2(env.AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY) !== expectedPublicKeySha256) {
    throw new Error('V2 archive public key does not match its accepted fingerprint');
  }
  return encryptAuditReportFileV2({ ...options, env });
}

// The expected digest is the writer's retained receipt, not a digest freshly
// calculated from this readback path. This also supports a separately stored
// encrypted copy without ever loading an offline decryption key.
export async function verifySavedAuditArchiveV2({ encryptedPath, expectedEncryptedBytesSha256 }) {
  if (typeof expectedEncryptedBytesSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedEncryptedBytesSha256)) {
    throw new Error('V2 archive readback digest is unavailable');
  }
  const bytes = await readAuditFileV2(encryptedPath, maxEncryptedBytes);
  const encryptedBytesSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (encryptedBytesSha256 !== expectedEncryptedBytesSha256) throw new Error('V2 saved archive readback does not match');
  return { encryptedBytesSha256, savedBytesVerified: true };
}

// Network acquisition/authentication remains with the existing receiver reader.
// This owner validates its independently acquired bounded report bytes. Neither
// HTTP 201 nor an upload receipt can substitute for this separate observation.
export async function readMatchedAuditReportV2({ reportPath, readbackPath, env = process.env }) {
  if (path.resolve(reportPath) === path.resolve(readbackPath)) throw new Error('V2 report readback must be independently acquired');
  const source = await readReport(reportPath, env), observed = await readReport(readbackPath, env);
  const left = await fs.stat(reportPath, { bigint: true }), right = await fs.stat(readbackPath, { bigint: true });
  if (left.dev === right.dev && left.ino === right.ino
    || canonicalAuditJson(source.report) !== canonicalAuditJson(observed.report)) throw new Error('V2 ingested report readback does not match');
  return source.report;
}

export async function verifyAuditReportReadbackV2(options) {
  const { reportId, catalogId, catalogVersion, catalogDigestSha256, digestSha256 } = await readMatchedAuditReportV2(options);
  return { reportId, catalogId, catalogVersion, catalogDigestSha256, digestSha256, ingestedReportMatched: true };
}

// The run owner retains the encryption receipt privately and acquires receiver
// bytes through its separate authorized reader. No upload acknowledgement or
// operator-decryption claim can satisfy these gates. Remove only the validated
// temporary source and receiver copy; retain the encrypted archive. The caller
// persists its run manifest/verification receipts before requesting cleanup and
// owns recovery if an interrupted cleanup leaves either temporary path present.
export async function completeOfflineKeyRetentionV2({ reportPath, readbackPath, encryptedPath,
  archiveReceipt, expectedPublicKeySha256, env = process.env }) {
  const keys = ['reportId', 'catalogId', 'catalogVersion', 'catalogDigestSha256', 'digestSha256',
    'reportBytesSha256', 'encryptedBytesSha256', 'publicKeySha256', 'savedBytesVerified'];
  if (!archiveReceipt || Object.keys(archiveReceipt).sort().join(',') !== keys.sort().join(',')
    || archiveReceipt.savedBytesVerified !== true || !/^[a-f0-9]{64}$/.test(expectedPublicKeySha256 ?? '')
    || archiveReceipt.publicKeySha256 !== expectedPublicKeySha256
    || publicKeyFingerprintV2(env.AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY) !== expectedPublicKeySha256) {
    throw new Error('V2 offline-key retention preconditions are unavailable');
  }
  const before = await fs.lstat(reportPath, { bigint: true });
  const readbackBefore = await fs.lstat(readbackPath, { bigint: true });
  const source = await readReport(reportPath, env);
  if (crypto.createHash('sha256').update(source.bytes).digest('hex') !== archiveReceipt.reportBytesSha256
    || ['reportId', 'catalogId', 'catalogVersion', 'catalogDigestSha256', 'digestSha256']
      .some(key => source.report[key] !== archiveReceipt[key])) throw new Error('V2 archive receipt does not bind this report');
  await verifySavedAuditArchiveV2({ encryptedPath, expectedEncryptedBytesSha256: archiveReceipt.encryptedBytesSha256 });
  const readback = await verifyAuditReportReadbackV2({ reportPath, readbackPath, env });
  for (const [file, original] of [[reportPath, before], [readbackPath, readbackBefore]]) {
    const after = await fs.lstat(file, { bigint: true });
    for (const key of ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']) {
      if (original[key] !== after[key]) throw new Error('V2 temporary report changed before cleanup');
    }
  }
  for (const file of [reportPath, readbackPath]) {
    await fs.unlink(file);
    try { await fs.lstat(file); throw new Error('V2 temporary report cleanup did not verify'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { ...readback, encryptedBytesSha256: archiveReceipt.encryptedBytesSha256,
    publicKeySha256: expectedPublicKeySha256, savedBytesVerified: true, temporaryPlaintextRemoved: true };
}

// This is the final workflow assertion, after storage/encrypted-artifact receipts
// have been checked by their owners. A security FAIL is a finding, not an I/O
// failure. Both independently parsed row counts and execution errors are checked.
export async function assertAuditExecutionCompleteFileV2({ reportPath, env = process.env }) {
  const { report } = await readReport(reportPath, env);
  if (report.executionErrors.length !== 0 || report.counts.error !== 0) throw new Error('V2 audit execution evidence is incomplete');
}
