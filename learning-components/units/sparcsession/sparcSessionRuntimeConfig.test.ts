import assert from 'node:assert/strict';
import {
  resolveSparcSessionPageId,
  resolveSparcSessionOrientationMode,
  resolveSparcSessionProbabilitySource,
  resolveSparcSessionRuntimeConfig,
  resolveSparcSessionStartingKC,
  resolveSparcSessionUnitMode,
  validateSparcSessionModelConfiguration,
} from './sparcSessionRuntimeConfig';

describe('sparc session runtime config', function() {
  it('resolves sparcsession config when present', function() {
    const sparcSession = { clusterlist: ' 0 1 ' };
    assert.equal(resolveSparcSessionRuntimeConfig({ sparcsession: sparcSession }), sparcSession);
    assert.equal(resolveSparcSessionRuntimeConfig({}), null);
  });

  it('trims sparcsession page ids', function() {
    assert.equal(resolveSparcSessionPageId({ sparcsession: { pageId: ' page-1 ' } }), 'page-1');
    assert.equal(resolveSparcSessionPageId({ sparcsession: { pageId: '  ' } }), undefined);
    assert.equal(resolveSparcSessionPageId({}), undefined);
  });

  it('reads the unit starting KC and rejects invalid configured identities', function() {
    assert.equal(resolveSparcSessionStartingKC({ sparcsession: { startingKC: ' biology.kc.s06 ' } }), 'biology.kc.s06');
    assert.equal(resolveSparcSessionStartingKC({}), undefined);
    for (const startingKC of ['', '  ', 6, null]) {
      assert.throws(() => resolveSparcSessionStartingKC({ sparcsession: { startingKC } }), /nonempty clusterKC identity/);
    }
  });

  it('resolves sparcsession unit mode without learning-session aliases', function() {
    assert.equal(resolveSparcSessionUnitMode({ sparcsession: { unitMode: ' distance ' } }), 'distance');
    assert.equal(resolveSparcSessionUnitMode({ sparcsession: { unitMode: '   ' } }), 'default');
    assert.equal(resolveSparcSessionUnitMode({}), 'default');
  });

  it('resolves sparcsession probability source', function() {
    assert.equal(
      resolveSparcSessionProbabilitySource({ sparcsession: { calculateProbability: ' return p; ' } }),
      'return p;'
    );
    assert.equal(resolveSparcSessionProbabilitySource({ sparcsession: { calculateProbability: '  ' } }), undefined);
  });

  it('defaults orientation to full and preserves each explicit per-lesson mode', function() {
    assert.equal(resolveSparcSessionOrientationMode(undefined), 'full');
    assert.equal(resolveSparcSessionOrientationMode({ sparcsession: {} }), 'full');
    for (const orientationMode of ['full', 'headings', 'off']) {
      const unit = { sparcsession: { orientationMode } };
      assert.equal(resolveSparcSessionOrientationMode(unit), orientationMode);
      assert.deepEqual(validateSparcSessionModelConfiguration(unit), []);
    }
  });

  it('rejects invalid orientation modes at runtime and upload configuration validation', function() {
    for (const orientationMode of ['', 'FULL', 'none', ' full ', true, 0, null, {}, []]) {
      const unit = { sparcsession: { orientationMode } };
      assert.throws(() => resolveSparcSessionOrientationMode(unit), /orientationMode must be full, headings, or off/);
      assert.equal(validateSparcSessionModelConfiguration(unit)[0]?.kind, 'invalid-sparcsession-orientation-mode');
    }
  });

  it('validates coherent model configuration for model-backed SPARC features', function() {
    assert.deepEqual(validateSparcSessionModelConfiguration({ sparcsession: {
      teacherPersona: { teachingStyle: ['Explain conceptual relationships'] },
    } }), []);
    assert.equal(validateSparcSessionModelConfiguration({ sparcsession: {
      teacherPersona: { personalInterests: ['Soccer'] },
    } })[0]?.kind, 'invalid-sparcsession-teacher-persona');
    assert.deepEqual(validateSparcSessionModelConfiguration({}), [{
      kind: 'missing-sparcsession-model-config',
      message: 'SPARC model-backed features require unit-level sparcsession model configuration',
    }]);
    assert.deepEqual(validateSparcSessionModelConfiguration({ sparcsession: {} }), []);
    assert.deepEqual(validateSparcSessionModelConfiguration({
      sparcsession: {
        pageId: 'page-1',
        calculateProbability: 'return p;',
      },
    }), []);
  });
});
