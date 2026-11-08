import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const source = await fs.readFile(new URL('../receiver-release-window.sh', import.meta.url), 'utf8');
const rootLinux = process.platform === 'linux' && process.getuid?.() === 0;
const sources = ['deploy/security-audit/release-receipt.sh', 'deploy/security-audit/receiver-release.compose.yml',
  'mofacts/common/securityAudit/releaseReceipt.mjs', 'mofacts/common/securityAudit/buildIdentity.ts',
  'mofacts/common/securityAudit/proofFields.ts', 'mofacts/common/securityAudit/reportIdentity.ts',
  'mofacts/server/securityAudit/securityAuditReceiverRelease.ts', 'mofacts/server/securityAudit/securityAuditReceiverIdentity.ts'];

// These are operator-orchestration tests. Docker/reader leaves are explicit
// synthetic doubles; real installer and kernel read-only proofs have their own
// fixtures. No host configuration, actual Docker engine or SSH is accessed here.
async function fixture(t, mode = 'success') {
  const root = await fs.mkdtemp('/var/tmp/mofacts-receiver-fixture.');
  const job = await fs.mkdtemp('/var/tmp/mofacts-receiver-release.' + randomBytes(3).toString('hex'));
  for (const owned of [root, job]) await fs.chmod(owned, 0o700);
  t.after(async () => { for (const owned of [root, job]) { assert.equal(path.dirname(owned), '/var/tmp'); assert.match(path.basename(owned), /^mofacts-receiver-(fixture|release)\./); await fs.rm(owned, { recursive: true, force: true }); } });
  for (const name of ['config', 'lib', 'deploy', 'run', 'bin']) await fs.mkdir(root + '/' + name, { mode: 0o700 });
  const put = async (file, bytes, mode = 0o600) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, bytes, { mode }); };
  const config = root + '/config/security-audit.conf', receipt = root + '/config/release-receipt.json';
  const tool = root + '/lib/release-receipt.sh', parser = root + '/lib/releaseReceipt.mjs';
  await put(config, 'MOFACTS_PUBLIC_HOSTNAME=staging2.optimallearning.org\n'); await put(root + '/config/.env.self-hosted', 'SYNTHETIC=true\n');
  await put(root + '/deploy/docker-compose.yml', 'synthetic-base', 0o644); await put(root + '/deploy/docker-compose.staging2-runtime.yml', 'synthetic-runtime', 0o644);
  await put(receipt, 'exact previous synthetic receipt\n'); await put(tool, '#!/bin/sh\nexit 0\n', 0o755); await put(parser, '// exact previous synthetic parser\n', 0o644);
  await put(root + '/lib/imageArchiveIdentity.mjs', '// synthetic existing dependency', 0o644);
  const image = 'sha256:' + 'f'.repeat(64), app = '1'.repeat(64), serviceHash = 'a'.repeat(64), sourceCommit = 'a'.repeat(40);
  const platformImage = 'registry.example.test/mofacts@sha256:' + 'd'.repeat(64);
  await put(root + '/docker-state.json', JSON.stringify({ overlay: false, serial: 1 }));
  const toolDouble = `#!/usr/bin/env bash
set -euo pipefail
case "$1" in
install-v2) test ! -e '${receipt}'; cat > '${root}/config/release/next.json'; chmod 600 '${root}/config/release/next.json'; mv -T '${root}/config/release/next.json' '${root}/config/release/release-receipt.json'; printf '{"state":"receipt-installed-unqualified"}\\n' ;;
read-v2) jq -cn --slurpfile receipt '${root}/config/release/release-receipt.json' '{state:"observed",result:"MATCH",receipt:$receipt[0]}' ;;
*) exit 1 ;;
esac
`;
  for (const item of sources) await put(job + '/public-source/' + item, item.endsWith('/release-receipt.sh') ? toolDouble : '// synthetic reviewed source\n', 0o644);
  const native = JSON.stringify({ schema: 'NativeMeteorVerificationV1', sourceObservation: { identity: { baseCommit: sourceCommit, includedUncommittedLocalChanges: false } },
    limits: { workerMemoryMiB: 6144 }, environments: ['server', 'client'].map(side => ({ side, counts: { failed: 0 }, hookFailures: 0 })) }) + '\n';
  const transfer = JSON.stringify({ schema: 'MoFaCTSReleaseReceiptV2', synthetic: true }) + '\n';
  await put(job + '/native-verification.json', native); await put(job + '/release-receipt-transfer.json', transfer);
  const files = [];
  for (const p of [config, root + '/config/.env.self-hosted', root + '/deploy/docker-compose.yml', root + '/deploy/docker-compose.staging2-runtime.yml', receipt, tool, parser, root + '/lib/imageArchiveIdentity.mjs']) {
    const stat = await fs.stat(p); files.push({ path: p, sha256: sha(await fs.readFile(p)), ownerModeLinks: `${stat.uid}:${stat.gid}:${(stat.mode & 0o777).toString(8)}:${stat.nlink}` });
  }
  const baseline = { state: 'staging2-receiver-window-baseline', v2OriginallyAbsent: true, app: { id: app, imageId: image, serviceHash }, files };
  const rows = []; for (const item of sources) rows.push({ source: item, sha256: sha(await fs.readFile(job + '/public-source/' + item)) });
  const packet = { state: 'prepared-not-installed', sourceCommit, nativeReceiptSha256: sha(native), receiptTransferSha256: sha(transfer), files: rows };
  await put(job + '/packet.json', JSON.stringify(packet)); await put(job + '/baseline.json', JSON.stringify(baseline));
  const controller = source.replace('CONFIG_DIRECTORY=/etc/mofacts', 'CONFIG_DIRECTORY=' + root + '/config')
    .replace('LIBRARY_DIRECTORY=/usr/local/libexec/mofacts-security-audit', 'LIBRARY_DIRECTORY=' + root + '/lib')
    .replace('PROJECT_DIRECTORY=/opt/mofacts/deploy', 'PROJECT_DIRECTORY=' + root + '/deploy')
    .replace('LOCK_DIRECTORY=/run/mofacts-security-audit', 'LOCK_DIRECTORY=' + root + '/run');
  await put(job + '/operator-controller.sh', controller);
  const docker = `#!${process.execPath}
const fs=require('node:fs'); const root=${JSON.stringify(root)},job=${JSON.stringify(job)},mode=${JSON.stringify(mode)},image=${JSON.stringify(image)},serviceHash=${JSON.stringify(serviceHash)},platformImage=${JSON.stringify(platformImage)};
const args=process.argv.slice(2),state=JSON.parse(fs.readFileSync(root+'/docker-state.json'));const app=String(state.serial).repeat(64),other='9'.repeat(64);
const output=s=>process.stdout.write(String(s)+'\\n');
if(args[0]==='container'){process.exit(0);}
else if(args[0]==='ps'){output(args.some(s=>s.includes('service=mofacts'))?app:app+'\\n'+other);}
else if(args[0]==='compose'){
 if(args.includes('config'))output('mofacts '+serviceHash);
 else {const overlay=args.some(s=>s.endsWith('/receiver-release.compose.yml')); if(state.overlay!==overlay){state.overlay=overlay;state.serial++;}fs.writeFileSync(root+'/docker-state.json',JSON.stringify(state));
 if(overlay&&mode==='activation-failure')process.exit(3);if(overlay&&mode==='foreign-parser')fs.writeFileSync(root+'/lib/releaseReceipt.mjs','foreign fixture change');}
}else if(args[0]==='inspect'){
 const format=args.at(-1),id=args[1];
 if(format==='{{.Id}}')output(id);else if(format==='{{.Image}}')output(image);
 else if(format.includes('.State.Health.Status'))output('true healthy');
 else if(format.includes('config-hash'))output(state.overlay?'b'.repeat(64):serviceHash);
 else if(format.includes('.Mounts'))output(state.overlay?(format.includes('.Type')?'bind '+root+'/config/release false':'/run/mofacts/release'):'');
 else output(id+' '+image+' 2026-11-01T00:00:00Z true');
}else if(args[0]==='exec'){output(JSON.stringify({state:'app-receipt-read-only',inode:fs.statSync(root+'/config/release/release-receipt.json').ino,platformImage}));}
else if(args[0]==='run'){output(JSON.stringify({state:'receiver-adapter-verified',platformImage}));}else process.exit(9);
`;
  await put(root + '/bin/docker', docker, 0o755);
  const run = action => spawnSync('bash', [job + '/operator-controller.sh', action, job, sha(JSON.stringify(packet)), sha(JSON.stringify(baseline)), sha(controller)],
    { env: { ...process.env, PATH: root + '/bin:' + process.env.PATH }, encoding: 'utf8', timeout: 25000, maxBuffer: 32768 });
  return { root, job, run, receipt, tool, parser, prior: { receipt: await fs.readFile(receipt), tool: await fs.readFile(tool), parser: await fs.readFile(parser) } };
}

test('receiver operator window verifies its leaves, restores original files/configuration and supports repeated explicit restoration', { skip: !rootLinux }, async t => {
  const f = await fixture(t); const result = f.run('run'); assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.deepEqual(JSON.parse(await fs.readFile(f.job + '/result.json')), { state: 'receiver-window-finished', operationExit: 0, restorationExit: 0 });
  for (const name of ['receipt', 'tool', 'parser']) assert.deepEqual(await fs.readFile(f[name]), f.prior[name]);
  await assert.rejects(fs.stat(f.root + '/config/release'), { code: 'ENOENT' });
  assert.equal(f.run('restore').status, 0);
});
test('receiver operator window restores exact originals after activation failure', { skip: !rootLinux }, async t => {
  const f = await fixture(t, 'activation-failure'); const result = f.run('run'); assert.notEqual(result.status, 0);
  const state = JSON.parse(await fs.readFile(f.job + '/result.json')); assert.notEqual(state.operationExit, 0); assert.equal(state.restorationExit, 0);
  for (const name of ['receipt', 'tool', 'parser']) assert.deepEqual(await fs.readFile(f[name]), f.prior[name]);
});
test('receiver operator window refuses to overwrite a foreign parser edit and records failed restoration', { skip: !rootLinux }, async t => {
  const f = await fixture(t, 'foreign-parser'); assert.notEqual(f.run('run').status, 0);
  assert.equal(JSON.parse(await fs.readFile(f.job + '/result.json')).restorationExit, 1);
  assert.equal(await fs.readFile(f.parser, 'utf8'), 'foreign fixture change');
});
test('receiver operator preflight rejects drift before invocation or file replacement', { skip: !rootLinux }, async t => {
  const f = await fixture(t); await fs.appendFile(f.root + '/config/.env.self-hosted', 'DRIFT=true\n');
  assert.notEqual(f.run('run').status, 0); await assert.rejects(fs.stat(f.job + '/invoked'), { code: 'ENOENT' });
  for (const name of ['receipt', 'tool', 'parser']) assert.deepEqual(await fs.readFile(f[name]), f.prior[name]);
});
