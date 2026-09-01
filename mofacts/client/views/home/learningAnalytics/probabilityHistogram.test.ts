import { expect } from 'chai';
import { buildProbabilityHistogram } from './probabilityHistogram';

describe('probabilityHistogram', function() {
  it('creates exactly 40 equal bins and conserves boundary values', function() {
    const probabilities = [0, 0.024999, 0.025, 0.05, 0.975, 1];
    const bins = buildProbabilityHistogram(probabilities);

    expect(bins).to.have.length(40);
    expect(bins[0]).to.deep.equal({ start: 0, end: 0.025, count: 2 });
    expect(bins[1]).to.deep.equal({ start: 0.025, end: 0.05, count: 1 });
    expect(bins[2]).to.deep.equal({ start: 0.05, end: 0.075, count: 1 });
    expect(bins[39]).to.deep.equal({ start: 0.975, end: 1, count: 2 });
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).to.equal(probabilities.length);
  });

  it('rejects values outside the probability contract', function() {
    expect(() => buildProbabilityHistogram([-0.001])).to.throw('between 0 and 1');
    expect(() => buildProbabilityHistogram([1.001])).to.throw('between 0 and 1');
    expect(() => buildProbabilityHistogram([Number.NaN])).to.throw('between 0 and 1');
  });
});
