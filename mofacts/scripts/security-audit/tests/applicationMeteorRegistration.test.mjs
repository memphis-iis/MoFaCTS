import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { componentRegistrationReferences, directMeteorRegistrationReferences, packageRegistrationReferences } from '../checkApplicationMeteorRegistration.mjs';

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

test('checks authored component scripts and compiled template bindings', () => {
  const check = text => componentRegistrationReferences('Widget.svelte', text);
  assert.deepEqual(check("<script lang='ts'>\nimport { Meteor as api } from 'meteor/meteor';\nconst fn = (api as any).methods;\n</script>"),
    [{ member: 'methods', line: 3 }]);
  assert.deepEqual(check("<script module>import { Meteor as framework } from 'meteor/meteor';</script><button onclick={() => framework.publish('x')}>x</button>").map(row => row.member), ['publish']);
  assert.deepEqual(check("<script module>const Meteor = { methods() {} };</script><script>Meteor.methods();</script>"), []);
  assert.deepEqual(check("<script>const Meteor = { methods: () => true };</script><button onclick={() => Meteor.methods()}>Meteor.publish</button>"), []);
});

test('limits the local package registration exception to its single upload-owner call', () => {
  const scan = (text, owner = true) => packageRegistrationReferences(
    ts.createSourceFile('package.js', text, ts.ScriptTarget.Latest, true), owner);
  const source = body => 'class FilesCollection { constructor() { ' + body + ' } }';
  const call = 'Meteor.methods(_methods);';
  assert.deepEqual(scan(source(call)), []);
  assert.deepEqual(scan(source(call), false).map(r => r.member), ['methods']);
  assert.deepEqual(scan(source(call + ' const later = Meteor.publish;')).map(r => r.member), ['publish']);
  assert.deepEqual(scan(source(call + ' Meteor.methods(other);')).map(r => r.member), ['methods']);
  for (const text of [source(''), source(call + call), source('Meteor.methods(other);'),
    source('function inner() { ' + call + ' }'), 'class Other { constructor() { ' + call + ' } }']) {
    assert.throws(() => scan(text), /exactly one/);
  }
});
