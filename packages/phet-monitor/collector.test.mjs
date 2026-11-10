import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
const source = await readFile(new URL('./collector.js', import.meta.url), 'utf8');
function make(options) {
  const context = vm.createContext({ Map, Set, WeakMap, WeakSet, ArrayBuffer, DataView, Date, RegExp, TextEncoder, performance });
  vm.runInContext(source, context);
  return context.PhETResearch.createCollector(options);
}
const property = value => ({ tinyProperty: { _value: value, listeners: new Set() } });
const at = (c,path) => c.snapshot().find(entry => entry.path === path);
function emit(c,p,value) { const before=p.tinyProperty._value; p.tinyProperty._value=value; c.emit(p.tinyProperty,[value,before,p]); }

test('idle frame boundaries never inspect model objects or install listeners', () => {
  assert.throws(()=>make({sampling:'frame'}),/Only object-events/);
  assert.throws(()=>make({sampling:'event'}),/Only object-events/);
  let reads=0; const model=new Proxy({ p:property(0), vector:{x:0} },{ownKeys(target){reads++;return Reflect.ownKeys(target);}});
  Object.defineProperty(model,'danger',{enumerable:true,get(){throw Error('getter invoked');}});
  const c=make();c.model(model);c.frame();const initial=c.status().objectInspections, ownReads=reads;c.drain();
  for(let i=0;i<1000;i++)c.frame();
  assert.equal(reads,ownReads);assert.equal(c.status().objectInspections,initial);assert.equal(c.drain().length,0);
  assert.equal(model.p.tinyProperty.listeners.size,0);assert.equal(at(c,'screens.0.model').state.fields.danger.unsupported,'accessor-not-invoked');
  assert.equal(at(c,'screens.0.model').state.fieldCoverage.vector,'initial-only-no-change-signal');
});

test('only the notified property and explicit event value are inspected', () => {
  const p=property(0), other={x:1},c=make();c.model({p,other});c.frame();c.drain();const count=c.status().objectInspections;
  emit(c,p,1);emit(c,p,2);emit(c,p,3);c.frame();const records=c.drain();
  assert.deepEqual(Array.from(records.filter(r=>r.type==='property'),r=>r.data.args[0]),[1,2,3]);
  assert.equal(c.status().objectInspections-count,3);assert.equal(at(c,'screens.0.model.p').state.value,3);
});

test('silent mutable fields are explicitly unsupported and are never polled', () => {
  const vector={x:0},buffer=new Float64Array([1]),c=make();c.model({vector,buffer});c.frame();const records=c.drain();
  vector.x=9;buffer[0]=4;c.frame();
  assert.equal(at(c,'screens.0.model.vector').state.fields.x,0);assert.equal(at(c,'screens.0.model.buffer').state.values[0],1);
  assert.equal(c.drain().length,0);
  assert.ok(records.filter(r=>r.type==='catalog'&&['object','typed-array'].includes(r.data.kind)).every(r=>r.data.coverage==='unsupported'));
});

test('an object carried by a property event gets a labeled snapshot without scanning siblings', () => {
  const vector={x:0},p=property(vector),c=make();c.model({p,sibling:{x:1}});c.frame();c.drain();
  vector.x=2;c.emit(p.tinyProperty,[vector,vector,p]);c.frame();const records=c.drain();
  assert.equal(at(c,'screens.0.model.p.value').state.fields.x,2);
  assert.ok(records.some(r=>r.type==='sample'&&r.data.trigger?.eventSource));
  assert.equal(at(c,'screens.0.model.sibling').state.fields.x,1);
});

test('observable collection mutations discover early property events and release removed objects', () => {
  const items=[],c=make();c.registerCollection(items,items);c.beginModel();c.model({items});c.frame();c.drain();
  const child={p:property(1)};emit(c,child.p,2);items.push(child);c.collectionChanged(items,items);emit(c,child.p,3);
  items.pop();c.collectionChanged(items,items);c.dispose(child.p.tinyProperty);c.dispose(child);c.frame();
  const records=c.drain();assert.deepEqual(Array.from(records.filter(r=>r.type==='property'),r=>r.data.args[0]),[2,3]);
  assert.ok(records.some(r=>r.type==='disposed'));assert.ok(records.some(r=>r.type==='detached'));
  assert.equal(at(c,'screens.0.model.items').state.fields.length,0);assert.equal(c.status().activeObjects,2);
});

test('collection reorder preserves identities, and ordinary arrays cannot masquerade as observed collections', () => {
  const a={},b={},items=[a,b],c=make();c.registerCollection(items,items);c.model({items,plain:[]});c.frame();
  const first=at(c,'screens.0.model.items').state.fields;items.reverse();c.collectionChanged(items,items);c.frame();
  const next=at(c,'screens.0.model.items').state.fields;assert.equal(next[0].ref,first[1].ref);assert.equal(next[1].ref,first[0].ref);
  const catalog=c.drain().filter(r=>r.type==='catalog');assert.equal(catalog.find(r=>r.data.path==='screens.0.model.items').data.coverage,'observed');
  assert.equal(catalog.find(r=>r.data.path==='screens.0.model.plain').data.coverage,'unsupported');
});

test('trial deletion releases removed cycles and preserves externally owned aliases', () => {
  const shared={x:1},child={shared};child.self=child;const items=[child],p=property(shared),c=make();
  c.registerCollection(items,items);c.model({items,p});c.frame();c.drain();items.pop();c.collectionChanged(items,items);c.frame();
  assert.equal(c.snapshot().some(e=>e.path.endsWith('.self')),false);assert.equal(c.status().activeObjects,4);
  emit(c,p,null);c.frame();assert.equal(c.status().activeObjects,3);assert.equal(c.status().complete,true);
});

test('construction notifications remain ordered before the first checkpoint', () => {
  const c=make();c.beginModel();const p=property(0);emit(c,p,1);emit(c,p,2);c.model({p});emit(c,p,3);c.frame();
  const records=c.drain();assert.deepEqual(Array.from(records.filter(r=>r.type==='property'),r=>r.data.args[0]),[1,2,3]);
  assert.ok(records.filter(r=>r.type==='property').every(r=>r.frame===0));
  records.forEach((r,i)=>{assert.equal(r.sequence,i+1);if(i)assert.ok(r.order>records[i-1].order);});
});

test('disposal during construction and repeated disposal do not leave active property metadata', () => {
  const c=make();c.beginModel();const p=property(1);c.dispose(p.tinyProperty);c.model({p});c.dispose(p.tinyProperty);c.frame();
  assert.equal(c.snapshot().some(e=>e.kind==='property'),false);assert.equal(c.drain().filter(r=>r.type==='disposed').length,1);
});

test('transport is notified by records and preserves bounded UTF-8 batches', () => {
  const c=make();let notified=0;c.onRecords(()=>notified++);c.model({label:'Δ🙂'.repeat(20),a:{x:1}});c.frame();
  assert.ok(notified>0);const records=[];
  while(c.status().queuedRecords){const chunk=c.drain(2,1800);assert.ok(chunk.length);assert.ok(new TextEncoder().encode(JSON.stringify(chunk)).length<1800);records.push(...chunk);}
  records.forEach((r,i)=>assert.equal(r.sequence,i+1));
  const prior=notified;for(let i=0;i<100;i++)c.frame();assert.equal(notified,prior);
});

test('overflow and oversized records fail explicitly without changing model behavior', () => {
  const c=make({maximumRecords:5});const p=property(0);c.model({p});for(let i=1;i<20;i++)emit(c,p,i);
  assert.equal(p.tinyProperty._value,19);assert.equal(c.status().complete,false);
  const large=make();large.model({label:'x'.repeat(10000)});large.frame();large.drain(4000,600);
  assert.equal(large.status().complete,false);
});

test('global values cannot retain retired component parents through weak-key metadata', () => {
  execFileSync(process.execPath,['--expose-gc','-e',`
    require('node:vm').runInThisContext(require('node:fs').readFileSync(0,'utf8'));
    const assert=require('node:assert/strict');const shared=global.sharedEnum={name:'shared'};
    const items=[{shared}],ref=new WeakRef(items[0]),c=PhETResearch.createCollector();
    c.registerCollection(items,items);c.model({items});c.frame();c.drain();items.pop();c.collectionChanged(items,items);c.frame();c.drain();
    setImmediate(()=>{global.gc();setImmediate(()=>{global.gc();assert.equal(ref.deref(),undefined);assert.equal(global.sharedEnum,shared);});});
  `],{input:source,windowsHide:true});
});

test('stop releases inventories, pending events and event subscribers',()=>{
  const c=make();c.model({p:property(0)});c.stop();assert.equal(c.status().activeObjects,0);assert.equal(c.status().queuedRecords,0);
  c.frame();assert.equal(c.status().activeObjects,0);
});
