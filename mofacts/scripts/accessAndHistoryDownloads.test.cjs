// Isolated authorization and transport regressions; no Meteor server or database.
require('./registerHistoryTypescript.cjs');
const tests = require('node:test');
const Module = require('node:module');
Object.assign(globalThis, { describe: tests.describe, it: tests.it });
const load = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'meteor/meteor') return { Meteor: { Error: class extends Error {
    constructor(code, message) { super(message); this.error = code; }
  } } };
  return load.call(this, request, parent, isMain);
};
try {
  require('../server/methods/accessMethods.test.ts');
  require('../server/lib/ownHistoryDownloadHandler.test.ts');
  require('../server/lib/ownedHistoryDownloadHandler.test.ts');
} finally { Module._load = load; }
