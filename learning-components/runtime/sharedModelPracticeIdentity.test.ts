import assert from 'node:assert/strict';
import {
  modelPracticeEnvelopeMatches,
  normalizeClusterKC,
  resolveModelPracticeEnvelope,
  resolveSharedModelPracticeKey,
  sharedModelPracticeKeyMatches,
} from './sharedModelPracticeIdentity';

describe('sharedModelPracticeIdentity', function() {
  it('normalizes numeric and semantic cluster KCs for shared model keys', function() {
    assert.equal(normalizeClusterKC(1007), '1007');
    assert.equal(normalizeClusterKC(' Fractions.Addition.Like_Denominators '), 'fractions.addition.like_denominators');
  });

  it('resolves a compatibility envelope without deriving stimulus identity from clusterKC', function() {
    const envelope = resolveModelPracticeEnvelope({
      stimuliSetId: 'stim-set-1',
      clusterKC: ' Fractions.LCD ',
      stimulusKC: 'item-variant-a',
    });

    assert.deepEqual(envelope, {
      stimuliSetId: 'stim-set-1',
      clusterKC: 'fractions.lcd',
      stimulusKC: 'item-variant-a',
      KCId: 'item-variant-a',
      KCDefault: 'item-variant-a',
      KCCluster: 'fractions.lcd',
    });
  });

  it('matches shared model keys by user, context, and normalized clusterKC only', function() {
    const left = resolveSharedModelPracticeKey('user-1', {
      contextKind: 'course',
      contextId: 'course-1',
    }, { clusterKC: ' Fractions.LCD ' });
    const right = resolveSharedModelPracticeKey('user-1', {
      contextKind: 'course',
      contextId: 'course-1',
    }, { clusterKC: 'fractions.lcd' });

    assert.equal(sharedModelPracticeKeyMatches(left, right), true);
    assert.equal(sharedModelPracticeKeyMatches(left, {
      ...right,
      contextId: 'course-2',
    }), false);
  });

  it('keeps envelope matching sensitive to item-level fields', function() {
    const left = resolveModelPracticeEnvelope({
      stimuliSetId: 'stim-set-1',
      clusterKC: 'fractions.lcd',
      stimulusKC: 'item-a',
    });
    const right = resolveModelPracticeEnvelope({
      stimuliSetId: 'stim-set-2',
      clusterKC: 'fractions.lcd',
      stimulusKC: 'item-b',
    });

    assert.equal(modelPracticeEnvelopeMatches(left, right), false);
  });

  it('fails before building a shared key from a blank clusterKC', function() {
    assert.throws(
      () => resolveSharedModelPracticeKey('user-1', {
        contextKind: 'tdf',
        contextId: 'tdf-1',
      }, { clusterKC: '   ' }),
      /Model practice identity missing clusterKC/,
    );
  });
});
