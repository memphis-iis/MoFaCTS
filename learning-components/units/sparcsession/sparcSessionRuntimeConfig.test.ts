import assert from 'node:assert/strict';
import {
  resolveSparcSessionClusterListSource,
  resolveSparcSessionRuntimeConfig,
} from './sparcSessionRuntimeConfig';

describe('sparc session runtime config', function() {
  it('resolves sparcsession config when present', function() {
    const sparcSession = { clusterlist: ' 0 1 ' };
    assert.equal(resolveSparcSessionRuntimeConfig({ sparcsession: sparcSession }), sparcSession);
    assert.equal(resolveSparcSessionRuntimeConfig({}), null);
  });

  it('trims sparcsession cluster lists', function() {
    assert.equal(resolveSparcSessionClusterListSource({ sparcsession: { clusterlist: ' 0 1 ' } }), '0 1');
    assert.equal(resolveSparcSessionClusterListSource({}), undefined);
  });
});