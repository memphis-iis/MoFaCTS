// Pure contract/reconstruction/export/audit tests. Meteor/DDP integration remains in test:ci.
require('./registerHistoryTypescript.cjs');
const nodeTest = require('node:test');
for (const name of ['describe', 'it', 'beforeEach', 'afterEach']) global[name] = nodeTest[name];
for (const file of [
  '../server/lib/assessmentHistoryContract.test.ts',
  '../server/lib/stimulusCrowdStats.test.ts',
  '../server/methods/learnerAnalyticsMethods.test.ts',
  '../client/views/home/learningAnalytics/learnerAnalyticsAggregation.test.ts',
  '../client/views/home/learningAnalytics/learnerModelProgress.test.ts',
  '../common/historyEnvelope.test.ts',
  '../client/views/experiment/svelte/services/historyReconstruction.test.ts',
  '../../learning-components/runtime/modelPracticeHistoryExchange.test.ts',
  '../../learning-components/runtime/modelPracticeStateQueries.test.ts',
]) require(file);
