import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const maximums = Object.freeze({ files: 10000, entries: 20000, directories: 1024,
  bytes: 512 * 1024 * 1024, depth: 64, chunkBytes: 64 * 1024 });
const invalid = () => { throw new Error('Client bundle inspection incomplete'); };
const unchanged = (before, after) => {
  for (const key of ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']) {
    if (before[key] !== after[key]) invalid();
  }
};

async function directoryChain(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || path.resolve(directory) !== directory) invalid();
  const chain = [], root = path.parse(directory).root;
  let current = root;
  for (const part of [root, ...directory.slice(root.length).split(path.sep).filter(Boolean)]) {
    current = part === root ? root : path.join(current, part);
    const stat = await fs.lstat(current, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) invalid();
    chain.push({ file: current, stat });
  }
  return chain;
}

export function parseClientBundleCanariesV2(canaries) {
  if (!Array.isArray(canaries) || canaries.length < 1 || canaries.length > 64
    || canaries.some(value => typeof value !== 'string' || value.length < 8
      || Buffer.byteLength(value) > 512 || Buffer.from(value).toString('utf8') !== value)
    || new Set(canaries).size !== canaries.length) invalid();
  return Object.freeze([...canaries]);
}

// Import-safe, built-ins only: this same source can be mounted into the selected
// immutable runtime image. It receives only the canary subset, never fixtures.
// Finding counts mean matching regular files, not matches or canary identities.
export async function scanClientBundleCanariesV2({ programsDirectory, canaries, limits = {} }) {
  const values = parseClientBundleCanariesV2(canaries);
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)
    || Object.keys(limits).some(key => !Object.hasOwn(maximums, key))) invalid();
  const bounds = { ...maximums, ...limits };
  for (const [key, value] of Object.entries(bounds)) {
    if (!Number.isSafeInteger(value) || value < 1 || value > maximums[key]) invalid();
  }
  const patterns = values.map(value => Buffer.from(value)), overlap = Math.max(...patterns.map(value => value.length)) - 1;
  const chain = await directoryChain(programsDirectory);
  const snapshots = [], counts = { files: 0, entries: 0, directories: 0, bytes: 0, findings: 0 };
  async function fileContents(file, before) {
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size > BigInt(bounds.bytes - counts.bytes) || ++counts.files > bounds.files) invalid();
    const handle = await fs.open(file, fs.constants.O_RDONLY
      | (process.platform === 'linux' ? fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK : 0));
    let found = false, carry = Buffer.alloc(0), fileBytes = 0;
    try {
      unchanged(before, await handle.stat({ bigint: true }));
      const chunk = Buffer.alloc(bounds.chunkBytes);
      for (;;) {
        const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
        if (!bytesRead) break;
        counts.bytes += bytesRead; fileBytes += bytesRead;
        if (counts.bytes > bounds.bytes) invalid();
        const window = Buffer.concat([carry, chunk.subarray(0, bytesRead)]);
        if (!found && patterns.some(pattern => window.includes(pattern))) found = true;
        carry = window.subarray(Math.max(0, window.length - overlap));
      }
      if (BigInt(fileBytes) !== before.size) invalid();
      unchanged(before, await handle.stat({ bigint: true }));
      unchanged(before, await fs.lstat(file, { bigint: true }));
      snapshots.push({ file, stat: before });
    } finally { await handle.close(); }
    if (found) counts.findings++;
  }
  async function visit(directory, depth) {
    if (depth > bounds.depth || ++counts.directories > bounds.directories) invalid();
    const before = await fs.lstat(directory, { bigint: true });
    if (!before.isDirectory() || before.isSymbolicLink()) invalid();
    snapshots.push({ file: directory, stat: before });
    const stream = await fs.opendir(directory);
    let files = 0;
    for await (const entry of stream) {
      if (++counts.entries > bounds.entries) invalid();
      const file = path.join(directory, entry.name), stat = await fs.lstat(file, { bigint: true });
      if (stat.isSymbolicLink()) invalid();
      if (stat.isDirectory()) files += await visit(file, depth + 1);
      else { await fileContents(file, stat); files++; }
    }
    unchanged(before, await fs.lstat(directory, { bigint: true }));
    return files;
  }
  // Preserve both client targets of the existing V1 policy. Missing or empty
  // target directories cannot turn a partial scan into a clean image result.
  for (const name of ['web.browser', 'web.browser.legacy']) {
    if (await visit(path.join(programsDirectory, name), 1) < 1) invalid();
  }
  // Immutable-image/read-only execution is the owning isolation boundary.
  // Detect unexpected changes as well; never return paths or matched bytes.
  for (const { file, stat } of [...snapshots, chain.at(-1)]) unchanged(stat, await fs.lstat(file, { bigint: true }));
  for (const { file, stat } of chain.slice(0, -1)) {
    const after = await fs.lstat(file, { bigint: true });
    for (const key of ['dev', 'ino', 'mode']) if (stat[key] !== after[key]) invalid();
  }
  return { evaluatedCount: counts.files, findingCount: counts.findings };
}

// Deliberately unscheduled. The eventual coordinator must establish exact image
// identity/isolation before invoking this entry point inside that image.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2) invalid();
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length; if (size > 64 * 1024) invalid(); chunks.push(chunk);
    }
    // Only an array is accepted, so duplicate object keys cannot carry settings.
    const canaries = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    const value = await scanClientBundleCanariesV2({ programsDirectory: '/opt/bundle/bundle/programs', canaries });
    process.stdout.write(JSON.stringify({ state: 'observed', value }) + '\n');
  } catch {
    process.stdout.write(JSON.stringify({ state: 'unavailable', reason: 'evidence-incomplete' }) + '\n');
    process.exitCode = 1;
  }
}
