import { expect } from 'chai';
import {
  resolveSessionContentSurface,
  resolveSessionSurfaceDiagnostic,
  resolveSessionSurfaceLaunchCompletion,
  resolveSessionSurfaceLearningProgressPanel,
  resolveSessionSurfaceShell,
  resolveSessionSurfaceState,
  resolveSessionSurfaceUnitEntryRoute,
  shouldInlineSessionVideoInstructions,
  shouldRequireSessionVideoReadiness,
  shouldShowSessionVideoInstructionOverlay,
} from './sessionSurfaceMode';

describe('session surface mode', function() {
  it('uses the flashcard surface when no specialized session is active', function() {
    expect(resolveSessionSurfaceState({})).to.deep.equal({
      isAutoTutorSession: false,
      isVideoSession: false,
      mode: 'flashcard',
    });
  });

  it('detects video sessions from delivery settings, Session state, or unit content', function() {
    expect(resolveSessionSurfaceState({ deliverySettings: { isVideoSession: true } }).mode).to.equal('video');
    expect(resolveSessionSurfaceState({ sessionIsVideoSession: true }).isVideoSession).to.equal(true);
    expect(resolveSessionSurfaceState({ currentTdfUnit: { videosession: {} } }).mode).to.equal('video');
  });

  it('detects SPARC sessions from unit-level sparcsession content', function() {
    expect(resolveSessionSurfaceState({ currentTdfUnit: { sparcsession: {} } }).mode).to.equal('sparc');
    expect(resolveSessionContentSurface(resolveSessionSurfaceState({
      currentTdfUnit: { sparcsession: {} },
    }))).to.deep.equal({
      mode: 'sparc',
      showAutoTutorSession: false,
      showVideoSession: false,
      showSparcSession: true,
      showFlashcardSession: false,
    });
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

  it('centralizes session diagnostic cluster-list precedence', function() {
    expect(resolveSessionSurfaceDiagnostic({
      learningsession: { clusterlist: '1 2' },
      videosession: { questions: [3, 4] },
      assessmentsession: { clusterlist: '5 6' },
    })).to.deep.equal({ clusterlist: '1 2' });

    expect(resolveSessionSurfaceDiagnostic({
      videosession: { questions: [3, 4] },
      assessmentsession: { clusterlist: '5 6' },
    })).to.deep.equal({ clusterlist: [3, 4] });

    expect(resolveSessionSurfaceDiagnostic({
      assessmentsession: { clusterlist: '5 6' },
    })).to.deep.equal({ clusterlist: '5 6' });

    expect(resolveSessionSurfaceDiagnostic({})).to.deep.equal({ clusterlist: null });
  });

  it('describes the content surface that owns the render branch', function() {
    expect(resolveSessionContentSurface(resolveSessionSurfaceState({}))).to.deep.equal({
      mode: 'flashcard',
      showAutoTutorSession: false,
      showVideoSession: false,
      showSparcSession: false,
      showFlashcardSession: true,
    });
    expect(resolveSessionContentSurface(resolveSessionSurfaceState({
      currentTdfUnit: { videosession: {} },
    }))).to.deep.equal({
      mode: 'video',
      showAutoTutorSession: false,
      showVideoSession: true,
      showSparcSession: false,
      showFlashcardSession: false,
    });
    expect(resolveSessionContentSurface(resolveSessionSurfaceState({
      currentTdfUnit: {
        autotutorsession: {},
        videosession: {},
      },
    }))).to.deep.equal({
      mode: 'autotutor',
      showAutoTutorSession: true,
      showVideoSession: false,
      showSparcSession: false,
      showFlashcardSession: false,
    });
  });

  it('assigns exactly one content surface for each resolved mode', function() {
    for (const surfaceState of [
      resolveSessionSurfaceState({}),
      resolveSessionSurfaceState({ currentTdfUnit: { videosession: {} } }),
      resolveSessionSurfaceState({ currentTdfUnit: { sparcsession: {} } }),
      resolveSessionSurfaceState({ sessionUnitType: 'autotutor' }),
    ]) {
      const surface = resolveSessionContentSurface(surfaceState);
      const activeSurfaceCount = [
        surface.showAutoTutorSession,
        surface.showVideoSession,
        surface.showSparcSession,
        surface.showFlashcardSession,
      ].filter(Boolean).length;

      expect(activeSurfaceCount).to.equal(1);
    }
  });

  it('fails clearly when a caller passes an invalid content surface adapter', function() {
    const invalidContentSurface = {
      mode: 'video' as const,
      showAutoTutorSession: false,
      showVideoSession: false,
      showSparcSession: false,
      showFlashcardSession: false,
    };

    expect(() => shouldShowSessionVideoInstructionOverlay({
      contentSurface: invalidContentSurface,
      instructionText: 'Watch the video before answering.',
      instructionsSeen: false,
    })).to.throw('shouldShowSessionVideoInstructionOverlay received an invalid session content surface');
    expect(() => resolveSessionSurfaceLaunchCompletion({
      contentSurface: invalidContentSurface,
      isLaunchLoadingActive: true,
    })).to.throw('resolveSessionSurfaceLaunchCompletion received an invalid session content surface');
    expect(() => shouldInlineSessionVideoInstructions({
      contentSurface: invalidContentSurface,
      lockoutMinutes: 0,
      hasUnitText: true,
      hasUnitImage: false,
      hasUnitQuestion: false,
    })).to.throw('shouldInlineSessionVideoInstructions received an invalid session content surface');
    expect(() => resolveSessionSurfaceUnitEntryRoute(invalidContentSurface))
      .to.throw('resolveSessionSurfaceUnitEntryRoute received an invalid session content surface');
    expect(() => shouldRequireSessionVideoReadiness(invalidContentSurface))
      .to.throw('shouldRequireSessionVideoReadiness received an invalid session content surface');
  });

  it('fails clearly when deriving a content surface from an unknown mode', function() {
    expect(() => resolveSessionContentSurface({
      isAutoTutorSession: false,
      isVideoSession: false,
      mode: 'unknown',
    } as unknown as ReturnType<typeof resolveSessionSurfaceState>)).to.throw(
      'resolveSessionContentSurface received an unknown session surface mode "unknown"',
    );
  });

  it('does not complete launch loading for the flashcard surface', function() {
    expect(resolveSessionSurfaceLaunchCompletion({
      contentSurface: resolveSessionContentSurface(resolveSessionSurfaceState({})),
      isLaunchLoadingActive: true,
    })).to.equal(null);
  });

  it('does not complete launch loading when no launch overlay is active', function() {
    expect(resolveSessionSurfaceLaunchCompletion({
      contentSurface: resolveSessionContentSurface(resolveSessionSurfaceState({ sessionUnitType: 'autotutor' })),
      isLaunchLoadingActive: false,
    })).to.equal(null);
  });

  it('describes AutoTutor launch completion as a terminal render action', function() {
    expect(resolveSessionSurfaceLaunchCompletion({
      contentSurface: resolveSessionContentSurface(resolveSessionSurfaceState({ sessionUnitType: 'autotutor' })),
      isLaunchLoadingActive: true,
    })).to.deep.equal({
      timingName: 'autoTutorUnit:rendered',
      finishReason: 'autotutor-unit-rendered',
      stopInitialization: true,
    });
  });

  it('describes video launch completion while allowing card initialization to continue', function() {
    expect(resolveSessionSurfaceLaunchCompletion({
      contentSurface: resolveSessionContentSurface(resolveSessionSurfaceState({
        currentTdfUnit: { videosession: {} },
      })),
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

  it('shows video instructions only for unseen video surfaces with instruction text', function() {
    const videoSurface = resolveSessionContentSurface(resolveSessionSurfaceState({
      currentTdfUnit: { videosession: {} },
    }));
    const flashcardSurface = resolveSessionContentSurface(resolveSessionSurfaceState({}));

    expect(shouldShowSessionVideoInstructionOverlay({
      contentSurface: videoSurface,
      instructionText: ' Watch the video before answering. ',
      instructionsSeen: false,
    })).to.equal(true);
    expect(shouldShowSessionVideoInstructionOverlay({
      contentSurface: videoSurface,
      instructionText: 'Watch the video before answering.',
      instructionsSeen: true,
    })).to.equal(false);
    expect(shouldShowSessionVideoInstructionOverlay({
      contentSurface: videoSurface,
      instructionText: '   ',
      instructionsSeen: false,
    })).to.equal(false);
    expect(shouldShowSessionVideoInstructionOverlay({
      contentSurface: flashcardSurface,
      instructionText: 'Watch the video before answering.',
      instructionsSeen: false,
    })).to.equal(false);
  });

  it('inlines video instructions only for text-only video surfaces without lockout', function() {
    const videoSurface = resolveSessionContentSurface(resolveSessionSurfaceState({
      currentTdfUnit: { videosession: {} },
    }));
    const flashcardSurface = resolveSessionContentSurface(resolveSessionSurfaceState({}));

    expect(shouldInlineSessionVideoInstructions({
      contentSurface: videoSurface,
      lockoutMinutes: 0,
      hasUnitText: true,
      hasUnitImage: false,
      hasUnitQuestion: false,
    })).to.equal(true);
    expect(shouldInlineSessionVideoInstructions({
      contentSurface: videoSurface,
      lockoutMinutes: 1,
      hasUnitText: true,
      hasUnitImage: false,
      hasUnitQuestion: false,
    })).to.equal(false);
    expect(shouldInlineSessionVideoInstructions({
      contentSurface: videoSurface,
      lockoutMinutes: 0,
      hasUnitText: true,
      hasUnitImage: true,
      hasUnitQuestion: false,
    })).to.equal(false);
    expect(shouldInlineSessionVideoInstructions({
      contentSurface: videoSurface,
      lockoutMinutes: 0,
      hasUnitText: true,
      hasUnitImage: false,
      hasUnitQuestion: true,
    })).to.equal(false);
    expect(shouldInlineSessionVideoInstructions({
      contentSurface: flashcardSurface,
      lockoutMinutes: 0,
      hasUnitText: true,
      hasUnitImage: false,
      hasUnitQuestion: false,
    })).to.equal(false);
  });

  it('routes specialized session surfaces directly to card entry', function() {
    expect(resolveSessionSurfaceUnitEntryRoute(
      resolveSessionContentSurface(resolveSessionSurfaceState({})),
    )).to.equal('/instructions');
    expect(resolveSessionSurfaceUnitEntryRoute(
      resolveSessionContentSurface(resolveSessionSurfaceState({ currentTdfUnit: { videosession: {} } })),
    )).to.equal('/card');
    expect(resolveSessionSurfaceUnitEntryRoute(
      resolveSessionContentSurface(resolveSessionSurfaceState({ currentTdfUnit: { sparcsession: {} } })),
    )).to.equal('/card');
    expect(resolveSessionSurfaceUnitEntryRoute(
      resolveSessionContentSurface(resolveSessionSurfaceState({ sessionUnitType: 'autotutor' })),
    )).to.equal('/card');
  });

  it('requires video readiness only for the active video content surface', function() {
    expect(shouldRequireSessionVideoReadiness(
      resolveSessionContentSurface(resolveSessionSurfaceState({})),
    )).to.equal(false);
    expect(shouldRequireSessionVideoReadiness(
      resolveSessionContentSurface(resolveSessionSurfaceState({ currentTdfUnit: { videosession: {} } })),
    )).to.equal(true);
    expect(shouldRequireSessionVideoReadiness(
      resolveSessionContentSurface(resolveSessionSurfaceState({ sessionUnitType: 'autotutor' })),
    )).to.equal(false);
  });

  it('describes flashcard shell behavior with learning progress enabled', function() {
    expect(resolveSessionSurfaceShell({
      surfaceState: resolveSessionSurfaceState({}),
      progressPanelDisabled: false,
      learningProgressAvailable: true,
    })).to.deep.equal({
      mode: 'flashcard',
      isAutoTutorSession: false,
      isVideoSession: false,
      contentSurface: {
        mode: 'flashcard',
        showAutoTutorSession: false,
        showVideoSession: false,
        showSparcSession: false,
        showFlashcardSession: true,
      },
      contentSurfaceClasses: {
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
      surfaceState: resolveSessionSurfaceState({ currentTdfUnit: { videosession: {} } }),
      progressPanelDisabled: false,
      learningProgressAvailable: true,
    }).contentSurface).to.deep.equal({
      mode: 'video',
      showAutoTutorSession: false,
      showVideoSession: true,
      showSparcSession: false,
      showFlashcardSession: false,
    });
    expect(resolveSessionSurfaceShell({
      surfaceState: resolveSessionSurfaceState({ currentTdfUnit: { sparcsession: {} } }),
      progressPanelDisabled: false,
      learningProgressAvailable: true,
    })).to.deep.include({
      mode: 'sparc',
      showLearningProgressPanel: true,
    });
    expect(resolveSessionSurfaceShell({
      surfaceState: resolveSessionSurfaceState({ currentTdfUnit: { sparcsession: {} } }),
      progressPanelDisabled: false,
      learningProgressAvailable: true,
    }).contentSurface).to.deep.equal({
      mode: 'sparc',
      showAutoTutorSession: false,
      showVideoSession: false,
      showSparcSession: true,
      showFlashcardSession: false,
    });
    expect(resolveSessionSurfaceShell({
      surfaceState: resolveSessionSurfaceState({ sessionUnitType: 'autotutor' }),
      progressPanelDisabled: false,
      learningProgressAvailable: true,
    })).to.deep.include({
      mode: 'autotutor',
      showLearningProgressPanel: false,
    });
    expect(resolveSessionSurfaceShell({
      surfaceState: resolveSessionSurfaceState({ sessionUnitType: 'autotutor' }),
      progressPanelDisabled: false,
      learningProgressAvailable: true,
    }).contentSurface).to.deep.equal({
      mode: 'autotutor',
      showAutoTutorSession: true,
      showVideoSession: false,
      showSparcSession: false,
      showFlashcardSession: false,
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

  it('closes the learning progress viewport when the active surface cannot show the panel', function() {
    const cardShell = resolveSessionSurfaceShell({
      surfaceState: resolveSessionSurfaceState({}),
      progressPanelDisabled: false,
      learningProgressAvailable: true,
    });
    const videoShell = resolveSessionSurfaceShell({
      surfaceState: resolveSessionSurfaceState({ currentTdfUnit: { videosession: {} } }),
      progressPanelDisabled: false,
      learningProgressAvailable: true,
    });
    const disabledCardShell = resolveSessionSurfaceShell({
      surfaceState: resolveSessionSurfaceState({}),
      progressPanelDisabled: true,
      learningProgressAvailable: true,
    });

    expect(resolveSessionSurfaceLearningProgressPanel({
      shell: cardShell,
      requestedOpen: true,
    })).to.deep.equal({
      showPanel: true,
      panelOpen: true,
      viewportOpen: true,
    });
    expect(resolveSessionSurfaceLearningProgressPanel({
      shell: videoShell,
      requestedOpen: true,
    })).to.deep.equal({
      showPanel: false,
      panelOpen: false,
      viewportOpen: false,
    });
    expect(resolveSessionSurfaceLearningProgressPanel({
      shell: disabledCardShell,
      requestedOpen: true,
    })).to.deep.equal({
      showPanel: false,
      panelOpen: false,
      viewportOpen: false,
    });
  });
});
