// Render the actual error markup and drive the actual runtime/loading controller.
require('./registerHistoryTypescript.cjs');
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');const {JSDOM}=require('jsdom');
test('machine failures dismiss loading and render an accessible localized retry without exposing service details',async()=>{
 const dom=new JSDOM('<!doctype html><html><body></body></html>',{pretendToBeVisual:true});
 for(const key of ['window','document','navigator','HTMLElement','HTMLMediaElement','HTMLInputElement','HTMLFormElement','Element','Document','Node','Text','Comment','Event','CustomEvent','MutationObserver'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
 const values=new Map([['launchLoadingActive',true],['appLoading',true]]);const old=Module._load;
 Module._load=function(request,parent,main){if(request==='meteor/session')return {Session:{get:k=>values.get(k),set:(k,v)=>values.set(k,v)}};if(request.endsWith('clientLogger'))return {clientConsole(){}};return old.call(this,request,parent,main);};
 let app,controller;
 try{
  const {createContentRuntimeMachineRuntimeController}=require('../client/views/experiment/svelte/services/contentRuntimeMachineRuntime.ts');
  const {finishLaunchLoading}=require('../client/lib/launchLoading.ts');
  const {compile}=require('svelte/compiler');const {mount,unmount,flushSync,tick}=require('svelte');
  const source=fs.readFileSync(path.resolve(__dirname,'../client/views/experiment/svelte/components/ContentSurface.svelte'),'utf8');
  const section=source.slice(source.indexOf('  <section role="alert"'),source.indexOf('  </section>',source.indexOf('  <section role="alert"'))+'  </section>'.length);
  assert.ok(section.includes('lesson.runtimeLoadFailed'));assert.ok(source.includes("onRuntimeError: () => finishLaunchLoading('content-runtime-failed')"));
  const filename=path.resolve(__dirname,'contentRuntimeFailureFixture.svelte');
  const generated=compile(`<script>import {translatePlatformString} from '../client/lib/interfaceI18n.ts';function getActiveUiLocale(){return 'en';}export let initial;let state=initial;export function update(value){state=value;}</script>{#if state.matches('error')}${section}{/if}`,{filename,generate:'client'}).js.code;
  const mod=new Module(filename);mod.filename=filename;mod.paths=Module._nodeModulePaths(__dirname);mod._compile(ts.transpileModule(generated,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
  const snapshot=state=>({value:state,context:{errorMessage:'Synthetic private diagnostic that must not be rendered'},matches:value=>value===state});
  app=mount(mod.exports.default,{target:document.body,props:{initial:snapshot('idle')}});flushSync();await tick();let publish;
  controller=createContentRuntimeMachineRuntimeController({machine:{},createActor:()=>({getSnapshot:()=>snapshot('idle'),subscribe:handler=>{publish=handler;return {unsubscribe(){}};},start(){},stop(){}}),setState:state=>app.update(state),sendStartEvent(){},getStartEvent:()=>({type:'START'}),log(){},onRuntimeError:()=>finishLaunchLoading('content-runtime-failed')});
  controller.start();assert.equal(document.querySelector('[role="alert"]'),null);
  publish(snapshot('error'));flushSync();await tick();
  assert.equal(values.get('appLoading'),false);assert.equal(values.get('launchLoadingActive'),false);
  assert.match(document.querySelector('[role="alert"]').textContent,/could not load.*course or demo entry.*instructor/i);
  assert.equal(document.querySelector('button').textContent,'Try again');assert.equal(document.querySelector('button').type,'button');
  assert.doesNotMatch(document.body.textContent,/private diagnostic/);
  controller.stop();await unmount(app);app=null;
 }finally{controller?.stop();if(app){const {unmount}=require('svelte');await unmount(app);}Module._load=old;dom.window.close();}
});
