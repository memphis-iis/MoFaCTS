import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseReleaseReceiptV2, receiptPlatformImage, RECEIPT_MAX_BYTES } from '../../common/securityAudit/releaseReceipt.mjs';
import type { BuildIdentityObservation } from '../../common/securityAudit/buildIdentity.ts';
import { parseAuditIdentity, type AuditIdentityObservation } from '../../common/securityAudit/reportIdentity.ts';

const RELEASE_DIRECTORY = '/run/mofacts/release';
const RELEASE_NAME = 'release-receipt.json';

// The optional audit overlay supplies one metadata-only directory. Reopen on
// every ingestion so an atomic host replacement is visible; never cache a mount
// inode or infer image identity from the request. No I/O occurs at import/startup.
export async function readReceiverReleaseBytes(directory = RELEASE_DIRECTORY): Promise<Buffer | undefined> {
  if (process.platform !== 'linux') throw new Error('Protected release acquisition requires Linux');
  let parent;
  try { parent = await fs.lstat(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== 0 || parent.gid !== 0
    || (parent.mode & 0o777) !== 0o700 || await fs.realpath(directory) !== path.resolve(directory)) {
    throw new Error('Unsafe protected release directory');
  }
  const file = path.join(directory, RELEASE_NAME);
  let before;
  try { before = await fs.lstat(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  const safe = (stat: typeof before) => stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1
    && stat.uid === 0 && stat.gid === 0 && (stat.mode & 0o777) === 0o600 && stat.size > 0 && stat.size <= RECEIPT_MAX_BYTES;
  if (!safe(before)) throw new Error('Unsafe protected release file');
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = await handle.stat();
    if (!safe(opened) || opened.dev !== before.dev || opened.ino !== before.ino
      || opened.size !== before.size || opened.mtimeMs !== before.mtimeMs || opened.ctimeMs !== before.ctimeMs) {
      throw new Error('Protected release changed during acquisition');
    }
    const bytes = Buffer.alloc(RECEIPT_MAX_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < bytes.length) {
      const read = await handle.read(bytes, bytesRead, bytes.length - bytesRead, null);
      if (!read.bytesRead) break;
      bytesRead += read.bytesRead;
    }
    const after = await handle.stat();
    const current = await fs.lstat(file), currentParent = await fs.lstat(directory);
    if (bytesRead !== before.size || !safe(after) || !safe(current)
      || current.ino !== opened.ino || current.dev !== opened.dev
      || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs
      || current.mtimeMs !== opened.mtimeMs || current.ctimeMs !== opened.ctimeMs
      || currentParent.dev !== parent.dev || currentParent.ino !== parent.ino
      || currentParent.uid !== parent.uid || currentParent.gid !== parent.gid || currentParent.mode !== parent.mode) {
      throw new Error('Protected release changed during acquisition');
    }
    return bytes.subarray(0, bytesRead);
  } finally { await handle.close(); }
}

export function createAuditReceiverPlatformIdentity(
  loadBuildIdentity: () => Promise<BuildIdentityObservation>,
  readBytes: () => Promise<Buffer | undefined> = readReceiverReleaseBytes,
  platform = `${process.platform}/${process.arch === 'x64' ? 'amd64' : process.arch}`,
): () => Promise<AuditIdentityObservation> {
  return async () => {
    try {
      const bytes = await readBytes();
      if (bytes === undefined) return { state: 'unavailable', reason: 'not-provided' };
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > RECEIPT_MAX_BYTES) throw new Error('Invalid receipt bytes');
      const receipt = parseReleaseReceiptV2(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
      const build = await loadBuildIdentity();
      if (build.state !== 'observed') return { state: 'unavailable', reason: 'unresolved' };
      if (receipt.baseCommit !== build.identity.baseCommit
        || receipt.includedUncommittedLocalChanges !== build.identity.includedUncommittedLocalChanges
        || receipt.publishedImage.platform !== platform) {
        return { state: 'conflicting', reason: 'independent-observations-disagree' };
      }
      return parseAuditIdentity({ state: 'observed', value: receiptPlatformImage(receipt) }, 'platform-image');
    } catch { return { state: 'unavailable', reason: 'malformed' }; }
  };
}
