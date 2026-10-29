import { strict as assert } from 'node:assert';
import { createStimClusterMapping, isValidClusterPermutation } from './clusterMapping';

function withRandomDraws<T>(draws: number[], work: () => T) {
  const original = Math.random;
  let used = 0;
  Math.random = () => {
    const draw = draws[used++];
    if (draw === undefined) throw new Error('Unexpected random draw in cluster mapping');
    return draw;
  };
  try {
    return { value: work(), used };
  } finally {
    Math.random = original;
  }
}

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

  it('performs shuffle passes before chunk swaps without mutating the starting mapping', function() {
    const start = [0, 1, 2, 3];
    const result = withRandomDraws([0, 0, 0, 0, 0, 0], () =>
      createStimClusterMapping(4, ['0-3'], ['0-1', '2-3'], start));
    assert.deepEqual(result.value, [3, 0, 1, 2]);
    assert.equal(result.used, 6);
    assert.deepEqual(start, [0, 1, 2, 3]);
  });

  it('retains blank swap entries and their existing random draw consumption', function() {
    const blank = withRandomDraws([.4], () => createStimClusterMapping(3, [''], [''], [2, 1, 0]));
    assert.deepEqual(blank.value, [2, 1, 0]);
    assert.equal(blank.used, 1);
    const empty = withRandomDraws([], () => createStimClusterMapping(3, [], [], [2, 1, 0]));
    assert.deepEqual(empty.value, [2, 1, 0]);
    assert.equal(empty.used, 0);
  });

  it('keeps the content owner zero-count and scalar-input behavior independent of assessment inputs', function() {
    const untouched = withRandomDraws([], () => createStimClusterMapping(0, [], [], [1, 0]));
    assert.deepEqual(untouched.value, [1, 0]);
    const empty = withRandomDraws([], () => createStimClusterMapping(0, [''], [], [1, 0]));
    assert.deepEqual(empty.value, []);
    const scalarShuffle = withRandomDraws([], () => createStimClusterMapping(3, '0-2', [], []));
    assert.deepEqual(scalarShuffle.value, [0, 1, 2]);
    const scalarSwap = withRandomDraws([.5], () => createStimClusterMapping(3, [], '0-1', []));
    assert.deepEqual(scalarSwap.value, [0, 1, 2]);
    assert.equal(scalarSwap.used, 1);
  });

  it('distinguishes sequential shuffle passes from overlapping ranges within one pass', function() {
    const passes = withRandomDraws([0, 0, 0, 0], () => createStimClusterMapping(3, ['0-1', '1-2'], [], []));
    assert.deepEqual(passes.value, [1, 2, 0]);
    const overlapping = withRandomDraws([0, 0, 0, 0], () => createStimClusterMapping(3, ['0-1 1-2'], [], []));
    assert.deepEqual(overlapping.value, [1, 2, 1]);
    assert.equal(isValidClusterPermutation(overlapping.value, 3), false);
  });
});
