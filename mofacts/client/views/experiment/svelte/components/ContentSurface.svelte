<script>
  /**
   * ContentSurface Component
   * Route-mounted learner runtime shell that orchestrates session surfaces and the XState machine.
   */
  import { onMount, onDestroy, tick } from 'svelte';
  import {
    cleanupAudioRecorder,
    startRecording as startSrRecording,
    stopRecording as stopSrRecording
  } from '../services/speechRecognitionService';
  import { completeCleanup } from '../utils/lifecycleCleanup';
  import { createActor } from 'xstate';
  import { Session } from 'meteor/session';
  import { Meteor } from 'meteor/meteor';
  import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
  import { currentUserHasRole } from '../../../../lib/roleUtils';
  import { stopStimDisplayTypeMapVersionSync } from '../../../../lib/stimDisplayTypeMapSync';
  import { deliverySettingsStore } from '../../../../lib/state/deliverySettingsStore';
  import { clientConsole } from '../../../../lib/clientLogger';
  import {
    finishLaunchLoading,
    isLaunchLoadingActive,
    markLaunchLoadingTiming,
    setLaunchLoadingMessage
  } from '../../../../lib/launchLoading';
  import { getDisplayAnswerText } from '../../learnerResponseAssessment';
  import { contentRuntimeMachine } from '../machine/contentRuntimeMachine';
  import { DEFAULT_DELIVERY_SETTINGS, EVENTS } from '../machine/constants';
  import { initializeContentSurface } from '../services/contentSurfaceInit';
  import { createExperimentState } from '../services/experimentState';
  import {
    waitForContentReadiness as waitForContentReadinessService,
  } from '../services/contentReadiness';
  import { runContentLaunchOrchestration } from '../services/contentLaunchOrchestration';
  import { beginLearningAttempt } from '../services/attemptIdentity';
  import {
    canActivateContentInput,
    createContentLaunchCoordinator,
    resolveContentLaunchSurfaceKind,
  } from '../services/contentLaunchCoordinator';
  import { createContentLaunchEnvironment } from '../services/contentLaunchEnvironment';
  import { getElementTransitionDurationMs } from '../services/trialTransitionTiming';
  import {
    buildTrialSubset,
    buildTrialSubsetKey,
    getBaseTrialSubsetKind,
    isOutgoingFreezeState as isOutgoingFreezeSnapshot,
    isPreparedAdvanceWaitState as isPreparedAdvanceWaitSnapshot,
  } from '../services/trialDisplayState';
  import {
    buildActiveTrialCurrentDisplayValues,
    createActiveTrialDisplayStateController,
  } from '../services/activeTrialDisplayState';
  import {
    createDisplayTimeoutController,
    createTimeoutCountdownController,
    createTimeoutCountdownSyncController,
  } from '../services/timeoutCountdown';
  import { createVideoMachineBridge } from '../services/videoMachineBridge';
  import { createVideoSessionBridge } from '../services/videoSessionBridge';
  import { createVideoSessionRuntimeController } from '../services/videoSessionRuntime';
  import { createVideoEndOverlayController } from '../services/videoEndOverlay';
  import { createVideoEventRuntime } from '../services/videoEventRuntime';
  import {
    buildVideoRuntimeSnapshot,
    createCompletedVideoQuestionsStore,
  } from '../services/videoRuntimeSnapshot';
  import { waitForBrowserPaint } from '../utils/paintTiming';
  import { getMainTimeoutMs, getFeedbackTimeoutMs } from '../utils/timeoutUtils';
  import { recordCurrentInstructionContinue } from '../../instructions';
  import { resolveContentLanguageAttributes } from '../../../../../common/lib/contentLanguageAttributes';
  import { getActiveUiLocale } from '../../../../lib/interfaceLocaleState';
  import { translatePlatformString } from '../../../../lib/interfaceI18n';
  import {
    resolveH5PTrialDisplayResult,
    selfHostedH5PTrialDisplayOwnsInteraction,
  } from '../services/h5pTrialDisplay';
  import { createTrialDisplaySubmissionController } from '../services/trialDisplaySubmission';
  import { createLearningProgressRuntimeController } from '../services/learningProgressPanelRuntime';
  import {
    notifyLearningProgressLayoutChange,
  } from '../services/learningProgressPanelViewport';
  import {
    getContentSurfaceAdapter,
    isSpecializedSurfaceReadyToCommit,
  } from '../services/contentSurfaceActivation';
  import {
    buildContentSurfaceRuntimeSnapshot,
    startVideoInstructionTimer,
  } from '../services/contentSurfaceRuntime';
  import {
    createCardWakeLockController,
    shouldHoldScreenWakeLock,
  } from '../services/cardWakeLock';
  import {
    continueToNextRuntimeUnit,
    createCardUnitContinuationController,
  } from '../services/cardUnitContinuation';
  import { createCardRuntimeWindowEventController } from '../services/cardRuntimeWindowEvents';
  import {
    getVideoCheckpoints,
    getVideoResumeAnchor,
    resolveRuntimeEngine,
  } from '../services/cardRuntimeState';
  import {
    createContentRuntimeMachineRuntimeController,
    getInitialContentRuntimeMachineSnapshot,
  } from '../services/contentRuntimeMachineRuntime';
  import { createCardRuntimeLifecycleController } from '../services/cardRuntimeLifecycle';
  import { createContentSurfaceLifecycleRuntime } from '../services/contentSurfaceLifecycleRuntime';
  import { createMeteorCardReactiveTrackers } from '../services/cardReactiveTrackers';
  import { buildCardInputSrSnapshot } from '../services/cardInputSrState';
  import {
    buildCardPerformanceData,
    buildCardPerformanceDisplaySnapshot,
  } from '../services/cardPerformanceDisplay';
  import { createFlashcardTextInputController } from '../services/flashcardTextInputController';
  import { createFlashcardEventController } from '../services/flashcardEventController';
  import { createFlashcardReviewEventController } from '../services/flashcardReviewEventController';
  import { sanitizeCardInstructionHtml } from '../services/cardInstructionSanitizer';
  import { createCardBlockingAssetController } from '../services/cardBlockingAssetState';
  import {
    createIncomingTrialSlotController,
  } from '../services/incomingTrialSlotController';
  import { buildIncomingTrialSlotDisplaySnapshot } from '../services/incomingTrialSlotDisplay';
  import { createActiveTrialRevealController } from '../services/activeTrialRevealController';
  import { createTrialFadeTransitionController } from '../services/trialFadeTransitionController';
  import {
    buildFlashcardControllerPropsFromSubset,
    getCorrectAnswerImageSrc,
  } from '../services/flashcardControllerProps';
  import { getHiddenItems } from '../services/hiddenVisibilityRuntimeState';
  import AutoTutorSession from './AutoTutorSession.svelte';
  import DisplayTimeoutFooter from './DisplayTimeoutFooter.svelte';
  import FlashcardSessionSurface from './FlashcardSessionSurface.svelte';
  import SparcSessionSurface from './SparcSessionSurface.svelte';
  import VideoSessionSurface from './VideoSessionSurface.svelte';

  /** @type {string} Session ID */
  export let userId = '';
  let attemptId = '';

  /** @type {number|undefined} Zero-based TDF unit index */
  export let unitId = undefined;

  /** @type {string} TDF ID */
  export let tdfId = '';

  /** @type {Object} Initial engine indices (optional) */
  export let engineIndices = null;

  /** @type {boolean} Enable static tester mode (no machine side effects) */
  export let testMode = false;

  /** @type {{ value: unknown, context: Object, matches: Function }|null} */
  export let testSnapshot = null;

  /** @type {{ totalTimeDisplay?: string, percentCorrect?: string, cardsSeen?: number, totalCards?: number, currentTrial?: number }|null} */
  export let testPerformance = null;

  /** @type {{ mode?: 'question' | 'feedback' | 'none', progress?: number, remainingTime?: number }|null} */
  export let testTimeout = null;

  function normalizeTestSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('[ContentSurface] testMode requires a testSnapshot object');
    }
    const value = snapshot.value ?? 'test';
    const context = snapshot.context || {};
    const matches = typeof snapshot.matches === 'function'
      ? snapshot.matches
      : (state) => state === value;
    return { value, context, matches };
  }

  function parsePositiveNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function toBoolean(value) {
    if (value === true || value === 'true' || value === 1 || value === '1') {
      return true;
    }
    if (value === false || value === 'false' || value === 0 || value === '0') {
      return false;
    }
    return Boolean(value);
  }

  function resolveLearningProgressEngine(contextEngine) {
    if (contextEngine && typeof contextEngine.getModelProgressItems === 'function') {
      return contextEngine;
    }
    return resolveRuntimeEngine();
  }

  function cardDebugStateEnabled() {
    if (!Meteor.isDevelopment || typeof window === 'undefined') {
      return false;
    }
    const queryValue = new URLSearchParams(window.location.search).get('cardDebugState');
    if (queryValue !== null) {
      return queryValue === '1' || queryValue === 'true';
    }
    return window.localStorage.getItem('mofacts.cardDebugState') === '1';
  }

  // Initialize XState machine using a local actor to avoid version mismatches
  let contentRuntimeMachineRuntimeController = null;
  let state = getInitialContentRuntimeMachineSnapshot();
  let videoInstructionDismissed = false;
  let videoInstructionStartBlocked = false;
  let videoInstructionsShownAt = 0;
  let videoPlayerReady = false;
  let sessionUnitModeVersion = 0;
  const send = (event) => {
    if (testMode) {
      clientConsole(2, '[ContentSurface] Ignoring event in test mode:', event?.type || event);
      return;
    }
    const actor = contentRuntimeMachineRuntimeController?.getActor?.();
    if (actor && typeof actor.send === 'function') {
      actor.send(event);
    }
  };
  const trialDisplaySubmissionController = createTrialDisplaySubmissionController({
    getCurrentDisplay: () => context.currentDisplay,
    h5pOwnsResponse: () => h5pOwnsResponse,
    resolveH5PResult: resolveH5PTrialDisplayResult,
    now: () => Date.now(),
    submit: send,
  });

  function adminDiagnosticModeEnabled() {
    return currentUserHasRole('admin');
  }

  $: if (testMode) {
    state = normalizeTestSnapshot(testSnapshot);
  }

  // Reactive state selectors
  $: context = state.context;
  $: currentState = state.value;
  $: preparedTrial = context.preparedTrial || null;
  $: deliverySettings = { ...DEFAULT_DELIVERY_SETTINGS, ...(context.deliverySettings || {}) };
  $: audioState = context.audio || { waitingForTranscription: false, srAttempts: 0, maxSrAttempts: 0 };
  $: contentSurfaceRuntimeSnapshot = (sessionUnitModeVersion, buildContentSurfaceRuntimeSnapshot({
    currentTdfUnit: Session.get('currentTdfUnit'),
    curUnitInstructionsSeen: Session.get('curUnitInstructionsSeen'),
    videoInstructionDismissed,
    sanitizeInstructionHtml: sanitizeCardInstructionHtml,
  }));
  $: currentTdfUnit = contentSurfaceRuntimeSnapshot.currentTdfUnit;
  $: sessionSurfaceState = contentSurfaceRuntimeSnapshot.sessionSurfaceState;
  $: sessionContentSurface = contentSurfaceRuntimeSnapshot.sessionContentSurface;
  $: rawVideoInstructionText = contentSurfaceRuntimeSnapshot.rawVideoInstructionText;
  $: sanitizedVideoInstructionText = contentSurfaceRuntimeSnapshot.sanitizedVideoInstructionText;
  $: videoInstructionsSeen = contentSurfaceRuntimeSnapshot.videoInstructionsSeen;
  $: showVideoInstructionOverlay = contentSurfaceRuntimeSnapshot.showVideoInstructionOverlay;
  $: videoInstructionsShownAt = startVideoInstructionTimer({
    showVideoInstructionOverlay,
    videoInstructionsShownAt,
    now: Date.now,
    setInstructionClientStart: (timestamp) => {
      Session.set('instructionClientStart', timestamp);
    },
  });
  $: layoutMode = deliverySettings.stimuliPosition;
  $: fontSizeScale = (parsePositiveNumber(deliverySettings?.fontsize) ?? 24) / 16;
  $: cardFontSizeStyle = `--card-font-size: calc(var(--app-font-size-base) * ${fontSizeScale});`;

  // Audio & SR settings
  let user = null;
  $: inputSrSnapshot = buildCardInputSrSnapshot({
    user,
    tdfFile: Session.get('currentTdfFile'),
    sessionSpeechApiKey: Session.get('speechAPIKey'),
    serverSpeechConfigured: Session.get('speechAPIKeyConfigured'),
    buttonTrial: Boolean(context.buttonTrial),
    source: context.source,
    stateMatches: (value) => state.matches(value),
  });
  $: srAvailability = inputSrSnapshot.srAvailability;
  $: isSrEnabled = inputSrSnapshot.isSrEnabled;
  $: isSrReady = inputSrSnapshot.isSrReady;
  $: isSrProcessing = inputSrSnapshot.isSrProcessing;
  $: inputMode = inputSrSnapshot.inputMode;
  $: isSrRecording = inputSrSnapshot.isSrRecording;
  $: isVoiceValidating = inputSrSnapshot.isVoiceValidating;
  $: srStatus = inputSrSnapshot.srStatus;
  $: if (typeof window !== 'undefined' && inputMode !== undefined) {
    void cardWakeLockController.sync('reactive update');
  }

  const activeTrialDisplayStateController = createActiveTrialDisplayStateController();
  const contentLaunchCoordinator = createContentLaunchCoordinator();
  let contentLaunchPhase = contentLaunchCoordinator.getSnapshot().phase;
  const unsubscribeContentLaunch = contentLaunchCoordinator.subscribe((snapshot) => {
    contentLaunchPhase = snapshot.phase;
    if (snapshot.phase === 'active' && isLaunchLoadingActive()) {
      markLaunchLoadingTiming('contentLaunch:active', {
        surface: snapshot.surface || 'unknown',
      });
      finishLaunchLoading('initial-content-visible');
    }
  });
  let trialContentFadeElement;
  let lastFadeLogContext = {
    key: 'none',
    subsetKind: 'none',
    visibleSetAt: 0,
    configuredDurationMs: 0,
  };
  let stimulusBlockingAssetReady = true;
  let feedbackBlockingAssetReady = true;
  let incomingBlockingAssetVersion = 0;
  const incomingBlockingAssetState = {
    stimulusReady: true,
    feedbackReady: true,
  };
  let activeSlotMounted = false;
  let activeSlotVisible = false;
  let incomingSlotMounted = false;
  let incomingReadySent = false;
  let transitionCompleteSent = false;
  let incomingAllBlockingAssetsReady = true;
  const incomingTrialSlotController = createIncomingTrialSlotController({
    onUpdate: (snapshot) => {
      incomingSlotMounted = snapshot.mounted;
      incomingReadySent = snapshot.readySent;
      transitionCompleteSent = snapshot.transitionCompleteSent;
    },
    waitForBrowserPaint,
    waitForDomUpdate: tick,
  });
  const activeTrialRevealController = createActiveTrialRevealController({
    getRuntimeState: () => ({
      isFadingOut,
      isOutgoingFreezeState,
      isTestMode: testMode,
      subsetKind: trialSubset.kind,
    }),
    log: clientConsole,
    markFirstRevealClassSet: () => undefined,
    now: () => performance.now(),
    onFadeContext: (context) => {
      lastFadeLogContext = context;
    },
    onRevealStarted: (subsetKind) => {
      if (contentLaunchCoordinator.getSnapshot().phase === 'committing-first-render') {
        contentLaunchCoordinator.markInitialRenderVisible();
      }
      send({
        type: EVENTS.TRIAL_REVEAL_STARTED,
        timestamp: Date.now(),
        subsetKind,
      });
    },
    onTrialStaged: () => {
      if (contentLaunchCoordinator.getSnapshot().phase === 'initializing-engine') {
        contentLaunchCoordinator.markFirstTrialPreparing();
        contentLaunchCoordinator.markFirstRenderCommitting();
      }
    },
    onUpdate: (snapshot) => {
      activeSlotMounted = snapshot.activeSlotMounted;
      activeSlotVisible = snapshot.activeSlotVisible;
      feedbackBlockingAssetReady = snapshot.feedbackBlockingAssetReady;
      stimulusBlockingAssetReady = snapshot.stimulusBlockingAssetReady;
    },
    primeFadeStart: () => {
      primeFlashcardControllerFadeStart();
    },
    readTransitionDurationMs: () => getElementTransitionDurationMs(
      trialContentFadeElement,
      (element) => getComputedStyle(element),
    ),
    waitForBrowserPaint,
    waitForDomUpdate: tick,
  });
  const trialFadeTransitionController = createTrialFadeTransitionController({
    getComputedOpacity: () => trialContentFadeElement
      ? getComputedStyle(trialContentFadeElement).opacity
      : 'unknown',
    getFadeContext: () => lastFadeLogContext,
    getRuntimeState: () => ({
      feedbackReadyForPreparedHandoff: incomingBlockingAssetState.feedbackReady,
      isFadingOut,
      isPreparedFadingOut,
      isTestMode: testMode,
      stimulusReadyForPreparedHandoff: incomingBlockingAssetState.stimulusReady,
      transitionCompleteSent,
      trialContentVisible,
    }),
    log: clientConsole,
    markPreparedHandoffOnNextReveal: activeTrialRevealController.markPreparedHandoffOnNextReveal,
    markTransitionCompleteSent: incomingTrialSlotController.markTransitionCompleteSent,
    now: () => performance.now(),
    sendTransitionComplete: () => {
      send({ type: EVENTS.TRANSITION_COMPLETE, timestamp: Date.now() });
    },
  });
  let videoEndOverlayMounted = false;
  let videoEndOverlayVisible = false;
  const videoEndOverlayController = createVideoEndOverlayController({
    onUpdate: (snapshot) => {
      videoEndOverlayMounted = snapshot.mounted;
      videoEndOverlayVisible = snapshot.visible;
    },
    waitForBrowserPaint,
    waitForDomUpdate: tick,
  });

  $: isQuestionState = state.matches('presenting.fadingIn') ||
    state.matches('presenting.prestimulus') ||
    state.matches('presenting.displaying') ||
    state.matches('presenting.audioGate') ||
    state.matches('presenting.awaiting') ||
    state.matches('presenting.validating');
  $: isPrestimulusState = state.matches('presenting.prestimulus');
  $: isFeedbackState = state.matches('feedback');
  $: isStudyState = state.matches('study');
  $: baseIsForceCorrecting = state.matches('feedback.forceCorrecting');
  $: baseTrialSubsetKind = getBaseTrialSubsetKind({
    isFeedbackState,
    isForceCorrecting: baseIsForceCorrecting,
    isPrestimulusState,
    isQuestionState,
    isStudyState,
  });
  $: h5pOwnsResponse = selfHostedH5PTrialDisplayOwnsInteraction(context.currentDisplay) && baseTrialSubsetKind === 'question';
  $: sparcSessionOwnsCurrentResponse = sessionContentSurface.showSparcSession && baseTrialSubsetKind === 'question';
  $: trialDisplaySubmissionController.resetForDisplay(baseTrialSubsetKind === 'question' ? context.currentDisplay : undefined);
  let studyInteractionText = '';
  $: if (!isStudyState && studyInteractionText) {
    studyInteractionText = '';
  }
  $: inputEnabled = canActivateContentInput(
    contentLaunchPhase,
    state.matches('presenting.awaiting') || state.matches('feedback.forceCorrecting'),
  );
  $: isOutgoingFreezeState = isOutgoingFreezeSnapshot(state);
  $: isPreparedAdvanceWaitState = isPreparedAdvanceWaitSnapshot(state);
  $: isFadingOut = state.matches('transition.fadingOut');
  $: isPreparedFadingOut = isFadingOut && Boolean(preparedTrial);
  $: activeTrialCurrentDisplay = buildActiveTrialCurrentDisplayValues({
    correctColor: deliverySettings.correctColor,
    currentAnswer: context.currentAnswer,
    currentDisplay: context.currentDisplay,
    displayCorrectFeedback: deliverySettings.displayCorrectFeedback,
    displayIncorrectFeedback: deliverySettings.displayIncorrectFeedback,
    feedbackMessage: context.feedbackMessage,
    formatAnswerText: getDisplayAnswerText,
    h5pOwnsResponse,
    isCorrect: context.isCorrect,
    isForceCorrecting: baseIsForceCorrecting,
    isStudyState,
    originalAnswer: context.originalAnswer,
    skipStudyEnabled: toBoolean(deliverySettings.skipstudy),
    sparcSessionOwnsResponse: sparcSessionOwnsCurrentResponse,
    studyInteractionText,
    trialSubsetKind: baseTrialSubsetKind,
  });

  $: activeTrialDisplaySnapshot = activeTrialDisplayStateController.buildSnapshot({
    current: activeTrialCurrentDisplay,
    isOutgoingFreezeState,
  });
  $: trialSubsetKind = activeTrialDisplaySnapshot.active.trialSubsetKind;
  $: displayVisible = activeTrialDisplaySnapshot.active.displayVisible;
  $: feedbackVisible = activeTrialDisplaySnapshot.active.feedbackVisible;
  $: isForceCorrecting = activeTrialDisplaySnapshot.active.isForceCorrecting;
  $: responseVisible = activeTrialDisplaySnapshot.active.responseVisible;
  $: showSkipStudyButton = activeTrialDisplaySnapshot.active.showSkipStudyButton;
  $: feedbackIsCorrect = activeTrialDisplaySnapshot.active.feedbackIsCorrect;
  $: feedbackCorrectColor = activeTrialDisplaySnapshot.active.feedbackCorrectColor;
  $: feedbackText = activeTrialDisplaySnapshot.active.feedbackText;
  $: feedbackCorrectAnswer = activeTrialDisplaySnapshot.active.feedbackCorrectAnswer;
  $: displayCorrectFeedback = activeTrialDisplaySnapshot.active.displayCorrectFeedback;
  $: displayIncorrectFeedback = activeTrialDisplaySnapshot.active.displayIncorrectFeedback;
  $: trialSubset = buildTrialSubset({
    kind: trialSubsetKind,
    display: activeTrialDisplaySnapshot.active.display,
    displayVisible,
    feedbackVisible,
    responseVisible,
    isForceCorrecting,
    showQuestionNumber: deliverySettings.displayQuestionNumber,
    questionNumber: performanceData?.currentTrial || 0,
    replayEnabled: !feedbackVisible,
    showSkipStudyButton,
  });
  $: activeFlashcardControllerState = buildFlashcardControllerPropsFromSubset({
    buttonList: context.buttonList,
    correctAnswer: feedbackCorrectAnswer,
    correctAnswerImageSrc,
    correctColor: feedbackCorrectColor,
    defaultInputMode: inputMode,
    deliverySettings,
    displayCorrectFeedback,
    displayIncorrectFeedback,
    feedbackMessage: feedbackText,
    feedbackUserAnswer: context.userAnswer,
    inputEnabled,
    isCorrect: feedbackIsCorrect,
    isTimeout: context.isTimeout,
    layoutMode,
    srAttempt: audioState.srAttempts,
    srMaxAttempts: audioState.maxSrAttempts,
    srStatus,
    subset: trialSubset,
    userAnswer: textAnswer,
  });
  $: expectedStimulusBlockerSrc = activeFlashcardControllerState.expectedStimulusBlockerSrc;
  $: expectedFeedbackBlockerSrc = activeFlashcardControllerState.expectedFeedbackBlockerSrc;
  $: trialSubsetKey = buildTrialSubsetKey({
    context,
    isVideoSession: sessionContentSurface.showVideoSession,
    subset: trialSubset,
  });
  $: allBlockingAssetsReady = (!expectedStimulusBlockerSrc || stimulusBlockingAssetReady) &&
    (!expectedFeedbackBlockerSrc || feedbackBlockingAssetReady);
  $: activeTrialRevealController.syncVisibility({
    isOutgoingFreezeState,
    showOverlay: trialSubset.showOverlay,
  });
  $: trialContentMounted = activeSlotMounted;
  $: trialContentVisible = activeSlotVisible;
  $: cardVisualReady = trialContentMounted || sessionContentSurface.showSparcSession || state.matches('videoWaiting') || videoEnded;
  $: declaredContentLanguage = String(Session.get('currentTdfFile')?.tdfs?.tutor?.setspec?.contentLanguage || '').trim();
  $: contentLanguageAttributes = resolveContentLanguageAttributes(declaredContentLanguage || getActiveUiLocale());
  $: flashcardControllerProps = {
    ...activeFlashcardControllerState.props,
    inputLanguage: contentLanguageAttributes.lang || '',
    inputTextDirection: contentLanguageAttributes.dir || '',
  };
  $: showSparcSessionSurface = sessionContentSurface.showSparcSession &&
    flashcardControllerProps.subsetKind !== 'none';
  let specializedSurfaceActivationScheduled = false;
  $: if (
    !specializedSurfaceActivationScheduled &&
    contentLaunchPhase === 'initializing-engine' &&
    isSpecializedSurfaceReadyToCommit({
      surface: contentLaunchCoordinator.getSnapshot().surface || 'flashcard',
      initializedForRender,
      sparcContentReady: showSparcSessionSurface,
      videoInstructionVisible: showVideoInstructionOverlay,
      videoPlayerReady,
    })
  ) {
    specializedSurfaceActivationScheduled = true;
    contentLaunchCoordinator.markFirstTrialPreparing();
    contentLaunchCoordinator.markFirstRenderCommitting();
    void (async () => {
      await tick();
      await waitForBrowserPaint();
      if (contentLaunchCoordinator.getSnapshot().phase === 'committing-first-render') {
        contentLaunchCoordinator.markInitialRenderVisible();
      }
    })();
  }
  $: videoEnded = state.matches('videoEnded');
  $: videoEndOverlayController.syncVideoEnded(videoEnded);

  $: activeTrialRevealController.syncStage({
    expectedFeedbackBlockerSrc,
    expectedStimulusBlockerSrc,
    isFadingOut,
    isOutgoingFreezeState,
    showOverlay: trialSubset.showOverlay,
    trialSubsetKey,
    trialSubsetKind,
  });

  $: if (
    sessionContentSurface.showFlashcardSession &&
    initializedForRender &&
    activeSlotMounted &&
    !activeSlotVisible &&
    trialSubset.showOverlay
  ) {
    activeTrialRevealController.revealMountedNowIfReady({
      allBlockingAssetsReady,
      isOutgoingFreezeState,
      isTestMode: testMode,
      subsetKind: trialSubsetKind,
    });
  }

  $: incomingSlotDisplaySnapshot = buildIncomingTrialSlotDisplaySnapshot({
    defaultInputMode: inputMode,
    deliverySettings,
    formatAnswerText: getDisplayAnswerText,
    layoutMode,
    performanceCurrentTrial: performanceData?.currentTrial || 0,
    preparedTrial,
    skipStudyEnabled: toBoolean(deliverySettings.skipstudy),
  });
  $: incomingSlot = incomingSlotDisplaySnapshot.slot;
  $: incomingExpectedStimulusBlockerSrc = incomingSlotDisplaySnapshot.expectedStimulusBlockerSrc;
  $: incomingExpectedFeedbackBlockerSrc = incomingSlotDisplaySnapshot.expectedFeedbackBlockerSrc;
  $: incomingSlotKey = incomingSlotDisplaySnapshot.slotKey;
  $: {
    incomingBlockingAssetVersion;
    const incomingSlotChanged = incomingTrialSlotController.syncSlotKey(incomingSlotKey);
    if (incomingSlotChanged) {
      incomingBlockingAssetState.stimulusReady = !incomingExpectedStimulusBlockerSrc;
      incomingBlockingAssetState.feedbackReady = !incomingExpectedFeedbackBlockerSrc;
    }
    incomingAllBlockingAssetsReady = (!incomingExpectedStimulusBlockerSrc || incomingBlockingAssetState.stimulusReady) &&
      (!incomingExpectedFeedbackBlockerSrc || incomingBlockingAssetState.feedbackReady);
  }
  $: if (!preparedTrial) {
    incomingTrialSlotController.syncSlotKey('none');
  }
  $: if (
    !testMode &&
    isPreparedAdvanceWaitState &&
    preparedTrial &&
    incomingSlotMounted &&
    incomingAllBlockingAssetsReady &&
    !incomingReadySent
  ) {
    incomingTrialSlotController.markReadySent();
    send({ type: 'INCOMING_READY' });
  }

  let displayTimeoutClockVersion = 1;
  let continuingToNextUnit = false;
  const cardUnitContinuationController = createCardUnitContinuationController({
    continueUnit: continueToNextRuntimeUnit,
    isTestMode: () => testMode,
    log: clientConsole,
    onUpdate: (snapshot) => {
      continuingToNextUnit = snapshot.continuing;
    },
  });
  const displayTimeoutController = createDisplayTimeoutController({
    onTick: () => {
      displayTimeoutClockVersion += 1;
    },
  });
  $: displayTimeoutSnapshot = (displayTimeoutClockVersion, displayTimeoutController.buildSnapshot({
    deliverySettings,
    currentUnitStartTime: Session.get('currentUnitStartTime'),
    currentTdfId: Session.get('currentTdfId'),
    currentUnitNumber: Session.get('currentUnitNumber'),
    continuingToNextUnit,
    testMode,
  }));
  $: hasDisplayTimeout = displayTimeoutSnapshot.hasDisplayTimeout;
  $: displayTimeoutCanContinue = displayTimeoutSnapshot.canContinue;
  $: footerMessage = displayTimeoutSnapshot.footerMessage;
  $: if (displayTimeoutSnapshot.shouldAutoAdvance) {
    displayTimeoutController.markAutoAdvanced();
    void forceAdvanceToNextUnit('Display Max Seconds Reached');
  }

  $: correctAnswerImageSrc = getCorrectAnswerImageSrc(context.buttonList, context.currentAnswer);

  let performanceData = buildCardPerformanceData();
  let learningProgressRequestVersion = 0;
  let contentSurfaceRefreshVersion = 0;
  const learningProgressRuntimeController = createLearningProgressRuntimeController({
    defaultDeliverySettings: DEFAULT_DELIVERY_SETTINGS,
    documentRef: () => typeof document === 'undefined' ? null : document,
    getHiddenItems,
  });
  $: learningProgressRuntimeSnapshot = (learningProgressRequestVersion, learningProgressRuntimeController.buildRuntimeSnapshot({
    deliverySettings,
    engine: resolveLearningProgressEngine(context.engine),
    feedbackEnd: context.timestamps?.feedbackEnd || 0,
    refreshSignal: context.h5pResult?.batchId || context.sparcResult?.observationId || context.sparcResult?.responseValue || contentSurfaceRefreshVersion || '',
    surfaceState: sessionSurfaceState,
  }));
  $: sessionSurfaceShell = learningProgressRuntimeSnapshot.sessionSurfaceShell;
  $: learningProgressSnapshot = learningProgressRuntimeSnapshot.snapshot;
  $: learningProgressPanelState = learningProgressRuntimeSnapshot.panelState;
  $: showLearningProgressPanel = learningProgressPanelState.showPanel;

  // Timeout tracking
  let timeoutProgress = 0;
  let remainingTime = 0;
  let timeoutStart = null;
  let timeoutDuration = 0;
  let textAnswer = '';
  let timeoutModeState = 'none';
  const flashcardTextInputController = createFlashcardTextInputController({
    getContext: () => context,
    getState: () => state,
    now: () => Date.now(),
    send,
    setContextUserAnswer: (value) => {
      context.userAnswer = value;
    },
    setTextAnswer: (value) => {
      textAnswer = value;
    },
  });
  const flashcardEventController = createFlashcardEventController({
    getContext: () => context,
    loadTtsPlayback: async () => {
      const { ttsPlaybackService } = await import('../services/ttsService');
      return ttsPlaybackService;
    },
    send,
  });
  const flashcardReviewEventController = createFlashcardReviewEventController({
    getSubsetKind: () => trialSubset.kind,
    isTestMode: () => testMode,
    log: clientConsole,
    now: () => Date.now(),
    send,
    stateMatches: (path) => state.matches(path),
  });
  const cardBlockingAssetController = createCardBlockingAssetController({
    getExpectedFeedbackSrc: (slot) => slot === 'incoming'
      ? incomingExpectedFeedbackBlockerSrc
      : expectedFeedbackBlockerSrc,
    getExpectedStimulusSrc: (slot) => slot === 'incoming'
      ? incomingExpectedStimulusBlockerSrc
      : expectedStimulusBlockerSrc,
    setReady: ({ owner, ready, slot }) => {
      if (owner === 'stimulus') {
        if (slot === 'incoming') {
          incomingBlockingAssetState.stimulusReady = ready;
          incomingBlockingAssetVersion += 1;
        } else {
          activeTrialRevealController.setBlockingAssetReady({ owner, ready });
        }
        return;
      }

      if (slot === 'incoming') {
        incomingBlockingAssetState.feedbackReady = ready;
        incomingBlockingAssetVersion += 1;
      } else {
        activeTrialRevealController.setBlockingAssetReady({ owner, ready });
      }
    },
  });
  const timeoutCountdown = createTimeoutCountdownController({
    onUpdate: (snapshot) => {
      timeoutModeState = snapshot.modeState;
      timeoutProgress = snapshot.progress;
      remainingTime = snapshot.remainingTime;
      timeoutStart = snapshot.start;
      timeoutDuration = snapshot.duration;
    },
  });
  const timeoutCountdownSyncController = createTimeoutCountdownSyncController({
    countdown: timeoutCountdown,
    getMainTimeoutMs,
    getFeedbackTimeoutMs,
  });

  $: flashcardTextInputController.resetForRuntimeState(state);
  $: flashcardTextInputController.syncTrialStart(context.timestamps?.trialStart);
  $: timeoutMode = timeoutCountdownSyncController.sync({
    testMode,
    testTimeout,
    state,
    context,
    deliverySettings,
    isOutgoingFreezeState,
  });

  $: performanceDisplaySnapshot = buildCardPerformanceDisplaySnapshot({
    deliverySettings,
    performanceData,
    timeoutMode,
    timeoutProgress,
    remainingTime,
  });
  $: showTimeoutBar = performanceDisplaySnapshot.showTimeoutBar;
  $: showTimeoutCountdown = performanceDisplaySnapshot.showTimeoutCountdown;
  $: showPerformanceStats = performanceDisplaySnapshot.showPerformanceStats;
  $: performanceSlotProps = performanceDisplaySnapshot.performanceSlotProps;
  $: performanceStatsProps = performanceDisplaySnapshot.performanceStatsProps;
  $: trialTimerProps = performanceDisplaySnapshot.trialTimerProps;
  $: showTrialTimerArea = performanceDisplaySnapshot.showTrialTimerArea;

  // Event handlers
  function handleSubmit(event) {
    flashcardEventController.handleSubmit(event);
  }

  function handleChoice(event) {
    flashcardEventController.handleChoice(event);
  }

  function handleH5PResult(event) {
    trialDisplaySubmissionController.handleH5PResult(event.detail || {});
  }

  function handleRuntimeEvent(event) {
    send(event.detail);
  }

  function handleRuntimeRefresh() {
    contentSurfaceRefreshVersion += 1;
  }

  async function handleForceAdvance(event) {
    await forceAdvanceToNextUnit(event.detail?.reason || 'Session Done');
  }

  function handleInput(event) {
    flashcardTextInputController.handleInput(event.detail);
  }

  function handleInputActivity(event) {
    flashcardTextInputController.handleInputActivity(event.detail);
  }

  function handleBlockingAssetState(event, slot = 'active') {
    cardBlockingAssetController.handleBlockingAssetState(event.detail, slot);
  }

  function handleFeedbackContent(event) {
    flashcardReviewEventController.handleFeedbackContent(event.detail);
  }

  function handleReviewRevealStarted(event) {
    flashcardReviewEventController.handleReviewRevealStarted(event.detail);
  }

  function primeFlashcardControllerFadeStart() {
    if (!trialContentFadeElement || typeof window === 'undefined') {
      return;
    }

    // Mobile Safari can briefly composite swapped trial content at the prior
    // opacity unless it observes the hidden start state before fade-in begins.
    void trialContentFadeElement.offsetWidth;
    void getComputedStyle(trialContentFadeElement).opacity;
  }

  function logTrialFadeEvent(event) {
    const transitionEvent = event?.detail?.target ? event.detail : event;
    trialFadeTransitionController.handleTransitionEvent({
      eventType: event?.type,
      isOwnTarget: transitionEvent?.target === trialContentFadeElement,
      propertyName: transitionEvent?.propertyName,
      pseudoElement: transitionEvent?.pseudoElement || '',
    });
  }

  function handleFirstKeypress(event) {
    flashcardEventController.handleFirstKeypress(event);
  }

  function handleSkipStudy() {
    flashcardEventController.handleSkipStudy();
  }

  async function handleReplay(event) {
    await flashcardEventController.handleReplay(event);
  }

  const completedVideoQuestionsStore = createCompletedVideoQuestionsStore();
  const cardWakeLockController = createCardWakeLockController({
    navigatorRef: () => typeof navigator === 'undefined' ? null : navigator,
    documentRef: () => typeof document === 'undefined' ? null : document,
    shouldHold: () => shouldHoldScreenWakeLock({
      active: !testMode,
      documentRef: typeof document === 'undefined' ? null : document,
    }),
    log: clientConsole,
  });
  const videoMachineBridge = createVideoMachineBridge({
    addCompletedVideoQuestion: (questionIndex) => {
      completedVideoQuestionsStore.add(questionIndex);
    },
    getCompletedVideoQuestions: completedVideoQuestionsStore.get,
    getCurrentState: () => currentState,
    getRepeatQuestionsSinceCheckpointEnabled: () => repeatQuestionsSinceCheckpointEnabled,
    getRewindOnIncorrectEnabled: () => rewindOnIncorrectEnabled,
    getVideoCheckpoints: () => videoCheckpoints,
    getVideoPlayer: () => videoPlayer,
    log: clientConsole,
    scheduleRetry: (callback, delayMs) => {
      setTimeout(callback, delayMs);
    },
    setQuestionsToRepeat: (questionsToRepeat) => {
      Session.set('questionsToRepeat', questionsToRepeat);
    },
    stateMatches: (path) => state.matches(path),
    waitForDomUpdate: tick,
  });
  const videoSessionBridge = createVideoSessionBridge({
    getCurrentState: () => currentState,
    getVideoCheckpoints: () => videoCheckpoints,
    getVideoPlayer: () => videoPlayer,
    isTestMode: () => testMode,
    log: clientConsole,
    send,
    setSessionValue: (key, value) => {
      Session.set(key, value);
    },
    stateMatches: (path) => state.matches(path),
  });
  const videoSessionRuntimeController = createVideoSessionRuntimeController({
    getCurrentUnitNumber: () => Session.get('currentUnitNumber'),
    getVideoInstructionsShownAt: () => videoInstructionsShownAt,
    getVideoPlayer: () => videoPlayer,
    log: clientConsole,
    now: () => Date.now(),
    persistInstructionState: createExperimentState,
    prepareReadyPlayer: (showOverlay) => {
      videoSessionBridge.prepareReadyPlayer(showOverlay);
    },
    recordInstructionContinue: recordCurrentInstructionContinue,
    setSessionValue: (key, value) => {
      Session.set(key, value);
    },
    setVideoInstructionDismissed: (value) => {
      videoInstructionDismissed = value;
    },
    setVideoInstructionStartBlocked: (value) => {
      videoInstructionStartBlocked = value;
    },
    setVideoPlayerReady: (value) => {
      videoPlayerReady = value;
    },
    flushPendingResume: (reason) => videoMachineBridge.flushPendingResume(reason),
  });
  const videoEventRuntime = createVideoEventRuntime({
    getVideoPlayer: () => videoPlayer,
    machineBridge: videoMachineBridge,
    send,
    sessionBridge: videoSessionBridge,
    sessionRuntime: videoSessionRuntimeController,
    stateMatches: (path) => state.matches(path),
  });

  const contentLaunchEnvironment = createContentLaunchEnvironment({
    getSessionValue: (key) => Session.get(key),
    setSessionValue: (key, value) => {
      Session.set(key, value);
    },
    getDeliverySettings: () => deliverySettingsStore.get(),
    getVideoCheckpoints,
    getUser: () => Meteor.user(),
    routeTo: (path) => FlowRouter.go(path),
    finishLaunchLoading,
    now: () => Date.now(),
  });

  function startRuntimeWindowEventController() {
    if (typeof window === 'undefined') {
      return null;
    }

    const runtimeWindowEventController = createCardRuntimeWindowEventController({
      windowTarget: window,
      documentTarget: document,
      startRecording: startSrRecording,
      stopRecording: stopSrRecording,
      cleanupAudioRecorder,
      setStudyInteractionText: (next) => {
        studyInteractionText = next;
      },
      requestVideoResume: (reason) => {
        videoMachineBridge.requestResume(reason);
      },
      handleVideoAnswer: (detail) => {
        videoMachineBridge.handleVideoAnswer(detail);
      },
      syncScreenWakeLock: cardWakeLockController.sync,
      releaseScreenWakeLock: cardWakeLockController.release,
      userCanForceAdvance: () => currentUserHasRole('admin,teacher'),
      forceAdvanceToNextUnit,
      log: clientConsole,
    });
    runtimeWindowEventController.start();
    return runtimeWindowEventController;
  }

  // Lifecycle: Start machine on mount
  let initializedForRender = false;
  contentRuntimeMachineRuntimeController = createContentRuntimeMachineRuntimeController({
    machine: contentRuntimeMachine,
    createActor: (machine) => createActor(machine),
    setState: (snapshot) => {
      state = snapshot;
    },
    sendStartEvent: send,
    getStartEvent: () => ({
      type: 'START',
      userId,
      attemptId,
      unitId,
      tdfId,
      engineIndices,
    }),
    log: clientConsole,
  });
  const cardRuntimeLifecycleController = createCardRuntimeLifecycleController({
    startRuntimeWindowEvents: startRuntimeWindowEventController,
    machineRuntime: contentRuntimeMachineRuntimeController,
    createReactiveTrackers: () => createMeteorCardReactiveTrackers({
      setPerformanceData: (performance) => {
        performanceData = buildCardPerformanceData(performance);
      },
      setUser: (nextUser) => {
        user = nextUser;
      },
      setVideoCheckpoints: (nextVideoCheckpoints) => {
        videoCheckpoints = nextVideoCheckpoints;
      },
      resetCompletedVideoQuestions: () => {
        completedVideoQuestionsStore.reset();
      },
    }),
  });

  let contentSurfaceElement;
  const contentSurfaceLifecycleRuntime = createContentSurfaceLifecycleRuntime({
    applyTestPerformance: () => {
      performanceData = { ...performanceData, ...testPerformance };
    },
    cleanupAudioRecorder,
    clearDisplayTimeoutClock: displayTimeoutController.stopClock,
    clearLearningProgressViewport: learningProgressRuntimeController.closeViewport,
    clearTimeoutCountdown: timeoutCountdownSyncController.stopInterval,
    completeCleanup,
    failLaunch: (failure) => {
      if (contentLaunchCoordinator.getSnapshot().phase !== 'failed') {
        contentLaunchCoordinator.fail(failure);
      }
    },
    launch: runContentLaunchOrchestration,
    launchDeps: {
      initializeContent: async () => {
        contentLaunchCoordinator.begin();
        try {
          const result = await initializeContentSurface();
          if (!result?.redirected) {
            const activeTdfId = String(Session.get('currentTdfId') || '').trim();
            const rootTdfId = String(Session.get('currentRootTdfId') || '').trim();
            const resolvedUnitIndex = Number(Session.get('currentUnitNumber'));
            const resolvedUnit = Session.get('currentTdfUnit');
            attemptId = beginLearningAttempt(activeTdfId);
            contentLaunchCoordinator.markProgressRestoring(
              resolveContentLaunchSurfaceKind({
                currentTdfUnit: resolvedUnit,
              }),
              {
                userId,
                rootTdfId,
                activeTdfId,
                unitIndex: resolvedUnitIndex,
                attemptId,
              },
            );
            contentLaunchCoordinator.markEngineInitializing();
          }
          return result;
        } catch (error) {
          contentLaunchCoordinator.fail(error);
          throw error;
        }
      },
      waitForContentReadiness: waitForContentReadinessService,
      getReadinessDependencies: contentLaunchEnvironment.getReadinessDependencies,
      buildReadinessDiagnostic: contentLaunchEnvironment.buildReadinessDiagnostic,
      buildInitializeFailureDiagnostic: contentLaunchEnvironment.buildInitializeFailureDiagnostic,
      setFailureDiagnostic: contentLaunchEnvironment.setFailureDiagnostic,
      log: clientConsole,
      routeInitializationFailure: contentLaunchEnvironment.routeInitializationFailure,
      setLaunchLoadingMessage,
      loadingContentMessage: translatePlatformString(getActiveUiLocale(), 'common.loadingContent'),
      markLaunchLoadingTiming,
      prepareRender: async () => undefined,
    },
    lifecycle: cardRuntimeLifecycleController,
    normalizeTestSnapshot,
    setInitializedForRender: (value) => {
      initializedForRender = value;
    },
    setSessionUnitModeVersion: (updater) => {
      sessionUnitModeVersion = updater(sessionUnitModeVersion);
      learningProgressRequestVersion += 1;
    },
    setState: (nextState) => {
      state = nextState;
    },
    shouldStartReadyRuntime: () => {
      const surface = contentLaunchCoordinator.getSnapshot().surface;
      return surface ? getContentSurfaceAdapter(surface).runtimeOwner === 'shared-machine' : false;
    },
    startDisplayTimeoutClock: displayTimeoutController.startClock,
    stopStimDisplayTypeMapVersionSync,
    testMode: () => testMode,
    testPerformance: () => testPerformance,
    testSnapshot: () => testSnapshot,
    waitForDomUpdate: tick,
  });

  onMount(() => {
    contentSurfaceLifecycleRuntime.mount();
  });

  // Lifecycle: Cleanup on unmount
  onDestroy(() => {
    unsubscribeContentLaunch();
    contentSurfaceLifecycleRuntime.unmount();
  });

  // Video player reference
  let videoPlayer;
  let videoCheckpoints = null;
  $: videoRuntimeSnapshot = buildVideoRuntimeSnapshot({
    currentState,
    currentTdfUnit,
    getVideoResumeAnchor,
    state,
    videoCheckpoints,
  });
  $: preventScrubbingEnabled = videoRuntimeSnapshot.preventScrubbingEnabled;
  $: rewindOnIncorrectEnabled = videoRuntimeSnapshot.rewindOnIncorrectEnabled;
  $: repeatQuestionsSinceCheckpointEnabled = videoRuntimeSnapshot.repeatQuestionsSinceCheckpointEnabled;
  $: videoEventRuntime.syncPendingResume();
  const showCardDebugState = cardDebugStateEnabled();

  $: if (testMode && testPerformance) {
    performanceData = { ...performanceData, ...testPerformance };
  }

  async function forceAdvanceToNextUnit(reason) {
    await cardUnitContinuationController.forceAdvanceToNextUnit(reason);
  }

  function handleLearningProgressPanelToggle(event) {
    learningProgressRuntimeController.setRequestedOpen(Boolean(event?.detail?.open));
    learningProgressRequestVersion += 1;
    void notifyLearningProgressLayoutChange({
      windowRef: typeof window === 'undefined' ? null : window,
      waitForDomUpdate: tick,
    });
  }

  async function handleFooterContinue(event) {
    event?.preventDefault?.();
    await forceAdvanceToNextUnit('Continue Button Pressed');
  }

</script>

{#if testMode || initializedForRender}
<div
  class="content-surface"
  class:video-mode={sessionSurfaceShell.contentSurfaceClasses.videoMode}
  class:auto-tutor-mode={sessionSurfaceShell.contentSurfaceClasses.autoTutorMode}
  bind:this={contentSurfaceElement}
  style={cardFontSizeStyle}
>
  {#if sessionContentSurface.showAutoTutorSession}
    <AutoTutorSession on:complete={() => forceAdvanceToNextUnit('AutoTutor Complete')} />
  {:else if sessionContentSurface.showVideoSession}
    <VideoSessionSurface
      bind:videoPlayer={videoPlayer}
      bind:trialContentFadeElement={trialContentFadeElement}
      checkpointGateState={videoRuntimeSnapshot.checkpointGateState}
      continueButtonText={deliverySettings.continueButtonText || ''}
      {deliverySettings}
      fadingOut={isFadingOut}
      instructionHtml={sanitizedVideoInstructionText}
      instructionStartBlocked={videoInstructionStartBlocked}
      overlayMounted={trialContentMounted}
      overlayVisible={trialContentVisible}
      performanceStatsProps={performanceStatsProps}
      preventScrubbing={preventScrubbingEnabled}
      questionIndices={videoRuntimeSnapshot.questionIndices}
      questionTimes={videoRuntimeSnapshot.questionTimes}
      resumeCheckpointIndex={videoRuntimeSnapshot.resumeCheckpointIndex}
      resumeStartTime={videoRuntimeSnapshot.resumeStartTime}
      showInstructionOverlay={showVideoInstructionOverlay}
      showPerformanceStats={showPerformanceStats}
      showTrialTimerArea={showTrialTimerArea}
      startBlocked={showVideoInstructionOverlay}
      flashcardControllerProps={flashcardControllerProps}
      trialTimerProps={trialTimerProps}
      videoCanAcceptCheckpoint={videoRuntimeSnapshot.canAcceptCheckpoint}
      videoEndOverlayMounted={videoEndOverlayMounted}
      videoEndOverlayVisible={videoEndOverlayVisible}
      videoPlayerReady={videoPlayerReady}
      on:checkpoint={(event) => videoEventRuntime.handleCheckpoint(event)}
      on:ready={() => videoEventRuntime.handleReady(showVideoInstructionOverlay)}
      on:ended={() => videoEventRuntime.handleEnded()}
      on:transitionrun={logTrialFadeEvent}
      on:transitionstart={logTrialFadeEvent}
      on:transitionend={logTrialFadeEvent}
      on:submit={handleSubmit}
      on:choice={handleChoice}
      on:input={handleInput}
      on:activity={handleInputActivity}
      on:firstKeypress={handleFirstKeypress}
      on:feedbackcontent={handleFeedbackContent}
      on:blockingassetstate={handleBlockingAssetState}
      on:reviewrevealstarted={handleReviewRevealStarted}
      on:h5presult={handleH5PResult}
      on:instructioncontinue={(event) => videoEventRuntime.handleInstructionContinue(event)}
      on:videocontinue={() => videoEventRuntime.handleContinue()}
    />
  {:else if showSparcSessionSurface}
    <SparcSessionSurface
      display={flashcardControllerProps.display}
      adminDiagnosticMode={adminDiagnosticModeEnabled()}
      engine={context.engine}
      tdfId={context.tdfId}
      userId={context.userId}
      attemptId={context.attemptId}
      levelUnit={context.unitId}
      runtimeNodeValues={context.sparcNodeValues}
      {learningProgressSnapshot}
      showQuestionNumber={flashcardControllerProps.showQuestionNumber}
      questionNumber={flashcardControllerProps.questionNumber}
      subsetKind={flashcardControllerProps.subsetKind}
      feedbackVisible={flashcardControllerProps.feedbackVisible}
      isCorrect={flashcardControllerProps.isCorrect}
      isTimeout={flashcardControllerProps.isTimeout}
      feedbackUserAnswer={flashcardControllerProps.feedbackUserAnswer}
      correctAnswer={flashcardControllerProps.correctAnswer}
      correctAnswerImageSrc={flashcardControllerProps.correctAnswerImageSrc}
      correctLabelText={flashcardControllerProps.correctLabelText}
      incorrectLabelText={flashcardControllerProps.incorrectLabelText}
      feedbackMessage={flashcardControllerProps.feedbackMessage}
      correctColor={flashcardControllerProps.correctColor}
      incorrectColor={flashcardControllerProps.incorrectColor}
      displayCorrectFeedback={flashcardControllerProps.displayCorrectFeedback}
      displayIncorrectFeedback={flashcardControllerProps.displayIncorrectFeedback}
      displayUserAnswerInFeedback={flashcardControllerProps.displayUserAnswerInFeedback}
      feedbackLayout={flashcardControllerProps.feedbackLayout}
      displayCorrectAnswerInIncorrectFeedback={flashcardControllerProps.displayCorrectAnswerInIncorrectFeedback}
      inputLanguage={flashcardControllerProps.inputLanguage}
      inputTextDirection={flashcardControllerProps.inputTextDirection}
      on:feedbackcontent={handleFeedbackContent}
      on:blockingassetstate={handleBlockingAssetState}
      on:reviewrevealstarted={handleReviewRevealStarted}
      on:runtimeevent={handleRuntimeEvent}
      on:runtimewatchedstatechanged={handleRuntimeRefresh}
      on:forceadvance={handleForceAdvance}
    />
  {:else if sessionContentSurface.showFlashcardSession}
    <FlashcardSessionSurface
      bind:trialContentFadeElement={trialContentFadeElement}
      {deliverySettings}
      fadingOut={isFadingOut}
      incomingSlot={incomingSlot}
      learningProgressPanelState={learningProgressPanelState}
      learningProgressSnapshot={learningProgressSnapshot}
      performanceStatsProps={performanceStatsProps}
      showLearningProgressPanel={showLearningProgressPanel}
      showPerformanceStats={showPerformanceStats}
      showTrialTimerArea={showTrialTimerArea}
      flashcardControllerProps={flashcardControllerProps}
      trialContentVisible={trialContentVisible}
      trialSubset={trialSubset}
      trialTimerProps={trialTimerProps}
      on:transitionrun={logTrialFadeEvent}
      on:transitionstart={logTrialFadeEvent}
      on:transitionend={logTrialFadeEvent}
      on:submit={handleSubmit}
      on:choice={handleChoice}
      on:input={handleInput}
      on:activity={handleInputActivity}
      on:firstKeypress={handleFirstKeypress}
      on:feedbackcontent={handleFeedbackContent}
      on:replay={handleReplay}
      on:blockingassetstate={handleBlockingAssetState}
      on:incomingblockingassetstate={(event) => handleBlockingAssetState(event, 'incoming')}
      on:reviewrevealstarted={handleReviewRevealStarted}
      on:h5presult={handleH5PResult}
      on:skipstudy={handleSkipStudy}
      on:learningprogresstoggle={handleLearningProgressPanelToggle}
    />
  {/if}

  {#if hasDisplayTimeout}
    <DisplayTimeoutFooter
      canContinue={displayTimeoutCanContinue}
      continueButtonText={deliverySettings.continueButtonText || ''}
      continuing={continuingToNextUnit}
      message={footerMessage}
      on:continue={handleFooterContinue}
    />
  {/if}

  <!-- Debug state display (development only) -->
  {#if showCardDebugState}
    <div class="debug-state">
      <details>
        <summary>State: {JSON.stringify(currentState)}</summary>
        <pre>{JSON.stringify(context, null, 2)}</pre>
      </details>
    </div>
  {/if}
</div>
{/if}

<style>
  .content-surface {
    /* Layout variables */
    --card-spacing-xs: 0.25rem;
    --card-spacing-sm: 0.5rem;
    --card-spacing-md: 0.75rem;
    --card-spacing-lg: 1rem;
    
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
    background-color: var(--app-background-color);
    font-family: var(--app-font-family);
    font-size: var(--app-font-size-base);
  }

  .content-surface.video-mode {
    background-color: var(--app-text-color);
  }

  .content-surface.auto-tutor-mode {
    background-color: var(--app-background-color);
  }

  .content-surface.video-mode :global(.video-session-mode) {
    flex: 1 1 auto;
    min-height: 0;
  }

  .debug-state {
    position: fixed;
    top: 10px;
    right: 10px;
    background: color-mix(in srgb, var(--app-text-color) 80%, transparent);
    color: var(--app-accent-color);
    padding: var(--app-space-2);
    border-radius: var(--app-border-radius-sm);
    font-family: monospace;
    font-size: calc(var(--app-font-size-base) * 0.7);
    max-width: 300px;
    max-height: 200px;
    overflow: auto;
    z-index: 9999;
  }

  .debug-state summary {
    cursor: pointer;
    user-select: none;
  }

  .debug-state pre {
    margin: var(--app-space-2) 0 0 0;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
</style>

