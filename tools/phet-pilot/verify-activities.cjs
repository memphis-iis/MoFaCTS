require('../../mofacts/scripts/registerHistoryTypescript.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { sparcTrialDisplayAdapter } = require('../../learning-components/trial-displays/sparc/SparcTrialDisplayAdapter.ts');
const { createSparcAuthoredDocumentFromTrialDisplay, evaluateSparcTrialDisplayProductionRuleEvents } = require('../../learning-components/units/sparcsession/sparcTrialDisplayRuntimeBridge.ts');
const { createSparcAuthoredInitialReplayState } = require('../../learning-components/units/sparcsession/sparcAuthoredInitialState.ts');
const { applySparcStateTransition, createSparcStateCellKey } = require('../../learning-components/units/sparcsession/sparcStateReplay.ts');
const { createSparcProductionRuleTraceHistoryRecords } = require('../../learning-components/units/sparcsession/sparcProductionRuleTraceHistory.ts');
const { SPARC_ATOMIC_NODE_CATALOG } = require('../../learning-components/units/sparcsession/sparcAuthoringCatalog.ts');
const starter = SPARC_ATOMIC_NODE_CATALOG.find(entry => entry.schema.properties.atomType.const === 'simulation').defaultValue;
assert.doesNotThrow(() => sparcTrialDisplayAdapter.normalizeDisplay({ type: 'sparc', nodes: [{ ...starter, id: 'starter-simulation' }] }),
  'The authoring palette starter must render before a build/address is selected');
const examples = {
  density: [{ mass: 2, volume: 0.005 }, { mass: 2.4, volume: 0.006 }],
  'pendulum-lab': [{ length: 0.7, angle: 0 }, { length: 0.8, angle: 0 }, { length: 0.8, angle: -0.2 }, { length: 0.8, angle: 0.2 }, { length: 0.8, angle: -0.2 }],
  'circuit-construction-kit-dc': [{ componentCount: 0, conducting: false }, { componentCount: 1, conducting: false }, { componentCount: 0, conducting: false }, { componentCount: 3, conducting: true }],
};
for (const [simulation, facts] of Object.entries(examples)) {
  const pageKey = `phet-${simulation}`;
  const stimuli = JSON.parse(fs.readFileSync(path.join(process.argv[2], `${pageKey}_stims.json`)));
  const display = sparcTrialDisplayAdapter.normalizeDisplay(stimuli.setspec.sparcPages[0].display);
  const document = createSparcAuthoredDocumentFromTrialDisplay({ pageKey, display });
  let replayState = createSparcAuthoredInitialReplayState(document);
  let sequence = 1;
  let transitions = 0;
  const observe = values => {
    const evidence = { buildId: display.nodes.find(n => n.id === 'simulation').simulation.buildId, attemptId: 'synthetic-contract-attempt', firstSequence: sequence, lastSequence: sequence, checkpointSequence: sequence, sourceSequence: sequence++ };
    const result = evaluateSparcTrialDisplayProductionRuleEvents({ pageKey, display, document, replayState, priorHistoryRecords: [], result: { eventType: 'simulation-observation', submittedNodes: { simulation: { facts: values, evidence, activity: { version:1,recordRole:'internal',buildId:evidence.buildId,attemptId:evidence.attemptId,sourceEventId:'contract:'+sequence,origin:'observation',eventName:'observation',values:{},evidence } } }, timestamp: sequence } });
    for (const evaluation of result.evaluations) if (evaluation.transition) { replayState = applySparcStateTransition(replayState, evaluation.transition); transitions++; }
    assert.deepEqual(result.classifications, []); assert.deepEqual(result.credits, []);
    for (const evaluation of result.evaluations) {
      const traces = createSparcProductionRuleTraceHistoryRecords({ core:{ TDFId:'synthetic-tdf', sessionID:'synthetic-session', userId:'synthetic-learner', levelUnit:0 }, document, event:result.events[0], execution:evaluation.execution });
      for (const trace of traces) assert.deepEqual(trace.sparc.traceStep.details.observationEvidence, evidence);
    }
  };
  observe(facts[0]);
  assert.equal(replayState.cells[createSparcStateCellKey({ pageKey, nodeId:'simulation' }, 'completed')], undefined);
  facts.slice(1).forEach(observe);
  assert.equal(replayState.cells[createSparcStateCellKey({ pageKey, nodeId:'simulation' }, 'completed')].value, true);
  const before = transitions; observe(facts.at(-1)); assert.equal(transitions, before, 'completed task must not repeat');
  console.log(`${simulation}: authored stages, completion, no raw answer/KC updates, repeated completion guard passed`);
}
