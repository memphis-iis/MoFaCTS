import { expect } from 'chai';
import { normalizeH5PTrialResult } from './h5pTrialResult';

describe('h5p trial result contract', function() {
  it('normalizes the self-hosted H5P result payload used by card submission', function() {
    const result = normalizeH5PTrialResult({
      contentId: ' activity-1 ',
      batchId: ' batch-1 ',
      completed: true,
      passed: false,
      score: 1,
      maxScore: 2,
      scaledScore: 0.5,
      library: ' H5P.MultiChoice 1.16 ',
      widgetType: ' H5P.MultiChoice ',
      responseSummary: 'choice-a',
      events: [{ response: 'choice-a', correct: true }],
    }, 'activity-1');

    expect(result).to.deep.equal({
      contentId: 'activity-1',
      batchId: 'batch-1',
      completed: true,
      passed: false,
      score: 1,
      maxScore: 2,
      scaledScore: 0.5,
      library: 'H5P.MultiChoice 1.16',
      widgetType: 'H5P.MultiChoice',
      responseSummary: 'choice-a',
      events: [{ response: 'choice-a', correct: true }],
    });
  });

  it('fails clearly when required identity fields are absent or mismatched', function() {
    expect(() => normalizeH5PTrialResult({
      batchId: 'batch-1',
      completed: true,
      events: [],
    })).to.throw('contentId');

    expect(() => normalizeH5PTrialResult({
      contentId: 'activity-1',
      completed: true,
      events: [],
    })).to.throw('batchId');

    expect(() => normalizeH5PTrialResult({
      contentId: 'activity-1',
      batchId: 'batch-1',
      completed: true,
      events: [],
    }, 'activity-2')).to.throw('contentId does not match');
  });

  it('fails clearly when result values cannot be logged deterministically', function() {
    expect(() => normalizeH5PTrialResult({
      contentId: 'activity-1',
      batchId: 'batch-1',
      completed: 'true',
      events: [],
    })).to.throw('completed');

    expect(() => normalizeH5PTrialResult({
      contentId: 'activity-1',
      batchId: 'batch-1',
      completed: true,
      score: Number.NaN,
      events: [],
    })).to.throw('score');

    expect(() => normalizeH5PTrialResult({
      contentId: 'activity-1',
      batchId: 'batch-1',
      completed: true,
      events: ['not-an-object'],
    })).to.throw('event at index 0');
  });
});
