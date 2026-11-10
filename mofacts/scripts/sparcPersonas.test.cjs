// Authenticated persona persistence contracts; no Meteor process, database, or provider calls.
require('./registerHistoryTypescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
let userWriteRules;
Module._load = function(request, parent, isMain) {
  if (request === 'meteor/meteor') return { Meteor: { users: { deny(rules) { userWriteRules = rules; } }, Error: class extends Error {
    constructor(code, reason) { super(reason); this.error = code; }
  } } };
  if (request === 'meteor/check') return { check() { throw new Error('Unexpected check boundary'); }, Match: {} };
  return originalLoad.call(this, request, parent, isMain);
};
let createProfileMethods;
try {
  ({ createProfileMethods } = require('../server/methods/profileMethods.ts'));
  require('../server/runtime/userProfileWrites.ts');
}
finally { Module._load = originalLoad; }

test('the server blocks direct self-profile updates regardless of modifier, including replacement and rename', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  assert.match(fs.readFileSync(path.join(__dirname, '../server/main.ts'), 'utf8'), /import ["']\.\/runtime\/userProfileWrites["']/);
  for (const modifier of [
    { $set: { 'profile.sparcPersona': { traits: 'invalid' } } },
    { $set: { 'profile.sparcPersona.traits': ['Bypass method'] } },
    { $unset: { 'profile.sparcPersona': '' } },
    { $set: { profile: { sparcPersona: {} } } },
    { $rename: { 'profile.name': 'profile.sparcPersona' } },
  ]) {
    assert.equal(userWriteRules.update('student', { _id: 'student' }, ['profile'], modifier), true);
  }
});

test('persona writes are validated, self-scoped, and preserve other profile fields', async () => {
  const writes = [];
  const methods = createProfileMethods({ usersCollection: { async updateAsync(selector, modifier) { writes.push({ selector, modifier }); } } });
  await assert.rejects(methods.updateOwnSparcPersona.call({}, { personalInterests: ['Soccer'] }), /logged in/);
  await assert.rejects(methods.updateOwnSparcPersona.call({ userId: 'student' }, { userId: 'other', personalInterests: ['Soccer'] }), /Unexpected/);
  await assert.rejects(methods.updateOwnSparcPersona.call({ userId: 'student' }, { abilities: [''] }), /persona/);
  assert.equal(writes.length, 0);
  await methods.updateOwnSparcPersona.call({ userId: 'student' }, { abilities: ['Basic algebra'], personalInterests: ['Soccer'] });
  assert.deepEqual(writes, [{ selector: { _id: 'student' }, modifier: { $set: { 'profile.sparcPersona': {
    traits: [], abilities: ['Basic algebra'], experiences: [], personalInterests: ['Soccer'],
  } } } }]);
  await methods.updateOwnSparcPersona.call({ userId: 'student' }, {});
  assert.deepEqual(writes[1].modifier.$set['profile.sparcPersona'], { traits: [], abilities: [], experiences: [], personalInterests: [] });
});
