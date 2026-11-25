import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseImageObservation } from '../../../common/securityAudit/releaseQualification.ts';
import { parsePublishedImage } from '../../../common/securityAudit/releaseReceipt.mjs';
import { imageDigest } from '../../../common/securityAudit/proofFields.ts';
import { IMAGE_ARCHIVE_LIMITS, IMAGE_MEDIA_TYPES } from './imageArchiveIdentity.mjs';
import { evidenceCommand, readCiFile } from './collectCiEvidence.mjs';
import { parseCiEvidenceJson } from './ciEvidence.mjs';

const maximum = IMAGE_ARCHIVE_LIMITS.metadataBytes;
const invalid = () => { throw new Error('Published image observation is unavailable'); };
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function descriptor(value, types) {
  if (!value || typeof value !== 'object' || !types.includes(value.mediaType)
    || !Number.isSafeInteger(value.size) || value.size < 1 || value.size > maximum) invalid();
  return { digest: imageDigest(value.digest), size: value.size };
}

// Read-only registry metadata. A tag is not accepted and no image is pulled,
// built or published. The independently observed config/platform must
// agree with the content-addressed registry graph. This is not qualification.
export async function observePublishedImage(reference, imageObservation, command = evidenceCommand) {
  const expected = parseImageObservation(imageObservation);
  if (expected.platform !== 'linux/amd64' || typeof reference !== 'string' || reference.length > 400
    || !/^[a-z0-9][a-z0-9._:/-]*@sha256:[a-f0-9]{64}$/.test(reference) || reference.includes('://')) invalid();
  const [repository, rootDigest] = reference.split('@'); imageDigest(rootDigest);
  async function read(digest, size) {
    const bytes = await command('docker', ['--context', 'default', 'buildx', 'imagetools', 'inspect', '--raw', `${repository}@${digest}`], maximum);
    // buildx --raw returns the registry blob bytes. Do not reserialize, trim
    // whitespace or try another digest interpretation on mismatch.
    if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > maximum
      || size !== undefined && bytes.length !== size || hash(bytes) !== digest) invalid();
    const value = parseCiEvidenceJson(bytes, maximum);
    if (!value || value.schemaVersion !== 2) invalid();
    return value;
  }
  const root = await read(rootDigest); let manifest = root, platformManifestDigest;
  const index = IMAGE_MEDIA_TYPES.indices.includes(root.mediaType);
  if (index) {
    if (!Array.isArray(root.manifests) || root.manifests.length < 1 || root.manifests.length > 64) invalid();
    const selected = root.manifests.filter(row => row.platform?.os === 'linux'
      && row.platform?.architecture === 'amd64' && row.platform?.variant === undefined);
    if (selected.length !== 1) invalid();
    const platform = descriptor(selected[0], IMAGE_MEDIA_TYPES.manifests);
    platformManifestDigest = platform.digest; manifest = await read(platform.digest, platform.size);
  }
  if (!IMAGE_MEDIA_TYPES.manifests.includes(manifest.mediaType) || !Array.isArray(manifest.layers)
    || manifest.layers.length > IMAGE_ARCHIVE_LIMITS.entries) invalid();
  const config = descriptor(manifest.config, IMAGE_MEDIA_TYPES.configs);
  if (config.digest !== expected.configDigest) invalid();
  return parsePublishedImage({ kind: index ? 'index' : 'manifest', digest: rootDigest,
    ...(index ? { platformManifestDigest } : {}), configDigest: config.digest, platform: expected.platform });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) invalid();
    const built = parseCiEvidenceJson(await readCiFile(path.resolve(process.argv[3]), 16384), 16384);
    process.stdout.write(JSON.stringify(await observePublishedImage(process.argv[2], built)) + '\n');
  } catch {
    process.stderr.write('Published image observation failed; no qualification was issued.\n'); process.exitCode = 1;
  }
}
