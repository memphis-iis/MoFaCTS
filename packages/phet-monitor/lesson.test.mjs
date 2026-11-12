import test from 'node:test';
import assert from 'node:assert/strict';
import { ObservedState } from './protocol.ts';
import { validateSimulationConfig, projectSimulationBindings } from './lesson.ts';

function catalog(stream, id, data, type = 'catalog') {
  const sequence = stream.lastSequence + 1;
  stream.apply({ firstSequence: sequence, lastSequence: sequence, records: [{ sequence, order: sequence, frame: 0, time: sequence, type, data: { id, ...data } }] });
}

test('bindings reject ambiguous addresses and reserved event slots',()=>{
  const binding={name:'mass',address:{path:'model.mass'},projection:'value'};
  assert.doesNotThrow(()=>validateSimulationConfig({buildId:'pinned-build',bindings:[binding]}));
  for(const bad of [{...binding,name:'evidence'}, {...binding,name:'simulationActivity'}, {...binding,address:{path:'x',tandem:'y'}}, {...binding,projection:'execute'}]) {
    assert.throws(()=>validateSimulationConfig({buildId:'pinned-build',bindings:[bad]}));
  }
});
test('dynamic collection projection follows object references after reordering',()=>{
  const stream=new ObservedState();
  catalog(stream,'list',{path:'model.elements',coverage:'observed'});
  catalog(stream,'pa',{coverage:'observed'});catalog(stream,'pb',{coverage:'observed'});
  stream.states.set('list',{fields:{length:2,0:{ref:'a'},1:{ref:'b'}}});
  stream.states.set('a',{fields:{currentProperty:{ref:'pa'}}});
  stream.states.set('b',{fields:{currentProperty:{ref:'pb'}}});
  stream.states.set('pa',{value:0});stream.states.set('pb',{value:.9});
  const bindings=[{name:'count',address:{path:'model.elements'},projection:'count'},
    {name:'conducting',address:{path:'model.elements'},projection:'any-nonzero',memberProperty:'currentProperty'}];
  assert.deepEqual({...projectSimulationBindings(stream,bindings)},{count:2,conducting:true});
  stream.states.set('list',{fields:{length:1,0:{ref:'b'}}});
  assert.deepEqual({...projectSimulationBindings(stream,bindings)},{count:1,conducting:true});
  catalog(stream,'pb',{coverage:'unsupported'});
  assert.throws(()=>projectSimulationBindings(stream,bindings),/unsupported change coverage/);
  catalog(stream,'pb',{coverage:'observed'});
  stream.states.delete('pb');assert.throws(()=>projectSimulationBindings(stream,bindings),/missing or disposed/);
});
test('unsupported, ambiguous and incomplete evidence cannot produce lesson facts',()=>{
  const stream=new ObservedState();const bindings=[{name:'mass',address:{path:'model.mass'},projection:'value'}];
  assert.throws(()=>projectSimulationBindings(stream,bindings),/missing or ambiguous/);
  catalog(stream,'p',{path:'model.mass',coverage:'observed'});stream.states.set('p',{value:{unsupported:'function'}});
  assert.throws(()=>projectSimulationBindings(stream,bindings),/unsupported/);
  stream.states.set('p',{value:3});catalog(stream,'q',{path:'model.mass',coverage:'observed'});
  assert.throws(()=>projectSimulationBindings(stream,bindings),/ambiguous/);
  catalog(stream,'q',{},'detached');stream.complete=false;
  assert.throws(()=>projectSimulationBindings(stream,bindings),/incomplete/);
});

test('initial-only and historical sampled addresses cannot be used as observed lesson values',()=>{
  for (const coverage of ['unsupported','sampled',undefined]) {
    const stream=new ObservedState();catalog(stream,'p',{path:'model.mass',coverage});stream.states.set('p',{value:3});
    assert.throws(()=>projectSimulationBindings(stream,[{name:'mass',address:{path:'model.mass'},projection:'value'}]),/unsupported/);
  }
});
