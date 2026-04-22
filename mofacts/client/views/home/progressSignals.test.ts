import { expect } from 'chai';
import {
  applyFallbackProgressSignals,
  shouldUseProgressSignalFallback,
} from './progressSignals';

describe('dashboard progress signals', function() {
  it('uses fallback when cache is missing or meaningful progress is empty', function() {
    expect(shouldUseProgressSignalFallback(undefined, 0)).to.equal(true);
    expect(shouldUseProgressSignalFallback({ tdfStats: {} }, 0)).to.equal(true);
    expect(shouldUseProgressSignalFallback({ tdfStats: { a: {} } }, 2)).to.equal(false);
  });

  it('merges attempted and meaningful progress signals from fallback payload', function() {
    const attempted = new Set<string>(['tdf-existing']);
    const meaningful = new Set<string>();
    applyFallbackProgressSignals(attempted, meaningful, {
      attemptedTdfIds: ['tdf-existing', 'tdf-a'],
      meaningfulProgressTdfIds: ['tdf-a'],
    });

    expect(Array.from(attempted).sort()).to.deep.equal(['tdf-a', 'tdf-existing']);
    expect(Array.from(meaningful)).to.deep.equal(['tdf-a']);
  });
});
