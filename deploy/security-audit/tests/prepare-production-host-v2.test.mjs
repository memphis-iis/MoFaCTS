import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { prepareProductionHostPacket, verifyProductionHostPacket } from '../prepare-production-host-v2.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const revision = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
async function fixture(t) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-production-packet-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const directory = path.join(parent, 'packet');
  const result = await prepareProductionHostPacket({ revision, directory });
  return { parent, directory, ...result };
}

test('packet exports the complete public V2 host cohort from exact Git bytes without installing anything', async t => {
  const result = await fixture(t);
  assert.equal(result.fileCount, 13);
  assert.equal(result.state, 'prepared-not-installed');
  const manifest = await verifyProductionHostPacket(result);
  assert.equal(manifest.target, 'https://mofacts.optimallearning.org');
  assert.equal(manifest.files[0].destination, '/usr/local/sbin/mofacts-host-exposure-audit');
  assert(manifest.files.some(row => row.source.endsWith('/imageArchiveIdentity.mjs')));
  assert(manifest.files.some(row => row.source.endsWith('/read-default-concern-role.json')));
  assert(manifest.files.every(row => !row.destination.startsWith('/etc/') && row.owner === 'root:root'));
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(result.directory)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(path.join(result.directory, 'manifest.json'))).mode & 0o777, 0o600);
  }
  await assert.rejects(prepareProductionHostPacket({ revision, directory: result.directory }));
});

test('moving revisions and paths inside the repository are rejected before creating a packet', async () => {
  await assert.rejects(prepareProductionHostPacket({ revision: 'main', directory: path.join(os.tmpdir(), 'unused') }));
  await assert.rejects(prepareProductionHostPacket({ revision, directory: path.join(root, 'unused-production-packet') }));
  await assert.rejects(prepareProductionHostPacket({ revision, directory: 'relative' }));
});

test('changed source cannot be laundered by updating manifest and manifest digest', async t => {
  const result = await fixture(t);
  const manifestPath = path.join(result.directory, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const file = path.join(result.directory, 'public-source', manifest.files[0].source);
  await fs.appendFile(file, '\n# unreviewed change\n');
  await assert.rejects(verifyProductionHostPacket(result));
  manifest.files[0].sha256 = sha256(await fs.readFile(file));
  const bytes = JSON.stringify(manifest);
  await fs.writeFile(manifestPath, bytes);
  await assert.rejects(verifyProductionHostPacket({ directory: result.directory, manifestSha256: sha256(bytes) }));
});

test('unlisted files and redirected installation destinations are rejected', async t => {
  const result = await fixture(t);
  const extra = path.join(result.directory, 'extra');
  await fs.writeFile(extra, 'unexpected');
  await assert.rejects(verifyProductionHostPacket(result));
  await fs.unlink(extra);
  const manifestPath = path.join(result.directory, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.files[0].destination = '/etc/sudoers';
  const bytes = JSON.stringify(manifest);
  await fs.writeFile(manifestPath, bytes);
  await assert.rejects(verifyProductionHostPacket({ directory: result.directory, manifestSha256: sha256(bytes) }));
});

test('symlink and hardlink payload substitution is rejected', { skip: process.platform === 'win32' }, async t => {
  const result = await fixture(t);
  const file = path.join(result.directory, 'public-source', 'deploy/security-audit/host-audit-v2.sh');
  const other = path.join(result.parent, 'other');
  await fs.rename(file, other);
  await fs.symlink(other, file);
  await assert.rejects(verifyProductionHostPacket(result));
  await fs.unlink(file);
  await fs.link(other, file);
  await assert.rejects(verifyProductionHostPacket(result));
});
