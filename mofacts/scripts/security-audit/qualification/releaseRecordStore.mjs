import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseWorkstationReleaseRecord, classifyReleaseRecordProof, parseRunningImageObservation } from '../../../common/securityAudit/releaseQualification.ts';
import { parsePublishedImage, parseReleaseReceipt, parseReleaseReceiptV2 } from '../../../common/securityAudit/releaseReceipt.mjs';

const MAX_BYTES = 16384;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const invalid = () => { throw new Error('Release record storage validation failed'); };

// Never follow a substituted directory, file link, or multi-link record. The
// existing operator directory is the trust boundary; this does not create it.
async function directory(target) {
  const absolute = path.resolve(target);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) invalid();
  }
  if (await fs.realpath(absolute) !== absolute) invalid();
  return absolute;
}

export async function readReleaseBytes(file) {
  await directory(path.dirname(file));
  const before = await fs.lstat(file, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size > BigInt(MAX_BYTES)) invalid();
  const handle = await fs.open(file, fs.constants.O_RDONLY | (process.platform === 'linux' ? fs.constants.O_NOFOLLOW : 0));
  try {
    const opened = await handle.stat({ bigint: true });
    if (before.ino !== opened.ino || before.dev !== opened.dev || before.size !== opened.size) invalid();
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let count = 0;
    while (count < buffer.length) {
      const { bytesRead } = await handle.read(buffer, count, buffer.length - count, null);
      if (!bytesRead) break;
      count += bytesRead;
    }
    const after = await fs.lstat(file, { bigint: true });
    if (count > MAX_BYTES || BigInt(count) !== before.size) invalid();
    for (const key of ['ino', 'dev', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']) {
      if (before[key] !== after[key]) invalid();
    }
    return buffer.subarray(0, count);
  } finally { await handle.close(); }
}

export function parseReleaseBytes(bytes) {
  if (bytes.length > MAX_BYTES) invalid();
  const record = parseWorkstationReleaseRecord(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  classifyReleaseRecordProof(record);
  return record;
}

async function existingBytes(file) {
  try { return await readReleaseBytes(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function syncDirectory(target) {
  // Linux supports directory fsync. Windows uses native atomic rename and file
  // FlushFileBuffers through sync(); Node cannot promise directory fsync there.
  if (process.platform === 'win32') return;
  const handle = await fs.open(target, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function writeNew(file, bytes, mode) {
  const handle = await fs.open(file, 'wx', mode);
  try { await handle.writeFile(bytes); await handle.sync(); }
  catch (error) { await handle.close(); await fs.unlink(file); throw error; }
  await handle.close();
}

async function preserve(history, bytes, id) {
  const destination = path.join(history, hash(bytes) + '.json');
  const prior = await existingBytes(destination);
  if (prior) {
    if (!prior.equals(bytes)) invalid();
    if ((await fs.stat(destination)).mode & 0o222) invalid();
    return;
  }
  const temporary = path.join(history, '.' + id + '.tmp');
  await writeNew(temporary, bytes, 0o600);
  try {
    // Exclusive atomic publication; rename must not replace a colliding archive.
    await fs.link(temporary, destination);
  } finally { await fs.unlink(temporary); }
  await fs.chmod(destination, 0o400);
  if (!(await readReleaseBytes(destination)).equals(bytes)) invalid();
  await syncDirectory(history);
}

export async function writeReleaseRecord(file, candidate, dependencies = {}) {
  const target = path.resolve(file);
  const parent = await directory(path.dirname(target));
  const owner = await fs.stat(parent);
  if (process.platform !== 'win32' && (owner.uid !== process.getuid() || (owner.mode & 0o022))) invalid();
  const record = parseReleaseBytes(candidate);
  const bytes = Buffer.from(JSON.stringify(record, null, 2) + '\n');
  if (bytes.length > MAX_BYTES) invalid();
  const id = randomUUID();
  const lock = target + '.lock';
  const history = target + '.history';
  // No automatic stale-lock takeover or reuse of another writer's temporary file.
  await writeNew(lock, Buffer.from(JSON.stringify({ schema: 'MoFaCTSReleaseWriteLockV1', id, pid: process.pid })), 0o600);
  const temporary = path.join(parent, '.' + path.basename(target) + '.' + id + '.tmp');
  let allocated = false;
  try {
    const prior = await existingBytes(target);
    if (prior) parseReleaseBytes(prior);
    try { await fs.mkdir(history, { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    await directory(history);
    const stat = await fs.stat(history);
    if (process.platform !== 'win32' && (stat.uid !== process.getuid() || (stat.mode & 0o077))) invalid();
    if (prior) await preserve(history, prior, id);
    await preserve(history, bytes, id);
    await syncDirectory(parent);
    await dependencies.checkpoint?.('history-preserved');
    await writeNew(temporary, bytes, 0o600);
    allocated = true;
    await dependencies.checkpoint?.('before-replace');
    // Detect a changed latest at publication. This lock serializes cooperating
    // writers; the directory owner must exclude other writers, including the
    // old direct command-sheet write. It is not a filesystem compare-and-swap.
    const latest = await existingBytes(target);
    if (Boolean(latest) !== Boolean(prior) || (latest && !latest.equals(prior))) invalid();
    await fs.rename(temporary, target);
    allocated = false;
    await dependencies.checkpoint?.('after-replace');
    await syncDirectory(parent);
    if (!(await readReleaseBytes(target)).equals(bytes)) invalid();
    return { state: 'release-record-written', recordDigestSha256: hash(bytes),
      proof: classifyReleaseRecordProof(record) };
  } finally {
    if (allocated) await fs.unlink(temporary);
    await fs.unlink(lock);
  }
}

export function projectReleaseReceipt(bytes) {
  const record = parseReleaseBytes(bytes);
  if (!record.imageId) throw new Error('Release receipt requires the recorded running image ID');
  const { deployedAtUtc, baseCommit, includedUncommittedLocalChanges, image, tag, digest, imageId } = record;
  return parseReleaseReceipt({ schema: 'MoFaCTSReleaseReceiptV1', recordDigestSha256: hash(bytes),
    deployedAtUtc, baseCommit, includedUncommittedLocalChanges, image, tag, digest, imageId });
}

// The publication tuple is an explicit existing workstation observation. It is
// never inferred from a tag, a CI image, a report body or a bare index digest.
export function projectReleaseReceiptV2(bytes, publication) {
  const base = projectReleaseReceipt(bytes);
  const publishedImage = parsePublishedImage(publication);
  const record = parseReleaseBytes(bytes);
  const proof = record.qualification;
  const supplied = proof?.schema === 'ReleaseQualificationV2' ? proof.releaseIdentity?.publishedImage : proof?.publishedImage;
  if (supplied && JSON.stringify(parsePublishedImage(supplied)) !== JSON.stringify(publishedImage)) {
    throw new Error('Publication tuple conflicts with the authoritative release record');
  }
  return parseReleaseReceiptV2({ ...base, schema: 'MoFaCTSReleaseReceiptV2', publishedImage });
}

// Post-deployment hook: validate the complete receipt before changing authority,
// retain history through its existing owner, then bind output to exact readback.
// This performs no build/deploy/transfer and never invents qualification proof.
export async function writeReleaseRecordWithReceiptV2(file, bytes, publication, runningImage, dependencies = {}) {
  const observed = parseRunningImageObservation(runningImage), candidate = parseReleaseBytes(bytes);
  if (candidate.imageId === undefined) throw new Error('V2 receipt publication requires the recorded image identity and acceptance');
  if (candidate.baseCommit !== observed.baseCommit || candidate.imageId !== observed.configDigest
    || parsePublishedImage(publication).platform !== observed.platform) throw new Error('Running image conflicts with the release candidate');
  projectReleaseReceiptV2(bytes, publication);
  const written = await writeReleaseRecord(file, bytes, dependencies);
  const accepted = await readReleaseBytes(path.resolve(file));
  if (hash(accepted) !== written.recordDigestSha256) throw new Error('Release authority changed before receipt readback');
  return projectReleaseReceiptV2(accepted, publication);
}

export async function main(argv) {
  const [action, file, candidate, publication, runningImage, ...extra] = argv;
  if (!file || extra.length) invalid();
  if (action === 'write-v2' && candidate && publication && runningImage) return writeReleaseRecordWithReceiptV2(path.resolve(file),
    await readReleaseBytes(path.resolve(candidate)),
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readReleaseBytes(path.resolve(publication)))),
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readReleaseBytes(path.resolve(runningImage)))));
  if (publication || runningImage) invalid();
  if (action === 'project-v2' && candidate) return projectReleaseReceiptV2(await readReleaseBytes(path.resolve(file)),
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readReleaseBytes(path.resolve(candidate)))));
  if (action === 'write' && candidate) return writeReleaseRecord(file, await readReleaseBytes(path.resolve(candidate)));
  if (action === 'project' && !candidate) return projectReleaseReceipt(await readReleaseBytes(path.resolve(file)));
  invalid();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(result => process.stdout.write(JSON.stringify(result) + '\n'), () => {
    process.stderr.write('Release record operation failed; no qualification was issued.\n');
    process.exitCode = 1;
  });
}
