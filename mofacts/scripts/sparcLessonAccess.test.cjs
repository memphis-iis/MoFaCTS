// Real authorization/resolution methods with synthetic persistence and provider boundaries.
// No account creation, MongoDB connection, network, paid provider call or emitted JS.
require('./registerHistoryTypescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
class MeteorError extends Error { constructor(error, reason) { super(reason); this.error=error; this.reason=reason; } }
let publication, vectorReads=0;
const publicationStorageCalls=[];
let stoppedObservers=0;
const observer=async()=>({stop(){stoppedObservers++;}});
const originalLoad=Module._load;
Module._load=function(request,parent,main){
 if(request==='meteor/meteor')return {Meteor:{Error:MeteorError,publish:(_name,handler)=>{publication=handler;}}};
 if(request==='meteor/check')return {check:()=>{},Match:{ObjectIncluding:x=>x}};
 if(request.endsWith('sparcInstructionalLibraryStorage'))return {SparcInstructionalLibrary:{
  rawCollection:()=>({
   find:()=>{publicationStorageCalls.push('catalog');return {toArray:async()=>[]};},
   findOne:async()=>null,
  }),
  find:()=>{vectorReads++;publicationStorageCalls.push('entries');return {observeChanges:observer};},
 }};
 if(request.endsWith('sparcMoveLibraryStorage'))return {
  ensureSparcContentUseForUser:async userId=>{publicationStorageCalls.push(`initialize-user:${userId}`);},
  SparcMoveRequests:{find:selector=>{publicationStorageCalls.push(`moves:${selector.userId}`);return {observeChanges:observer};}},
 };
 if(request.endsWith('sparcFigureLibraryStorage'))return {
  SparcFigureRequests:{find:selector=>{publicationStorageCalls.push(`visuals:${selector.userId}`);return {observeChanges:observer};}},
 };
 return originalLoad.call(this,request,parent,main);
};
const {requireSparcLessonAccess,createSparcLessonAuthorizer}=require('../server/lib/sparcLessonAccess.ts');
const {createSparcDemoAccess}=require('../server/lib/sparcDemoAccess.ts');
const {createTdfLookupHelpers}=require('../server/lib/tdfLookup.ts');
const contentAccess=require('../server/lib/contentAccessPolicy.ts');
const {resolvePreferredApiKey,getAccessibleTdfApiKey}=require('../server/lib/apiKeyResolution.ts');
const {createOpenRouterMethods}=require('../server/methods/openRouterMethods.ts');
const {createSparcPromptImageMethods}=require('../server/methods/sparcPromptImageMethods.ts');
const {createSparcMoveLibraryMethods}=require('../server/methods/sparcMoveLibraryMethods.ts');
const {createSparcLibraryCurationMethods}=require('../server/methods/sparcLibraryCurationMethods.ts');
const {registerSparcRetrievalPublication}=require('../server/lib/sparcRetrievalPublication.ts');
Module._load=originalLoad;
const now=Date.parse('2026-10-26T11:00:00Z');
const value=(row,key)=>key.split('.').reduce((v,k)=>v?.[k],row);
function matches(row,selector){return Object.entries(selector).every(([key,expected])=>{
 if(key==='$or')return expected.some(s=>matches(row,s));
 const actual=value(row,key);
 if(expected&&typeof expected==='object'&&!Array.isArray(expected)&&!(expected instanceof Date))return Object.entries(expected).every(([op,arg])=>{
  if(op==='$in')return arg.includes(actual);if(op==='$ne')return actual!==arg;if(op==='$exists')return (actual!==undefined)===arg;
  if(op==='$lte')return actual<=arg;throw new Error('Unimplemented fixture selector '+op);
 });return actual===expected;
});}
const collection=rows=>({findOneAsync:async s=>rows.find(r=>matches(r,s)),find:s=>({fetchAsync:async()=>rows.filter(r=>matches(r,s))})});
function fixture(){
 const makeLesson=(id,policy,target)=>({_id:id,ownerId:'author',tdfRevision:1,content:{tdfs:{tutor:{setspec:{userselect:'false',...(target?{experimentTarget:target}:{}),openRouterApiKey:'fixture-encrypted',openRouterModel:'fixture/model'},unit:[{sparcsession:{}}]}}},rawStimuliFile:{instructionalController:{policyId:policy}}});
 const lessons=[makeLesson('agent','dynamic-instruction-agent-v2'),makeLesson('student-policy','dynamic-instruction-student-v2'),makeLesson('progressive','progressive-scaffolding-v1'),makeLesson('demo','dynamic-instruction-agent-v2','public-demo-test'),makeLesson('private','dynamic-instruction-agent-v2')];
 const users=[{_id:'student',profile:{}},{_id:'demo-user',createdAt:new Date(now-3600000),profile:{createdBy:'provisionExperimentUser',experimentTarget:'public-demo-test'}},{_id:'intruder',profile:{}},{_id:'expired',createdAt:new Date(now-86400001),profile:{createdBy:'provisionExperimentUser',experimentTarget:'public-demo-test'}},{_id:'ordinary',createdAt:new Date(0),profile:{createdBy:'provisionExperimentUser',experimentTarget:'ordinary-study'}}];
 const assignments=['agent','student-policy','progressive'].map(TDFId=>({_id:'assignment-'+TDFId,courseId:'course',assignmentType:'lesson',TDFId}));
 const contexts=Object.fromEntries(assignments.map(a=>[a.TDFId,{assignmentId:a._id,courseId:a.courseId,TDFId:a.TDFId,launchSource:'courses',launchMode:'individual'}]));
 const lookup=createTdfLookupHelpers({serverConsole(){},Tdfs:collection(lessons),usersCollection:collection(users),GlobalExperimentStates:collection([]),Assignments:collection(assignments),Courses:collection([{_id:'course',semester:'SU_2022',visibility:'private'}]),Sections:collection([{_id:'section',courseId:'course'}]),SectionUserMap:collection([{_id:'enrollment',userId:'student',sectionId:'section'}]),normalizeCanonicalId:v=>typeof v==='string'&&v.trim()?v.trim():null,resolveAssignedRootTdfIdsForUser:async userId=>userId==='student'?['agent','student-policy','progressive']:[],...contentAccess});
 const quota=[];
 const demos=createSparcDemoAccess({readUser:async id=>users.find(x=>x._id===id),readDemoTutor:async target=>lessons.find(x=>x.content.tdfs.tutor.setspec.experimentTarget===target)?.content.tdfs.tutor,rateLimit:async(id,ip)=>{quota.push([id,ip]);},now:()=>now});
 const authorize=createSparcLessonAuthorizer({readAssignmentContext:async(id,tdf)=>id==='student'?contexts[tdf]??null:null,readAuthorizedLesson:(id,tdf,courseAssignment)=>lookup.getTdfById.call({userId:id},tdf,{courseAssignment}),assertDemoExpiry:demos.assertExpiry});
 const auth={userIsInRoleAsync:async id=>id==='admin',requireSparcLessonAccess:authorize};
 const keyDeps={getUserById:async()=>null,getTdfById:async id=>lessons.find(x=>x._id===id),getAdminApiKeySettings:async()=>null,hasHistoryWithTdf:async()=>false,userIsInRoleAsync:auth.userIsInRoleAsync,decryptData:()=> 'fixture-not-a-live-key'};
 return {lessons,users,contexts,lookup,auth,authorize,demos,quota,keyDeps};
}
test('fresh enrolled students execute both dynamic policies and progressive scaffolding using real enrollment checks',async()=>{
 const f=fixture();for(const id of ['agent','student-policy','progressive'])assert.equal(await requireSparcLessonAccess(f.auth,'student',id),'student');
 await assert.rejects(requireSparcLessonAccess(f.auth,'intruder','agent'),/Not authorized/);
 await assert.rejects(requireSparcLessonAccess(f.auth,'student','private'),/Not authorized/);
 await assert.rejects(requireSparcLessonAccess(f.auth,null,'agent'),/logged in/);
 await assert.rejects(requireSparcLessonAccess(f.auth,'student',null),/Reopen/);
 assert.equal(await requireSparcLessonAccess(f.auth,'admin',null),'admin');
});
test('fresh direct-demo participants use their server-owned target and expired participants cannot execute',async()=>{
 const f=fixture();assert.equal(await requireSparcLessonAccess(f.auth,'demo-user','demo'),'demo-user');
 await assert.rejects(requireSparcLessonAccess(f.auth,'demo-user','agent'),/Not authorized/);
 await assert.rejects(requireSparcLessonAccess(f.auth,'expired','demo'),/expired/);
});
test('forged course context does not bypass enrollment or release validation',async()=>{
 const f=fixture();await assert.rejects(f.lookup.getTdfById.call({userId:'intruder'},'agent',{courseAssignment:f.contexts.agent}),/not available/);
 await assert.rejects(f.lookup.getTdfById.call({userId:'student'},'private',{courseAssignment:f.contexts.agent}),/does not match/);
});
test('direct and automatic demos share quota/expiry checks; ordinary learners are not demo-limited',async()=>{
 const f=fixture();f.users.push({_id:'automatic',profile:{createdBy:'publicDemo',demoExpiresAt:new Date(now+1000)}});
 await f.demos.assertAiQuota('demo-user','fixture-ip');await f.demos.assertAiQuota('automatic','fixture-ip');
 await f.demos.assertAiQuota('student','fixture-ip');await f.demos.assertAiQuota('ordinary','fixture-ip');
 assert.deepEqual(f.quota,[['demo-user','fixture-ip'],['automatic','fixture-ip']]);
 await assert.rejects(f.demos.assertAiQuota('expired','fixture-ip'),/expired/);
 f.users.push({_id:'malformed',profile:{createdBy:'publicDemo',demoExpiresAt:'invalid'}});
 await assert.rejects(f.demos.assertAiQuota('malformed','fixture-ip'),/expired/);
});
test('first lesson-key resolution works without history only inside server execution capability; raw getter stays restricted',async()=>{
 const f=fixture();await assert.rejects(getAccessibleTdfApiKey(f.keyDeps,{userId:'student',tdfId:'agent',kind:'openrouter'}),/Access denied/);
 const runtime={...f.keyDeps,authorizeTdfExecution:async(id,tdf)=>{await requireSparcLessonAccess(f.auth,id,tdf);}};
 const result=await resolvePreferredApiKey(runtime,{userId:'student',tdfId:'agent',kind:'openrouter'});assert.equal(result.source,'tdf');
 await assert.rejects(resolvePreferredApiKey({...runtime,hasHistoryWithTdf:async()=>true},{userId:'intruder',tdfId:'agent',kind:'openrouter'}),/Not authorized/);
 await assert.rejects(resolvePreferredApiKey(runtime,{userId:'intruder',tdfId:'agent',kind:'openrouter'}),/Not authorized/);
});
test('both dynamic provider paths accept members, deny outsiders before provider calls, and retain admin testing',async()=>{
 const f=fixture();let calls=0;const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:'{"ok":true}'},finish_reason:'stop'}]}),{status:200});};
 try{
  const methods=createOpenRouterMethods({serverConsole(){},getMethodAuthorizationDeps:()=>f.auth,getApiKeyResolutionDeps:()=>({...f.keyDeps,authorizeTdfExecution:async(id,tdf)=>{await requireSparcLessonAccess(f.auth,id,tdf);}}),assertPublicDemoAiQuota:f.demos.assertAiQuota,openRouterModelCatalogService:{getCatalog:async()=>[{id:'fixture/model',reasoning:{mandatory:false,supportedLevels:null,defaultLevel:'none'}}]}});
  for(const [tdfId,policyId] of [['agent','dynamic-instruction-agent-v2'],['student-policy','dynamic-instruction-student-v2'],['progressive','progressive-scaffolding-v1'],['demo','dynamic-instruction-agent-v2']]){
   const params={tdfId,policyId,messages:[{role:'user',content:'Synthetic fixture only.'}],intent:{title:'Fixture'}};
   await assert.rejects(methods.callResolvedOpenRouterJson.call({userId:'intruder'},params),/Not authorized|Access denied/);
   const userId=tdfId==='demo'?'demo-user':'student';await methods.callResolvedOpenRouterJson.call({userId},params);
  }
  assert.equal(calls,4);
  await assert.rejects(methods.callResolvedOpenRouterJson.call({userId:'intruder'},{tdfId:'agent',messages:[{role:'user',content:'Synthetic omitted-policy attempt.'}],intent:{title:'Fixture'}}),/Not authorized/);
  await assert.rejects(methods.callResolvedOpenRouterJson.call({userId:'student'},{tdfId:'agent',policyId:'dynamic-instruction-agent-v1',messages:[],intent:{}}),/administrator/);
  await assert.rejects(methods.callResolvedOpenRouterEmbeddings.call({userId:'intruder'},{tdfId:'agent',input:['fixture'],model:'fixture'}),/Not authorized/);
  await assert.rejects(methods.callAdminTestResolvedOpenRouterJson.call({userId:'student'},{}),/Only admins/);
 }finally{globalThis.fetch=oldFetch;}
});
test('runtime vector publication needs lesson membership; administrative browsing/curation remain admin-only',async()=>{
 const f=fixture();registerSparcRetrievalPublication(()=>f.auth);vectorReads=0;publicationStorageCalls.length=0;stoppedObservers=0;
 let stopPublication,readyCalls=0;
 const ctx={userId:'intruder',onStop(handler){stopPublication=handler;},ready(){readyCalls++;},added(){},changed(){},removed(){},error(error){throw error;}};
 await assert.rejects(publication.call(ctx,{kind:'feedback',readingLevel:'unbiased',responseFormat:'text'},'agent'),/Not authorized/);assert.equal(vectorReads,0);
 assert.deepEqual(publicationStorageCalls,[]);assert.equal(readyCalls,0);assert.equal(stopPublication,undefined);
 await publication.call({...ctx,userId:'student'},{kind:'feedback',readingLevel:'unbiased',responseFormat:'text'},'agent');assert.equal(vectorReads,1);
 assert.deepEqual(publicationStorageCalls,['catalog','initialize-user:student','moves:student','visuals:student','entries']);
 assert.equal(readyCalls,1);stopPublication();await new Promise(resolve=>setImmediate(resolve));assert.equal(stoppedObservers,3);
 const methods=createSparcMoveLibraryMethods({store:{},getMethodAuthorizationDeps:()=>f.auth,verifyFigure:async()=>{}});
 for(const name of ['listSparcMoveLibrary','reviseSparcPrimitive'])await assert.rejects(methods[name].call({userId:'student'}),/Permission denied/);
 const curation=createSparcLibraryCurationMethods({getMethodAuthorizationDeps:()=>f.auth,remove:async()=>{throw new Error('Must not delete');},removed:async()=>['removed']});
 await assert.rejects(curation.deleteSparcInstructionalComponent.call({userId:'student'},'item'),/Permission denied/);
 assert.deepEqual(await curation.getSparcAdministrativeRemovals.call({userId:'student'},['removed'],'agent'),['removed']);
});
test('lesson-authorized image reads preserve other-user private assets and generation enforces demo quota first',async()=>{
 const f=fixture();let reads=0;let provider=0;const asset={_id:'abc123',userId:'student',type:'image/png',path:'fixture',meta:{uploadPurpose:'sparc-prompt-image',public:false,ready:true}};
 // Use the production purpose constant, not a guessed surface flag.
 asset.meta.uploadPurpose=require('../common/lib/sparcPromptImage.ts').SPARC_PROMPT_IMAGE_PURPOSE;
 const methods=createSparcPromptImageMethods({getMethodAuthorizationDeps:()=>f.auth,getApiKeyResolutionDeps:()=>f.keyDeps,DynamicAssets:{collection:{findOneAsync:async selector=>matches(asset,selector)?asset:undefined},writeAsync:async()=>{throw new Error('No writes in this fixture');}},storageBoundary:{backend:'local'},readFile:async()=>{reads++;return Buffer.from('synthetic-raster-bytes');},generateImage:async()=>{provider++;throw new Error('No live image calls');},isRemoved:async()=>false,assertPublicDemoAiQuota:async()=>{throw new MeteorError(429,'Demo quota reached');}});
 assert.match((await methods.getSparcPromptImage.call({userId:'student'},'abc123','agent')).dataUrl,/^data:image\/png/);
 await assert.rejects(methods.getSparcPromptImage.call({userId:'demo-user'},'abc123','demo'),/not found/);assert.equal(reads,1);
 await assert.rejects(methods.generateSparcPromptImage.call({userId:'demo-user'},{tdfId:'demo'}),/quota/);assert.equal(provider,0);
 await assert.rejects(methods.listSparcLibraryImages.call({userId:'student'}),/Permission denied/);
});
test('teacher target repair is dry-run-first, idempotent, revision-guarded and reversible without replacing content/identity',async()=>{
 const context={module:{exports:{}},process:{env:{}}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../deploy/repair-teacher-demo-target.mongosh.js'),'utf8'),context);
 const repair=context.module.exports.repairTeacherDemoTarget;let writes=0;
 const row={_id:'tdf_90326bcac960053c76deac45',tdfRevision:3,tdfFileName:'AutoTutor_Natural_Selection_TDF.json',content:{tdfs:{tutor:{setspec:{name:'Keep this name'},unit:[{sparcsession:{pageId:'keep'}}]}}},stimuliSetId:999};
 const tdfs={findOne:async selector=>matches(row,selector)?row:null,updateOne:async(selector,update)=>{if(!matches(row,selector))return {matchedCount:0,modifiedCount:0};writes++;if(update.$set)row.content.tdfs.tutor.setspec.experimentTarget=update.$set['content.tdfs.tutor.setspec.experimentTarget'];if(update.$unset)delete row.content.tdfs.tutor.setspec.experimentTarget;row.tdfRevision++;return {matchedCount:1,modifiedCount:1};}};
 assert.equal((await repair(tdfs)).status,'dry-run');assert.equal(writes,0);
 assert.equal((await repair(tdfs,{apply:true})).status,'repaired');assert.equal((await repair(tdfs,{apply:true})).status,'already-correct');assert.equal(writes,1);
 await assert.rejects(repair(tdfs,{apply:true,rollback:true,expectedRevision:3}),/revision/);
 assert.equal((await repair(tdfs,{apply:true,rollback:true,expectedRevision:4})).status,'rolled-back');assert.equal(row.stimuliSetId,999);assert.equal(row.content.tdfs.tutor.unit[0].sparcsession.pageId,'keep');
 const conflict={...tdfs,findOne:async selector=>selector._id?.$ne?{_id:'another'}:row};await assert.rejects(repair(conflict,{apply:true}),/already owns/);
});
