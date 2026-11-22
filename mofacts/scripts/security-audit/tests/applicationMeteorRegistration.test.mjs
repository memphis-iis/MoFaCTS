import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { directMeteorRegistrationReferences } from '../checkApplicationMeteorRegistration.mjs';

function members(source, file) {
  return directMeteorRegistrationReferences(ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true))
    .map(row => row.member);
}

test('detects direct, renamed, and deferred framework registrations in application source', () => {
  assert.deepEqual(members("Meteor.methods({}); Meteor['publish']('items', handler);", 'server.js'), ['methods', 'publish']);
  assert.deepEqual(members("import { Meteor as M } from 'meteor/meteor'; const publish = (M as any).publish;", 'server.ts'), ['publish']);
  assert.deepEqual(members("import * as api from 'meteor/meteor'; const { methods: later } = api.Meteor;", 'server.mjs'), ['methods']);
});
test('keeps application adapter calls, injected dispatch, and unrelated properties distinct', () => {
  assert.deepEqual(members("function unrelated(Meteor) { Meteor.methods(); }", 'scope.js'), []);
  assert.deepEqual(members("const app = Meteor as any; const target = app; target['methods']({});", 'alias.ts'), ['methods']);
  assert.deepEqual(members("registerMeteorMethods(Meteor, handlers, bindings, read); server.methods(handlers); Meteor.callAsync('publish');", 'server.js'), []);
});

test('reports computed Meteor references that require explicit resolution', () => {
  assert.deepEqual(members("import { Meteor as app } from 'meteor/meteor'; app[operation](handlers);", 'shared.js'), ['[unresolved property]']);
  assert.deepEqual(members("const { ['publish']: register, [key]: unknown } = Meteor;", 'client.ts'), ['publish', '[unresolved property]']);
  assert.deepEqual(members("const opts = {}; opts[operation](); Meteor['callAsync']('read');", 'client.js'), []);
});
