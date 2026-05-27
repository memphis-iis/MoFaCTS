import { expect } from 'chai';
import {
  normalizeH5PDisplayConfig,
} from '../../learning-components/trial-displays/h5p/h5pDisplay';
import {
  normalizeH5PTrialResult,
  resolveH5PModelOutcomes,
} from '../../learning-components/trial-displays/h5p/h5pTrialResult';
import {
  normalizeH5PDisplayConfig as normalizeAppH5PDisplayConfig,
} from './lib/h5pDisplay';
import {
  normalizeH5PTrialResult as normalizeAppH5PTrialResult,
  resolveH5PModelOutcomes as resolveAppH5PModelOutcomes,
} from './lib/h5pTrialResult';

describe('H5P component compatibility facades', function() {
  it('keeps app display config normalization aligned with the component-owned contract', function() {
    const display = {
      sourceType: 'self-hosted',
      contentId: ' content-1 ',
      packageAssetId: ' package-1 ',
      library: ' H5P.Blanks 1.14 ',
      completionPolicy: 'xapi-completed',
      scorePolicy: 'correct-if-passed',
      preferredHeight: 600,
    };

    expect(normalizeAppH5PDisplayConfig(display)).to.deep.equal(normalizeH5PDisplayConfig(display));
  });

  it('keeps app trial result normalization aligned with the component-owned contract', function() {
    const result = {
      contentId: 'content-1',
      batchId: 'batch-1',
      completed: true,
      score: 1,
      maxScore: 2,
      events: [
        { eventIndex: 0, correct: true },
        { eventIndex: 1, correct: false },
      ],
    };

    const componentResult = normalizeH5PTrialResult(result, 'content-1');
    expect(normalizeAppH5PTrialResult(result, 'content-1')).to.deep.equal(componentResult);
    expect(resolveAppH5PModelOutcomes(componentResult)).to.deep.equal(resolveH5PModelOutcomes(componentResult));
  });
});
