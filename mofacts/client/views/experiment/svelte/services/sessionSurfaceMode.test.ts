import { expect } from 'chai';
import {
  resolveSessionSurfaceLaunchCompletion,
  resolveSessionSurfaceState,
} from './sessionSurfaceMode';

describe('session surface mode', function() {
  it('uses the standard card surface when no specialized session is active', function() {
    expect(resolveSessionSurfaceState({})).to.deep.equal({
      isAutoTutorSession: false,
      isVideoSession: false,
      mode: 'card',
    });
  });

  it('detects video sessions from delivery settings, Session state, or unit content', function() {
    expect(resolveSessionSurfaceState({ deliverySettings: { isVideoSession: true } }).mode).to.equal('video');
    expect(resolveSessionSurfaceState({ sessionIsVideoSession: true }).isVideoSession).to.equal(true);
    expect(resolveSessionSurfaceState({ currentTdfUnit: { videosession: {} } }).mode).to.equal('video');
  });

  it('detects AutoTutor sessions and preserves their priority over video rendering', function() {
    expect(resolveSessionSurfaceState({ sessionUnitType: 'autotutor' })).to.deep.equal({
      isAutoTutorSession: true,
      isVideoSession: false,
      mode: 'autotutor',
    });
    expect(resolveSessionSurfaceState({
      currentTdfUnit: {
        autotutorsession: {},
        videosession: {},
      },
    })).to.deep.equal({
      isAutoTutorSession: true,
      isVideoSession: true,
      mode: 'autotutor',
    });
  });

  it('does not complete launch loading for the standard card surface', function() {
    expect(resolveSessionSurfaceLaunchCompletion({
      surfaceState: resolveSessionSurfaceState({}),
      isLaunchLoadingActive: true,
    })).to.equal(null);
  });

  it('does not complete launch loading when no launch overlay is active', function() {
    expect(resolveSessionSurfaceLaunchCompletion({
      surfaceState: resolveSessionSurfaceState({ sessionUnitType: 'autotutor' }),
      isLaunchLoadingActive: false,
    })).to.equal(null);
  });

  it('describes AutoTutor launch completion as a terminal render action', function() {
    expect(resolveSessionSurfaceLaunchCompletion({
      surfaceState: resolveSessionSurfaceState({ sessionUnitType: 'autotutor' }),
      isLaunchLoadingActive: true,
    })).to.deep.equal({
      timingName: 'autoTutorUnit:rendered',
      finishReason: 'autotutor-unit-rendered',
      stopInitialization: true,
    });
  });

  it('describes video launch completion while allowing card initialization to continue', function() {
    expect(resolveSessionSurfaceLaunchCompletion({
      surfaceState: resolveSessionSurfaceState({ currentTdfUnit: { videosession: {} } }),
      isLaunchLoadingActive: true,
      showVideoInstructionOverlay: true,
      videoPlayerReady: false,
    })).to.deep.equal({
      timingName: 'videoUnit:rendered',
      finishReason: 'video-unit-rendered',
      timingData: {
        showVideoInstructionOverlay: true,
        videoPlayerReady: false,
      },
      stopInitialization: false,
    });
  });
});
