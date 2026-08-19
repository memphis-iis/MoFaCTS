import crypto from 'node:crypto';
import { canonicalJson } from './audit-lib.mjs';

export const ENCRYPTED_REPORT_SCHEMA = 'SecurityAuditEncryptedEnvelopeV1';
const MAX_REPORT_BYTES = 2 * 1024 * 1024;
const ENVELOPE_KEYS = [
  'schema', 'keyAlgorithm', 'contentAlgorithm', 'encryptedKey', 'iv', 'authTag', 'ciphertext',
];

function requireRsaKey(key, expectedType) {
  if (key.asymmetricKeyType !== 'rsa' || key.type !== expectedType
    || Number(key.asymmetricKeyDetails?.modulusLength || 0) < 3072) {
    throw new Error(`A ${expectedType} RSA key of at least 3072 bits is required`);
  }
  return key;
}

function decodeBase64(value, field) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error(`Encrypted report ${field} is invalid`);
  }
  return Buffer.from(value, 'base64');
}

export function encryptReportBuffer(reportBuffer, publicKeyPem) {
  if (!Buffer.isBuffer(reportBuffer) || reportBuffer.length === 0 || reportBuffer.length > MAX_REPORT_BYTES) {
    throw new Error('Canonical report is empty or exceeds 2 MiB');
  }
  verifyCanonicalReportDigest(reportBuffer);
  const publicKey = requireRsaKey(crypto.createPublicKey(publicKeyPem), 'public');
  const contentKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', contentKey, iv);
  const ciphertext = Buffer.concat([cipher.update(reportBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const encryptedKey = crypto.publicEncrypt({
    key: publicKey,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256',
  }, contentKey);
  return {
    schema: ENCRYPTED_REPORT_SCHEMA,
    keyAlgorithm: 'RSA-OAEP-SHA256',
    contentAlgorithm: 'AES-256-GCM',
    encryptedKey: encryptedKey.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function decryptReportEnvelope(value, privateKeyPem) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== ENVELOPE_KEYS.length
    || ENVELOPE_KEYS.some((key) => !(key in value))) {
    throw new Error('Encrypted report envelope has an invalid shape');
  }
  if (value.schema !== ENCRYPTED_REPORT_SCHEMA
    || value.keyAlgorithm !== 'RSA-OAEP-SHA256'
    || value.contentAlgorithm !== 'AES-256-GCM') {
    throw new Error('Encrypted report algorithms are unsupported');
  }
  const privateKey = requireRsaKey(crypto.createPrivateKey(privateKeyPem), 'private');
  const contentKey = crypto.privateDecrypt({
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256',
  }, decodeBase64(value.encryptedKey, 'encryptedKey'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', contentKey, decodeBase64(value.iv, 'iv'));
  decipher.setAuthTag(decodeBase64(value.authTag, 'authTag'));
  const plaintext = Buffer.concat([
    decipher.update(decodeBase64(value.ciphertext, 'ciphertext')),
    decipher.final(),
  ]);
  if (plaintext.length === 0 || plaintext.length > MAX_REPORT_BYTES) {
    throw new Error('Decrypted report is empty or exceeds 2 MiB');
  }
  return plaintext;
}

export function verifyCanonicalReportDigest(reportBuffer) {
  const report = JSON.parse(reportBuffer.toString('utf8'));
  if (!report || typeof report !== 'object' || Array.isArray(report)
    || !/^[a-f0-9]{64}$/.test(String(report.digestSha256 || ''))) {
    throw new Error('Decrypted report has no valid canonical digest');
  }
  const { digestSha256, ...payload } = report;
  const actual = crypto.createHash('sha256').update(canonicalJson(payload)).digest('hex');
  if (actual !== digestSha256) throw new Error('Decrypted report digest does not match its content');
  return report;
}
