import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Authored lesson content only. Collection machinery never imports these rules.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = process.argv[2];
if (!output || !path.isAbsolute(output)) throw new Error('Specify the absolute canonical lesson directory');
const require = createRequire(path.join(root, 'mofacts/package.json'));
const JSZip = require('jszip');
const hash = value => createHash('sha256').update(value).digest('hex');
const collectorHash = hash(await readFile(path.join(root, 'packages/phet-monitor/collector.js')));
const bridgeHash = hash(await readFile(path.join(root, 'packages/phet-monitor/bridge.js')));
const literal = value => ({ type: 'literal', value });
const variable = name => ({ type: 'variable', name });
const bind = variable => ({ type: 'bind', variable });
const test = (op, left, right) => ({ op, left: variable(left), right: literal(right) });
const observed = slots => ({ factType: 'interface-event', slots: { eventType: literal('simulation-observation'), ...slots } });
const state = (key, value) => ({ factType: 'interface-state', slots: { node: literal('simulation'), key: literal(key), value } });
const absent = key => ({ type: 'not', pattern: state(key, literal(true)) });
const variableDescriptions = {
  mass: { label: 'Block mass', unit: 'kg' }, volume: { label: 'Block volume', unit: 'm³' },
  length: { label: 'Pendulum length', unit: 'm' }, angle: { label: 'Pendulum angle', unit: 'rad' },
  componentCount: { label: 'Component count', unit: 'count' }, conducting: { label: 'Conducting circuit', unit: 'boolean' },
};
const describeVariable = name => {
  if (!variableDescriptions[name]) throw new Error('Missing authored variable description: ' + name);
  return variableDescriptions[name];
};
const specifications = [
  { simulation: 'density', title: 'Density: mass and volume', instructions: 'Open Intro. Keep the wood material and increase the block volume above 5 liters. Observe how mass changes while density remains 400 kg per cubic meter.',
    bindings: [['mass', 'blockA.massProperty'], ['volume', 'blockA.volumeProperty']],
    stages: [{ id: 'relationship', when: [observed({ mass: bind('mass'), volume: bind('volume') }), absent('completed')],
      tests: [test('gt', 'volume', 0.0055), ...['gt', 'lt'].map((op, index) => ({ op, left: { type: 'function', name: 'subtract', args: [variable('mass'), { type: 'function', name: 'multiply', args: [literal(400), variable('volume')] }] }, right: literal(index ? 0.001 : -0.001) }))],
      complete: true, message: 'Task complete: mass increased with volume, and mass / volume is still 400 kg/m³.' }] },
  { simulation: 'pendulum-lab', title: 'Pendulum: length and oscillation', instructions: 'Open Intro. Increase the first pendulum length to at least 0.75 m, then drag and release its bob. We will detect the length change and a subsequent left–right–left oscillation. This observes angular crossings; it does not estimate an exact period.',
    bindings: [['length', 'pendula.0.lengthProperty'], ['angle', 'pendula.0.angleProperty']],
    stages: [
      { id: 'lengthChanged', when: [observed({ length: bind('length') }), absent('lengthChanged')], tests: [test('gte', 'length', 0.75)], message: 'Length change observed. Release the bob and let it swing across the center.' },
      { id: 'leftSeen', when: [observed({ angle: bind('angle') }), state('lengthChanged', literal(true)), absent('leftSeen')], tests: [test('lt', 'angle', -0.05)], message: 'First side observed. Keep the pendulum moving.' },
      { id: 'rightSeen', when: [observed({ angle: bind('angle') }), state('leftSeen', literal(true)), absent('rightSeen')], tests: [test('gt', 'angle', 0.05)], message: 'Opposite side observed. One more crossing completes the oscillation check.' },
      { id: 'oscillation', when: [observed({ angle: bind('angle') }), state('rightSeen', literal(true)), absent('completed')], tests: [test('lt', 'angle', -0.05)], complete: true, message: 'Task complete: the length changed and the bob subsequently crossed to both sides and returned.' },
    ] },
  { simulation: 'circuit-construction-kit-dc', title: 'Circuit: components and conduction', instructions: 'Open Intro. Add a wire, then reset or remove it. Next build a closed circuit using a battery, wires, and a resistor or bulb. The activity checks creation, removal, and nonzero simulated current.',
    bindings: [['componentCount', 'circuit.circuitElements', 'count'], ['conducting', 'circuit.circuitElements', 'any-nonzero', 'currentProperty']],
    stages: [
      { id: 'created', when: [observed({ componentCount: bind('count') }), absent('created')], tests: [test('gt', 'count', 0)], message: 'Component creation observed. Remove it or reset before building the conducting circuit.' },
      { id: 'removed', when: [observed({ componentCount: literal(0) }), state('created', literal(true)), absent('removed')], message: 'Component removal observed. Now connect a battery and a resistor or bulb in a closed circuit.' },
      { id: 'circuit', when: [observed({ conducting: literal(true) }), state('removed', literal(true)), absent('completed')], complete: true, message: 'Task complete: components were created and removed, and the circuit now carries nonzero simulated current.' },
    ] },
];
await mkdir(output, { recursive: true });
const zip = new JSZip();
for (const spec of specifications) {
  const build = JSON.parse(await readFile(path.join(root, 'tmp/phet-pilot', spec.simulation, 'monitored/monitored-build-result.json'), 'utf8'));
  if (build.status !== 'built' || build.collectorHash !== collectorHash || build.bridgeHash !== bridgeHash) throw new Error(`Build ${spec.simulation} with current shared sources first`);
  const pageKey = `phet-${spec.simulation}`;
  const target = nodeId => ({ pageKey, nodeId });
  const write = (key, value) => ({ type: 'write-state', write: { target: target('simulation'), key, value: literal(value) } });
  const message = (text, messageType = 'hint') => ({ type: 'message', messageType, template: text, target: target('feedback') });
  const history = (selection, action, input, outcome = 'unknown', endsAttempt = false) => ({ type: 'history-event', selection: literal(selection), action: literal(action), input, outcome: literal(outcome), ...(endsAttempt ? { endsAttempt: true } : {}) });
  const rules = spec.stages.map(stage => ({ id: `${pageKey}.${stage.id}`, when: stage.when, tests: stage.tests || [], then: [write(stage.complete ? 'completed' : stage.id, true), message(stage.message, stage.complete ? 'success' : 'hint'), history(spec.title, stage.complete ? 'Check' : 'Observe task condition', stage.message, stage.complete ? 'correct' : 'unknown')] }));
  const button = selection => ({ factType: 'interface-event', slots: { selection: literal(selection), action: literal('ButtonPressed') } });
  rules.push({ id: `${pageKey}.hint`, when: [button('hint')], then: [message(spec.instructions), history('Hint button', 'Request hint', 'hint')] });
  rules.push({ id: `${pageKey}.done`, when: [button('done'), state('completed', literal(true))], then: [{ type: 'classify', outcome: 'correct' }, history(spec.title, 'Complete', 'Authored task complete', 'unknown', true)] });
  rules.push({ id: `${pageKey}.not-done`, when: [button('done'), absent('completed')], then: [message('Complete the simulation task before selecting Done.'), history(spec.title, 'Check', 'Task conditions not satisfied', 'incorrect')] });
  for (const [name, , projection = 'value'] of spec.bindings) if (projection === 'value') {
    const description = describeVariable(name);
    rules.push({ id: pageKey + '.interaction.' + name,
      when: [observed({ simulationEvent: literal('interaction-completed'), interactionBinding: literal(name),
        [name]: bind(name), ['previous_' + name]: bind('previous_' + name) })],
      tests: [{ op: 'neq', left: variable(name), right: variable('previous_' + name) }],
      then: [history(description.label, 'Adjust ' + name, description.label + ' {previous_' + name + '} → {' + name + '} ' + description.unit)] });
  }
  for (const [signal, action] of [['interaction-cancelled', 'Cancel adjustment'], ['reset', 'Reset'], ['collection-added', 'Component added'], ['collection-removed', 'Component removed']]) {
    rules.push({ id: pageKey + '.activity.' + signal, when: [observed({ simulationEvent: literal(signal), changeCount: bind('count') })],
      then: [history(spec.title, action, signal.startsWith('collection-') ? '{count} component(s)' : action),
        ...(signal === 'reset' && spec.simulation === 'pendulum-lab' ? spec.stages.filter(stage => !stage.complete).map(stage => write(stage.id, false)) : [])] });
  }
  if (spec.simulation === 'circuit-construction-kit-dc') {
    rules.push({ id: pageKey + '.conducting.start', when: [observed({ simulationEvent: literal('observation'), conducting: literal(true) }), absent('conductingRecorded')],
      then: [write('conductingRecorded', true), history(spec.title, 'Conducting circuit established', 'Nonzero simulated current')] });
    rules.push({ id: pageKey + '.conducting.stop', when: [observed({ simulationEvent: literal('observation'), conducting: literal(false) }), state('conductingRecorded', literal(true))],
      then: [write('conductingRecorded', false), history(spec.title, 'Circuit stopped conducting', 'No conducting path')] });
  }
  const display = { type: 'sparc', schema: 'tutorscript-sparc/2.0', nodes: [
    { id: 'instructions', nodeType: 'atomic', atomType: 'text-block', value: spec.instructions },
    { id: 'simulation', nodeType: 'atomic', atomType: 'simulation', label: spec.title, simulation: { buildId: build.identity,
      bindings: spec.bindings.map(([name, address, projection = 'value', memberProperty]) => ({ name, ...describeVariable(name), address: { path: `screens.1.model.${address}` }, projection, ...(memberProperty ? { memberProperty } : {}) })) } },
    { id: 'feedback', nodeType: 'atomic', atomType: 'message-box', value: 'Start a fresh simulation attempt when ready.' },
    { id: 'hint', nodeType: 'atomic', atomType: 'button', value: 'Hint', label: 'Hint' },
    { id: 'done', nodeType: 'atomic', atomType: 'button', value: 'Done', label: 'Done' },
  ], productionRules: rules, clusterTargets: [{ clusterIndex: 0, label: spec.title, stimulusKC: pageKey, clusterKC: pageKey }],
  response: { completion: { type: 'path-complete', doneSelection: 'done', doneAction: 'ButtonPressed' } } };
  const stimulusName = `${pageKey}_stims.json`;
  const tdf = { tutor: { setspec: { lessonname: spec.title, stimulusfile: stimulusName, userselect: 'true', lfparameter: '0.85', shuffleclusters: '0', contentLanguage: 'en' },
    unit: [{ unitname: spec.title, sparcsession: { clusterlist: '0', unitMode: 'distance', pageId: pageKey, calculateProbability: 'p.probability = 0.5; return p;' } },
      { unitname: 'Complete', unitinstructions: '<p>Simulation activity complete. Your recorded task progress is preserved.</p>' }] } };
  const stimuli = { setspec: { lessonname: spec.title, clusters: [{ clusterid: 0, clustername: pageKey, clusterKC: pageKey, stims: [{ stimulusid: 0, stimulusKC: pageKey, clusterKC: pageKey, textStimulus: spec.title, response: { correctResponse: '__SPARC_COMPLETED__' } }] }], sparcPages: [{ pageId: pageKey, display }] } };
  for (const [name, data] of [[`${pageKey}_TDF.json`, tdf], [stimulusName, stimuli]]) {
    const text = JSON.stringify(data, null, 2) + '\n'; await writeFile(path.join(output, name), text); zip.file(name, text);
  }
}
await writeFile(path.join(path.dirname(output), 'SPARC PhET Pilot.zip'), await zip.generateAsync({ type: 'nodebuffer' }));
console.log(`Wrote three pinned activities to ${output}`);
