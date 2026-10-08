// Isolated server method contracts; real Meteor invocation and Mongo transactions remain in CI.
require('./registerHistoryTypescript.cjs');
const nodeTest = require('node:test');
const Module = require('node:module');
const { randomBytes } = require('node:crypto');
for (const name of ['describe', 'it', 'beforeEach', 'afterEach']) global[name] = nodeTest[name];
class MeteorError extends Error {
  constructor(error, reason) { super(reason); this.error = error; this.reason = reason; }
}
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'meteor/meteor') return { Meteor: {
    Error: MeteorError,
    userId: () => { throw new Error('Method contracts must use explicit caller identity'); },
  } };
  if (request === 'meteor/check') return { check: () => undefined };
  if (request === 'meteor/random') return { Random: { secret: () => randomBytes(32).toString('hex') } };
  return originalLoad.call(this, request, parent, isMain);
};
try {
  require('../server/methods/analyticsMethods.test.ts');
} finally {
  Module._load = originalLoad;
}
