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
  'sparcLearnerResponseScoring',
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
  'sparcDialogueOpenRouterAdapter',
  'sparcTrialDisplayControllerDialogueBridge',
];
require('../common/lib/sparcFigureClustering.test.ts');
require('../common/publicDemoContract.test.ts');
// Meteor-dependent KC-chain integration is discovered by server-test-entry.js.
require('../../learning-components/runtime/sparcInstructionalNeed.test.ts');
require('../../learning-components/runtime/sparcReadingLevel.test.ts');
require('../../learning-components/runtime/sparcEmbeddingIndex.test.ts');
require('../server/lib/sparcInstructionalEmbeddingMigration.test.ts');
require('../server/lib/sparcFigureBrowseService.test.ts');
require('../server/lib/sparcHistoryBatchStorage.test.ts');
require('../server/lib/historyCommitStorage.test.ts');
require('../server/lib/sparcContentUse.test.ts');
require('../server/lib/backup/dashboardHistoryRestore.test.ts');
require('../server/lib/userDeletion.test.ts');
require('../server/lib/sparcMoveLibraryService.test.ts');
require('../server/lib/sparcRetrievalSelector.test.ts');
require('../server/lib/sparcRetrievalPublicationState.test.ts');
require('../server/lib/sparcRetrievalPublication.test.ts');
require('../server/lib/boundedExternalSort.test.ts');
require('../server/lib/sortedHistoryExport.test.ts');
require('../server/lib/ownedHistoryDownloadHandler.test.ts');
require('../server/migrations/course_assignment_contract.test.ts');
require('../client/views/experimentSetup/sparc/sparcLibraryPreview.test.ts');
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
  // Match module identity: injected method transports must be shared by all importers.
  const meteorModule = { Meteor: { Error: class MeteorError extends Error {
    constructor(code, reason, details) { super(reason); this.error = code; this.reason = reason; this.details = details; }
  }, callAsync: () => { throw new Error('Unexpected live Meteor call in isolated contracts'); } } };
  const dom = new JSDOM('');
  global.document = dom.window.document;
  global.window = dom.window;
  global.HTMLElement = dom.window.HTMLElement;
  global.MutationObserver = dom.window.MutationObserver;
  Module._load = function(request, parent, isMain) {
    if (request === 'meteor/meteor') return meteorModule;
    if (request === 'meteor/tracker') return { Tracker: {} };
    if (request === 'meteor/mongo') return { Mongo: {} };
    if (request === 'meteor/session') return { Session: { get: () => undefined } };
    if (request === 'meteor/check') return { check: () => {}, Match: { ObjectIncluding: value => value } };
    if (request === 'meteor/random') return { Random: { secret: () => require('node:crypto').randomBytes(32).toString('hex') } };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    if (process.argv.includes('--include-client-contracts')) {
      require('../client/views/experiment/svelte/services/sparcControllerDialogueOpenRouter.test.ts');
      require('../client/views/experiment/svelte/services/sparcLocalRetrieval.test.ts');
      require('../client/views/experiment/svelte/services/sparcOutputDiagnostics.test.ts');
      require('../client/views/experiment/svelte/services/sparcMoveLibraryClient.test.ts');
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
    require('../server/lib/tdfRuntimeLifecycle.test.ts');
    require('../server/lib/packageExport.test.ts');
    require('../server/methods/openRouterMethods.test.ts');
    require('../server/methods/sparcLibraryCurationMethods.test.ts');
    require('../server/methods/sparcPromptImageMethods.test.ts');
    require('../server/methods/sparcMoveLibraryMethods.test.ts');
    require('../server/methods/sparcInstructionalBrowseMethods.test.ts');
    require('../server/lib/sparcInstructionalLibraryMigration.test.ts');
    require('../server/lib/sparcFigureLibraryService.test.ts');
    require('../server/methods/dashboardCacheMethods.test.ts');
    require('../server/lib/adminUserPagePublication.test.ts');
    require('../server/lib/ownedHistoryDownloadScope.test.ts');
    require('../server/methods/analyticsDownloadMethods.test.ts');
    require('../server/lib/dashboardHistoryRefresh.test.ts');
    require('../server/lib/dashboardHistoryArchive.test.ts');
    if (process.argv.includes('--include-history-contracts')) require('../server/methods/analyticsMethods.test.ts');
  } finally { Module._load = originalLoad; }
  tests.after(() => { dom.window.close(); delete global.document; delete global.window; delete global.HTMLElement; delete global.MutationObserver; });
}
