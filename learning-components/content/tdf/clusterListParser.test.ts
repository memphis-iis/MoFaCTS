import { strict as assert } from 'assert';
import { applyClusterListAvailability } from './clusterListParser';

describe('clusterListParser', function() {
  it('marks singleton cluster entries as usable', function() {
    const cards = [{ canUse: false }];

    applyClusterListAvailability(
      cards,
      ['0'],
      () => [],
      (value) => Number(value),
    );

    assert.equal(cards[0]?.canUse, true);
  });
});