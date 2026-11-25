import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const resolver = fileURLToPath(new URL('../../../../deploy/resolve-node-runtime.ps1', import.meta.url));
const recorder = fileURLToPath(new URL('../../../../deploy/record-deployment-release.ps1', import.meta.url));
const options = { skip: process.platform !== 'win32' };
function powershell(file, args) { return spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-File', file, ...args], {
  encoding: 'utf8', timeout: 15000, windowsHide: true, maxBuffer: 32768,
}); }
async function fixture(t, version) {
  const parent = await fs.realpath(os.tmpdir()), root = await fs.mkdtemp(path.join(parent, 'mofacts-standard-runtime-'));
  t.after(async () => { assert.equal(path.dirname(root), parent); await fs.rm(root, { recursive: true, force: true }); });
  const marker = path.join(root, 'invoked.txt'), executable = path.join(root, 'synthetic-node.cmd');
  await fs.writeFile(executable, `@echo off\r\necho called>>"${marker}"\r\necho ${version}\r\nexit /b 0\r\n`);
  return { root, marker, executable };
}
test('standard recorder resolves the exact running pinned Node executable and rejects relative paths', options, () => {
  const valid = powershell(resolver, ['-NodeExecutable', process.execPath]);
  assert.equal(valid.status, 0, valid.stderr); assert.equal(valid.stdout.trim(), process.execPath);
  assert.notEqual(powershell(resolver, ['-NodeExecutable', 'relative-node.exe']).status, 0);
});
test('standard runtime preflight rejects an installed executable reporting the wrong version', options, async t => {
  const value = await fixture(t, 'v0.0.0'), result = powershell(resolver, ['-NodeExecutable', value.executable]);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /does not match/);
  assert.equal(await fs.readFile(value.marker, 'utf8').then(() => true), true);
});
test('standard recording cannot invoke the runtime or SSH before explicit participant acceptance', options, async t => {
  const value = await fixture(t, process.version), result = powershell(recorder, ['-NodeExecutable', value.executable,
    '-RecordPath', path.join(value.root, 'record.json'), '-CandidatePath', path.join(value.root, 'candidate.json'),
    '-SshHost', 'not-contacted.invalid', '-SshKey', path.join(value.root, 'key'),
    '-KnownHosts', path.join(value.root, 'hosts'), '-EvidenceDirectory', value.root]);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /participant checks must pass/);
  await assert.rejects(fs.stat(value.marker), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(value.root, 'record.json')), { code: 'ENOENT' });
});
