import { expect } from 'chai';
import {
  resolveSessionSurfaceLaunchCompletion,
  resolveSessionSurfaceShell,
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

  it('describes standard card shell behavior with learning progress enabled', function() {
    expect(resolveSessionSurfaceShell({
      surfaceState: resolveSessionSurfaceState({}),
      progressPanelDisabled: false,
      learningProgressAvailable: true,
    })).to.deep.equal({
      mode: 'card',
      isAutoTutorSession: false,
      isVideoSession: false,
      cardScreenClasses: {
        videoMode: false,
        autoTutorMode: false,
      },
      showLearningProgressPanel: true,
    });
  });

  it('keeps specialized surfaces out of the learning progress panel shell', function() {
    expect(resolveSessionSurfaceShell({
      surfaceState: resolveSessionSurfaceState({ currentTdfUnit: { videosession: {} } }),
      progressPanelDisabled: false,
      learningProgressAvailable: true,
    })).to.deep.include({
      mode: 'video',
      showLearningProgressPanel: false,
    });
    expect(resolveSessionSurfaceShell({
      surfaceState: resolveSessionSurfaceState({ sessionUnitType: 'autotutor' }),
      progressPanelDisabled: false,
      learningProgressAvailable: true,
    })).to.deep.include({
      mode: 'autotutor',
      showLearningProgressPanel: false,
    });
  });

  it('keeps learning progress hidden when card progress is unavailable or disabled', function() {
    const surfaceState = resolveSessionSurfaceState({});

    expect(resolveSessionSurfaceShell({
      surfaceState,
      progressPanelDisabled: true,
      learningProgressAvailable: true,
    }).showLearningProgressPanel).to.equal(false);
    expect(resolveSessionSurfaceShell({
      surfaceState,
      progressPanelDisabled: false,
      learningProgressAvailable: false,
    }).showLearningProgressPanel).to.equal(false);
  });
});
