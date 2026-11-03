import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../../../deploy/security-audit/host-mongo-roles.js', import.meta.url), 'utf8');
const definition = JSON.parse(fs.readFileSync(new URL('../../../../deploy/mongodb/read-default-concern-role.json', import.meta.url), 'utf8'));
const copy = value => JSON.parse(JSON.stringify(value));
const completeRoles = () => [
  { role: 'readWrite', db: 'app' }, { role: definition.role, db: definition.db },
];

function fixture(mode = 'absent') {
  const state = {
    input: { database: 'app', appUser: 'appUser', appRole: 'readWrite', sidecarUser: 'reservedSidecar', sidecarExpectedState: mode,
      ...(mode === 'configured' ? { sidecarRole: 'read' } : {}) },
    definition: copy(definition),
    app: { roles: completeRoles() },
    sidecar: mode === 'configured' ? { roles: [{ role: 'read', db: 'app' }] } : null,
    role: copy(definition),
    queries: [],
    mutations: [],
    lines: [],
    exitCode: undefined,
    queryError: null,
    queryErrorAt: 'database',
  };
  const mutate = name => () => {
    state.mutations.push(name);
    throw new Error('mutating API must never be called');
  };
  const mutators = Object.fromEntries(['createUser', 'updateUser', 'dropUser', 'grantRolesToUser', 'revokeRolesFromUser',
    'createRole', 'updateRole', 'dropRole', 'grantPrivilegesToRole', 'revokePrivilegesFromRole', 'runCommand',
    'getCollection'].map(name => [name, mutate(name)]));
  const termination = new Error('test quit');
  const run = () => {
    const env = {
      MOFACTS_AUDIT_MONGO_INPUT: state.inputText ?? JSON.stringify(state.input),
      MOFACTS_AUDIT_READ_CONCERN_ROLE: state.definitionText ?? JSON.stringify(state.definition),
    };
    if (state.missingInput) delete env.MOFACTS_AUDIT_MONGO_INPUT;
    if (state.missingDefinition) delete env.MOFACTS_AUDIT_READ_CONCERN_ROLE;
    const context = {
      Buffer,
      process: { env },
      print: line => state.lines.push(line),
      quit(code) { state.exitCode = code; throw termination; },
      db: { ...mutators, getSiblingDB(name) {
        state.queries.push(['database', name]);
        if (state.queryError && state.queryErrorAt === 'database') throw state.queryError;
        assert.ok(name === 'app' || name === definition.db);
        return { ...mutators,
          getUser(username) {
            state.queries.push(['user', name, username]);
            if (state.queryError && state.queryErrorAt === 'user') throw state.queryError;
            assert.equal(name, 'app');
            if (username === state.input.appUser) return state.app;
            assert.equal(username, state.input.sidecarUser);
            return state.sidecar;
          },
          getRole(role, options) {
            state.queries.push(['role', name, role]);
            if (state.queryError && state.queryErrorAt === 'role') throw state.queryError;
            assert.equal(name, definition.db);
            assert.equal(role, definition.role);
            assert.deepEqual(copy(options), { showPrivileges: true });
            return state.role;
          },
        };
      } },
    };
    assert.throws(() => vm.runInNewContext(source, context), error => error === termination);
    assert.equal(state.lines.length, 1);
    assert.ok(Buffer.byteLength(state.lines[0]) < 256);
    assert.deepEqual(state.mutations, []);
    return JSON.parse(state.lines[0]);
  };
  return { state, run };
}

test('the read-only Mongo probe accepts the modern app role set in either order and an absent reserved Sidecar user', () => {
  for (const reversed of [false, true]) {
    const { state, run } = fixture();
    if (reversed) state.app.roles.reverse();
    assert.deepEqual(run(), { state: 'observed', appRolesExact: true, readConcernRoleExact: true, sidecarUserAbsent: true });
    assert.equal(state.exitCode, 0);
    assert.deepEqual(state.queries, [
      ['database', 'app'], ['user', 'app', 'appUser'], ['user', 'app', 'reservedSidecar'],
      ['database', 'admin'], ['role', 'admin', definition.role],
    ]);
  }
});

test('configured Sidecar mode requires exactly its one configured application-database role', () => {
  const { state, run } = fixture('configured');
  assert.deepEqual(run(), { state: 'observed', appRolesExact: true, readConcernRoleExact: true, sidecarRolesExact: true });
  assert.equal(state.exitCode, 0);
});

test('usernames remain literal data and successful output contains no identities or database records', () => {
  const { state, run } = fixture();
  state.input.appUser = 'learner+test@例.example';
  state.input.sidecarUser = 'reserved \'quoted" user';
  state.app.privateDiagnostic = 'must-not-appear-in-output';
  state.role.privateDiagnostic = 'must-not-appear-in-output';
  assert.deepEqual(run(), { state: 'observed', appRolesExact: true, readConcernRoleExact: true, sidecarUserAbsent: true });
  assert.equal(state.exitCode, 0);
  assert.deepEqual(state.queries.slice(1, 3), [
    ['user', 'app', state.input.appUser], ['user', 'app', state.input.sidecarUser],
  ]);
});

test('missing, extra, duplicate, malformed and old single app grants are policy findings', () => {
  for (const app of [null, {}, { roles: null }, { roles: [] },
    { roles: [completeRoles()[0]] }, { roles: [completeRoles()[1]] },
    { roles: [...completeRoles(), { role: 'root', db: 'admin' }] },
    { roles: [completeRoles()[0], completeRoles()[0]] },
    { roles: [completeRoles()[1], completeRoles()[1]] },
    { roles: [{ role: 'readWrite', db: 'other' }, completeRoles()[1]] },
    { roles: [{ ...completeRoles()[0], unexpected: true }, completeRoles()[1]] },
  ]) {
    const { state, run } = fixture();
    state.app = app;
    assert.deepEqual(run(), { state: 'observed', appRolesExact: false, readConcernRoleExact: true, sidecarUserAbsent: true });
    assert.equal(state.exitCode, 3);
  }
});

test('unexpected Sidecar users fail absent mode, and absent or broader grants fail configured mode', () => {
  for (const sidecar of [{ roles: [] }, { roles: [{ role: 'read', db: 'app' }] }, undefined]) {
    const { state, run } = fixture();
    state.sidecar = sidecar;
    assert.equal(run().sidecarUserAbsent, false);
    assert.equal(state.exitCode, 3);
  }
  for (const sidecar of [null, {}, { roles: [] },
    { roles: [{ role: 'readWrite', db: 'app' }] }, { roles: [{ role: 'read', db: 'other' }] },
    { roles: [{ role: 'read', db: 'app' }, { role: 'read', db: 'app' }] },
    { roles: [{ role: 'read', db: 'app' }, { role: 'root', db: 'admin' }] },
  ]) {
    const { state, run } = fixture('configured');
    state.sidecar = sidecar;
    assert.equal(run().sidecarRolesExact, false);
    assert.equal(state.exitCode, 3);
  }
});

test('missing or tampered read-concern role definitions are policy findings', () => {
  const privilege = definition.privileges[0];
  for (const role of [null, {}, { ...copy(definition), role: 'anotherRole' }, { ...copy(definition), db: 'app' },
    { ...copy(definition), roles: [{ role: 'root', db: 'admin' }] },
    { ...copy(definition), roles: undefined }, { ...copy(definition), privileges: [] },
    { ...copy(definition), privileges: [privilege, privilege] },
    { ...copy(definition), privileges: [{ resource: { anyResource: true }, actions: privilege.actions }] },
    { ...copy(definition), privileges: [{ resource: { cluster: true, db: 'app' }, actions: privilege.actions }] },
    { ...copy(definition), privileges: [{ resource: privilege.resource, actions: ['setDefaultRWConcern'] }] },
    { ...copy(definition), privileges: [{ resource: privilege.resource, actions: [...privilege.actions, 'setDefaultRWConcern'] }] },
    { ...copy(definition), privileges: [{ ...privilege, unexpected: true }] },
  ]) {
    const { state, run } = fixture();
    state.role = role;
    assert.deepEqual(run(), { state: 'observed', appRolesExact: true, readConcernRoleExact: false, sidecarUserAbsent: true });
    assert.equal(state.exitCode, 3);
  }
});

test('invalid mode-specific inputs fail before Mongo access with fixed sanitized output', () => {
  const invalid = [
    state => { state.missingInput = true; },
    state => { state.inputText = '{"secret":"must-not-appear-in-output"'; },
    state => { state.inputText = ' '.repeat(4097); },
    state => { state.inputText = '"' + 'é'.repeat(2048) + '"'; },
    state => { state.input = null; }, state => { state.input = []; }, state => { state.input = {}; },
    state => { delete state.input.sidecarExpectedState; },
    state => { state.input.sidecarExpectedState = 'unknown'; },
    state => { state.input.appUser = state.input.sidecarUser; },
    state => { state.input.sidecarRole = 'read'; },
    state => { state.input.sidecarExpectedState = 'configured'; },
    state => { state.input.sidecarExpectedState = 'configured'; state.input.sidecarRole = ''; },
    state => { state.input.sidecarExpectedState = 'configured'; state.input.sidecarRole = {}; },
    state => { state.input.sidecarExpectedState = 'configured'; state.input.sidecarRole = 'invalid role'; },
    state => { state.input.unknown = 'must-not-appear-in-output'; },
    ...['database', 'appUser', 'sidecarUser', 'appRole'].flatMap(key => [
      state => { delete state.input[key]; }, state => { state.input[key] = ''; },
      state => { state.input[key] = 'x'.repeat(129); }, state => { state.input[key] = "invalid'\nvalue"; },
      state => { state.input[key] = {}; },
    ]),
    state => { state.input.database = 'admin'; },
    ...['invalid.database', 'invalid/database', 'invalid\\database', 'invalid database', 'invalid$database'].map(database =>
      state => { state.input.database = database; }),
  ];
  for (const invalidate of invalid) {
    const { state, run } = fixture();
    invalidate(state);
    assert.deepEqual(run(), { state: 'unavailable', reason: 'invalid-input' });
    assert.equal(state.exitCode, 64);
    assert.deepEqual(state.queries, []);
  }
});

test('missing, malformed or structurally unsafe shared policy input fails before Mongo access', () => {
  for (const invalidate of [
    state => { state.missingDefinition = true; },
    state => { state.definitionText = ''; }, state => { state.definitionText = ' '.repeat(4097); },
    state => { state.definitionText = '{"secret":"must-not-appear-in-output"'; },
    state => { state.definition = null; }, state => { state.definition = []; }, state => { state.definition = {}; },
    state => { state.definition.db = 'app'; }, state => { state.definition.role = ''; },
    state => { state.definition.roles = [{ role: 'root', db: 'admin' }]; },
    state => { state.definition.privileges = []; },
    state => { state.definition.privileges[0].resource = { anyResource: true }; },
    state => { state.definition.privileges[0].actions.push('setDefaultRWConcern'); },
    state => { state.definition.unexpected = true; },
  ]) {
    const { state, run } = fixture();
    invalidate(state);
    assert.deepEqual(run(), { state: 'unavailable', reason: 'invalid-input' });
    assert.equal(state.exitCode, 64);
    assert.deepEqual(state.queries, []);
  }
});

test('query or authorization errors produce unavailable output without raw errors or records', () => {
  for (const stage of ['database', 'user', 'role']) {
    const { state, run } = fixture();
    state.queryErrorAt = stage;
    state.queryError = new Error('Authentication failed for secret-user with secret-password');
    assert.deepEqual(run(), { state: 'unavailable', reason: 'query-failed' });
    assert.equal(state.exitCode, 70);
  }
});
