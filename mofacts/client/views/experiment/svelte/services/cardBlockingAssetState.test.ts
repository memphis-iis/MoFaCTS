import { expect } from 'chai';
import {
  createCardBlockingAssetController,
  resolveBlockingAssetUpdate,
  type BlockingAssetUpdate,
} from './cardBlockingAssetState';

describe('card blocking asset state', function() {
  it('accepts expected stimulus and feedback readiness updates', function() {
    expect(resolveBlockingAssetUpdate({
      detail: {
        owner: 'stimulus',
        blocking: true,
        ready: false,
        src: '/stimulus.png',
      },
      expectedStimulusSrc: '/stimulus.png',
      expectedFeedbackSrc: '/feedback.png',
      slot: 'active',
    })).to.deep.equal({
      owner: 'stimulus',
      ready: false,
      slot: 'active',
    });

    expect(resolveBlockingAssetUpdate({
      detail: {
        owner: 'feedback',
        blocking: true,
        ready: true,
        src: '/feedback.png',
      },
      expectedStimulusSrc: '/stimulus.png',
      expectedFeedbackSrc: '/feedback.png',
      slot: 'active',
    })).to.deep.equal({
      owner: 'feedback',
      ready: true,
      slot: 'active',
    });
  });

  it('ignores blocking updates from stale asset sources', function() {
    expect(resolveBlockingAssetUpdate({
      detail: {
        owner: 'stimulus',
        blocking: true,
        ready: true,
        src: '/old.png',
      },
      expectedStimulusSrc: '/current.png',
      expectedFeedbackSrc: '',
      slot: 'active',
    })).to.equal(null);
  });

  it('ignores nonblocking clears while an expected source is still present', function() {
    expect(resolveBlockingAssetUpdate({
      detail: {
        owner: 'feedback',
        blocking: false,
        ready: true,
        src: '',
      },
      expectedStimulusSrc: '',
      expectedFeedbackSrc: '/feedback.png',
      slot: 'active',
    })).to.equal(null);
  });

  it('routes active and incoming updates through the controller', function() {
    const updates: BlockingAssetUpdate[] = [];
    const controller = createCardBlockingAssetController({
      getExpectedStimulusSrc: (slot) => slot === 'incoming' ? '/incoming-stimulus.png' : '/active-stimulus.png',
      getExpectedFeedbackSrc: (slot) => slot === 'incoming' ? '/incoming-feedback.png' : '/active-feedback.png',
      setReady: (update) => updates.push(update),
    });

    controller.handleBlockingAssetState({
      owner: 'stimulus',
      blocking: true,
      ready: true,
      src: '/active-stimulus.png',
    });
    controller.handleBlockingAssetState({
      owner: 'feedback',
      blocking: true,
      ready: false,
      src: '/incoming-feedback.png',
    }, 'incoming');

    expect(updates).to.deep.equal([
      {
        owner: 'stimulus',
        ready: true,
        slot: 'active',
      },
      {
        owner: 'feedback',
        ready: false,
        slot: 'incoming',
      },
    ]);
  });
});
