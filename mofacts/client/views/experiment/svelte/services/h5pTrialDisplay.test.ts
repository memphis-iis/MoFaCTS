import { expect } from 'chai';
import { resolveH5PTrialDisplayResult } from './h5pTrialDisplay';

describe('H5P trial display service', function() {
  it('returns null for non-H5P displays', function() {
    expect(resolveH5PTrialDisplayResult({ text: 'Prompt' }, null, '[test]')).to.equal(null);
  });

  it('normalizes self-hosted H5P results through the registered trial-display adapter', function() {
    const display = {
      h5p: {
        sourceType: 'self-hosted',
        contentId: 'content-a',
      },
    };
    const result = {
      contentId: 'content-a',
      batchId: 'batch-a',
      completed: true,
      events: [],
    };

    expect(resolveH5PTrialDisplayResult(display, result, '[test]')).to.deep.equal(result);
  });

  it('fails clearly for missing or mismatched H5P result data', function() {
    const display = {
      h5p: {
        sourceType: 'self-hosted',
        contentId: 'content-a',
      },
    };

    expect(() => resolveH5PTrialDisplayResult(display, null, '[test]'))
      .to.throw('[test] H5P result missing');
    expect(() => resolveH5PTrialDisplayResult(display, {
      contentId: 'content-b',
      batchId: 'batch-b',
      completed: true,
      events: [],
    }, '[test]')).to.throw('contentId does not match');
  });
});
