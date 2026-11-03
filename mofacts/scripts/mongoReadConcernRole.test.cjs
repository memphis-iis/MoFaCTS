const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const sourceDirectory = path.resolve(__dirname, '../../deploy/mongodb');
const definitionPath = path.join(sourceDirectory, 'read-default-concern-role.json');
const source = fs.readFileSync(path.join(sourceDirectory, 'ensure-app-read-concern-role.js'), 'utf8');
const definitionBytes = fs.readFileSync(definitionPath);
const definition = JSON.parse(definitionBytes);
const plain = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const state = {
    role: null,
    user: { roles: [{ role: 'readWrite', db: 'app' }] },
    definitionBytes: Buffer.from(definitionBytes),
    definitionStat: { size: definitionBytes.length, isFile: () => true, isSymbolicLink: () => false },
    readError: null,
    databaseReads: 0,
    creates: 0,
    grants: 0,
  };
  const context = {
    __dirname: sourceDirectory,
    require(name) {
      if (name === 'path') return path;
      assert.equal(name, 'fs');
      return {
        lstatSync(file) {
          assert.equal(file, definitionPath);
          if (state.readError) throw state.readError;
          return state.definitionStat;
        },
        readFileSync(file) {
          assert.equal(file, definitionPath);
          if (state.readError) throw state.readError;
          return state.definitionBytes;
        },
      };
    },
    process: { env: { MOFACTS_MONGO_APP_DATABASE: 'app', MOFACTS_MONGO_APP_USERNAME: 'learnerApp' } },
    print() {},
    db: { getSiblingDB(name) {
      state.databaseReads += 1;
      if (name === 'app') return {
        getUser: username => { assert.equal(username, 'learnerApp'); return state.user; },
        grantRolesToUser: (username, roles) => {
          assert.equal(username, 'learnerApp');
          state.grants += 1;
          state.user.roles.push(...plain(roles));
        },
      };
      assert.equal(name, 'admin');
      return {
        getRole: (name, options) => {
          assert.equal(name, definition.role);
          assert.deepEqual(plain(options), { showPrivileges: true });
          return state.role;
        },
        createRole: role => { state.creates += 1; state.role = { ...plain(role), db: definition.db }; },
      };
    } },
  };
  return { state, run: () => vm.runInNewContext(source, context) };
}

test('the shared role definition pins the approved single read-only privilege', () => {
  assert.deepEqual(definition, {
    db: 'admin',
    role: 'mofactsReadDefaultConcern',
    privileges: [{ resource: { cluster: true }, actions: ['getDefaultRWConcern'] }],
    roles: [],
  });
});

test('grants exactly the shared consistency-default read action and preserves existing roles', () => {
  const { state, run } = fixture();
  run();
  assert.deepEqual(state.role, {
    db: 'admin',
    role: 'mofactsReadDefaultConcern',
    privileges: [{ resource: { cluster: true }, actions: ['getDefaultRWConcern'] }],
    roles: [],
  });
  assert.deepEqual(state.user.roles, [
    { role: 'readWrite', db: 'app' }, { role: 'mofactsReadDefaultConcern', db: 'admin' },
  ]);
  run();
  assert.equal(state.creates, 1);
  assert.equal(state.grants, 1);
});

test('does not grant a conflicting role with broader privileges or inherited roles', () => {
  for (const broader of [
    { ...plain(definition), privileges: [{ resource: { cluster: true }, actions: ['getDefaultRWConcern', 'setDefaultRWConcern'] }] },
    { ...plain(definition), privileges: [{ resource: { cluster: true }, actions: ['setDefaultRWConcern'] }] },
    { ...plain(definition), roles: [{ role: 'root', db: 'admin' }] },
    { ...plain(definition), db: 'other' },
    { ...plain(definition), role: 'otherRole' },
    { ...plain(definition), privileges: [{ resource: { anyResource: true }, actions: ['getDefaultRWConcern'] }] },
    { ...plain(definition), privileges: [{ resource: { cluster: true, db: 'app' }, actions: ['getDefaultRWConcern'] }] },
    { ...plain(definition), privileges: [plain(definition.privileges[0]), plain(definition.privileges[0])] },
    { ...plain(definition), privileges: [{ resource: { cluster: true }, actions: ['getDefaultRWConcern', 'getDefaultRWConcern'] }] },
    { ...plain(definition), privileges: [{ ...plain(definition.privileges[0]), unexpected: true }] },
    { ...plain(definition), roles: undefined },
    { ...plain(definition), privileges: undefined },
  ]) {
    const { state, run } = fixture();
    state.role = broader;
    assert.throws(run, /single read-only privilege contract/);
    assert.equal(state.grants, 0);
    assert.equal(state.creates, 0);
  }
});

test('provisioning does not revoke or reshape other existing application grants', () => {
  const { state, run } = fixture();
  state.user.roles.push({ role: 'existingScopedRole', db: 'app' });
  const original = plain(state.user.roles);
  run();
  assert.deepEqual(state.user.roles, [
    ...original,
    { role: definition.role, db: definition.db },
  ]);
});

test('missing, linked, oversized or malformed shared definitions fail before database access', () => {
  const invalidDefinitions = [
    null,
    [],
    {},
    { ...plain(definition), db: 'app' },
    { ...plain(definition), role: '' },
    { ...plain(definition), role: 'invalid role' },
    { ...plain(definition), roles: [{ role: 'root', db: 'admin' }] },
    { ...plain(definition), privileges: [] },
    { ...plain(definition), privileges: [plain(definition.privileges[0]), plain(definition.privileges[0])] },
    { ...plain(definition), privileges: [{ resource: { anyResource: true }, actions: ['getDefaultRWConcern'] }] },
    { ...plain(definition), privileges: [{ resource: { cluster: true, db: 'app' }, actions: ['getDefaultRWConcern'] }] },
    { ...plain(definition), privileges: [{ resource: { cluster: true }, actions: [] }] },
    { ...plain(definition), privileges: [{ resource: { cluster: true }, actions: ['getDefaultRWConcern', 'setDefaultRWConcern'] }] },
    { ...plain(definition), privileges: [{ resource: { cluster: true }, actions: ['invalid action'] }] },
    { ...plain(definition), unexpected: 'must-not-appear-in-errors' },
  ];
  const invalidFiles = [
    state => { state.readError = new Error('ENOENT must-not-appear-in-errors'); },
    state => { state.definitionStat.isSymbolicLink = () => true; },
    state => { state.definitionStat.isFile = () => false; },
    state => { state.definitionStat.size = 4097; },
    state => { state.definitionBytes = Buffer.alloc(4097, ' '); },
    state => { state.definitionBytes = Buffer.from('{"private":"must-not-appear-in-errors"'); },
    ...invalidDefinitions.map(value => state => { state.definitionBytes = Buffer.from(JSON.stringify(value)); }),
  ];
  for (const invalidate of invalidFiles) {
    const { state, run } = fixture();
    invalidate(state);
    assert.throws(run, error => error.message === 'MoFaCTS read-concern role definition is missing or invalid.');
    assert.equal(state.databaseReads, 0);
    assert.equal(state.creates, 0);
    assert.equal(state.grants, 0);
  }
});

test('fails before mutation when the configured application user is missing', () => {
  const { state, run } = fixture();
  state.user = null;
  assert.throws(run, /user does not exist/);
  assert.equal(state.creates, 0);
  assert.equal(state.grants, 0);
});

test('invalid application-user role metadata fails before creating or granting the shared role', () => {
  for (const roles of [undefined, null, 'readWrite']) {
    const { state, run } = fixture();
    state.user.roles = roles;
    assert.throws(run, /invalid role metadata/);
    assert.equal(state.creates, 0);
    assert.equal(state.grants, 0);
  }
});
