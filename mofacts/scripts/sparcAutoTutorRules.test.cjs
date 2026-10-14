// Pure SPARC contracts: no Meteor server, database, provider calls, or emitted JS.
require('./registerHistoryTypescript.cjs');
const tests = require('node:test');
Object.assign(globalThis, {
  describe: tests.describe, it: tests.it,
  before: tests.before, after: tests.after,
  beforeEach: tests.beforeEach, afterEach: tests.afterEach,
});
const suites = [
  'sparcMoveDefinitions',
  'sparcExpectationHistory',
  'sparcInstructionalPrimitives',
  'sparcInstructionalCycle',
  'sparcCompetitiveSelection',
  'sparcDynamicInstructionRules',
  'SparcSessionUnitEngine',
  'sparcInstructionalControl',
  'sparcProductionActions',
  'sparcProgressiveScaffoldingRules',
  'sparcAutoTutorAssessmentRules',
  'sparcAutoTutorRuleRuntime',
  'sparcTrialDisplayControllerDialogueBridge',
];
require('../common/lib/sparcFigureClustering.test.ts');
require('../server/lib/sparcFigureBrowseService.test.ts');
if (process.argv.includes('--include-general-rules')) {
  suites.push('sparcProductionRuleEvaluator', 'sparcTrialDisplayRuntimeBridge');
}
for (const name of suites) require(`../../learning-components/units/sparcsession/${name}.test.ts`);
if (process.argv.includes('--include-general-rules')) {
  require('../../learning-components/trial-displays/sparc/sparcSemanticNodes.test.ts');
  require('../../learning-components/trial-displays/sparc/sparcProgressiveNodes.test.ts');
}
if (process.argv.includes('--include-client-contracts')) {
  // Isolated client contracts use the same injected providers/writers as Meteor tests.
  // This is not a live Meteor or Mongo integration run.
  const Module = require('node:module');
  const { JSDOM } = require('jsdom');
  const originalLoad = Module._load;
  const dom = new JSDOM('');
  global.document = dom.window.document;
  Module._load = function(request, parent, isMain) {
    if (request === 'meteor/meteor') return { Meteor: { Error: class MeteorError extends Error {
      constructor(code, reason) { super(reason); this.error = code; }
    }, callAsync: () => { throw new Error('Unexpected live Meteor call in isolated contracts'); } } };
    if (request === 'meteor/tracker') return { Tracker: {} };
    if (request === 'meteor/session') return { Session: { get: () => undefined } };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    require('../client/views/experiment/svelte/services/sparcControllerDialogueOpenRouter.test.ts');
    require('../client/views/experiment/svelte/services/sparcAutoTutorRuleCommit.test.ts');
    require('../common/lib/autoTutorContract.test.ts');
    require('../server/methods/sparcPromptImageMethods.test.ts');
    require('../server/lib/sparcFigureLibraryService.test.ts');
  } finally { Module._load = originalLoad; }
  tests.after(() => { dom.window.close(); delete global.document; });
}
