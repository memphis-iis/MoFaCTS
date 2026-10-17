import { expect } from 'chai';
import {
  resolveSessionContentSurface,
  resolveSessionSurfaceDiagnostic,
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
      isVideoSession: false,
      mode: 'flashcard',
    });
  });

  it('detects video sessions only from the current unit content', function() {
    expect(resolveSessionSurfaceState({ currentTdfUnit: { videosession: {} } }).mode).to.equal('video');
  });

  it('detects SPARC sessions from unit-level sparcsession content', function() {
    expect(resolveSessionSurfaceState({ currentTdfUnit: { sparcsession: {} } }).mode).to.equal('sparc');
    expect(resolveSessionContentSurface(resolveSessionSurfaceState({
      currentTdfUnit: { sparcsession: {} },
    }))).to.deep.equal({
      mode: 'sparc',
      showVideoSession: false,
      showSparcSession: true,
      showFlashcardSession: false,
    });
  });

  it('rejects retired units before choosing any rendering surface', function() {
    for (const currentTdfUnit of [{ autotutorsession: {} }, { autotutorsession: {}, sparcsession: {} }]) {
      expect(() => resolveSessionSurfaceState({ currentTdfUnit })).to.throw('standalone AutoTutor has been removed');
    }
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
      showVideoSession: false,
      showSparcSession: false,
      showFlashcardSession: true,
    });
    expect(resolveSessionContentSurface(resolveSessionSurfaceState({
      currentTdfUnit: { videosession: {} },
    }))).to.deep.equal({
      mode: 'video',
      showVideoSession: true,
      showSparcSession: false,
      showFlashcardSession: false,
    });
  });

  it('assigns exactly one content surface for each resolved mode', function() {
    for (const surfaceState of [
      resolveSessionSurfaceState({}),
      resolveSessionSurfaceState({ currentTdfUnit: { videosession: {} } }),
      resolveSessionSurfaceState({ currentTdfUnit: { sparcsession: {} } }),
    ]) {
      const surface = resolveSessionContentSurface(surfaceState);
      const activeSurfaceCount = [
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
      showVideoSession: false,
      showSparcSession: false,
      showFlashcardSession: false,
    };

    expect(() => shouldShowSessionVideoInstructionOverlay({
      contentSurface: invalidContentSurface,
      instructionText: 'Watch the video before answering.',
      instructionsSeen: false,
    })).to.throw('shouldShowSessionVideoInstructionOverlay received an invalid session content surface');
    expect(() => shouldInlineSessionVideoInstructions({
      contentSurface: invalidContentSurface,
      lockoutMinutes: 0,
      hasUnitText: true,
      hasUnitImage: false,
    })).to.throw('shouldInlineSessionVideoInstructions received an invalid session content surface');
    expect(() => resolveSessionSurfaceUnitEntryRoute(invalidContentSurface))
      .to.throw('resolveSessionSurfaceUnitEntryRoute received an invalid session content surface');
    expect(() => shouldRequireSessionVideoReadiness(invalidContentSurface))
      .to.throw('shouldRequireSessionVideoReadiness received an invalid session content surface');
  });

  it('fails clearly when deriving a content surface from an unknown mode', function() {
    expect(() => resolveSessionContentSurface({
      isVideoSession: false,
      mode: 'unknown',
    } as unknown as ReturnType<typeof resolveSessionSurfaceState>)).to.throw(
      'resolveSessionContentSurface received an unknown session surface mode "unknown"',
    );
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
    })).to.equal(true);
    expect(shouldInlineSessionVideoInstructions({
      contentSurface: videoSurface,
      lockoutMinutes: 1,
      hasUnitText: true,
      hasUnitImage: false,
    })).to.equal(false);
    expect(shouldInlineSessionVideoInstructions({
      contentSurface: videoSurface,
      lockoutMinutes: 0,
      hasUnitText: true,
      hasUnitImage: true,
    })).to.equal(false);
    expect(shouldInlineSessionVideoInstructions({
      contentSurface: flashcardSurface,
      lockoutMinutes: 0,
      hasUnitText: true,
      hasUnitImage: false,
    })).to.equal(false);
  });

  it('routes specialized session surfaces directly to content entry', function() {
    expect(resolveSessionSurfaceUnitEntryRoute(
      resolveSessionContentSurface(resolveSessionSurfaceState({})),
    )).to.equal('/instructions');
    expect(resolveSessionSurfaceUnitEntryRoute(
      resolveSessionContentSurface(resolveSessionSurfaceState({ currentTdfUnit: { videosession: {} } })),
    )).to.equal('/content');
    expect(resolveSessionSurfaceUnitEntryRoute(
      resolveSessionContentSurface(resolveSessionSurfaceState({ currentTdfUnit: { sparcsession: {} } })),
    )).to.equal('/content');
  });

  it('requires video readiness only for the active video content surface', function() {
    expect(shouldRequireSessionVideoReadiness(
      resolveSessionContentSurface(resolveSessionSurfaceState({})),
    )).to.equal(false);
    expect(shouldRequireSessionVideoReadiness(
      resolveSessionContentSurface(resolveSessionSurfaceState({ currentTdfUnit: { videosession: {} } })),
    )).to.equal(true);
  });

  it('describes flashcard shell behavior with learning progress enabled', function() {
    expect(resolveSessionSurfaceShell({
      surfaceState: resolveSessionSurfaceState({}),
      progressPanelDisabled: false,
      learningProgressAvailable: true,
    })).to.deep.equal({
      mode: 'flashcard',
      isVideoSession: false,
      contentSurface: {
        mode: 'flashcard',
        showVideoSession: false,
        showSparcSession: false,
        showFlashcardSession: true,
      },
      contentSurfaceClasses: {
        videoMode: false,
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
      showVideoSession: false,
      showSparcSession: true,
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
