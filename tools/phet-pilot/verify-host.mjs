import { launchLocalPilotBrowser, signInLocalPilot } from './local-app.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (!process.argv[2]) throw new Error('Specify the local pilot activity-ID file; only localhost:3200 is supported');
const activities = JSON.parse(await readFile(process.argv[2],'utf8'));
const browser = await launchLocalPilotBrowser();
const results = [];
const holdResearch = process.argv.includes('--hold-research');
try {
  const page = await browser.newPage({ viewport:{width:1400,height:1100} });
  const errors=[]; page.on('pageerror', error=>errors.push(error.message));
  page.on('console', message => { if (message.text().includes('[Simulation] Monitoring stopped:')) console.log(message.text()); });
  await signInLocalPilot(page);
  // Exercise the actual authoring palette and fields without saving test edits.
  await page.goto(`http://localhost:3200/sparcEdit/${activities[0].id}`);
  await page.locator('.sparc-palette-item').filter({hasText:'Simulation'}).click({timeout:60000});
  const fields=page.locator('.sparc-context-card').filter({hasText:'Approved simulation build'});
  await fields.getByLabel('Label',{exact:true}).fill('Authoring probe');
  await fields.getByLabel('Label',{exact:true}).press('Tab');
  const approved=await page.evaluate(()=>Meteor.settings.public.simulationBuilds.find(build=>build.id.startsWith('density-')).id);
  await fields.getByRole('combobox').selectOption(approved);
  const bindingText=JSON.stringify([{name:'mass',address:{path:'screens.1.model.blockA.massProperty'},projection:'value'}]);
  const bindings=fields.getByLabel('Observation bindings (JSON)',{exact:true});
  await bindings.fill(bindingText); await bindings.press('Tab');
  assert.equal(await fields.getByRole('alert').count(),0);
  await bindings.fill('{'); await bindings.press('Tab');
  await fields.getByRole('alert').waitFor();
  await bindings.fill(bindingText); await bindings.press('Tab');
  assert.equal(await fields.getByRole('alert').count(),0);
  assert.equal(await page.locator('.sparc-simulation iframe').count(),0,'Authoring preview must not start telemetry');
  const authoring={palette:true,approvedBuildSelection:true,bindingsValidation:true,previewDoesNotLaunch:true};
  // Explicitly discard only these unsaved authoring probe changes.
  page.on('dialog',dialog=>dialog.accept());
  for (const activity of activities) {
    const title=activity.label.replace(/^Edit TDF settings: /,'');
    if (process.argv[3] && !process.argv[3].startsWith('--') && !new RegExp(process.argv[3]).test(title)) continue;
    await page.goto('http://localhost:3200/home');
    const row=page.locator('tr').filter({hasText:title});
    await row.getByRole('button',{name:/^(Start|Continue)$/}).click();
    await page.getByRole('button',{name:'Start simulation',exact:true}).waitFor({timeout:60000});
    const iframe=page.locator('.sparc-simulation iframe');
    assert.ok(!await iframe.getAttribute('src') || await iframe.getAttribute('src')==='about:blank');
    await page.evaluate(holdResearch=>{
      window.pilotResearchGate = holdResearch ? new Promise(resolve=>{window.releasePilotResearch=resolve;}) : Promise.resolve();
      window.pilotIngests=[];window.pilotAttempt='';window.pilotRuleLatencies=[];window.pilotStops=[];window.pilotChildErrors=[];window.pilotActivityActions=[];
      window.pilotCheckpointTimes=new Map();window.pilotChildTimeOrigin=null;
      window.addEventListener('message',event=>{
        if(event.origin!=='http://127.0.0.1:3212'||event.source!==document.querySelector('.sparc-simulation iframe')?.contentWindow
          ||event.data?.protocol!=='phet-research'||event.data.sessionId!==window.pilotAttempt)return;
        if(event.data.kind==='error')window.pilotChildErrors.push(event.data.data);
        if(event.data.kind!=='batch')return;
        for(const record of event.data.data.records)if(record.type==='checkpoint')window.pilotCheckpointTimes.set(record.sequence,record.time);
      });
      const original=Meteor.callAsync;
      Meteor.callAsync=async function(name,...args){
        if(name==='endSimulationResearchAttempt')window.pilotStops.push(args[1]);
        if(name==='ingestSimulationResearchBatch') await window.pilotResearchGate;
        const started=performance.now();const result=await original.call(this,name,...args);
        if(name==='insertHistory'&&args[0]?.['79']?.simulationActivity?.recordRole==='activity')window.pilotActivityActions.push(args[0]['79'].simulationActivity.eventName);
        if(name==='startSimulationResearchAttempt')window.pilotAttempt=result.attemptId;
        if(name==='ingestSimulationResearchBatch')window.pilotIngests.push({sequence:result.sequence,complete:result.complete,ms:performance.now()-started});
        if(name==='insertHistory'&&window.pilotChildTimeOrigin!==null){
          // The canonical compressed history code 79 is `sparc` (Definitions.ts).
          // Only retained production-rule traces supply an instructional decision.
          const detail=args[0]?.['79']?.traceStep?.details;
          const evidence=detail?.observationEvidence;
          const checkpoint=window.pilotCheckpointTimes.get(evidence?.checkpointSequence);
          if(detail?.sourceEventType==='simulation-observation'&&evidence?.attemptId===window.pilotAttempt&&checkpoint!==undefined){
            window.pilotRuleLatencies.push({checkpointSequence:evidence.checkpointSequence,
              ruleId:args[0]['79'].traceStep.productionRuleId,
              ms:performance.timeOrigin+performance.now()-window.pilotChildTimeOrigin-checkpoint});
          }
        }
        return result;
      };
    },holdResearch);
    const releaseResearch = async text => {
      if (!holdResearch) return;
      await page.getByText(text,{exact:false}).waitFor({timeout:8000});
      assert.equal(await page.evaluate(()=>pilotIngests.length),0,'Feedback must precede the first research write');
      await page.evaluate(()=>window.releasePilotResearch());
    };
    await page.getByRole('button',{name:'Start simulation',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.sparc-simulation iframe')?.src.startsWith('http://127.0.0.1:3212'),null,{timeout:15000});
    const frame=await (await iframe.elementHandle()).contentFrame();
    await frame.waitForFunction(()=>window.phetResearchMonitor?.status().frame>5,null,{timeout:60000});
    if(!holdResearch) await page.waitForFunction(()=>window.pilotIngests.length>0,null,{timeout:15000});
    let box=await iframe.boundingBox();
    await page.mouse.click(box.x+box.width*.30,box.y+box.height*.48);
    await page.waitForTimeout(1000);
    const simulationWindow=await frame.evaluate(()=>({build:window.phetResearchBuild,started:performance.timeOrigin}));
    await page.evaluate(origin=>{window.pilotChildTimeOrigin=origin;},simulationWindow.started);
    // Meaningful activity includes failed checks, repeated hints and reset.
    await page.locator('[data-node-id="done"]').click();
    await page.getByText('Complete the simulation task before selecting Done.',{exact:false}).waitFor();
    for (let hint=0;hint<2;hint++) {
      await page.locator('[data-node-id="hint"]').click();
      await page.waitForFunction(count=>pilotActivityActions.filter(action=>action==='Request hint').length===count,hint+1);
    }
    await frame.getByRole('button',{name:/Reset All/i}).press('Space');
    await page.waitForTimeout(250);
    box=await iframe.boundingBox();
    let keyboard=false;
    if(title.startsWith('Density')) {
      // Native accessible range keyboard events exercise the actual PhET controls.
      const sliders=frame.getByRole('slider');
      const values=await sliders.evaluateAll(es=>es.map(e=>Number(e.value)));
      const volumeIndex=values.indexOf(5);
      if(volumeIndex<0) {
        console.log(JSON.stringify({visible:await iframe.isVisible(),alerts:await page.locator('.sparc-simulation [role="alert"]').allTextContents(),
          pipeline:await page.evaluate(()=>({stops:pilotStops,ingests:pilotIngests,childErrors:pilotChildErrors}))}));
        throw new Error(`Density volume slider not identified: ${values}`);
      }
      await sliders.nth(volumeIndex).press('End'); keyboard=true;
      await releaseResearch('Task complete:');
    } else if(title.startsWith('Pendulum')) {
      // The approved historical launch enables its native keyboard controls.
      await frame.getByRole('slider').first().press('End'); keyboard=true;
      await releaseResearch('Length change observed.');
      await frame.waitForFunction(()=>phet.joist.sim.screens.find(s=>s.model.pendula).model.pendula[0].lengthProperty.value===1);
      const bob=await frame.evaluate(()=>{
        const screen=phet.joist.sim.screens.find(s=>s.model.pendula);
        const transform=phet.pendulumLab.PendulumLabConstants.MODEL_VIEW_TRANSFORM;
        const point=screen.view.localToGlobalPoint(transform.modelToViewPosition(screen.model.pendula[0].positionProperty.value));
        return {x:point.x,y:point.y};
      });
      box=await iframe.boundingBox();
      await page.mouse.move(box.x+bob.x,box.y+bob.y);await page.mouse.down();
      await page.mouse.move(box.x+bob.x-200,box.y+bob.y-50,{steps:15});await page.mouse.up();
    } else {
      await page.mouse.move(box.x+box.width*.066,box.y+box.height*.106);
      await page.mouse.down();await page.mouse.move(box.x+box.width*.30,box.y+box.height*.44,{steps:15});await page.mouse.up();
      await frame.waitForFunction(()=>phet.joist.sim.screens.find(s=>s.model.circuit).model.circuit.circuitElements.length===1);
      await page.getByText('Component creation observed.',{exact:false}).waitFor({timeout:15000});
      await releaseResearch('Component creation observed.');
      // Exercise the native focusable component, as a keyboard user does.
      // The embedded historical build did not delete a canvas-only selection
      // while focus remained on BODY; that limitation is retained in the report.
      // This pinned build leaves the component label blank after Reset All.
      // Select its single native component-edit focus target by declared role.
      const componentEditor=frame.locator('[role="application"][aria-roledescription="edit options button"]');
      assert.equal(await componentEditor.count(),1);
      await componentEditor.press('Delete');
      keyboard=true;
      await frame.waitForFunction(()=>phet.joist.sim.screens.find(s=>s.model.circuit).model.circuit.circuitElements.length===0);
      await page.getByText('Component removal observed.',{exact:false}).waitFor({timeout:15000});
      await frame.evaluate(()=>{
        const c=phet.joist.sim.screens.find(s=>s.model.circuit).model.circuit;
        const V=phet.dot.Vector2;
        const a=c.vertexGroup.createNextElement(new V(300,250));
        const b=c.vertexGroup.createNextElement(new V(450,250));
        const d=c.vertexGroup.createNextElement(new V(450,400));
        c.circuitElements.push(c.batteryGroup.createNextElement(a,b));
        c.circuitElements.push(c.wireGroup.createNextElement(b,d));
        c.circuitElements.push(c.resistorGroup.createNextElement(d,a));
      });
    }
    try { await page.getByText('Task complete:',{exact:false}).waitFor({timeout:30000}); }
    catch (error) {
      console.log(JSON.stringify({diagnostic:{title,errors,feedback:await page.locator('[data-node-id="feedback"]').allTextContents(),
        host:await page.evaluate(()=>({stops:pilotStops,ingests:pilotIngests.length,childErrors:pilotChildErrors,rules:pilotRuleLatencies})),
        monitor:await frame.evaluate(()=>window.phetResearchMonitor?.status()),
        circuit:await frame.evaluate(()=>{const c=window.phet?.joist?.sim?.screens.find(s=>s.model.circuit)?.model.circuit;return c?c.circuitElements.map(e=>({type:e.constructor.name,current:e.currentProperty?.value})):null;})}}));
      throw error;
    }
    assert.deepEqual(await frame.evaluate(()=>({build:window.phetResearchBuild,started:performance.timeOrigin})),simulationWindow,'instructional updates replaced the simulation');
    const status=await frame.evaluate(()=>window.phetResearchMonitor.status());assert.equal(status.complete,true);assert.equal(status.stopped,false);
    await page.waitForFunction(()=>pilotIngests.length>0,null,{timeout:15000});
    const researchTarget=await page.evaluate(()=>Math.max(0,...window.pilotCheckpointTimes.keys()));
    await page.waitForFunction(target=>window.pilotIngests.some(batch=>batch.sequence>=target),researchTarget,{timeout:15000});
    const telemetry=await page.evaluate(async()=>{
      const result=await Meteor.callAsync('exportSimulationResearchTrace',window.pilotAttempt,0);
      return {status:result.attempt.status,lastSequence:result.attempt.lastSequence,exportedBatches:result.batches.length};
    });
    assert.ok(telemetry.lastSequence>=researchTarget,'released research must persist through the captured observation boundary');
    const ingests=await page.evaluate(()=>window.pilotIngests);assert.ok(ingests.every(x=>x.complete));
    const ruleLatencies=await page.evaluate(()=>window.pilotRuleLatencies);
    assert.ok(ruleLatencies.length>0,'No observation-linked durable production-rule trace was measured');
    assert.ok(ruleLatencies.every(sample=>Number.isFinite(sample.ms)&&sample.ms>=0),'Invalid cross-frame timing');
    const completedAttempt=await page.evaluate(()=>window.pilotAttempt);
    await page.locator('.content-surface').screenshot({path:path.join(root,'tmp/phet-pilot',`${simulationWindow.build}-host.png`)});
    await page.reload();
    await page.getByRole('button',{name:'Start simulation',exact:true}).waitFor({timeout:60000});
    const reloaded=page.locator('.sparc-simulation iframe');assert.ok(!await reloaded.getAttribute('src')||await reloaded.getAttribute('src')==='about:blank');
    const interrupted=await page.evaluate(async id=>(await Meteor.callAsync('exportSimulationResearchTrace',id,0)).attempt.status,completedAttempt);
    assert.ok(['interrupted','incomplete'].includes(interrupted),'reload must interrupt or mark unfinished research incomplete');
    await page.locator('[data-node-id="done"]').click();
    await page.getByText('Simulation activity complete.',{exact:false}).waitFor({timeout:20000});
    const result={title,buildId:simulationWindow.build,reactedBeforeResearchWrite:holdResearch,researchPersistedThrough:researchTarget,reloadedResearchStatus:interrupted,telemetry,ingestedBatches:ingests.length,p95IngestMs:ingests.map(x=>x.ms).sort((a,b)=>a-b)[Math.floor(ingests.length*.95)],
      observationToDurableRuleTrace:{samples:ruleLatencies,p95Ms:ruleLatencies.map(x=>x.ms).sort((a,b)=>a-b)[Math.floor(ruleLatencies.length*.95)]},
      keyboard,completion:true,iframePreserved:true,explicitRestartOnReload:true,completedTaskPreserved:true,status};
    results.push(result);console.log(JSON.stringify(result));
    // Preserve completed evidence even if a later browser/process is interrupted.
    await persistResults();
  }
  await persistResults();
  assert.equal(errors.length,0);
  async function persistResults() {
  const resultPath=path.join(root,'tmp/phet-pilot/host-acceptance.json');
  let previous=[];
  try { previous=JSON.parse(await readFile(resultPath,'utf8')).results; } catch(error) { if(error.code!=='ENOENT') throw error; }
  const combined=[...previous.filter(old=>!results.some(current=>current.title===old.title)),...results];
  await writeFile(resultPath,JSON.stringify({browser:browser.version(),authoring,results:combined,errors,
    limitations:['Closed-circuit setup uses public model APIs. Representative native pointer/keyboard controls are tested separately; this is not a complete accessibility audit.',
      'Embedded CCK Delete works with native component keyboard focus. A canvas-only selection with BODY focus did not respond to Delete in this browser.',
      'Observation-to-durable-rule-trace latency includes transport, rule execution and the saved decision trace; research ingestion is independent; it uses iframe and host performance.timeOrigin clocks.',
      'Only the authored demonstration rule firings are timed; sample counts are small and do not establish sustained-load latency.']},null,2)+'\n');
  }
} finally { await browser.close(); }
