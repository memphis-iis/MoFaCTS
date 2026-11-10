// Run the real profile handlers with controlled user publications and saves, without Meteor.
require('./registerHistoryTypescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const profile = require('../client/views/profile/learningProfile.ts');
const source = fs.readFileSync(path.join(__dirname, '../client/views/profile/profile.ts'), 'utf8');
const ast = ts.createSourceFile('profile.ts', source, ts.ScriptTarget.Latest, true);
const functions = ['setStatus', 'clearStatus', 'saveLearningProfile', 'saveProfile'];
const declarations = [];
let events, sync, beforeUnload, navigationGuard;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && functions.includes(node.name?.text)) declarations.push(node.getText(ast));
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'registerProfileNavigationGuard') navigationGuard = node.getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'Template.profile.events') events = node.arguments[0].getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'this.autorun') sync = node.arguments[0].getText(ast);
  if (ts.isBinaryExpression(node) && node.left.getText(ast) === 'this.beforeUnloadHandler') beforeUnload = node.right.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(declarations.length, functions.length);
assert.ok(events && sync && beforeUnload);
const javascript = ts.transpileModule(`${declarations.join('\n')}
globalThis.handlers = ${events};
globalThis.save = saveLearningProfile;
globalThis.saveAccount = saveProfile;
globalThis.sync = function() { (${sync})(); };
globalThis.beforeUnload = function(event) { (${beforeUnload})(event); };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const variable = initial => ({ value: initial, get() { return this.value; }, set(value) { this.value = value; } });
function fixture() {
  const calls = [], destinations = [];
  const user = { profile: { sparcPersona: { personalInterests: ['Soccer'] } } };
  const template = {
    dirty: variable(false), saving: variable(false), statuses: variable({}),
    learningDirty: variable(false), learningSaving: variable(false), learningLoaded: variable(false),
    learningDraft: variable(profile.learningProfileDraft(undefined)),
    openRouterHasServerKey: variable(false), openRouterSelectedModel: variable('model'),
    openRouterSelectedReasoningLevel: variable('none'), lastSyncedOpenRouterSettings: 'model\u0000none',
    avatarType: variable('initials'), avatarIconId: variable(''), avatarImageData: variable(''),
    confirmationController: { getContext: () => ({ kind: 'leave-profile', destination: '/next' }),
      setPending: () => {}, complete: () => {} },
  };
  let avatarSyncs = 0, modelSyncs = 0;
  const context = {
    ...profile,
    MeteorAny: { callAsync: async (...args) => { calls.push(args); return { success: true }; } },
    Meteor: { user: () => user }, currentProfile: () => user.profile,
    Tracker: { nonreactive: callback => callback() },
    userHasServerOpenRouterKey: () => false,
    syncAvatarFromCurrentUser: () => { avatarSyncs++; },
    syncOpenRouterSettingsFromCurrentUser: () => { modelSyncs++; },
    profileText: key => key, getErrorMessage: error => error.message,
    inputValue: () => '', getActiveUiLocale: () => 'en',
    navigateFromProfile: destination => destinations.push(destination),
  };
  vm.runInNewContext(javascript, context);
  return { context, template, user, calls, destinations,
    syncCounts: () => [avatarSyncs, modelSyncs],
    sync: () => context.sync.call(template),
    edit(key, value) { context.handlers['input #learningProfileForm textarea']({ currentTarget: { name: key, value } }, template); },
    save: () => context.save(template),
  };
}

test('optional descriptions round-trip, normalize line endings, and clear without invented values', () => {
  const empty = profile.learningProfileDraft(undefined);
  assert.deepEqual(profile.learningProfilePersona(empty), { traits: [], abilities: [], experiences: [], personalInterests: [] });
  const persona = profile.learningProfilePersona({ ...empty, personalInterests: ' Soccer \r\n\r\nAnime\n' });
  assert.deepEqual(persona.personalInterests, ['Soccer', 'Anime']);
  assert.equal(profile.learningProfileDraft(persona).personalInterests, 'Soccer\nAnime');
});

test('saved descriptions load and publication updates preserve each dirty section independently', () => {
  const f = fixture(); f.sync();
  assert.equal(f.template.learningLoaded.get(), true);
  assert.equal(f.template.learningDraft.get().personalInterests, 'Soccer');
  f.edit('personalInterests', 'Anime');
  f.template.dirty.set(true);
  f.user.profile.sparcPersona.personalInterests = ['Cooking'];
  f.sync();
  assert.equal(f.template.learningDraft.get().personalInterests, 'Anime');
  assert.deepEqual(f.syncCounts(), [1, 1]);
  f.template.learningDirty.set(false); f.sync();
  assert.equal(f.template.learningDraft.get().personalInterests, 'Cooking');
  assert.deepEqual(f.syncCounts(), [1, 1]);
});

test('learning save writes only the persona and leaves unsaved account changes intact', async () => {
  const f = fixture(); f.sync(); f.template.dirty.set(true); f.edit('traits', 'Explain unfamiliar terms.');
  assert.equal(await f.save(), true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][0], 'updateOwnSparcPersona');
  assert.deepEqual(f.calls[0][1].traits, ['Explain unfamiliar terms.']);
  assert.equal(f.template.dirty.get(), true);
  assert.equal(f.template.learningDirty.get(), false);
  assert.equal(f.template.statuses.get().learning.kind, 'success');
  f.edit('traits', ''); f.edit('personalInterests', ''); await f.save();
  assert.deepEqual(f.calls[1][1], { traits: [], abilities: [], experiences: [], personalInterests: [] });
});

test('invalid descriptions stay editable and cannot be submitted or silently truncated', async () => {
  for (const text of ['x'.repeat(241), Array(9).fill('Description').join('\n'), 'A\tB']) {
    const f = fixture(); f.sync(); f.edit('traits', text);
    assert.equal(await f.save(), false);
    assert.equal(f.calls.length, 0);
    assert.equal(f.template.learningDraft.get().traits, text);
    assert.equal(f.template.learningDirty.get(), true);
    assert.equal(f.template.statuses.get().learning.message, 'profile.learningInvalid');
  }
});

test('unloaded or malformed saved data cannot be overwritten with an empty draft', async () => {
  const f = fixture();
  assert.equal(await f.save(), false);
  f.user.profile.sparcPersona = { traits: 'invalid' }; f.sync();
  assert.equal(f.template.learningLoaded.get(), false);
  assert.equal(await f.save(), false);
  assert.equal(f.calls.length, 0);
  assert.equal(f.template.statuses.get().learning.message, 'profile.learningLoadFailed');
});

test('pending saves block duplicate submissions and edits; a failed save preserves the draft', async () => {
  const f = fixture(); f.sync(); f.edit('traits', 'Concise');
  let reject;
  f.context.MeteorAny.callAsync = () => new Promise((_, fail) => { reject = fail; });
  const pending = f.save();
  assert.equal(f.template.learningSaving.get(), true);
  assert.equal(await f.save(), false);
  f.edit('traits', 'Changed during save');
  assert.equal(f.template.learningDraft.get().traits, 'Concise');
  reject(new Error('Save failed'));
  assert.equal(await pending, false);
  assert.equal(f.template.learningSaving.get(), false);
  assert.equal(f.template.learningDirty.get(), true);
  assert.equal(f.template.statuses.get().learning.message, 'Save failed');
});

test('account save preserves the learning draft and its unsaved-change protection', async () => {
  const f = fixture(); f.sync(); f.edit('traits', 'Concise'); f.template.dirty.set(true);
  assert.equal(await f.context.saveAccount(f.template), true);
  assert.equal(f.template.learningDirty.get(), true);
  f.sync();
  assert.equal(f.template.learningDraft.get().traits, 'Concise');
  let prevented = false;
  f.context.beforeUnload.call(f.template, { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
});

test('save-before-leaving saves both dirty sections and stays on the page if persona validation fails', async () => {
  for (const valid of [true, false]) {
    const f = fixture(); f.sync(); f.template.dirty.set(true);
    f.edit('traits', valid ? 'Concise' : 'x'.repeat(241));
    await f.context.handlers['click .admin-confirmation-cancel']({}, f.template);
    assert.equal(f.calls[0][0], 'updateOwnProfile');
    assert.deepEqual(f.destinations, valid ? ['/next'] : []);
    assert.equal(f.template.learningDirty.get(), !valid);
  }
});

test('blocked navigation preserves the mounted editor while restoring its route, then permits an authorized departure', () => {
  const f = fixture(); f.sync(); f.edit('traits', 'Unsaved description');
  f.template.profileRoutePath = '/profile';
  const deferred = [], confirmations = [], rendered = [];
  let trigger;
  const context = {
    activeProfileTemplate: f.template, profileNavigationGuardRegistered: false,
    profileNavigationBypass: false, returningToProfileForConfirmation: false,
    FlowRouter: { triggers: { enter(callbacks) { trigger = callbacks[0]; } } },
    Tracker: { afterFlush(callback) { deferred.push(callback); } },
    requestUnsavedChangesDecision(template, destination) { confirmations.push({ template, destination }); },
  };
  vm.runInNewContext(ts.transpileModule(`${navigationGuard}\nregisterProfileNavigationGuard();`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  // A redirect runs the destination's enter triggers synchronously. If they allow
  // its route action, the management loading frame tears down the old editor.
  function enter(path) {
    let stopped = false;
    trigger({ path, route: { name: path === '/profile' ? 'client.profile' : 'client.home' } },
      destination => { stopped = true; enter(destination); }, () => { stopped = true; });
    if (!stopped) { rendered.push(path); context.activeProfileTemplate = null; }
  }
  enter('/home?view=practice#lessons');
  deferred.splice(0).forEach(callback => callback());
  assert.deepEqual(rendered, []);
  assert.equal(confirmations.length, 1);
  assert.equal(confirmations[0].template, f.template);
  assert.equal(confirmations[0].destination, '/home?view=practice#lessons');
  assert.equal(f.template.learningDraft.get().traits, 'Unsaved description');
  assert.equal(context.returningToProfileForConfirmation, false);
  context.profileNavigationBypass = true;
  enter('/home?view=practice#lessons');
  assert.deepEqual(rendered, ['/home?view=practice#lessons']);
  assert.equal(context.profileNavigationBypass, false);
});
