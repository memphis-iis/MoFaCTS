// Isolated method contracts with synthetic membership; Mongo/DDP integration remains in CI.
require('./registerHistoryTypescript.cjs');
const nodeTest = require('node:test');
const Module = require('node:module');
for (const name of ['describe', 'it']) global[name] = nodeTest[name];
class MeteorError extends Error {
  constructor(error, reason) { super(reason); this.error = error; }
}
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'meteor/meteor') return { Meteor: { Error: MeteorError } };
  return originalLoad.call(this, request, parent, isMain);
};
try {
  require('../server/methods/sparcInstructionalBrowseMethods.test.ts');
} finally {
  Module._load = originalLoad;
}
