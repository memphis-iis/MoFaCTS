const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../deploy/mongodb/ensure-app-read-concern-role.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const state = { role: null, user: { roles: [{ role: 'readWrite', db: 'app' }] }, creates: 0, grants: 0 };
  const context = {
    process: { env: { MOFACTS_MONGO_APP_DATABASE: 'app', MOFACTS_MONGO_APP_USERNAME: 'learnerApp' } },
    print() {},
    db: { getSiblingDB(name) {
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
        getRole: () => state.role,
        createRole: role => { state.creates += 1; state.role = plain(role); },
      };
    } },
  };
  return { state, run: () => vm.runInNewContext(source, context) };
}

test('grants exactly the consistency-default read action and preserves existing roles', () => {
  const { state, run } = fixture();
  run();
  assert.deepEqual(state.role, {
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
    { privileges: [{ resource: { cluster: true }, actions: ['getDefaultRWConcern', 'setDefaultRWConcern'] }], roles: [] },
    { privileges: [{ resource: { cluster: true }, actions: ['getDefaultRWConcern'] }], roles: [{ role: 'root', db: 'admin' }] },
  ]) {
    const { state, run } = fixture();
    state.role = broader;
    assert.throws(run, /single read-only privilege contract/);
    assert.equal(state.grants, 0);
    assert.equal(state.creates, 0);
  }
});

test('fails before mutation when the configured application user is missing', () => {
  const { state, run } = fixture();
  state.user = null;
  assert.throws(run, /user does not exist/);
  assert.equal(state.creates, 0);
  assert.equal(state.grants, 0);
});
