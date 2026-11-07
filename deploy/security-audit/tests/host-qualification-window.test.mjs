import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';

const enabled=process.platform==='linux' && process.getuid?.()===0 && spawnSync('jq',['--version']).status===0;
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const controllerSource=fs.readFileSync(new URL('../host-qualification-window.sh',import.meta.url),'utf8');
async function fixture(t, options={}) {
  const root=fs.mkdtempSync('/root/mofacts-host-window-test-'); fs.chmodSync(root,0o700);
  const job='/var/tmp/mofacts-host-qualification.'+crypto.randomBytes(6).toString('hex'); fs.mkdirSync(job,{mode:0o700});
  const bin=path.join(root,'bin'),library=path.join(root,'library'),command=path.join(root,'command'),config=path.join(root,'config');
  for(const dir of [bin,library])fs.mkdirSync(dir,{mode:0o755});
  const children=[];
  t.after(async()=>{
    for(const child of children)if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await delay(1100);}
    assert.equal(path.dirname(root),'/root'); assert.match(path.basename(root),/^mofacts-host-window-test-/);
    assert.match(job,/^\/var\/tmp\/mofacts-host-qualification\.[a-f0-9]{12}$/);
    fs.rmSync(root,{recursive:true,force:true});fs.rmSync(job,{recursive:true,force:true});
  });
  fs.writeFileSync(config,"MOFACTS_PUBLIC_HOSTNAME='"+(options.wrongTarget?'other.example.org':'staging2.optimallearning.org')+"'\n",{mode:0o600});
  const paths=[['deploy/security-audit/host-observations.sh',command,'0755'],
    ['mofacts/common/securityAudit/catalogs/host-measurements.v1.json',library+'/host-measurements.v1.json','0644'],
    ...['host-mongo-connectivity.js','host-listener-policy.awk','host-firewall-policy.awk','host-apache-policy.awk','host-sidecar-policy.jq','host-mongo-roles.js']
      .map(name=>['deploy/security-audit/'+name,library+'/'+name,'0644']),
    ['deploy/mongodb/read-default-concern-role.json',library+'/read-default-concern-role.json','0644']];
  const files=[],before=[];
  for(const [source,destination,mode]of paths){
    const value='reviewed candidate '+source+'\n',file=path.join(job,'public-source',source);
    fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,value,{mode:0o600});
    files.push({source,destination,mode,owner:'root:root',sha256:sha(value)});
    const absent=destination.endsWith('/host-measurements.v1.json')||destination.endsWith('/host-mongo-connectivity.js');
    if(absent)before.push({path:destination,present:false});
    else{
      const original=destination===command?'original V1 command\n':value;
      fs.writeFileSync(destination,original,{mode:parseInt(mode,8)});
      const metadata=fs.statSync(destination);
      before.push({path:destination,present:true,ownerModeLinks:`0:0:${(metadata.mode&0o777).toString(8)}:1`,sha256:sha(original)});
    }
  }
  const policy=path.join(root,'policy');fs.writeFileSync(policy,'unchanged restricted policy\n',{mode:0o600});
  const containers=[0,1,2].map(index=>({id:String(index+1).repeat(64),name:['/mofacts','/staging2-mongodb-1','/staging2-redis-1'][index],
    image:'sha256:'+'a'.repeat(64),startedAt:'2026-11-07T00:00:00Z',running:true,health:'healthy'}));
  fs.writeFileSync(path.join(root,'containers'),JSON.stringify(containers));
  const baseline={state:'staging2-host-preflight',configurationTargetMatched:true,configurationRootOnly:true,files:before,
    policyFingerprints:[{path:policy,sha256:sha(fs.readFileSync(policy)),ownerModeLinks:'0:0:600:1'}],containers};
  const manifest={state:'prepared-not-installed',sourceCommit:'a'.repeat(40),nativeReceiptSha256:'b'.repeat(64),files};
  if(options.badDestination)manifest.files[0].destination=path.join(root,'outside-allowlist');
  if(options.helperDrift)fs.writeFileSync(paths[3][1],'unexpected helper update\n');
  const manifestFile=path.join(job,'packet-manifest.json'),baselineFile=path.join(job,'preflight.json');
  fs.writeFileSync(manifestFile,JSON.stringify(manifest)+'\n');fs.writeFileSync(baselineFile,JSON.stringify(baseline)+'\n');
  const replacements={COMMAND_FILE:command,LIBRARY_DIR:library,CONFIG_FILE:config,LOCK_DIRECTORY:path.join(root,'run'),MAX_WINDOW_SECONDS:String(options.seconds??20)};
  let script=controllerSource;
  for(const [key,value]of Object.entries(replacements)){
    const lines=script.split('\n').filter(line=>line.startsWith(key+'='));assert.equal(lines.length,1,key);
    script=script.replace(lines[0],key+'='+value);
  }
  const controller=path.join(root,'controller.sh');fs.writeFileSync(controller,script,{mode:0o700});
  fs.writeFileSync(path.join(job,'operator-controller.sh'),script,{mode:0o600});
  fs.writeFileSync(path.join(bin,'docker'),`#!${process.execPath}
const fs=require('node:fs');
if(process.argv[2]!=='inspect')process.exit(1);
for(const row of JSON.parse(fs.readFileSync(${JSON.stringify(path.join(root,'containers'))})))console.log(JSON.stringify(row));
`,{mode:0o755});
  if(options.failMainInstall){
    fs.writeFileSync(path.join(bin,'mv'),`#!${process.execPath}
const cp=require('node:child_process');
const args=process.argv.slice(2);if(args.at(-1)===${JSON.stringify(command)})process.exit(1);
cp.execFileSync('/usr/bin/mv',args,{stdio:'inherit'});
`,{mode:0o755});
  }
  const args=action=>[controller,action,job,options.badDigest?'c'.repeat(64):sha(fs.readFileSync(manifestFile)),sha(fs.readFileSync(baselineFile)),sha(fs.readFileSync(path.join(job,'operator-controller.sh')))];
  function start(action='run'){
    const child=spawn('bash',args(action),{env:{...process.env,PATH:bin+':'+process.env.PATH},stdio:['ignore','pipe','pipe']});children.push(child);
    let stdout='',stderr='';child.stdout.on('data',data=>{stdout+=data;});child.stderr.on('data',data=>{stderr+=data;});
    const finished=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal,stdout,stderr}));});
    return{child,finished};
  }
  async function ready(process){
    for(let attempt=0;attempt<200;attempt++){
      if(fs.existsSync(path.join(job,'ready.json')))return JSON.parse(fs.readFileSync(path.join(job,'ready.json')));
      if(process.child.exitCode!==null||process.child.signalCode!==null){const r=await process.finished;assert.fail('Controller ended before ready: '+r.stderr);}
      await delay(50);
    }
    assert.fail('Controller readiness deadline');
  }
  function assertRestored(){
    for(const row of before){if(row.present)assert.equal(sha(fs.readFileSync(row.path)),row.sha256,row.path);else assert.equal(fs.existsSync(row.path),false,row.path);}
    assert.equal(sha(fs.readFileSync(policy)),baseline.policyFingerprints[0].sha256);
  }
  return{root,job,command,library,policy,containers,start,ready,assertRestored,finish:()=>fs.writeFileSync(path.join(job,'finish'),''),result:()=>JSON.parse(fs.readFileSync(path.join(job,'result.json')))};
}
const native=(name,fn)=>test(name,{skip:enabled?false:'Requires root Linux and existing jq; no live host access.',timeout:60000},fn);

native('normal window verifies the candidate then restores exactly once without altering shared helpers',async t=>{
  const f=await fixture(t),process=f.start();await f.ready(process);
  assert.match(fs.readFileSync(f.command,'utf8'),/^reviewed candidate/);f.finish();
  const result=await process.finished;assert.equal(result.code,0,result.stderr);assert.equal(f.result().restorationExit,0);f.assertRestored();
  assert.notEqual((await f.start().finished).code,0,'A finished window cannot reinstall itself');
});
native('expired window fails honestly and restores the original files',async t=>{
  const f=await fixture(t,{seconds:1}),process=f.start();await f.ready(process);
  const result=await process.finished;assert.equal(result.code,124,result.stderr);assert.equal(f.result().operationExit,124);assert.equal(f.result().restorationExit,0);f.assertRestored();
});
native('TERM interruption restores the original auditor and removes only its added files',async t=>{
  const f=await fixture(t),process=f.start();await f.ready(process);process.child.kill('SIGTERM');
  const result=await process.finished;assert.equal(result.code,143,result.stderr);assert.equal(f.result().restorationExit,0);f.assertRestored();
});
native('independent restore recovers a killed controller and does not invent an operation pass',async t=>{
  const f=await fixture(t),process=f.start();await f.ready(process);process.child.kill('SIGKILL');await process.finished;
  const restored=await f.start('restore').finished;assert.equal(restored.code,0,restored.stderr);f.assertRestored();
  const result=JSON.parse(fs.readFileSync(path.join(f.job,'recovery-result.json')));assert.equal(result.operationExit,null);assert.equal(result.restorationExit,0);
});
native('concurrent command edits are preserved and reported as restoration failure',async t=>{
  const f=await fixture(t),process=f.start();await f.ready(process);fs.writeFileSync(f.command,'concurrent operator edit\n');f.finish();
  assert.equal((await process.finished).code,1);assert.equal(f.result().restorationExit,1);assert.equal(fs.readFileSync(f.command,'utf8'),'concurrent operator edit\n');
});
native('partial installation failure removes the staged additions and keeps the original command',async t=>{
  const f=await fixture(t,{failMainInstall:true}),result=await f.start().finished;
  assert.notEqual(result.code,0);assert.equal(f.result().restorationExit,0);f.assertRestored();
});
for(const [name,options]of [['packet digest',{badDigest:true}],['target identity',{wrongTarget:true}],['closed destination list',{badDestination:true}],['shared helper drift',{helperDrift:true}]]){
  native('preflight rejects '+name+' before modifying the installed command',async t=>{
    const f=await fixture(t,options),before=fs.readFileSync(f.command),result=await f.start().finished;
    assert.notEqual(result.code,0);assert.deepEqual(fs.readFileSync(f.command),before);assert.equal(fs.existsSync(path.join(f.job,'invoked')),false);
  });
}
