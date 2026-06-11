import { expect } from 'chai';
import {
  buildCardSessionRuntimeSnapshot,
  startVideoInstructionTimer,
} from './cardSessionRuntime';

describe('card session runtime', function() {
  it('builds a standard card snapshot from explicit session inputs', function() {
    const snapshot = buildCardSessionRuntimeSnapshot({
      currentTdfUnit: { learningsession: {} },
      deliverySettings: {},
      sessionIsVideoSession: false,
      sessionUnitType: undefined,
      curUnitInstructionsSeen: false,
      videoInstructionDismissed: false,
      sanitizeInstructionHtml: (value) => `safe:${value}`,
    });

    expect(snapshot.sessionContentSurface.showStandardCardSession).to.equal(true);
    expect(snapshot.rawVideoInstructionText).to.equal('');
    expect(snapshot.sanitizedVideoInstructionText).to.equal('safe:');
    expect(snapshot.showVideoInstructionOverlay).to.equal(false);
  });

  it('derives video instruction overlay state and sanitized copy for video sessions', function() {
    const snapshot = buildCardSessionRuntimeSnapshot({
      currentTdfUnit: {
        videosession: {},
        unitinstructions: '  <p>Watch first</p>  ',
      },
      deliverySettings: {},
      sessionIsVideoSession: false,
      sessionUnitType: undefined,
      curUnitInstructionsSeen: false,
      videoInstructionDismissed: false,
      sanitizeInstructionHtml: (value) => value.replace('<p>', '').replace('</p>', ''),
    });

    expect(snapshot.sessionContentSurface.showVideoSession).to.equal(true);
    expect(snapshot.rawVideoInstructionText).to.equal('<p>Watch first</p>');
    expect(snapshot.sanitizedVideoInstructionText).to.equal('Watch first');
    expect(snapshot.videoInstructionsSeen).to.equal(false);
    expect(snapshot.showVideoInstructionOverlay).to.equal(true);
  });

  it('treats session instructions as seen when persisted or locally dismissed', function() {
    for (const params of [
      { curUnitInstructionsSeen: true, videoInstructionDismissed: false },
      { curUnitInstructionsSeen: false, videoInstructionDismissed: true },
    ]) {
      const snapshot = buildCardSessionRuntimeSnapshot({
        currentTdfUnit: {
          videosession: {},
          unitinstructions: 'Watch first',
        },
        deliverySettings: {},
        sessionIsVideoSession: false,
        sessionUnitType: undefined,
        curUnitInstructionsSeen: params.curUnitInstructionsSeen,
        videoInstructionDismissed: params.videoInstructionDismissed,
        sanitizeInstructionHtml: (value) => value,
      });

      expect(snapshot.videoInstructionsSeen).to.equal(true);
      expect(snapshot.showVideoInstructionOverlay).to.equal(false);
    }
  });

  it('starts the video instruction timer once and persists the start timestamp', function() {
    const starts: number[] = [];

    expect(startVideoInstructionTimer({
      showVideoInstructionOverlay: true,
      videoInstructionsShownAt: 0,
      now: () => 1234,
      setInstructionClientStart: (timestamp) => starts.push(timestamp),
    })).to.equal(1234);
    expect(starts).to.deep.equal([1234]);

    expect(startVideoInstructionTimer({
      showVideoInstructionOverlay: true,
      videoInstructionsShownAt: 1234,
      now: () => 9999,
      setInstructionClientStart: (timestamp) => starts.push(timestamp),
    })).to.equal(1234);
    expect(starts).to.deep.equal([1234]);
  });

  it('does not start the timer when the overlay is hidden', function() {
    const starts: number[] = [];

    expect(startVideoInstructionTimer({
      showVideoInstructionOverlay: false,
      videoInstructionsShownAt: 0,
      now: () => 1234,
      setInstructionClientStart: (timestamp) => starts.push(timestamp),
    })).to.equal(0);
    expect(starts).to.deep.equal([]);
  });
});
