// Pure SPARC contracts: no Meteor server, database, provider calls, or emitted JS.
require('./registerHistoryTypescript.cjs');
const tests = require('node:test');
Object.assign(globalThis, {
  describe: tests.describe, it: tests.it,
  before: tests.before, after: tests.after,
  beforeEach: tests.beforeEach, afterEach: tests.afterEach,
});
const suites = [
  'sparcProductionActions',
  'sparcProgressiveScaffoldingRules',
  'sparcAutoTutorAssessmentRules',
  'sparcAutoTutorRuleRuntime',
  'sparcTrialDisplayControllerDialogueBridge',
];
if (process.argv.includes('--include-general-rules')) {
  suites.push('sparcProductionRuleEvaluator', 'sparcTrialDisplayRuntimeBridge');
}
for (const name of suites) require(`../../learning-components/units/sparcsession/${name}.test.ts`);
