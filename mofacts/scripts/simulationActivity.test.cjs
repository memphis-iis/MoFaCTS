require('./registerHistoryTypescript.cjs');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {SimulationActivityProjector}=require('../../packages/phet-monitor/activity.ts');
const {ObservedState}=require('../../packages/phet-monitor/protocol.ts');
const {evaluateSparcProductionRules,compileSparcProductionRulePlan,runSparcProductionRules}=require('../../learning-components/units/sparcsession/sparcProductionRuleEvaluator.ts');
const {createSparcProductionRuleTraceHistoryRecords}=require('../../learning-components/units/sparcsession/sparcProductionRuleTraceHistory.ts');
const {writeHistoryExport}=require('../server/lib/historyExport.ts');
const {compressHistoryRecord,decompressHistoryRecord}=require('../common/historyCompression.ts');
const {sparcHistoryWriteId}=require('../server/lib/sparcHistoryWrite.ts');
const {simulationLifecycleHistory}=require('../../learning-components/runtime/simulationLifecycleHistory.ts');
const {resumeSimulationHostAction}=require('../../learning-components/runtime/simulationActivityHistory.ts');
const literal=value=>({type:'literal',value});
const scope={tdfId:'lesson',pageKey:'page',nodeId:'simulation',buildId:'build',history:{sessionID:'session',levelUnit:0}};
const context={version:1,recordRole:'internal',buildId:'build',attemptId:'attempt',sourceEventId:'attempt:3:observation',origin:'observation',eventName:'observation',values:{mass:{before:null,value:2.4,label:'Wood  mass',unit:'kg'}}};
const event={eventId:'source',type:'simulation-observation',source:{pageKey:'page',nodeId:'simulation'},time:5,payload:{simulationActivity:context}};
const rule={id:'relationship',when:[{factType:'signal'}],then:[{type:'history-event',selection:literal('Wood block'),action:literal('Volume changed'),input:literal('5 → 6 L')}]};
const firing=()=>evaluateSparcProductionRules({facts:[{factType:'signal',factId:'signal'}],rules:[rule]});
const history=()=>createSparcProductionRuleTraceHistoryRecords({core:{TDFId:'lesson',userId:'learner',sessionID:'session',levelUnit:0},document:{productionRules:[rule]},event,execution:{firings:firing()}})[0];

test('history effects produce semantic rows with unknown outcome and no automatic credit',()=>{
 const f=firing()[0];assert.equal(f.historyEvent.outcome,'unknown');assert.deepEqual(f.credits,[]);assert.deepEqual(f.classifications,[]);assert.deepEqual(f.modelPracticeObservations,[]);
 const execution=runSparcProductionRules({facts:[{factType:'signal',factId:'signal'}],rules:[rule]});
 assert.deepEqual(execution.firings[0].historyEvent,f.historyEvent,'The live executor must preserve history while merging effects');
 const row=history();assert.equal(row.action,'Volume changed');assert.equal(row.input,'5 → 6 L');assert.equal(row.sparc.simulationActivity.recordRole,'activity');
 assert.equal(sparcHistoryWriteId(row),sparcHistoryWriteId(structuredClone(row)));
 assert.notEqual(sparcHistoryWriteId(row),sparcHistoryWriteId({...row,sparc:{...row.sparc,simulationActivity:{...row.sparc.simulationActivity,sourceEventId:'new'}}}));
 assert.throws(()=>compileSparcProductionRulePlan([{...rule,then:[...rule.then,...rule.then]}]),/multiple history/);
 assert.throws(()=>evaluateSparcProductionRules({facts:[{factType:'signal',factId:'s'}],rules:[{...rule,then:[{...rule.then[0],input:literal('x'.repeat(256))}]}]}),/oversized/);
});

test('normal TSV retains exact bounded JSON and selected nulls while excluding internal simulation rows',async()=>{
 const row=history();const roundtrip=decompressHistoryRecord(compressHistoryRecord(row));assert.deepEqual(roundtrip.sparc.simulationActivity,row.sparc.simulationActivity);
 const internal={...row,sparc:{...row.sparc,simulationActivity:{...row.sparc.simulationActivity,recordRole:'internal'}}};
 const old={...row};delete old.sparc;old.action='old action';
 let text='';await writeHistoryExport([internal,roundtrip,old],chunk=>{text+=chunk;},error=>{throw error;});
 const lines=text.trimEnd().split('\n').map(line=>line.split('\t'));assert.equal(lines.length,3);
 const index=lines[0].indexOf('CF (Simulation Activity)');assert.equal(index,lines[0].length-1);
 assert.deepEqual(JSON.parse(lines[1][index]),row.sparc.simulationActivity);assert.equal(JSON.parse(lines[1][index]).values.mass.before,null);
 assert.equal(lines[1][lines[0].indexOf('Action')],'Volume changed');assert.equal(lines[2][index]??'','');
});

test('lifecycle rows preserve recorded times and never manufacture selected initial values',()=>{
 const row=simulationLifecycleHistory('learner',scope,'attempt','Interrupted',10,20,'left-node');
 assert.equal(row.time,20);assert.equal(row.problemStartTime,10);assert.deepEqual(row.sparc.simulationActivity.values,{});assert.equal(row.outcome,'unknown');
 assert.equal(sparcHistoryWriteId(row),sparcHistoryWriteId(structuredClone(row)));
});

test('history input uses existing bound-variable template syntax and rejects missing bindings',()=>{
 const template={...rule,when:[{factType:'signal',slots:{volume:{type:'bind',variable:'volume'}}}],then:[{...rule.then[0],input:'Volume {volume} m³'}]};
 const output=evaluateSparcProductionRules({facts:[{factId:'s',factType:'signal',slots:{volume:.006}}],rules:[template]});assert.equal(output[0].historyEvent.input,'Volume 0.006 m³');
 assert.throws(()=>evaluateSparcProductionRules({facts:[{factId:'s',factType:'signal'}],rules:[{...rule,then:[{...rule.then[0],input:'Value {missing}'}]}]}),/Unbound history/);
});

test('projected control events preserve intermediate research records but emit one completed interaction',()=>{
 const stream=new ObservedState(),projector=new SimulationActivityProjector([{name:'mass',address:{path:'mass'},projection:'value',label:'Mass',unit:'kg'}],'build','attempt');let seq=0;
 const r=(type,data)=>({sequence:++seq,order:seq,time:seq,frame:1,type,data});
 const run=(...records)=>projector.apply(stream,{firstSequence:records[0].sequence,lastSequence:records.at(-1).sequence,records});
 run(r('catalog',{id:'p',path:'mass',kind:'property',coverage:'observed'}),r('initial',{id:'p',state:{value:2}}),r('checkpoint',{evidenceComplete:true}));
 const input={controlId:'control',kind:'value',propertyId:'p',modality:'pointer',trusted:true,before:2};
 let rows=run(r('interaction',{...input,phase:'start',value:2}),r('property',{id:'p',args:[3]}),r('checkpoint',{evidenceComplete:true}));
 assert.equal(rows.some(o=>o.facts.simulationEvent==='interaction-completed'),false);
 rows=run(r('property',{id:'p',args:[4]}),r('interaction',{...input,phase:'complete',value:4}),r('checkpoint',{evidenceComplete:true}));
 const done=rows.filter(o=>o.facts.simulationEvent==='interaction-completed');assert.equal(done.length,1);assert.equal(done[0].activity.origin,'input');assert.equal(done[0].activity.values.mass.before,2);assert.equal(done[0].activity.values.mass.value,4);
 assert.equal(run(r('checkpoint',{evidenceComplete:true})).length,0);
});

test('linked control units and transient collection identities survive event projection; reset suppresses removal noise',()=>{
 const stream=new ObservedState(),projector=new SimulationActivityProjector([
  {name:'volume',address:{path:'volume'},projection:'value',unit:'m³'},
  {name:'count',address:{path:'elements'},projection:'count'}],'build','attempt');let seq=0;
 const r=(type,data)=>({sequence:++seq,order:seq,time:seq,frame:1,type,data});
 const run=(...records)=>projector.apply(stream,{firstSequence:records[0].sequence,lastSequence:records.at(-1).sequence,records});
 run(r('catalog',{id:'p',path:'volume',kind:'property',coverage:'observed'}),r('initial',{id:'p',state:{value:.005}}),
  r('catalog',{id:'c',path:'elements',kind:'collection',coverage:'observed'}),r('initial',{id:'c',state:{fields:{length:0}}}),r('checkpoint',{evidenceComplete:true}));
 const input={controlId:'slider',kind:'value',propertyId:'adapter',modality:'keyboard',trusted:true};
 let output=run(r('interaction',{...input,phase:'start',before:5,value:5}),r('property',{id:'p',args:[.006]}),
  r('interaction',{...input,phase:'complete',before:5,value:6,properties:[{id:'p',before:.005,value:.006}]}),r('checkpoint',{evidenceComplete:true}));
 const changed=output.find(o=>o.facts.simulationEvent==='interaction-completed');assert.equal(changed.facts.interactionBinding,'volume');assert.deepEqual(changed.activity.values.volume,{before:.005,value:.006,label:'volume',unit:'m³'});
 const collection=fields=>r('sample',{id:'c',trigger:'collection-mutation',state:{fields}});
 output=run(collection({length:1,0:{ref:'dynamic-a'}}),collection({length:0}),r('checkpoint',{evidenceComplete:true}));
 const events=output.filter(o=>o.facts.simulationEvent.startsWith('collection-'));assert.deepEqual(events.map(o=>o.facts.simulationEvent),['collection-added','collection-removed']);assert.deepEqual(events[0].activity.values.members,['dynamic-a']);assert.equal(events[0].activity.values.countAfter,1);
 run(collection({length:1,0:{ref:'dynamic-b'}}),r('checkpoint',{evidenceComplete:true}));
 const reset={controlId:'reset',kind:'reset',propertyId:null,modality:'programmatic',trusted:false};
 output=run(r('interaction',{...reset,phase:'start'}),collection({length:0}),r('interaction',{...reset,phase:'complete'}),r('checkpoint',{evidenceComplete:true}));
 assert.deepEqual(output.map(o=>o.facts.simulationEvent),['reset']);assert.equal(output[0].activity.origin,'observation');
});

test('host actions after reload use recorded evidence without claiming restored state or repeated completion',()=>{
 const resumed=resumeSimulationHostAction('build',[context,{...context,completed:true,values:{mass:{value:4}}},
  {...context,origin:'lifecycle',eventName:'Interrupted',values:{}}],'fresh-action');
 assert.equal(resumed.origin,'input');assert.equal(resumed.sourceEventId,'fresh-action');assert.equal(resumed.completed,undefined);
 assert.equal(resumed.reason,'last-recorded-state-after-reload');assert.deepEqual(resumed.values,{mass:{value:4}});
 assert.equal(resumeSimulationHostAction('another-build',[context],'fresh'),undefined);
});
