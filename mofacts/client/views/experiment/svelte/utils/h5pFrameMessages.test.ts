import { expect } from 'chai';
import { parseH5PFrameMessage } from './h5pFrameMessages';

describe('h5p frame message adapter', function() {
  it('normalizes result messages before the frame exposes them to the trial', function() {
    const message = parseH5PFrameMessage({
      type: 'mofacts:h5p-result',
      contentId: 'content-a',
      batchId: ' batch-a ',
      completed: true,
      score: 1,
      events: [],
    }, 'content-a');

    expect(message).to.deep.equal({
      kind: 'result',
      result: {
        contentId: 'content-a',
        batchId: 'batch-a',
        completed: true,
        score: 1,
        events: [],
      },
    });
  });

  it('drops resizer messages for a different self-hosted content id', function() {
    const message = parseH5PFrameMessage({
      context: 'h5p',
      contentId: 'content-b',
      action: 'resize',
    }, 'content-a');

    expect(message).to.equal(null);
  });

  it('fails clearly for malformed result messages', function() {
    expect(() => parseH5PFrameMessage({
      type: 'mofacts:h5p-result',
      contentId: 'content-a',
      completed: true,
      events: [],
    }, 'content-a')).to.throw('batchId');
  });
});
