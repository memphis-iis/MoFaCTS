// Pure authoring and learner-artifact regressions; Meteor integration belongs to CI.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const nodeTest = require('node:test');

for (const name of ['describe', 'it', 'beforeEach', 'afterEach']) global[name] = nodeTest[name];
require.extensions['.ts'] = (module, filename) => {
  // Learning components intentionally use the application's installed dependencies.
  module.paths.push(path.resolve(__dirname, '../node_modules'));
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText, filename);
};
for (const filename of [
  '../common/lib/contentUpdateWarnings.test.ts',
  '../common/adaptiveUnitSequence.test.ts',
  '../client/views/experimentSetup/tdfDraftSchema.test.ts',
  '../client/views/experiment/svelte/services/mappingProgressPolicy.test.ts',
  '../../learning-components/content/tdf/clusterMapping.test.ts',
  '../../learning-components/units/shared/interactionStepAssembly.test.ts',
]) require(path.resolve(__dirname, filename));
