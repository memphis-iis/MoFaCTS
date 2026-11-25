import assert from 'node:assert/strict';import test from 'node:test';
import{legacyProbeInventory,legacyProbeSubjectNames}from'../verification/legacyProbeInventory.mjs';
const subjects={methods:['safeMethod'],publications:['safePublication'],httpRoutes:['/dynamicAssets'],managementRoutes:['client.admin|/admin']};
const raw=()=>({users:{learnerA:{username:'PRIVATE-email',password:'PRIVATE-password'}},canaries:['PRIVATE-canary'],authorizationProbes:[{actor:'learnerA',method:'safeMethod',args:['PRIVATE-id',{password:'PRIVATE-nested'}],expectDenied:true}],publicationProbes:[{actor:'learnerB',publication:'safePublication',otherUserCanary:'PRIVATE-other',expectError:false}],routeProbes:[{actor:'anonymous',path:'/admin?token=PRIVATE-token',expectDenied:true}],downloadProbes:[{actor:'learnerA',path:'/dynamicAssets/PRIVATE-file',expectDenied:true}]});
const run=value=>legacyProbeInventory(Buffer.from(JSON.stringify(value)),subjects);
test('format-only probe inventory emits public subjects/aliases/shapes and no credential, canary, resource or query values',()=>{
 const result=run(raw());assert.equal(result.total,4);assert.equal(JSON.stringify(result).includes('PRIVATE'),false);assert.equal(result.families.method[0].surfaceId,'method:safeMethod');assert.deepEqual(result.families.method[0].argumentKinds,['string','object']);assert.equal(result.families.route[0].queryBindingsPresent,true);assert.equal(result.families.download[0].sourceRouteCandidates[0],'/dynamicAssets');assert.equal(result.families.publication[0].otherUserCanaryPresent,true);
});
test('format-only inventory preserves unknown subject rows as unresolved without exposing their values',()=>{
 for(const change of[v=>v.authorizationProbes[0].method='PRIVATE-unknown',v=>v.publicationProbes[0].publication='PRIVATE-unknown']){const value=raw();change(value);const result=run(value);assert.equal(result.total,4);assert.equal(result.unresolvedSubjectCount,1);assert.equal(JSON.stringify(result).includes('PRIVATE'),false);}
 const value=raw();value.routeProbes[0].actor='PRIVATE-actor';assert.throws(()=>run(value),error=>!error.message.includes('PRIVATE'));
});
test('format-only inventory records missing intent/unresolved routes instead of authoring policy or inventing bindings',()=>{
 const value=raw();delete value.authorizationProbes[0].expectDenied;value.routeProbes[0].path='/PRIVATE-unmapped';const result=run(value);assert.equal(result.families.method[0].legacyExpectation,'unspecified');assert.equal(result.families.route[0].sourceResolution,'unresolved');assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
});
test('format-only inventory rejects malformed/duplicate/oversized inputs and duplicate semantic cases',()=>{
 for(const bytes of[Buffer.from('{"users":{},"users":{}}'),Buffer.alloc(65537),Buffer.from([255])])assert.throws(()=>legacyProbeInventory(bytes,subjects));
 const duplicate=raw();duplicate.authorizationProbes.push({...duplicate.authorizationProbes[0]});assert.throws(()=>run(duplicate));const invalid=raw();invalid.authorizationProbes[0].args='PRIVATE';assert.throws(()=>run(invalid));
});
test('format-only inventory preserves omitted arguments but never lets missing families become an empty reviewed catalog',()=>{
 const value=raw();delete value.authorizationProbes[0].args;assert.deepEqual(run(value).families.method[0].argumentKinds,[]);value.downloadProbes=[];assert.throws(()=>run(value));
});

test('current fixture subjects distinguish application methods from HTTP verbs and preserve mounted paths', () => {
 const { methods, publications, httpRoutes, managementRoutes } = legacyProbeSubjectNames();
 assert(methods.includes('getOwnOpenRouterSettings'));
 assert(methods.includes('_FilesCollectionWrite_Assets'));
 assert(!methods.includes('GET') && !methods.includes('HEAD'));
 assert(publications.includes('currentTdf'));
 assert(httpRoutes.includes('/data-download/own-history') && httpRoutes.includes('/dynamic-assets'));
 assert(httpRoutes.every(route => !route.includes(':token')));
 assert(managementRoutes.includes('client.adminSecurityAudits|/admin/security-audits'));
});
