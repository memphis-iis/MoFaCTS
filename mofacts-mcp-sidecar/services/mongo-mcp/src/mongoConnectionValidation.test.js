import assert from 'node:assert/strict';
import test from 'node:test';

import { validateConnectedMongoTarget } from './mongoConnectionValidation.js';

test('accepts a successful ping on the exact configured replica set', () => {
  assert.doesNotThrow(() => validateConnectedMongoTarget({
    hello: { ok: 1, setName: 'mofacts-rs' },
    ping: { ok: 1 },
    expectedReplicaSetName: 'mofacts-rs'
  }));
});

test('rejects standalone and wrong-set connections without including a URI', () => {
  for (const hello of [{ ok: 1 }, { ok: 1, setName: 'other-rs' }]) {
    assert.throws(
      () => validateConnectedMongoTarget({
        hello,
        ping: { ok: 1 },
        expectedReplicaSetName: 'mofacts-rs'
      }),
      (error) => error.message === 'Mongo MCP connected replica set does not match the configured identity.'
    );
  }
});

test('rejects a failed database ping', () => {
  assert.throws(
    () => validateConnectedMongoTarget({
      hello: { ok: 1, setName: 'mofacts-rs' },
      ping: { ok: 0 },
      expectedReplicaSetName: 'mofacts-rs'
    }),
    /database ping failed/
  );
});
