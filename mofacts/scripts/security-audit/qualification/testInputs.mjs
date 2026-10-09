import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inspectSnapshotTree, invalidSnapshot, sha256, SNAPSHOT_LIMITS, snapshotPath } from './sourceSnapshot.mjs';

// Reviewed supplemental readers: root ESLint/typecheck examples, excluded Meteor
// tests, source-security deployment assertions and the actual CI runner recipe.
// Build-owned deploy/docker and app/script fixtures already belong to context.
export const TEST_INPUTS = Object.freeze([
  ['eslint.config.mjs', 'file'], ['.gitleaksignore', 'file'],
  ['.github/workflows/ci.yml', 'file'],
  ['.github/workflows/production-security-audit.yml', 'file'],
  ['examples', 'directory'], ['mofacts/tests', 'directory'],
  ['deploy/docker-compose.yml', 'file'],
  ['deploy/Caddyfile.self-hosted.example', 'file'],
  ['deploy/security-audit/host-exposure-audit.sh', 'file'],
  ['deploy/security-audit/security-audit.conf.example', 'file'],
  ['deploy/security-audit/host-listener-policy.awk', 'file'],
  ['deploy/security-audit/host-firewall-policy.awk', 'file'],
  ['deploy/maintenance/apache-mofacts-maintenance.conf', 'file'],
]);

function safeSupplemental(name, limits) {
  snapshotPath(name, limits);
  if (name.split('/').some((part) => ['node_modules', '.meteor', '.git', 'coverage',
    'settings.json'].includes(part) || part.startsWith('.env'))) invalidSnapshot();
}

// Returns metadata only. Hashing and copying remain bounded and source bytes are
// never returned in diagnostic errors. Links and ambiguous paths fail explicitly.
async function inventory(root, selections, limits) {
  const entries = [];
  const names = new Set();
  let bytes = 0;
  async function visit(name, expected) {
    safeSupplemental(name, limits);
    const key = name.toLowerCase();
    if (names.has(key) || entries.length >= limits.entries) invalidSnapshot();
    names.add(key);
    const target = path.join(root, name);
    const stat = await fs.lstat(target);
    const type = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : null;
    if (stat.isSymbolicLink() || !type || (expected && expected !== type)) invalidSnapshot();
    const mode = stat.mode & 0o777;
    const entry = { name, type, mode };
    entries.push(entry);
    if (type === 'directory') {
      for (const child of (await fs.readdir(target)).sort()) await visit(`${name}/${child}`);
    } else {
      bytes += stat.size;
      if (stat.size > limits.fileBytes || bytes > limits.bytes) invalidSnapshot();
      entry.digest = await fileDigest(target, limits);
    }
  }
  // Check every ancestor too: lstat of a regular file alone follows parent links.
  for (const [name, type] of selections) {
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) {
      const stat = await fs.lstat(path.join(root, ...parts.slice(0, i)));
      if (!stat.isDirectory() || stat.isSymbolicLink()) invalidSnapshot();
    }
    await visit(name, type);
  }
  return { entries, bytes };
}

async function exists(target) {
  try { return await fs.lstat(target); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function fileDigest(target, limits = SNAPSHOT_LIMITS) {
  const before = await fs.lstat(target, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
    || before.size > BigInt(limits.fileBytes)) invalidSnapshot();
  const file = await fs.open(target, 'r');
  const hash = createHash('sha256');
  try {
    const opened = await file.stat({ bigint: true });
    if (opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== before.size) invalidSnapshot();
    const buffer = Buffer.alloc(64 * 1024);
    let read = 0;
    while (true) {
      const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, Number(before.size) - read + 1), null);
      if (!bytesRead) break;
      read += bytesRead;
      if (read > Number(before.size)) invalidSnapshot();
      hash.update(buffer.subarray(0, bytesRead));
    }
    if (read !== Number(before.size)) invalidSnapshot();
    const after = await fs.lstat(target, { bigint: true });
    for (const key of ['dev', 'ino', 'mode', 'size', 'mtimeNs', 'ctimeNs']) if (before[key] !== after[key]) invalidSnapshot();
    return hash.digest('hex');
  } finally { await file.close(); }
}

async function sameFile(a, b, mode, limits) {
  const stat = await fs.lstat(b);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== mode) invalidSnapshot();
  if (await fileDigest(a, limits) !== await fileDigest(b, limits)) invalidSnapshot();
}

async function copyEntries(source, destination, entries, limits, overlap = false) {
  for (const { name, type, mode } of entries) {
    const from = path.join(source, name);
    const to = path.join(destination, name);
    const previous = await exists(to);
    if (previous) {
      if (!overlap || previous.isSymbolicLink()) invalidSnapshot();
      if (type === 'directory') {
        if (!previous.isDirectory() || (previous.mode & 0o777) !== mode) invalidSnapshot();
      } else await sameFile(from, to, mode, limits);
      continue;
    }
    await fs.mkdir(path.dirname(to), { recursive: true });
    if (type === 'directory') {
      await fs.mkdir(to, { mode });
      await fs.chmod(to, mode);
    }
    else {
      await fs.copyFile(from, to, fs.constants.COPYFILE_EXCL);
      await fs.chmod(to, mode);
    }
  }
}

// destination must be an empty helper-owned derivative, never the build context.
// This records host-native modes. Linux export/sealing is a separate unfinished
// gate; on Windows this output cannot establish Linux mode equivalence or PASS.
export async function collectTestInputs(candidate, repository, destination, limits = SNAPSHOT_LIMITS) {
  for (const root of [candidate, repository, destination]) {
    const stat = await fs.lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) invalidSnapshot();
  }
  const roots = await Promise.all([candidate, repository, destination].map((root) => fs.realpath(root)));
  if (new Set(roots).size !== 3 || roots.some((root, index) => index < 2
    && !path.relative(root, roots[2]).startsWith(`..${path.sep}`))) invalidSnapshot();
  if ((await fs.readdir(destination)).length) invalidSnapshot();
  const buildBefore = await inspectSnapshotTree(candidate, limits);
  // Build source can contain .meteor declarations; its own capture validation
  // owns those. Do not apply supplemental secret-path policy to that source.
  const buildEntries = [];
  async function buildVisit(name) {
    snapshotPath(name, limits);
    if (buildEntries.length >= limits.entries) invalidSnapshot();
    const stat = await fs.lstat(path.join(candidate, name));
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) invalidSnapshot();
    const type = stat.isDirectory() ? 'directory' : 'file';
    buildEntries.push({ name, type, mode: stat.mode & 0o777 });
    if (type === 'directory') for (const child of (await fs.readdir(path.join(candidate, name))).sort()) await buildVisit(`${name}/${child}`);
  }
  for (const name of (await fs.readdir(candidate)).sort()) await buildVisit(name);
  const supplemental = await inventory(repository, TEST_INPUTS, limits);
  if (buildEntries.length + supplemental.entries.length > limits.entries
    || buildBefore.bytes + supplemental.bytes > limits.bytes) invalidSnapshot();
  await copyEntries(candidate, destination, buildEntries, limits);
  // Parent directories created for root supplemental files are structural only;
  // existing build files may be shared only with identical bytes and native mode.
  await copyEntries(repository, destination, supplemental.entries, limits, true);
  const supplementalAfter = await inventory(repository, TEST_INPUTS, limits);
  if (JSON.stringify(supplementalAfter) !== JSON.stringify(supplemental)) invalidSnapshot();
  for (const entry of supplemental.entries) if (entry.type === 'file'
    && await fileDigest(path.join(destination, entry.name), limits) !== entry.digest) invalidSnapshot();
  const buildAfter = await inspectSnapshotTree(candidate, limits);
  if (buildAfter.digestSha256 !== buildBefore.digestSha256) invalidSnapshot();
  for (const entry of buildEntries) if (entry.type === 'file') {
    await sameFile(path.join(candidate, entry.name), path.join(destination, entry.name), entry.mode, limits);
  }
  const merged = await inspectSnapshotTree(destination, limits);
  return { state: 'test-inputs-captured-unqualified', localTreeDigestSha256: merged.digestSha256,
    buildLocalTreeDigestSha256: buildBefore.digestSha256,
    testInputContractDigestSha256: sha256(JSON.stringify(TEST_INPUTS)),
    entryCount: merged.entries, bytes: merged.bytes };
}
