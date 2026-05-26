import { expect } from 'chai';
import {
  resolveH5PTrialDisplayResult,
  resolveSelfHostedH5PTrialDisplay,
  selfHostedH5PTrialDisplayOwnsInteraction,
} from './h5pTrialDisplay';

function createSelfHostedDisplay() {
  return {
    h5p: {
      sourceType: 'self-hosted',
      contentId: 'content-a',
      packageAssetId: 'asset-a',
      library: 'H5P.MultiChoice 1.16',
      completionPolicy: 'xapi-completed',
      scorePolicy: 'record-only',
    },
  };
}

describe('H5P trial display service', function() {
  it('returns null for non-H5P displays', function() {
    expect(resolveH5PTrialDisplayResult({ text: 'Prompt' }, null, '[test]')).to.equal(null);
  });

  it('resolves only self-hosted H5P trial displays for owned interaction', function() {
    const externalDisplay = {
      h5p: {
        sourceType: 'external-embed',
        embedUrl: 'https://example.com/h5p/embed/1',
        completionPolicy: 'viewed',
      },
    };

    expect(resolveSelfHostedH5PTrialDisplay(externalDisplay, '[test]')).to.equal(null);
    expect(selfHostedH5PTrialDisplayOwnsInteraction(externalDisplay)).to.equal(false);
    expect(resolveSelfHostedH5PTrialDisplay(createSelfHostedDisplay(), '[test]')?.h5p).to.deep.equal({
      sourceType: 'self-hosted',
      contentId: 'content-a',
      packageAssetId: 'asset-a',
      library: 'H5P.MultiChoice 1.16',
      completionPolicy: 'xapi-completed',
      scorePolicy: 'record-only',
    });
  });

  it('normalizes self-hosted H5P results through the registered trial-display adapter', function() {
    const display = createSelfHostedDisplay();
    const result = {
      contentId: 'content-a',
      batchId: 'batch-a',
      completed: true,
      events: [],
    };

    expect(resolveH5PTrialDisplayResult(display, result, '[test]')).to.deep.equal(result);
  });

  it('fails clearly for missing or mismatched H5P result data', function() {
    const display = createSelfHostedDisplay();

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
