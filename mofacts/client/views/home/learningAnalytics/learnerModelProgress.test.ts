import { expect } from 'chai';
import { consolidateLearnerModelProgress } from './learnerModelProgress';

describe('learnerModelProgress', function() {
  it('consolidates probabilities into one 40-bin client snapshot', function() {
    const result = consolidateLearnerModelProgress([
      { unitIndex: 0, challengeTarget: 0.8, itemProbabilities: [0, 0.8] },
      { unitIndex: 1, challengeTarget: 0.8, itemProbabilities: [0.81, 1] },
    ]);
    expect(result.reason).to.equal(undefined);
    expect(result.progress).to.deep.include({
      meanProbability: 0.6525000000000001,
      challengeTarget: 0.8,
      reachedChallengeTargetCount: 3,
      belowChallengeTargetCount: 1,
      modeledItemCount: 4,
    });
    expect(result.progress?.histogramBins).to.have.length(40);
    expect(result.progress?.histogramBins.reduce((sum, bin) => sum + bin.count, 0)).to.equal(4);
  });

  it('does not combine units with multiple challenge targets', function() {
    expect(consolidateLearnerModelProgress([
      { unitIndex: 0, challengeTarget: 0.8, itemProbabilities: [0.9] },
      { unitIndex: 1, challengeTarget: 0.9, itemProbabilities: [0.9] },
    ])).to.deep.equal({ reason: 'multiple-challenge-targets' });
  });

  it('reports unsupported when no learner model units exist', function() {
    expect(consolidateLearnerModelProgress([])).to.deep.equal({ reason: 'not-supported' });
  });
});
