// Pure assignment policy and persistence-contract tests; real Mongo/DDP coverage runs in test:ci.
require('./registerHistoryTypescript.cjs');
const nodeTest = require('node:test');
for (const name of ['describe', 'it', 'beforeEach', 'afterEach']) global[name] = nodeTest[name];
require('../server/lib/conditionAllocation.test.ts');
