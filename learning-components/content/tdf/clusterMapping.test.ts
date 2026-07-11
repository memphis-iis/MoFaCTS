import assert from 'node:assert/strict';
import { createStimClusterMapping, isClusterMappingCompatibleWithSetSpec } from './clusterMapping';

describe('cluster mapping contract', function() {
  it('preserves identity outside configured shuffle and swap ranges', function() {
    const mapping = createStimClusterMapping(8, ['2-5'], ['0-1'], []);
    assert.equal(mapping.length, 8);
    assert.deepEqual([...new Set(mapping)].sort((left, right) => left - right), [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.equal(mapping[6], 6);
    assert.equal(mapping[7], 7);
    assert.equal(isClusterMappingCompatibleWithSetSpec(mapping, 8, {
      shuffleclusters: ['2-5'],
      swapclusters: ['0-1'],
    }), true);
  });

  it('rejects non-identity mappings when no authored mapping behavior exists', function() {
    assert.equal(isClusterMappingCompatibleWithSetSpec([1, 0], 2, {}), false);
  });
});
