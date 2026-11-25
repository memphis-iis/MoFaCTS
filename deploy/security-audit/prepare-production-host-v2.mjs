import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const library = '/usr/local/libexec/mofacts-security-audit/';
const cohort = [
  ['deploy/security-audit/host-audit-v2.sh', '/usr/local/sbin/mofacts-host-exposure-audit', '0755'],
  ...['host-observations.sh', 'release-receipt.sh'].map(name => [`deploy/security-audit/${name}`, library + name, '0755']),
  ...['host-listener-policy.awk', 'host-firewall-policy.awk', 'host-apache-policy.awk', 'host-sidecar-policy.jq',
    'host-mongo-roles.js', 'host-mongo-connectivity.js'].map(name => [`deploy/security-audit/${name}`, library + name, '0644']),
  ['deploy/mongodb/read-default-concern-role.json', library + 'read-default-concern-role.json', '0644'],
  ['mofacts/common/securityAudit/catalogs/host-measurements.v1.json', library + 'host-measurements.v1.json', '0644'],
  ['mofacts/common/securityAudit/releaseReceipt.mjs', library + 'releaseReceipt.mjs', '0644'],
  ['mofacts/scripts/security-audit/qualification/imageArchiveIdentity.mjs', library + 'imageArchiveIdentity.mjs', '0644'],
];
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const invalid = () => { throw new Error('Production host packet input or integrity check failed'); };
function sourceAt(revision, source) {
  return execFileSync('git', ['-C', repository, 'show', `${revision}:${source}`],
    { maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}
function validateManifest(value) {
  if (!value || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['files', 'schema', 'sourceCommit', 'state', 'target'])
      || value.schema !== 'MoFaCTSProductionHostPacketV1' || value.state !== 'prepared-not-installed'
      || value.target !== 'https://mofacts.optimallearning.org' || !/^[a-f0-9]{40}$/.test(value.sourceCommit)
      || !Array.isArray(value.files) || value.files.length !== cohort.length) invalid();
  for (const [index, [source, destination, mode]] of cohort.entries()) {
    const row = value.files[index];
    if (!row || JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(['destination', 'mode', 'owner', 'sha256', 'source'])
        || row.source !== source || row.destination !== destination || row.mode !== mode || row.owner !== 'root:root'
        || !/^[a-f0-9]{64}$/.test(row.sha256)) invalid();
  }
}
async function safeDirectory(directory) {
  if (!path.isAbsolute(directory)) invalid();
  let cursor = directory;
  while (true) {
    const stat = await fs.lstat(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) invalid();
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}
async function readFile(file, limit) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > limit) invalid();
  return fs.readFile(file);
}

// Public Git blobs only. No SSH, installation, protected configuration, receipt
// generation, credential export, runtime call or implicit production acceptance.
export async function prepareProductionHostPacket({ revision, directory }) {
  if (!/^[a-f0-9]{40}$/.test(revision) || !path.isAbsolute(directory)) invalid();
  await safeDirectory(path.dirname(directory));
  const inside = path.relative(repository, directory);
  if (!inside || (!inside.startsWith('..' + path.sep) && inside !== '..' && !path.isAbsolute(inside))) invalid();
  const files = cohort.map(([source, destination, mode]) => {
    const bytes = sourceAt(revision, source);
    if (!bytes.length || bytes.length > 65536 || bytes.includes(0) || bytes.includes(13)) invalid();
    return { source, destination, mode, owner: 'root:root', sha256: sha256(bytes), bytes };
  });
  await fs.mkdir(directory, { mode: 0o700 });
  for (const row of files) {
    const file = path.join(directory, 'public-source', row.source);
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await fs.writeFile(file, row.bytes, { flag: 'wx', mode: 0o600 });
  }
  const manifest = { schema: 'MoFaCTSProductionHostPacketV1', state: 'prepared-not-installed',
    target: 'https://mofacts.optimallearning.org', sourceCommit: revision,
    files: files.map(({ source, destination, mode, owner, sha256 }) => ({ source, destination, mode, owner, sha256 })) };
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(path.join(directory, 'manifest.json'), bytes, { flag: 'wx', mode: 0o600 });
  const digest = sha256(bytes);
  await verifyProductionHostPacket({ directory, manifestSha256: digest });
  return { manifestSha256: digest, sourceCommit: revision, fileCount: files.length, state: manifest.state };
}

export async function verifyProductionHostPacket({ directory, manifestSha256 }) {
  if (!/^[a-f0-9]{64}$/.test(manifestSha256)) invalid();
  await safeDirectory(directory);
  const bytes = await readFile(path.join(directory, 'manifest.json'), 16384);
  if (sha256(bytes) !== manifestSha256) invalid();
  const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  validateManifest(manifest);
  const expected = new Set(['manifest.json', ...cohort.map(([source]) => 'public-source/' + source)]);
  async function inspect(folder, prefix = '') {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        if (![...expected].some(name => name.startsWith(relative + '/'))) invalid();
        await inspect(file, relative + '/');
      } else {
        if (!expected.delete(relative)) invalid();
        await readFile(file, 65536);
      }
    }
  }
  await inspect(directory);
  if (expected.size) invalid();
  for (const row of manifest.files) {
    const actual = await readFile(path.join(directory, 'public-source', row.source), 65536);
    if (sha256(actual) !== row.sha256 || !actual.equals(sourceAt(manifest.sourceCommit, row.source))) invalid();
  }
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, first, second] = process.argv.slice(2);
    if (process.argv.length !== 5) invalid();
    if (action === 'prepare') console.log(JSON.stringify(await prepareProductionHostPacket({ revision: first, directory: second })));
    else if (action === 'verify') {
      const result = await verifyProductionHostPacket({ directory: first, manifestSha256: second });
      console.log(JSON.stringify({ state: result.state, sourceCommit: result.sourceCommit, fileCount: result.files.length }));
    } else invalid();
  } catch {
    console.error('Production host packet preparation/verification failed; nothing was installed.');
    process.exitCode = 1;
  }
}
