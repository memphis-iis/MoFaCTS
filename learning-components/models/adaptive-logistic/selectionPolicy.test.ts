import { strict as assert } from 'assert';
import { selectCardClosestToOptimalProbability } from './selectionPolicy';

describe('selectionPolicy', function() {
  it('falls back to stim parameters when optimalThreshold is zero', function() {
    const result = selectCardClosestToOptimalProbability(
      [
        {
          canUse: true,
          trialsSinceLastSeen: 3,
          stims: [
            {
              canUse: true,
              stimulusKC: 1,
              parameter: [0, 0.7],
              probabilityEstimate: 0.7,
            },
          ],
        },
      ],
      [],
      { optimalThreshold: 0, forceSpacing: false },
    );

    assert.deepEqual(result, { clusterIndex: 0, stimIndex: 0 });
  });

  it('skips SPARC model-practice-only targets during trial selection', function() {
    const result = selectCardClosestToOptimalProbability(
      [
        {
          canUse: true,
          trialsSinceLastSeen: 3,
          stims: [
            {
              canUse: true,
              stimulusKC: 'fractions.lcd',
              modelPracticeOnly: true,
              parameter: [0, 0.8],
              probabilityEstimate: 0.8,
            },
            {
              canUse: true,
              stimulusKC: 1,
              parameter: [0, 0.7],
              probabilityEstimate: 0.7,
            },
          ],
        },
      ],
      [],
      { optimalThreshold: 0, forceSpacing: false },
    );

    assert.deepEqual(result, { clusterIndex: 0, stimIndex: 1 });
  });
});
