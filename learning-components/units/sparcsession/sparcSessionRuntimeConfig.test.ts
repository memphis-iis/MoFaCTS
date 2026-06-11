import assert from 'node:assert/strict';
import {
  resolveSparcSessionClusterListSource,
  resolveSparcSessionModelPreparationClusterListSource,
  resolveSparcSessionProbabilitySource,
  resolveSparcSessionRuntimeConfig,
  resolveSparcSessionUnitMode,
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

  it('resolves sparcsession unit mode without learning-session aliases', function() {
    assert.equal(resolveSparcSessionUnitMode({ sparcsession: { unitMode: ' distance ' } }), 'distance');
    assert.equal(resolveSparcSessionUnitMode({ sparcsession: { unitMode: '   ' } }), 'default');
    assert.equal(resolveSparcSessionUnitMode({}), 'default');
  });

  it('resolves sparcsession probability source and model-preparation cluster list', function() {
    assert.equal(
      resolveSparcSessionProbabilitySource({ sparcsession: { calculateProbability: ' return p; ' } }),
      'return p;'
    );
    assert.equal(resolveSparcSessionProbabilitySource({ sparcsession: { calculateProbability: '  ' } }), undefined);
    assert.equal(
      resolveSparcSessionModelPreparationClusterListSource({ sparcsession: { clusterlist: ' 0 ' } }),
      '0'
    );
  });
});
