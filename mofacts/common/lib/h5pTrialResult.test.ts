import { expect } from 'chai';
import { normalizeH5PTrialResult, resolveH5PModelOutcomes } from './h5pTrialResult';

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

  it('maps each H5P part correctness into one model observation for the same card', function() {
    const result = normalizeH5PTrialResult({
      contentId: 'activity-1',
      batchId: 'batch-1',
      completed: true,
      events: [
        { eventIndex: 2, response: 'a', correct: true },
        { eventIndex: 3, response: 'b', correct: false },
        { eventIndex: 4, response: 'c', correct: true },
      ],
    });

    expect(resolveH5PModelOutcomes(result)).to.deep.equal([
      { correct: true, eventIndex: 2, source: 'event' },
      { correct: false, eventIndex: 3, source: 'event' },
      { correct: true, eventIndex: 4, source: 'event' },
    ]);
  });

  it('expands integer H5P scores into separate model observations only when part events are unavailable', function() {
    const result = normalizeH5PTrialResult({
      contentId: 'activity-1',
      batchId: 'batch-1',
      completed: true,
      score: 2,
      maxScore: 3,
      events: [],
    });

    expect(resolveH5PModelOutcomes(result)).to.deep.equal([
      { correct: true, eventIndex: 0, source: 'score' },
      { correct: true, eventIndex: 1, source: 'score' },
      { correct: false, eventIndex: 2, source: 'score' },
    ]);
  });

  it('fails clearly when H5P model correctness is indeterminate', function() {
    expect(() => resolveH5PModelOutcomes(normalizeH5PTrialResult({
      contentId: 'activity-1',
      batchId: 'batch-1',
      completed: true,
      passed: true,
      events: [],
    }))).to.throw('model outcomes require');

    expect(() => resolveH5PModelOutcomes(normalizeH5PTrialResult({
      contentId: 'activity-1',
      batchId: 'batch-1',
      completed: false,
      events: [{ correct: true }],
    }))).to.throw('completed');
  });
});
