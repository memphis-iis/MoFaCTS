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
require('../server/lib/clusterKcChainSolver.test.ts');
require('../../learning-components/runtime/sparcInstructionalNeed.test.ts');
require('../server/lib/sparcInstructionalEmbeddingMigration.test.ts');
require('../server/lib/sparcFigureBrowseService.test.ts');
require('../server/lib/sparcHistoryBatchStorage.test.ts');
require('../server/lib/sparcMoveLibraryService.test.ts');
require('../../learning-components/units/sparcsession/sparcEvidenceHistory.test.ts');
if (process.argv.includes('--include-general-rules')) {
  suites.push('sparcProductionRuleEvaluator', 'sparcTrialDisplayRuntimeBridge');
}
for (const name of suites) require(`../../learning-components/units/sparcsession/${name}.test.ts`);
if (process.argv.includes('--include-general-rules')) {
  require('../../learning-components/trial-displays/sparc/sparcSemanticNodes.test.ts');
  require('../../learning-components/trial-displays/sparc/sparcProgressiveNodes.test.ts');
}
if (process.argv.includes('--include-client-contracts') || process.argv.includes('--include-history-contracts')) {
  // Isolated client contracts use the same injected providers/writers as Meteor tests.
  // This is not a live Meteor or Mongo integration run.
  const Module = require('node:module');
  const { JSDOM } = require('jsdom');
  const originalLoad = Module._load;
  const dom = new JSDOM('');
  global.document = dom.window.document;
  global.window = dom.window;
  global.HTMLElement = dom.window.HTMLElement;
  global.MutationObserver = dom.window.MutationObserver;
  Module._load = function(request, parent, isMain) {
    if (request === 'meteor/meteor') return { Meteor: { Error: class MeteorError extends Error {
      constructor(code, reason) { super(reason); this.error = code; this.reason = reason; }
    }, callAsync: () => { throw new Error('Unexpected live Meteor call in isolated contracts'); } } };
    if (request === 'meteor/tracker') return { Tracker: {} };
    if (request === 'meteor/session') return { Session: { get: () => undefined } };
    if (request === 'meteor/check') return { check: () => {} };
    if (request === 'meteor/random') return { Random: { secret: () => require('node:crypto').randomBytes(32).toString('hex') } };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    if (process.argv.includes('--include-client-contracts')) {
      require('../client/views/experiment/svelte/services/sparcControllerDialogueOpenRouter.test.ts');
      require('../client/views/experiment/svelte/services/sparcOutputLimitRecovery.test.ts');
      require('../client/views/experiment/svelte/services/sparcCompoundInterestLiveEvaluation.test.ts');
    }
    require('../client/views/experiment/svelte/services/sparcAutoTutorRuleCommit.test.ts');
    require('../client/views/experiment/svelte/services/sparcInstructionMarkdown.test.ts');
    require('../client/views/experiment/svelte/services/sparcPrimitiveRealization.test.ts');
    require('../client/views/experiment/svelte/services/sparcRelevantSupport.test.ts');
    require('../common/lib/autoTutorContract.test.ts');
    global.__meteor_bootstrap__ = { serverDir: require('node:path').resolve(__dirname, '..') };
    require('../server/lib/packageUploadPostProcess.test.ts');
    require('../server/lib/packageTdfIdentity.test.ts');
    require('../server/lib/packageExport.test.ts');
    require('../server/methods/sparcPromptImageMethods.test.ts');
    require('../server/methods/sparcMoveLibraryMethods.test.ts');
    require('../server/methods/sparcInstructionalBrowseMethods.test.ts');
    require('../server/lib/sparcInstructionalLibraryMigration.test.ts');
    require('../server/lib/sparcFigureLibraryService.test.ts');
    require('../server/methods/dashboardCacheMethods.test.ts');
    if (process.argv.includes('--include-history-contracts')) require('../server/methods/analyticsMethods.test.ts');
  } finally { Module._load = originalLoad; }
  tests.after(() => { dom.window.close(); delete global.document; delete global.window; delete global.HTMLElement; delete global.MutationObserver; });
}
