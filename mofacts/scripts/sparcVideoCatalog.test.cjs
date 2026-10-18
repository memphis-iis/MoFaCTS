// Provider and catalog contracts only: no Meteor process, MongoDB or real API requests.
require('./registerHistoryTypescript.cjs');
const tests = require('node:test');
Object.assign(globalThis, { describe: tests.describe, it: tests.it, beforeEach: tests.beforeEach, afterEach: tests.afterEach });
require('../common/lib/sparcVideo.test.ts');
require('../server/lib/sparcVideoProviders.test.ts');
require('../server/lib/sparcVideoCatalogService.test.ts');
require('../server/lib/sparcMoveLibraryService.test.ts');

// Same injected-client boundary used by the existing isolated SPARC contract runner.
const Module = require('node:module');
const originalLoad = Module._load;
const meteorBoundary = { Meteor: { Error: class MeteorError extends Error {
    constructor(code, reason) { super(reason); this.error = code; this.reason = reason; }
  }, callAsync() { throw new Error('Unexpected live Meteor call in isolated video contracts'); } } };
Module._load = function(request, parent, isMain) {
  if (request === 'meteor/meteor') return meteorBoundary;
  if (request === 'meteor/session') return { Session: { get: () => undefined } };
  if (request === 'meteor/tracker') return { Tracker: {} };
  if (request === 'meteor/check') return { check: () => {} };
  if (request === '../lib/sparcVideoCatalog' && parent.filename.endsWith('sparcVideoCatalogMethods.ts')) return {
    createMongoSparcVideoCatalog() { throw new Error('Unauthorized catalog storage access'); },
    sparcVideoCatalogTargets: require('../server/lib/sparcVideoCatalogService.ts').sparcVideoCatalogTargets,
  };
  return originalLoad.call(this, request, parent, isMain);
};
try {
  require('../client/views/experimentSetup/sparcVideoCatalogBuilder.test.ts');
  require('../client/views/experiment/svelte/services/sparcVideoInstruction.test.ts');
  require('../server/methods/sparcVideoCatalogMethods.test.ts');
} finally { Module._load = originalLoad; }
