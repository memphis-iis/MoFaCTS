import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { validateRollbackFixture } from '../rollback-runtime-baseline.mjs';

const script=fileURLToPath(new URL('../prepare-rollback-fixtures.mjs',import.meta.url));
function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mofacts-rollback-packet-test-'));
  t.after(()=>{assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));assert.match(path.basename(directory),/^mofacts-rollback-packet-test-/);fs.rmSync(directory,{recursive:true,force:true});});
  const metadata={configurationTargetMatched:true,configurationRootOnly:true,containers:[
    {name:'/staging2-mongodb-1',image:'sha256:'+'a'.repeat(64)},{name:'/staging2-redis-1',image:'sha256:'+'b'.repeat(64)}]};
  const source=path.join(directory,'metadata.json'),packet=path.join(directory,'packet');
  return{directory,source,packet,metadata,run(){fs.writeFileSync(source,JSON.stringify(metadata));return spawnSync(process.execPath,[script,packet,source],{cwd:directory,encoding:'utf8',timeout:15000});}};
}
test('rollback fixture preparation binds actual HEAD, exact bytes and owned synthetic identities from any cwd',t=>{
  const value=fixture(t),result=value.run();assert.equal(result.status,0,result.stderr);
  const prepared=JSON.parse(result.stdout),manifest=JSON.parse(fs.readFileSync(value.packet+'/manifest.json'));
  const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'}).trim();
  assert.equal(manifest.sourceCommit,revision);assert.equal(manifest.state,'prepared-only');
  assert.equal(Object.keys(manifest.files).length,9);
  for(const[name,hash]of Object.entries(manifest.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(value.packet,name))).digest('hex'),hash);
  const synthetic=JSON.parse(fs.readFileSync(value.packet+'/synthetic.json'));
  assert.equal(synthetic.v1.sourceRevision,revision);assert.equal(synthetic.v2.scannerSourceRevision,revision);
  assert.equal(validateRollbackFixture(synthetic,{MOFACTS_AUDIT_ROLLBACK_NAMESPACE:prepared.namespace,EXPECTED_MONGO_DB_NAME:prepared.namespace,
    ROOT_URL:'http://app:3000',MONGO_URL:`mongodb://mongo:27017/${prepared.namespace}?replicaSet=rollback-rs`}),prepared.namespace);
  assert(!result.stdout.includes(synthetic.resumeToken));
});
test('rollback fixture preparation rejects wrong host metadata before creating a credential packet',t=>{
  const value=fixture(t);value.metadata.configurationTargetMatched=false;
  assert.notEqual(value.run().status,0);assert.equal(fs.existsSync(value.packet),false);
});
