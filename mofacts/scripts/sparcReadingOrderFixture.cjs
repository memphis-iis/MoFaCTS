// Isolated browser fixture: production surface, nodes, figure reader and scroll owner;
// only external/application services are replaced. No account, history or provider calls.
const fs = require('node:fs');
const path = require('node:path');
const { rspack, NormalModuleReplacementPlugin } = require('@rspack/core');

async function buildFixture({ captureSubmissions = false, realStartup = false } = {}) {
  const app = path.resolve(__dirname, '..');
  fs.mkdirSync(path.join(app, '../tmp'), { recursive: true });
  const directory = fs.mkdtempSync(path.join(app, '../tmp/sparc-reading-'));
  const write = (name, source) => { const filename = path.join(directory, name); fs.writeFileSync(filename, source); return filename; };
  const replacements = {};
  const stub = (name, source) => { replacements[name] = write(`${name}.js`, source); };
  stub('sparcMoveLibraryClient', `export const sparcMoveLibraryClient = {};
    export const readSparcAdministrativeRemovals = ids => window.fixture.checkRemovals(ids);`);
  stub('meteorSession', 'export const Session = { get: () => undefined };');
  stub('meteorUser', 'export const Meteor = { user: () => undefined };');
  stub('sparcController', 'export const resolveSparcControllerDisplay = display => display; export const resolveSparcControllerResult = (_display, detail) => detail;');
  stub('sparcAutoTutorRuleCommit', `export const isSparcAutoTutorDisplay = () => true;
    export const commitSparcAutoTutorDocumentLoad = async () => ({ sparcNodeValues: {} });
    export const commitSparcAutoTutorSubmit = async params => {
      ${captureSubmissions ? 'window.fixture.submissions.push(params.sparcResult); window.fixture.submissionPresentations.push(params.submissionPresentation); return { sparcNodeValues: {} };' : "throw Error('Unexpected submission');"}
    };`);
  stub('sparcControllerDialogueOpenRouter', 'export const createSparcDialogueOpenRouterProvider = () => ({ prepareAssessment: async () => {} });');
  stub('sparcOpenRouterSession', "export const createSparcOpenRouterSession = () => ({ sessionIdForScope: () => 'synthetic' });");
  stub('sparcRuntimeState', 'export const readSparcResumeSnapshot = () => ({ nodeValues: {}, retainedHistoryRecords: window.fixture.historyRecords || [] });');
  if (realStartup) {
    delete replacements.sparcRuntimeState;
    const commit = path.join(app, 'client/views/experiment/svelte/services/sparcAutoTutorRuleCommit.ts').replaceAll('\\', '/');
    stub('sparcAutoTutorRuleCommit', `import * as real from ${JSON.stringify(commit)};
      export const isSparcAutoTutorDisplay = real.isSparcAutoTutorDisplay;
      const deps = { getUserId: () => 'synthetic', getIsAdmin: () => true, writeHistory: row => window.fixture.writeHistory(row) };
      export const commitSparcAutoTutorDocumentLoad = params => real.commitSparcAutoTutorDocumentLoad({ ...params, deps });
      export const commitSparcAutoTutorSubmit = params => real.commitSparcAutoTutorSubmit({ ...params, deps });`);
    stub('sparcControllerDialogueOpenRouter', `export const createSparcDialogueOpenRouterProvider = () => ({
      prepareAssessment: display => window.fixture.prepareAssessment(display),
      generateOrientation: () => 'We will study the synthetic condition. One learning goal remains.',
      generateTutorUtterance: request => window.fixture.generate(request),
      scoreLearnerResponse: () => { throw Error('Unexpected assessment'); }
    });`);
    stub('historyWire', 'export const insertCompressedHistory = () => { throw Error("Unexpected server call"); }; export const insertCompressedHistoryBatch = insertCompressedHistory;');
    stub('recoverableWarnings', 'export const reportRecoverableWarning = () => {};');
  }
  stub('sparcProductionRuleActionCommit', "export const commitSparcProductionRuleAction = () => { throw Error('Unexpected production action'); };");
  stub('sparcAutoTutorProgress', `export const buildSparcAutoTutorProgressSnapshot = () => ({ completed: false, turnCount: 0, coveredExpectations: 0,
    requiredExpectations: 1, misconceptionScore: 0, totalMisconceptions: 0 });
    export const selectSparcAutoTutorProgressSnapshotForRender = ({ currentSnapshot }) => currentSnapshot;`);
  stub('interfaceLocaleState', "export const getActiveUiLocale = () => 'en';");
  stub('clientLogger', 'export const clientConsole = () => {};');
  stub('sparcPromptImage', 'export const readSparcPromptImage = assetId => window.fixture.readImage(assetId);');
  replacements['LearningProgressChart.svelte'] = write('Empty.svelte', '<div></div>');
  replacements['SparcVideo.svelte'] = write('Video.svelte', '<script>export let video;</script><div data-video-shell={video.segmentId}>Video passage</div>');
  const surface = path.join(app, 'client/views/experiment/svelte/components/SparcSessionSurface.svelte').replaceAll('\\', '/');
  const wrapper = write('Fixture.svelte', `<script>
    import Surface from ${JSON.stringify(surface)};
    export let initial; let current = initial;
    export function update(props) { current = { ...current, ...props }; }
  </script><Surface {...current} ${realStartup ? 'on:runtimeevent={event => { if (event.detail.sparcNodeValues) current = { ...current, runtimeNodeValues: event.detail.sparcNodeValues }; }}' : ''} />`);
  const entry = write('entry.js', `import { mount, unmount, tick } from 'svelte';
    import Fixture from ${JSON.stringify(wrapper.replaceAll('\\', '/'))};
    ${realStartup ? `import { commitSparcTrialDisplayAutoTutorRules } from '${path.join(app, '../learning-components/units/sparcsession/sparcTrialDisplayRuntimeBridge.ts').replaceAll('\\', '/')}';` : ''}
    let instance;
    window.fixture = { submissions: [], submissionPresentations: [], checkRemovals: async () => [], readImage: async () => { throw Error('Unconfigured image'); },
      ${realStartup ? 'commitSparcTrialDisplayAutoTutorRules, prepareAssessment: async () => {},' : ''}
      async mount(props) { if (instance) await unmount(instance); instance = mount(Fixture, { target: document.querySelector('#fixture'), props: { initial: props } }); await tick(); },
      async update(props) { instance.update(props); await tick(); },
      async destroy() { if (instance) await unmount(instance); instance = undefined; await tick(); }
    };`);
  const compiler = rspack({
    mode: 'development', devtool: false, context: app, entry,
    output: { path: directory, filename: 'fixture.js', publicPath: '' },
    resolve: { extensions: ['.ts', '.js', '.svelte'], conditionNames: ['svelte', 'browser', 'import', 'default'], modules: [path.join(app, 'node_modules'), 'node_modules'] },
    module: { rules: [
      { test: /\.svelte$/, use: [{ loader: require.resolve('./loaders/svelte-loader-wrapper.cjs'), options: { compilerOptions: { dev: true } } }] },
      { test: /\.ts$/, exclude: /node_modules/, type: 'javascript/auto', use: [{ loader: 'builtin:swc-loader', options: { jsc: { parser: { syntax: 'typescript' }, target: 'es2022' } } }] },
    ] },
    plugins: [new NormalModuleReplacementPlugin(/./, resource => {
      if (resource.request === 'meteor/session') { resource.request = replacements.meteorSession; return; }
      if (resource.request === 'meteor/meteor') { resource.request = replacements.meteorUser; return; }
      const name = resource.request.split('/').at(-1);
      if (name === 'sparcPromptImage' && !resource.request.includes('/services/')) return;
      if (replacements[name]) resource.request = replacements[name];
    })],
    optimization: { minimize: false, splitChunks: false }, performance: { hints: false },
  });
  await new Promise((resolve, reject) => compiler.run((error, stats) => {
    compiler.close(closeError => {
      if (error || closeError) reject(error || closeError);
      else if (stats.hasErrors()) reject(new Error(stats.toString({ all: false, errors: true })));
      else resolve();
    });
  }));
  return { directory, source: fs.readFileSync(path.join(directory, 'fixture.js'), 'utf8') };
}
module.exports = { buildFixture };
