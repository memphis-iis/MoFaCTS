const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../deploy/mongodb/init-replica-set.js'), 'utf8');

function fixture(writableAfterSleeps) {
  const state = { sleeps: 0, provisions: 0, exits: [] };
  let now = 0;
  const config = { ok: 1, config: { _id: 'test-rs', members: [{ host: 'mongodb:27017' }] } };
  const admin = {
    runCommand(command) {
      if (command.hello) return {
        ok: 1, setName: 'test-rs', isWritablePrimary: state.sleeps >= writableAfterSleeps,
      };
      if (command.replSetGetConfig) return config;
      if (command.replSetGetStatus) return { ok: 1, members: [{ state: 1, stateStr: 'PRIMARY' }] };
      throw new Error('Unexpected MongoDB operation');
    },
  };
  const context = {
    process: { env: { MOFACTS_MONGO_REPLICA_SET_NAME: 'test-rs', MOFACTS_MONGO_REPLICA_SET_MEMBER: 'mongodb:27017' } },
    Date: { now: () => now },
    db: { getSiblingDB(name) { assert.equal(name, 'admin'); return admin; } },
    sleep(ms) { now += ms; state.sleeps += 1; },
    load(file) {
      assert.equal(file, '/opt/mofacts-mongodb/ensure-app-read-concern-role.js');
      assert.ok(state.sleeps >= writableAfterSleeps, 'must not provision before this server accepts primary writes');
      state.provisions += 1;
    },
    print() {},
    quit(code) { state.exits.push(code); throw new Error('fixture-exit'); },
  };
  return { state, run: () => vm.runInNewContext(source, context) };
}

test('waits for writable hello even after replica status reports an elected primary', () => {
  const { state, run } = fixture(2);
  assert.throws(run, /fixture-exit/);
  assert.equal(state.sleeps, 2);
  assert.equal(state.provisions, 1);
  assert.deepEqual(state.exits, [0]);
});

test('fails without provisioning if the elected member never becomes writable', () => {
  const { state, run } = fixture(Infinity);
  assert.throws(run, /did not report a writable primary before timeout/);
  assert.equal(state.provisions, 0);
  assert.deepEqual(state.exits, []);
});

test('provisions immediately when this server is already a writable primary', () => {
  const { state, run } = fixture(0);
  assert.throws(run, /fixture-exit/);
  assert.equal(state.sleeps, 0);
  assert.equal(state.provisions, 1);
  assert.deepEqual(state.exits, [0]);
});
