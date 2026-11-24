import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { componentRegistrationReferences, directFrameworkRegistrationReferences, packageRegistrationReferences } from '../checkApplicationMeteorRegistration.mjs';

function members(source, file) {
  return directFrameworkRegistrationReferences(ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true))
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

test('detects WebApp registration and aliases without flagging unrelated middleware', () => {
  assert.deepEqual(members("import { WebApp as http } from 'meteor/webapp'; const raw = http['rawConnectHandlers']; const later = raw.use;", 'handler.ts'),
    ['WebApp.rawConnectHandlers.use']);
  assert.deepEqual(members("import * as http from 'meteor/webapp'; const { handlers: { use: register } } = http.WebApp;", 'namespace.ts'),
    ['WebApp.handlers.use']);
  assert.deepEqual(members("const { connectHandlers: stack } = WebApp; stack[method](route); WebApp[stackName].use(route);", 'computed.js'),
    ['WebApp.connectHandlers.[unresolved property]', 'WebApp.[unresolved property]']);
  assert.deepEqual(members("const WebApp = { handlers: { use() {} } }; WebApp.handlers.use(route); router.use(route);", 'scope.js'), []);
});

test('limits the local package registration exception to its owned DDP and HTTP calls', () => {
  const scan = (text, owner = true) => packageRegistrationReferences(
    ts.createSourceFile('package.js', text, ts.ScriptTarget.Latest, true), owner);
  const source = (body, http = 'WebApp.connectHandlers.use(() => {});') =>
    'class FilesCollection { constructor() { ' + body + ' } _registerHttpHandlers() { ' + http + ' } }';
  const call = 'Meteor.methods(_methods);';
  assert.deepEqual(scan(source(call)), []);
  assert.deepEqual(scan(source(call), false).map(r => r.member), ['methods', 'WebApp.connectHandlers.use']);
  assert.deepEqual(scan(source(call + ' const later = Meteor.publish;')).map(r => r.member), ['publish']);
  assert.deepEqual(scan(source(call + ' Meteor.methods(other);')).map(r => r.member), ['methods']);
  assert.throws(() => scan(source(call, '')), /exactly one FilesCollection HTTP/);
  assert.throws(() => scan(source(call, 'WebApp.connectHandlers.use(() => {}); WebApp.connectHandlers.use(() => {});')), /exactly one FilesCollection HTTP/);
  for (const text of [source(''), source(call + call), source('Meteor.methods(other);'),
    source('function inner() { ' + call + ' }'), 'class Other { constructor() { ' + call + ' } }']) {
    assert.throws(() => scan(text), /exactly one/);
  }
});
