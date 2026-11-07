import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { control, section, finalizeReport } from '../../mofacts/scripts/security-audit/audit-lib.mjs';
import { parseSecurityAuditReport } from '../../mofacts/common/securityAuditReport.ts';
import membership from '../../mofacts/scripts/security-audit/tests/fixtures/v1-membership.json' with { type: 'json' };
import { errorReport } from '../../mofacts/scripts/security-audit/tests/fixtures/v2Fixtures.mjs';
import { auditDigest } from '../../mofacts/common/securityAudit/canonicalReport.ts';
import { parseSecurityAuditReportV2 } from '../../mofacts/common/securityAudit/reportV2.ts';
assert.equal(process.version,'v24.22.1');
assert.equal(process.argv.length,4);
const repository=fileURLToPath(new URL('../../',import.meta.url));
const sourceCommit=execFileSync('git',['rev-parse','--verify','HEAD'],{cwd:repository,encoding:'utf8'}).trim();
assert.match(sourceCommit,/^[a-f0-9]{40}$/);
const readSource=file=>fs.readFileSync(path.join(repository,file),'utf8');
const metadata=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
assert.equal(metadata.configurationTargetMatched,true);assert.equal(metadata.configurationRootOnly,true);
const image=name=>{const id=metadata.containers.find(row=>row.name===name)?.image;assert.match(id,/^sha256:[a-f0-9]{64}$/);return id;};
const mongoImage=image('/staging2-mongodb-1'),redisImage=image('/staging2-redis-1');
const directory=process.argv[2];assert(directory);
fs.mkdirSync(directory,{mode:0o700});
const token=crypto.randomBytes(6).toString('hex'),namespace='mofacts_audit_rollback_'+token;
const job='/var/tmp/mofacts-audit-rollback.'+token;
const now=new Date(),start=new Date(now-180000).toISOString(),completed=new Date(now-120000).toISOString();
const v1=parseSecurityAuditReport(finalizeReport({schema:'SecurityAuditReportV1',reportId:namespace+'-SecurityAuditReportV1',reportType:'full',
  startedAt:start,completedAt:completed,target:'https://rollback.invalid',sourceRevision:sourceCommit,productionImage:'unknown',toolVersions:{node:'24.22.1'},
  executionErrors:['Synthetic storage compatibility fixture.'],sections:Object.fromEntries(Object.entries(membership).map(([id,ids])=>[id,section(id,ids.map(id=>control(id,'Synthetic control','ERROR','HIGH','Synthetic unavailable evidence.')))]))}));
const draft=await errorReport();draft.reportId=namespace+'-SecurityAuditReportV2';draft.target='https://rollback.invalid';draft.startedAt=new Date(now-90000).toISOString();draft.completedAt=new Date(now-30000).toISOString();
draft.scannerSourceRevision=sourceCommit;
const {digestSha256:_old,...payload}=draft;void _old;
const v2=await parseSecurityAuditReportV2({...payload,digestSha256:await auditDigest(payload)},{purpose:'retained'});
const fixture={namespace,userId:namespace+'-admin',email:namespace+'@localhost.test',resumeToken:crypto.randomBytes(32).toString('base64url'),v1,v2};
const write=(name,text)=>fs.writeFileSync(path.join(directory,name),text,{flag:'wx',mode:0o600});
write('synthetic.json',JSON.stringify(fixture));
const settings=JSON.parse(readSource('mofacts/settings.ci.json'));
settings.owner=fixture.email;settings.ROOT_URL='http://app:3000';settings.initRoles.admins=[fixture.email];settings.public.admin=fixture.email;settings.public.socialPreview.url=settings.ROOT_URL;
settings.encryptionKey=crypto.randomBytes(32).toString('base64url');settings.storage.local.dynamicAssetsPath='/tmp/rollback-assets';settings.openCore={requireRedis:true};
write('settings.json',JSON.stringify(settings));
const redisPassword=crypto.randomBytes(32).toString('base64url');write('redis.password',redisPassword);
const previousImage='ppavlikmemphis/mofacts-mini@sha256:f8784b4afe9a4875fd62c5ccb153bab26796381548d47ded54d9a65d5148cc05';
write('parameters.json',JSON.stringify({namespace,job,previousImage,previousConfig:'sha256:214793c9cf7534eb4568934fc83843328b202a23b99d108fc323ead2ceafb697'}));
write('environment',Object.entries({ROLLBACK_NAMESPACE:namespace,ROLLBACK_JOB:job,ROLLBACK_PREVIOUS_IMAGE:previousImage,
  ROLLBACK_MONGO_IMAGE:mongoImage,ROLLBACK_REDIS_IMAGE:redisImage,ROLLBACK_REDIS_URL:`redis://:${redisPassword}@redis:6379/0`}).map(([key,value])=>key+'='+value).join('\n')+'\n');
const user={_id:fixture.userId,username:fixture.email,emails:[{address:fixture.email,verified:true}],emailCanonical:fixture.email,emailOriginal:fixture.email,
  profile:{experiment:false,username:fixture.email},services:{resume:{loginTokens:[{hashedToken:crypto.createHash('sha256').update(fixture.resumeToken).digest('base64')}]}}};
write('seed.mongo.js',`const owned=db.getSiblingDB(${JSON.stringify(namespace)});\nif(owned.users.countDocuments({})!==0||owned.security_audit_reports.countDocuments({})!==0)throw Error('Foreign fixture data');\nconst user=${JSON.stringify(user)};user.createdAt=new Date();user.services.resume.loginTokens[0].when=new Date();owned.users.insertOne(user);\nconst report=${JSON.stringify(v1)};report.ingestNonce=${JSON.stringify(namespace+'-v1-nonce')};report.ingestedAt=new Date();report.expiresAt=new Date(Date.now()+90*86400000);owned.security_audit_reports.insertOne(report);\n`);
write('compose.yml',readSource('deploy/security-audit/rollback-runtime.compose.yml').replaceAll('\r\n','\n'));
write('baseline.mjs',readSource('deploy/security-audit/rollback-runtime-baseline.mjs').replaceAll('\r\n','\n'));
write('imageArchiveIdentity.mjs',readSource('mofacts/scripts/security-audit/qualification/imageArchiveIdentity.mjs').replaceAll('\r\n','\n'));
const files=Object.fromEntries(fs.readdirSync(directory).sort().map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(directory,name))).digest('hex')]));
// HEAD is a provenance locator; exact packet hashes do not attest a clean tree
// or qualify a release. Do not freeze this reusable tool to its first draft SHA.
write('manifest.json',JSON.stringify({state:'prepared-only',sourceCommit,files})+'\n');
console.log(JSON.stringify({state:'synthetic-rollback-packet-prepared',namespace,job,manifestDigest:crypto.createHash('sha256').update(fs.readFileSync(path.join(directory,'manifest.json'))).digest('hex')}));
