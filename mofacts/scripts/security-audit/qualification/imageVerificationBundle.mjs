import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { observeEmbeddedBuildIdentity } from '../../../common/securityAudit/buildIdentity.ts';
import { auditDigest, canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { contentDigest } from '../../../common/securityAudit/proofFields.ts';
import { MAX_VERIFICATION_BUNDLE_BYTES, parseVerificationBundle,
  requireMatchingSourceVerification } from '../../../common/securityAudit/verificationBundle.ts';
import { digestVerificationCatalog, requiredMeteorVerificationIds } from './verificationCatalogProof.mjs';

const fileName = 'mofacts-verification-bundle.json';
export const verificationBundleHash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function readBuildVerificationBundle(file) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > MAX_VERIFICATION_BUNDLE_BYTES) {
    throw Error('Invalid verification bundle file');
  }
  const bytes = await fs.readFile(file);
  if (bytes.length !== stat.size) throw Error('Verification bundle changed during acquisition');
  return bytes;
}

// This validates the embedded source claim and its exact snapshot. The
// independently collected runtime/host evidence still owns qualification.
export async function validateBuildVerificationBundle(bytes, buildIdentity, release, sourceCatalog) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > MAX_VERIFICATION_BUNDLE_BYTES) {
    throw Error('Verification bundle exceeds its byte limit');
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const bundle = parseVerificationBundle(JSON.parse(text));
  if (text !== canonicalAuditJson(bundle)) throw Error('Image requires a canonical verification bundle');
  const verification = sourceCatalog ?? {
    verificationCatalogSha256: await digestVerificationCatalog(),
    sourceVerificationIds: new Set(requiredMeteorVerificationIds),
  };
  return requireMatchingSourceVerification(bundle, {
    ...verification, buildIdentity, profileSha256: await auditDigest({ mode: 'production', meteorRelease: release }),
    expectedRegistrySha256: bundle.expectedRegistrySha256,
  });
}

export async function carryImageVerificationBundle({ sourceFile, releaseFile, inputFile, outputDirectory, expectedHash }) {
  const present = await fs.lstat(inputFile).then(() => true, error => {
    if (error.code !== 'ENOENT') throw error;
    return false;
  });
  if (!present && expectedHash === '') {
    await fs.mkdir(outputDirectory);
    return;
  }
  if (!present || !expectedHash) throw Error('Verification bundle and expected digest must be supplied together');
  const bytes = await readBuildVerificationBundle(inputFile);
  if (verificationBundleHash(bytes) !== contentDigest(expectedHash)) throw Error('Build verification bundle digest mismatch');
  const source = observeEmbeddedBuildIdentity(JSON.parse(await fs.readFile(sourceFile, 'utf8')));
  if (source.state !== 'observed') throw Error('Verification bundle requires exact captured source identity');
  await validateBuildVerificationBundle(bytes, source.identity, (await fs.readFile(releaseFile, 'utf8')).trim());
  await fs.mkdir(outputDirectory);
  await fs.writeFile(path.join(outputDirectory, fileName), bytes, { flag: 'wx', mode: 0o644 });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [sourceFile, releaseFile, inputFile, outputDirectory, expectedHash] = process.argv.slice(2);
  const valid = process.argv.length === 7 && sourceFile && releaseFile && inputFile && outputDirectory;
  const action = valid ? carryImageVerificationBundle({ sourceFile, releaseFile, inputFile, outputDirectory, expectedHash }) : Promise.reject();
  action.catch(() => {
    process.stderr.write('Verification bundle embedding failed; no qualification was issued.\n');
    process.exitCode = 1;
  });
}
