import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const enabled = process.platform === 'linux' && process.getuid?.() === 0 && spawnSync('jq', ['--version']).status === 0;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(t, { earlyExit = false, failImage = false } = {}) {
  const root = fs.mkdtempSync('/root/mofacts-rollback-controller-'); fs.chmodSync(root, 0o700);
  const suffix = crypto.randomBytes(6).toString('hex'), namespace = 'mofacts_audit_rollback_' + suffix;
  const job = '/var/tmp/mofacts-audit-rollback.' + suffix; fs.mkdirSync(job, { mode: 0o700 });
  t.after(() => {
    assert.equal(path.dirname(root), '/root'); assert.match(path.basename(root), /^mofacts-rollback-controller-/);
    assert.match(job, /^\/var\/tmp\/mofacts-audit-rollback\.[a-f0-9]{12}$/);
    fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(job, { recursive: true, force: true });
  });
  const reference = 'ppavlikmemphis/mofacts-mini@sha256:f8784b4afe9a4875fd62c5ccb153bab26796381548d47ded54d9a65d5148cc05';
  const configDigest = 'sha256:214793c9cf7534eb4568934fc83843328b202a23b99d108fc323ead2ceafb697';
  const candidate = 'ppavlikmemphis/mofacts-staging2@sha256:' + 'c'.repeat(64);
  const parameters = { namespace, previousImage: reference, previousConfig: configDigest,
    candidateImage: candidate, candidateConfig: 'sha256:' + 'd'.repeat(64), candidateRevision: 'e'.repeat(40) };
  const contents = Object.fromEntries(['compose.yml', 'environment', 'synthetic.json', 'settings.json', 'redis.password', 'seed.mongo.js', 'baseline.mjs', 'imageArchiveIdentity.mjs'].map(name => [name, name === 'seed.mongo.js' ? 'synthetic-seed' : 'synthetic-input']));
  contents['parameters.json'] = JSON.stringify(parameters);
  for (const [name, value] of Object.entries(contents)) fs.writeFileSync(path.join(job, name), value, { mode: 0o600 });
  const manifest = JSON.stringify({ files: Object.fromEntries(Object.entries(contents).map(([name, value]) => [name, sha(value)])) });
  fs.writeFileSync(path.join(job, 'manifest.json'), manifest, { mode: 0o600 });
  const config = path.join(root, 'config'); fs.writeFileSync(config, 'MOFACTS_PUBLIC_HOSTNAME=staging2.optimallearning.org\n', { mode: 0o600 });
  const bin = path.join(root, 'bin'); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'df'), '#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nsynthetic 20000000 1 19999999 1%% /synthetic\\n"\n', { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'awk'), `#!${process.execPath}\nif(process.argv.includes('/proc/meminfo'))console.log(4194304);else process.exit(require('node:child_process').spawnSync('/usr/bin/awk',process.argv.slice(2),{stdio:'inherit'}).status);\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'docker'), `#!${process.execPath}
const fs=require('node:fs'),assert=require('node:assert/strict');const args=process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(path.join(root, 'calls'))},JSON.stringify(args)+'\\n');
const candidate=${JSON.stringify(candidate)},previous=${JSON.stringify(reference)};
const current=args.find(value=>[candidate,previous].includes(value))??process.env.ROLLBACK_APPLICATION_IMAGE;
const candidateSelected=current===candidate;
const native='sha256:'+(candidateSelected?'1':'2').repeat(64);
if(args[0]==='inspect'){
 if(args[1]==='8'.repeat(64))console.log(native);
 else for(let i=0;i<3;i++)console.log(JSON.stringify({id:String(i+1).repeat(64),image:'sha256:'+'a'.repeat(64),startedAt:'2026-11-07T00:00:00Z',running:true,health:'healthy'}));
}
else if(args[0]==='pull'){if(${failImage})process.exit(1);}
else if(args[0]==='image'&&args[1]==='inspect'){
  if(args.at(-1)==='{{.Id}}')console.log(native);
  else console.log(args.at(-1).includes('nativeId')?JSON.stringify({nativeId:native,platform:'linux/amd64',descriptor:null}):JSON.stringify({id:native,os:'linux',architecture:'amd64',revision:candidateSelected?'e'.repeat(40):'18677291993b66b890a090e55d65f703b45ff653',digests:[current]}));
}else if(args[0]==='image'&&args[1]==='save')process.stdout.write('synthetic-save-input');
else if(args[0]==='run'){assert.equal(fs.readFileSync(0,'utf8'),'synthetic-save-input');console.log(JSON.stringify({platform:'linux/amd64',configDigest:candidateSelected?'sha256:'+'d'.repeat(64):${JSON.stringify(configDigest)}}));}
else if(args[0]==='container'&&args[1]==='inspect')process.exit(1);
else if(args[0]==='compose'&&args.includes('ps')&&!args.includes('--status'))console.log('8'.repeat(64));
else if(args[0]==='compose'&&args.includes('exec')){
 const input=fs.readFileSync(0,'utf8');assert.equal(input,args.includes('--file')?'synthetic-seed':'');
 if(args.includes('df'))console.log('Filesystem 1024-blocks Used Available Capacity Mounted\\nsynthetic 20000000 1 19999999 1% /data/db');
 if(args.includes('/qualification/baseline.mjs')){
  const phase=args.at(-1);assert(['candidate','previous','candidate-restored'].includes(phase));
  console.log(JSON.stringify({state:'rollback-generation-verified',phase,schema:phase==='previous'?'SecurityAuditReportV1':'SecurityAuditReportV2',
   digestSha256:'a'.repeat(64),jsonSha256:'b'.repeat(64),htmlSha256:'c'.repeat(64),v1Preserved:true,v2Preserved:true,otherGenerationExcluded:true}));
 }
}
`, { mode: 0o755 });
  let source = fs.readFileSync(new URL('../rollback-runtime-window.sh', import.meta.url), 'utf8').replaceAll('/etc/mofacts/security-audit.conf', config);
  if (earlyExit) source = source.replace('stage=accepted-roundtrip', 'exit 0');
  return { root, job, source, args: [job, sha(manifest)], env: { ...process.env, PATH: bin + ':' + process.env.PATH } };
}
function run(value) {
  const result = spawnSync('bash', ['-s', '--', ...value.args], { input: value.source, env: value.env, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.error, undefined); assert.equal(result.stderr, '');
  assert.equal(fs.existsSync(value.job + '/mongo-data'), false);
  return { exit: result.status, receipt: JSON.parse(fs.readFileSync(value.job + '/result.json', 'utf8')) };
}
test('rollback controller keeps non-seed child stdin empty and completes only the actual acceptance stage', { skip: !enabled }, t => {
  const result = run(fixture(t)); assert.equal(result.exit, 0);
  assert.equal(result.receipt.stage, 'accepted-roundtrip'); assert.equal(result.receipt.operationExit, 0);
  assert.equal(result.receipt.cleanupExit, 0); assert.equal(result.receipt.originalContainersUnchanged, true);
});
test('rollback controller treats zero exit before acceptance as incomplete and still verifies cleanup', { skip: !enabled }, t => {
  const result = run(fixture(t, { earlyExit: true })); assert.equal(result.exit, 1);
  assert.equal(result.receipt.operationExit, 1); assert.equal(result.receipt.cleanupExit, 0);
  assert.equal(result.receipt.stage, 'candidate-restored-readback');
});
test('rollback image-acquisition failure starts no disposable data/app service and cleans up', { skip: !enabled }, t => {
  const value = fixture(t, { failImage: true }), result = run(value);
  assert.equal(result.exit, 1); assert.equal(result.receipt.stage, 'image-acquisition');
  assert.equal(result.receipt.cleanupExit, 0); assert.equal(result.receipt.originalContainersUnchanged, true);
  const calls = fs.readFileSync(value.root + '/calls', 'utf8').trim().split('\n').map(row => JSON.parse(row));
  assert(!calls.some(args => args[0] === 'compose' && args.includes('up')));
});
