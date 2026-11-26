import assert from 'node:assert/strict';
import test from 'node:test';
import { syncGoogleOAuthConfiguration } from '../../../server/startup/googleOAuthConfiguration.ts';

const credentials = {
  clientId: 'synthetic.apps.googleusercontent.com',
  secret: 'synthetic-google-oauth-secret',
};

test('Google startup clears unavailable service records without writing incomplete credentials', async () => {
  for (const settings of [undefined, {}, { clientId: credentials.clientId },
    { ...credentials, clientId: 'undefined' }, { ...credentials, secret: 'null' },
    { ...credentials, secret: ' ' }, { ...credentials, clientId: 42 }]) {
    const removed = [];
    const store = {
      upsertAsync: async () => assert.fail('Incomplete configuration must not be published'),
      removeAsync: async selector => { removed.push(selector); },
    };
    assert.equal(await syncGoogleOAuthConfiguration(store, settings), false);
    assert.deepEqual(removed, [{ service: 'google' }]);
  }
});

test('Google startup writes only the configured client and secret for its service', async () => {
  const writes = [];
  const store = {
    upsertAsync: async (...args) => { writes.push(args); },
    removeAsync: async () => assert.fail('Configured Google service must remain enabled'),
  };
  assert.equal(await syncGoogleOAuthConfiguration(store, { ...credentials, unownedSetting: true }), true);
  assert.deepEqual(writes, [[{ service: 'google' }, { $set: credentials }]]);
});
