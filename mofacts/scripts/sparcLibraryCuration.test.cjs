// Isolated contracts: no Meteor process, MongoDB writes, or provider calls.
require('./registerHistoryTypescript.cjs');
const tests = require('node:test');
Object.assign(globalThis, { describe: tests.describe, it: tests.it, beforeEach: tests.beforeEach, afterEach: tests.afterEach });
const Module = require('node:module');
const load = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'meteor/meteor') return { Meteor: { Error: class MeteorError extends Error {
    constructor(code, reason) { super(reason); this.error = code; }
  } } };
  return load.call(this, request, parent, isMain);
};
try {
  require('../server/lib/sparcMoveLibraryService.test.ts');
  require('../server/methods/sparcLibraryCurationMethods.test.ts');
  require('../server/methods/sparcPromptImageMethods.test.ts');
  require('../common/lib/sparcAdministrativeRemoval.test.ts');
} finally { Module._load = load; }
