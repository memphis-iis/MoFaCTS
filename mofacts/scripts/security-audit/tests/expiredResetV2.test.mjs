import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { captureUnusedExpiredResetV2 } from '../authentication/expiredResetV2.mjs';
import { writeAuditFileV2 } from '../core/producerFilesV2.mjs';
import { evaluateResetProtocol } from '../../../common/securityAudit/resetProtocol.ts';

const namespace = 'mofacts_audit_fixture_0123456789ab', target = 'https://staging2.optimallearning.org';
async function fixture(t, mode = 'success') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'unused-expiry-')); await fs.chmod(directory, 0o700);
  t.after(() => fs.rm(directory, { recursive:true, force:true }));
  const start = Date.now(); let time = start, attempts = 0, waits = 0, requests = 0;
  const leaseFile = path.join(directory,'staging2-authentication.lock.json');
  await writeAuditFileV2(leaseFile, { schema:'MoFaCTSAuditAuthenticationLeaseV1',target,namespace,startedAtMs:start,deadlineMs:start+7200000 });
  const actor = { userId:'owned-expiry',username:`operator+${namespace}-expiry@gmail.com`,password:'PRIVATE_OLD_PASSWORD_12345678901234567890' };
  const newPassword='PRIVATE_NEW_PASSWORD_12345678901234567890';
  const transport = {
    async baseline() { return { observation:{ state:'returned',allowedObservationMatched:mode!=='missing-baseline' } }; },
    async request() { requests++; return { state:'returned',allowedObservationMatched:true }; },
    async reset(email, token, password) {
      attempts++; assert.equal(email,actor.username); assert.equal(token,'a'.repeat(64)); assert.equal(password,newPassword);
      assert.ok(time-start>=3600000);
      return mode==='expired-accepted' ? {state:'returned',allowedObservationMatched:true}
        : {state:'rejected',code:mode==='domain-error'?'not-authorized':'invalid-token'};
    },
    async oldPasswordLogin() { return mode==='expired-accepted' ? {state:'rejected',code:'403'} : {state:'returned',allowedObservationMatched:true}; },
    async newPasswordLogin() { assert.fail('Unexpected new-password probe'); },
    async revokedSessions() { assert.fail('Unexpected revocation probe'); },
  };
  const run = () => captureUnusedExpiredResetV2({ namespace,target,actor,newPassword,transport,leaseDirectory:directory,
    confirmMailLease:async()=>{},
    acquireMail:async binding=>({metadata:{messageId:'synthetic',recipients:[actor.username],receivedAtMs:binding.requestedAtMs},
      plainText:`${target}/auth/reset-password?email=${encodeURIComponent(actor.username)}&token=${'a'.repeat(64)}`}),
    observeTokenAge:async()=>{
      const ageMs=time-start+(mode==='age-jump'&&waits?60000:0), lifetimeMs=mode==='wrong-lifetime'?7200000:3600000;
      return {owned:true,unused:mode!=='used-record',ageMs,lifetimeMs,remainingMs:lifetimeMs-ageMs};
    },
  },{now:()=>time,wait:async milliseconds=>{
    assert.ok(milliseconds>0&&milliseconds<=30000);waits++;time+=milliseconds;
    if(mode==='lease-replaced')await fs.writeFile(leaseFile,'{}\n');
  }});
  return {run,counts:()=>({attempts,waits,requests})};
}
function evaluate(expiry) {
  return evaluateResetProtocol({bindingsVerified:true,environmentLeaseHeld:true,currentTokenOwned:true,currentTokenUnused:true,
    expiredToken:expiry.expiredToken,results:[
      {verificationId:'authn.reset.current.password-before',outcome:'ALLOWED'},
      {verificationId:'authn.reset.current.accepted',outcome:'ALLOWED'},
      {verificationId:'authn.reset.current.replay',outcome:'DENIED_BY_POLICY'},...expiry.results]});
}
test('unused expiry waits the full source lifetime, rechecks its lease and returns finite observations without capabilities',async t=>{
  const f=await fixture(t),result=await f.run();
  assert.equal(evaluate(result).expired.status,'PASS');assert.equal(f.counts().attempts,1);assert.ok(f.counts().waits>=120);
  for(const secret of ['PRIVATE','a'.repeat(64),'@gmail.com'])assert.equal(JSON.stringify(result).includes(secret),false);
});
for(const mode of ['missing-baseline','used-record','wrong-lifetime','age-jump','lease-replaced']) {
  test(`expiry ${mode} stops before any password mutation`,async t=>{
    const f=await fixture(t,mode);await assert.rejects(f.run(),/observation is incomplete/);assert.equal(f.counts().attempts,0);
    if(mode==='missing-baseline')assert.equal(f.counts().requests,0);
  });
}
test('proven acceptance of the unused expired capability remains FAIL, while unrelated rejection remains ERROR',async t=>{
  const bad=await fixture(t,'expired-accepted');assert.equal(evaluate(await bad.run()).expired.status,'FAIL');
  const unavailable=await fixture(t,'domain-error');assert.equal(evaluate(await unavailable.run()).expired.status,'ERROR');
});
