import assert from 'node:assert/strict';
import {
  resolveSparcSessionClusterListSource,
  resolveSparcSessionModelPreparationClusterListSource,
  resolveSparcSessionPageId,
  resolveSparcSessionProbabilitySource,
  resolveSparcSessionRuntimeConfig,
  resolveSparcSessionUnitMode,
  validateSparcSessionModelConfiguration,
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

  it('trims sparcsession page ids', function() {
    assert.equal(resolveSparcSessionPageId({ sparcsession: { pageId: ' page-1 ' } }), 'page-1');
    assert.equal(resolveSparcSessionPageId({ sparcsession: { pageId: '  ' } }), undefined);
    assert.equal(resolveSparcSessionPageId({}), undefined);
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

  it('validates coherent model configuration for model-backed SPARC features', function() {
    assert.deepEqual(validateSparcSessionModelConfiguration({}), [{
      kind: 'missing-sparcsession-model-config',
      message: 'SPARC model-backed features require unit-level sparcsession model configuration',
    }]);
    assert.deepEqual(validateSparcSessionModelConfiguration({ sparcsession: {} }), [{
      kind: 'missing-sparcsession-pageId',
      message: 'SPARC sessions require unit-level sparcsession.pageId',
    }, {
      kind: 'missing-sparcsession-clusterlist',
      message: 'SPARC model-backed features require unit-level sparcsession.clusterlist',
    }, {
      kind: 'missing-sparcsession-calculateProbability',
      message: 'SPARC model-backed features require unit-level sparcsession.calculateProbability',
    }]);
    assert.deepEqual(validateSparcSessionModelConfiguration({
      sparcsession: {
        pageId: 'page-1',
        clusterlist: '0',
        calculateProbability: 'return p;',
      },
    }), []);
  });
});
