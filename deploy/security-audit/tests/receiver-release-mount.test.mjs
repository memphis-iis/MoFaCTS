import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import fixture from '../../../mofacts/common/securityAudit/fixtures/release-record.fixture.json' with { type: 'json' };
import { projectReleaseReceiptV2 } from '../../../mofacts/scripts/security-audit/qualification/releaseRecordStore.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const require = createRequire(new URL('../../../mofacts/package.json', import.meta.url));
test('optional Compose overlay mounts only the existing metadata directory read-only and refuses path creation', async () => {
  const overlay = require('js-yaml').load(await fs.readFile(new URL('../receiver-release.compose.yml', import.meta.url), 'utf8'));
  assert.deepEqual(overlay, { services: { mofacts: { volumes: [{ type: 'bind', source: '/etc/mofacts/release',
    target: '/run/mofacts/release', read_only: true, bind: { create_host_path: false } }] } } });
});

test('actual Linux container rejects receipt writes and observes atomic replacement and rollback through one directory mount', {
  skip: process.platform !== 'linux' || process.getuid?.() !== 0 || !process.env.MOFACTS_RECEIPT_TEST_IMAGE,
  timeout: 45000,
}, async t => {
  const image = process.env.MOFACTS_RECEIPT_TEST_IMAGE;
  assert.match(image, /^sha256:[a-f0-9]{64}$/);
  const available = spawnSync('docker', ['image', 'inspect', image, '--format', '{{.Id}}'], { encoding: 'utf8' });
  assert.equal(available.status, 0); assert.equal(available.stdout.trim(), image);
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'mofacts-release-mount-'));
  await fs.chmod(root, 0o700);
  const directory = path.join(root, 'release'); await fs.mkdir(directory, { mode: 0o700 });
  const file = path.join(directory, 'release-receipt.json');
  const record = { ...structuredClone(fixture), imageId: fixture.qualification.runningImage.configDigest,
    acceptance: 'operator-confirmed readiness and participant smoke checks' };
  delete record.qualification;
  const encode = value => JSON.stringify(projectReleaseReceiptV2(Buffer.from(JSON.stringify(value)), fixture.qualification.publishedImage));
  const original = encode(record); await fs.writeFile(file, original, { mode: 0o600 });
  const name = 'mofacts-receipt-mount-' + randomBytes(6).toString('hex');
  const program = `
import fs from 'node:fs/promises';
import readline from 'node:readline';
import assert from 'node:assert/strict';
import {createAuditReceiverPlatformIdentity,readReceiverReleaseBytes} from '/source/mofacts/server/securityAudit/securityAuditReceiverRelease.ts';
assert.equal(process.getuid(),0);
const build=${JSON.stringify({ state: 'observed', identity: fixture.qualification.buildIdentity })};
const load=createAuditReceiverPlatformIdentity(async()=>build,()=>readReceiverReleaseBytes('/protected'),'linux/amd64');
assert.equal((await load()).state,'observed');
for(const operation of [()=>fs.open('/protected/release-receipt.json','a'),()=>fs.chmod('/protected/release-receipt.json',0o600),()=>fs.mkdir('/protected/unwanted')]) {
  await assert.rejects(operation(),error=>error.code==='EROFS');
}
console.log('first-read-protected');
let phase=0;
for await(const _line of readline.createInterface({input:process.stdin})) {
  phase++;
  assert.equal((await load()).state,phase===1?'conflicting':'observed');
  console.log(phase===1?'replacement-observed':'rollback-observed');
  if(phase===2)break;
}
assert.equal(phase,2);
`;
  const child = spawn('docker', ['run', '--rm', '-i', '--pull', 'never', '--name', name,
    '--network', 'none', '--memory', '256m', '--memory-swap', '256m', '--cpus', '0.5',
    '--user', '0:0', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--read-only',
    '--mount', `type=bind,src=${repository},dst=/source,readonly`,
    '--mount', `type=bind,src=${directory},dst=/protected,readonly`,
    image, 'node', '--input-type=module', '-e', program], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', error = '';
  child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { error += b; });
  const completed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => resolve(code)); });
  const waitFor = marker => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.stdout.off('data', check); reject(new Error('Bounded receipt synchronization failed')); }, 15000);
    function check() { if (output.includes(marker)) { clearTimeout(timeout); child.stdout.off('data', check); resolve(); } }
    child.stdout.on('data', check); check();
  });
  t.after(async () => {
    spawnSync('docker', ['rm', '-f', name], { encoding: 'utf8' });
    child.stdin.destroy(); await completed;
    assert.equal(path.dirname(root), await fs.realpath(os.tmpdir()));
    await fs.rm(root, { recursive: true, force: true });
  });
  await waitFor('first-read-protected');
  const temporary = path.join(directory, 'next.json');
  await fs.writeFile(temporary, encode({ ...record, baseCommit: 'f'.repeat(40) }), { mode: 0o600 });
  await fs.rename(temporary, file); child.stdin.write('\n');
  await waitFor('replacement-observed');
  await fs.writeFile(temporary, original, { mode: 0o600 }); await fs.rename(temporary, file); child.stdin.end('\n');
  assert.equal(await completed, 0, 'Isolated mount fixture failed: ' + error);
  assert.match(output, /rollback-observed/); assert.equal(await fs.readFile(file, 'utf8'), original);
  assert.deepEqual((await fs.readdir(directory)), ['release-receipt.json']);
});
