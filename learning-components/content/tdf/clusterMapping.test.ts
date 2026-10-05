import assert from 'node:assert/strict';
import { createStimClusterMapping, isValidClusterPermutation } from './clusterMapping';

describe('cluster mapping contract', function() {
  it('preserves identity outside configured shuffle and swap ranges', function() {
    const mapping = createStimClusterMapping(8, ['2-5'], ['0-1'], []);
    assert.equal(mapping.length, 8);
    assert.deepEqual([...new Set(mapping)].sort((left, right) => left - right), [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.equal(mapping[6], 6);
    assert.equal(mapping[7], 7);
    assert.equal(isValidClusterPermutation(mapping, 8), true);
  });

  it('accepts saved permutations independently of current shuffle settings', function() {
    assert.equal(isValidClusterPermutation([1, 0], 2), true);
  });
});
