import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { archiveBuild } from './archive-build.mjs';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const acquisition = JSON.parse(await readFile(path.join(root, 'tmp/phet-pilot/acquisition.json'), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('./releases.json', import.meta.url), 'utf8'));
const collector = await readFile(path.join(root, 'packages/phet-monitor/collector.js'), 'utf8');
const bridge = await readFile(path.join(root, 'packages/phet-monitor/bridge.js'), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const exists = async name => { try { await access(name); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
const normalize = value => value.replace(/\r\n/g, '\n');
for (const pilot of manifest.pilots.filter(p => !process.argv[2] || p.simulation === process.argv[2])) {
  const evidence = JSON.parse(await readFile(path.join(root, 'tmp/phet-pilot', pilot.simulation, 'baseline/baseline-build.json'), 'utf8'));
  if (!evidence.status.startsWith('built-')) throw new Error(`Baseline not built: ${pilot.simulation}`);
  const smoke = JSON.parse(await readFile(path.join(root, 'tmp/phet-pilot', pilot.simulation, 'baseline-smoke.json'), 'utf8'));
  if (smoke.status !== 'launch-verified') throw new Error(`Baseline not launched: ${pilot.simulation}`);
  const workspace = path.join(root, 'tmp/phet-pilot', pilot.simulation, 'monitored');
  await mkdir(workspace, { recursive: true });
  const prior = await exists(path.join(workspace, 'monitor-build.json'))
    ? JSON.parse(await readFile(path.join(workspace, 'monitor-build.json'), 'utf8')) : null;
  await archiveBuild(workspace, pilot, prior);
  const sources = acquisition.results.filter(entry => entry.simulation === pilot.simulation);
  for (const source of sources) {
    if (source.status !== 'source-retrieved') throw new Error(`Missing source ${source.name}`);
    const target = path.join(workspace, source.name);
    if (!await exists(target)) {
      await exec('git', ['clone', '--quiet', '--shared', '--no-checkout', source.directory, target], { windowsHide: true });
      await exec('git', ['checkout', '--quiet', '--detach', source.sha], { cwd: target, windowsHide: true });
    }
    const head = (await exec('git', ['rev-parse', 'HEAD'], { cwd: target, windowsHide: true })).stdout.trim();
    if (head !== source.sha) throw new Error(`Monitored revision mismatch: ${target}`);
  }
  const changes = [];
  async function change(relative, transform) {
    const [repo, ...parts] = relative.split('/');
    const original = normalize((await exec('git', ['show', `HEAD:${parts.join('/')}`], { cwd: path.join(workspace, repo), windowsHide: true, maxBuffer: 8 * 1024 * 1024 })).stdout);
    const expected = transform(original);
    const filename = path.join(workspace, relative);
    const actual = normalize(await readFile(filename, 'utf8'));
    const priorChange = prior?.changes.find(entry => entry.path === relative);
    if (actual !== original && actual !== expected && hash(actual) !== priorChange?.modified) throw new Error(`Unexpected monitored edit: ${relative}`);
    await writeFile(filename, expected);
    changes.push({ path: relative, original: hash(original), modified: hash(expected) });
  }
  function replaceOnce(source, before, after) {
    if (source.split(before).length !== 2) throw new Error(`Unsupported shared infrastructure revision: ${before}`);
    return source.replace(before, after);
  }
  if (pilot.simulation !== 'pendulum-lab') {
    await change(`${pilot.simulation}/package.json`, text => replaceOnce(text,
      '"phet-io"\n    ]', '"phet-io",\n      "adapted-from-phet"\n    ]'));
  }
  await change('chipper/build.json', text => {
    const config = JSON.parse(text);
    config.common.preload.push('../chipper/js/research-collector.js', '../chipper/js/research-bootstrap.js', '../chipper/js/research-bridge.js');
    return JSON.stringify(config, null, 2) + '\n';
  });
  const oldFramework = !await exists(path.join(workspace, 'axon/js/TinyEmitter.ts'));
  // Compatibility is by framework generation. No simulation model file is patched.
  const screen = `joist/js/Screen.${oldFramework ? 'js' : 'ts'}`;
  await change(screen, text => replaceOnce(text, 'this._model = this.createModel();',
    'window.phetResearchMonitor.beginModel();\n      this._model = this.createModel();\n      window.phetResearchMonitor.model( this._model );'));
  const sim = `joist/js/Sim.${oldFramework ? 'js' : 'ts'}`;
  await change(sim, text => {
    const anchor = oldFramework ? 'this.frameEndedEmitter.emit1( dt );' : 'this.frameEndedEmitter.emit();';
    return replaceOnce(text, anchor, anchor + '\n      window.phetResearchMonitor.frame();');
  });
  if (oldFramework) {
    await change('axon/js/Emitter.js', text => {
      for (const [method, args] of [['emit', ''], ['emit1', ' arg1 '], ['emit2', ' arg1, arg2 '], ['emit3', ' arg1, arg2, arg3 ']]) {
        const signature = `${method}: function(${args}) {`;
        const values = method === 'emit' ? 'Array.prototype.slice.call( arguments )' : `[${args}]`;
        text = replaceOnce(text, signature, signature + `\n window.phetResearchMonitor.emit( this, ${values} );`);
      }
      return replaceOnce(text, 'dispose: function() {', 'dispose: function() {\n window.phetResearchMonitor.dispose( this );');
    });
    await change('axon/js/Property.js', text => replaceOnce(text, 'dispose: function() {',
      'dispose: function() {\n window.phetResearchMonitor.dispose( this.changedEmitter );'));
    await change('axon/js/ObservableArray.js', text => {
      const registration = 'this._array = array || [];';
      text = replaceOnce(text, registration, registration + '\n window.phetResearchMonitor.registerCollection( this, this._array );');
      // These are the pinned shared class's backing-array write statements.
      const mutations = [ 'this._array = this.initialArray.slice();', 'this._array.splice( index, 1 );',
        'this._array.push( item );', 'var item = this._array.pop();', 'var item = this._array.shift();',
        'var deleted = this._array.splice.apply( this._array, arguments );', 'Array.prototype.push.apply( this._array, shuffled );' ];
      for (const mutation of mutations) text = replaceOnce(text, mutation, mutation + '\n window.phetResearchMonitor.collectionChanged( this, this._array );');
      return replaceOnce(text, 'this.disposeObservableArray();', 'window.phetResearchMonitor.dispose( this );\n this.disposeObservableArray();');
    });
  } else {
    await change('axon/js/TinyEmitter.ts', text => {
      text = replaceOnce(text, 'public emit( ...args: T ): void {', 'public emit( ...args: T ): void {\n window.phetResearchMonitor.emit( this, args );');
      text = replaceOnce(text, 'public dispose(): void {', 'public dispose(): void {\n window.phetResearchMonitor.dispose( this );');
      return text + '\ndeclare global {\n interface Window {\n phetResearchMonitor: { beginModel(): void; model( model: object ): void; registerCollection( object: object, array: object ): void; collectionChanged( object: object, array?: object ): void; emit( emitter: object, args: unknown[] ): void; dispose( object: object ): void; frame(): void };\n }\n}\n';
    });
    await change('axon/js/Disposable.ts', text => replaceOnce(text, 'this._isDisposed = true;', 'this._isDisposed = true;\n window.phetResearchMonitor.dispose( this );'));
    await change('axon/js/createObservableArray.ts', text => {
      text = replaceOnce(text, 'observableArray.targetArray = targetArray;', 'window.phetResearchMonitor.registerCollection( observableArray, targetArray );\n observableArray.targetArray = targetArray;');
      for (const operation of ['set( array, key, newValue )', 'deleteProperty( array, key )']) {
        const anchor = `const returnValue = Reflect.${operation};`;
        text = replaceOnce(text, anchor, anchor + '\n if ( returnValue ) { window.phetResearchMonitor.collectionChanged( observableArray, targetArray ); }');
      }
      const mutation = /const returnValue = Array\.prototype\.(pop|shift|push|unshift|splice|copyWithin|fill)\.apply\( this\.targetArray, [^;]+;/g;
      const matches = [...text.matchAll(mutation)];
      if (matches.length !== 7) throw new Error('Unsupported observable-array mutation set');
      text = text.replace(mutation, statement => statement + '\n window.phetResearchMonitor.collectionChanged( this, this.targetArray );');
      text = replaceOnce(text, 'Array.prototype.push.apply( this.targetArray, shuffled );', 'Array.prototype.push.apply( this.targetArray, shuffled );\n window.phetResearchMonitor.collectionChanged( this, this.targetArray );');
      return replaceOnce(text, 'this.elementAddedEmitter.dispose();', 'window.phetResearchMonitor.dispose( this );\n this.elementAddedEmitter.dispose();');
    });
  }
  await writeFile(path.join(workspace, 'chipper/js/research-collector.js'), collector);
  await writeFile(path.join(workspace, 'chipper/js/research-bridge.js'), bridge);
  const hostOrigins = ['http://localhost:3200'];
  const sampling = 'object-events';
  const identity = `${pilot.simulation}-${pilot.version}-${hash(JSON.stringify({ changes, collector: hash(collector), bridge: hash(bridge), hostOrigins, sampling })).slice(0, 16)}`;
  const bootstrap = `window.phetResearchBuild = ${JSON.stringify(identity)};\nwindow.phetResearchConfiguration = ${JSON.stringify({ buildId: identity, hostOrigins, sampling })};\nwindow.phetResearchMonitor = window.PhETResearch.createCollector( { sampling: ${JSON.stringify(sampling)} } );\n`;
  await writeFile(path.join(workspace, 'chipper/js/research-bootstrap.js'), bootstrap);
  await writeFile(path.join(workspace, 'monitor-build.json'), JSON.stringify({ schemaVersion: 1, identity, sampling, collectorHash: hash(collector), bridgeHash: hash(bridge), bootstrapHash: hash(bootstrap), framework: oldFramework ? 'axon-amd-emitter' : 'axon-tiny-emitter', changes }, null, 2) + '\n');
  console.log(`${pilot.simulation}: prepared ${identity}`);
}
