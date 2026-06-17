<script>
  /**
   * CardScreen Component
   * Main container that orchestrates all components and XState machine
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
  import { Answers } from '../../answerAssess';
  import { cardMachine } from '../machine/cardMachine';
  import { DEFAULT_DELIVERY_SETTINGS, EVENTS } from '../machine/constants';
  import { initializeSvelteCard } from '../services/svelteInit';
  import { createExperimentState } from '../services/experimentState';
  import {
    waitForCardReadiness as waitForCardReadinessService,
  } from '../services/cardReadiness';
  import { runCardLaunchOrchestration } from '../services/cardLaunchOrchestration';
  import { createCardLaunchEnvironment } from '../services/cardLaunchEnvironment';
  import {
    createFirstTrialRevealController,
    getElementTransitionDurationMs,
  } from '../services/firstTrialReveal';
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
  import { createCardVideoEventRuntime } from '../services/cardVideoEventRuntime';
  import {
    buildCardVideoRuntimeSnapshot,
    createCompletedVideoQuestionsStore,
  } from '../services/cardVideoRuntime';
  import { waitForBrowserPaint } from '../utils/paintTiming';
  import { getMainTimeoutMs, getFeedbackTimeoutMs } from '../utils/timeoutUtils';
  import { recordCurrentInstructionContinue } from '../../instructions';
  import {
    resolveH5PTrialDisplayResult,
    selfHostedH5PTrialDisplayOwnsInteraction,
  } from '../services/h5pTrialDisplay';
  import {
    resolveSparcTrialDisplayResult,
    sparcTrialDisplayOwnsInteraction,
  } from '../services/sparcTrialDisplay';
  import { commitSparcProductionRuleAction } from '../services/sparcProductionRuleActionCommit';
  import { createTrialDisplaySubmissionController } from '../services/trialDisplaySubmission';
  import { createLearningProgressRuntimeController } from '../services/learningProgressPanelRuntime';
  import {
    notifyLearningProgressLayoutChange,
  } from '../services/learningProgressPanelViewport';
  import {
    resolveSessionSurfaceLaunchCompletion,
  } from '../services/sessionSurfaceMode';
  import {
    buildCardSessionRuntimeSnapshot,
    startVideoInstructionTimer,
  } from '../services/cardSessionRuntime';
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
    getIsVideoSessionFlag,
    getVideoCheckpoints,
    getVideoResumeAnchor,
  } from '../services/cardRuntimeState';
  import {
    createCardMachineRuntimeController,
    getInitialCardMachineSnapshot,
  } from '../services/cardMachineRuntime';
  import { createCardRuntimeLifecycleController } from '../services/cardRuntimeLifecycle';
  import { createCardScreenLifecycleRuntime } from '../services/cardScreenLifecycleRuntime';
  import { createMeteorCardReactiveTrackers } from '../services/cardReactiveTrackers';
  import { buildCardInputSrSnapshot } from '../services/cardInputSrState';
  import {
    buildCardPerformanceData,
    buildCardPerformanceDisplaySnapshot,
  } from '../services/cardPerformanceDisplay';
  import { createCardTextInputController } from '../services/cardTextInputController';
  import { createCardTrialEventController } from '../services/cardTrialEventController';
  import { createCardReviewEventController } from '../services/cardReviewEventController';
  import { sanitizeCardInstructionHtml } from '../services/cardInstructionSanitizer';
  import { createCardBlockingAssetController } from '../services/cardBlockingAssetState';
  import {
    createIncomingTrialSlotController,
  } from '../services/incomingTrialSlotController';
  import { buildIncomingTrialSlotDisplaySnapshot } from '../services/incomingTrialSlotDisplay';
  import { createActiveTrialRevealController } from '../services/activeTrialRevealController';
  import { createTrialFadeTransitionController } from '../services/trialFadeTransitionController';
  import {
    buildTrialContentPropsFromSubset,
    getCorrectAnswerImageSrc,
  } from '../services/trialContentProps';
  import { CardStore } from '../../modules/cardStore';
  import AutoTutorSession from './AutoTutorSession.svelte';
  import DisplayTimeoutFooter from './DisplayTimeoutFooter.svelte';
  import StandardCardSessionSurface from './StandardCardSessionSurface.svelte';
  import VideoCardSessionSurface from './VideoCardSessionSurface.svelte';

  /** @type {string} Session ID */
  export let sessionId = '';

  /** @type {string} Unit ID */
  export let unitId = '';

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
      throw new Error('[CardScreen] testMode requires a testSnapshot object');
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
  let cardMachineRuntimeController = null;
  let state = getInitialCardMachineSnapshot();
  let videoInstructionDismissed = false;
  let videoInstructionStartBlocked = false;
  let videoInstructionsShownAt = 0;
  let videoPlayerReady = false;
  let sessionUnitModeVersion = 0;
  const send = (event) => {
    if (testMode) {
      clientConsole(2, '[CardScreen] Ignoring event in test mode:', event?.type || event);
      return;
    }
    const actor = cardMachineRuntimeController?.getActor?.();
    if (actor && typeof actor.send === 'function') {
      actor.send(event);
    }
  };
  const trialDisplaySubmissionController = createTrialDisplaySubmissionController({
    getCurrentDisplay: () => context.currentDisplay,
    h5pOwnsResponse: () => h5pOwnsResponse,
    sparcOwnsResponse: () => sparcOwnsResponse,
    resolveH5PResult: resolveH5PTrialDisplayResult,
    resolveSparcResult: resolveSparcTrialDisplayResult,
    now: () => Date.now(),
    submit: send,
  });

  async function handleSparcAction(event) {
    const display = context.currentDisplay;
    if (!sparcOwnsResponse || !display || display.type !== 'sparc') {
      return;
    }
    const documentId = typeof display.documentId === 'string' ? display.documentId.trim() : '';
    const hasProductionRuleSource = Array.isArray(display.productionRules);
    if (!documentId || !hasProductionRuleSource) {
      return;
    }
    const sparcResult = resolveSparcTrialDisplayResult(display, event.detail || {}, '[CardScreen]');
    if (!sparcResult) {
      throw new Error('[CardScreen] SPARC action received for non-SPARC display');
    }
    const { sparcNodeValues } = await commitSparcProductionRuleAction({
      engine: context.engine,
      currentDisplay: display,
      sparcResult,
      tdfId: context.tdfId,
      sessionId: context.sessionId,
      levelUnit: context.unitId,
    });
    if (Object.keys(sparcNodeValues).length === 0) {
      return;
    }
    send({
      type: EVENTS.SPARC_ACTION,
      timestamp: sparcResult.timestamp,
      sparcNodeValues,
    });
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
  $: cardSessionRuntimeSnapshot = (sessionUnitModeVersion, buildCardSessionRuntimeSnapshot({
    currentTdfUnit: Session.get('currentTdfUnit'),
    deliverySettings,
    sessionIsVideoSession: getIsVideoSessionFlag(),
    sessionUnitType: Session.get('unitType'),
    curUnitInstructionsSeen: Session.get('curUnitInstructionsSeen'),
    videoInstructionDismissed,
    sanitizeInstructionHtml: sanitizeCardInstructionHtml,
  }));
  $: currentTdfUnit = cardSessionRuntimeSnapshot.currentTdfUnit;
  $: sessionSurfaceState = cardSessionRuntimeSnapshot.sessionSurfaceState;
  $: sessionContentSurface = cardSessionRuntimeSnapshot.sessionContentSurface;
  $: rawVideoInstructionText = cardSessionRuntimeSnapshot.rawVideoInstructionText;
  $: sanitizedVideoInstructionText = cardSessionRuntimeSnapshot.sanitizedVideoInstructionText;
  $: videoInstructionsSeen = cardSessionRuntimeSnapshot.videoInstructionsSeen;
  $: showVideoInstructionOverlay = cardSessionRuntimeSnapshot.showVideoInstructionOverlay;
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
  let trialContentFadeElement;
  let lastFadeLogContext = {
    key: 'none',
    subsetKind: 'none',
    visibleSetAt: 0,
    configuredDurationMs: 0,
  };
  function isFirstTrialRevealStable({ key, subsetKind }) {
    return initializedForRender &&
      activeSlotMounted &&
      activeSlotVisible &&
      trialContentVisible &&
      allBlockingAssetsReady &&
      !isFadingOut &&
      trialSubset.showOverlay &&
      trialSubsetKind === subsetKind &&
      trialSubsetKey === key &&
      (!trialContentFadeElement || getComputedStyle(trialContentFadeElement).opacity === '1');
  }
  const firstTrialReveal = createFirstTrialRevealController({
    finishLaunchLoading,
    getFadeContext: () => lastFadeLogContext,
    isLaunchLoadingActive,
    isRevealStable: isFirstTrialRevealStable,
    markLaunchLoadingTiming,
    now: () => performance.now(),
    scheduleTimeout: (callback, delayMs) => {
      setTimeout(callback, delayMs);
    },
    waitForBrowserPaint,
    waitForDomUpdate: tick,
  });
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
      allBlockingAssetsReady,
      isFadingOut,
      isTestMode: testMode,
      subsetKind: trialSubset.kind,
    }),
    log: clientConsole,
    markFirstRevealClassSet: firstTrialReveal.markRevealClassSet,
    now: () => performance.now(),
    onFadeContext: (context) => {
      lastFadeLogContext = context;
    },
    onRevealStarted: (subsetKind) => {
      send({
        type: EVENTS.TRIAL_REVEAL_STARTED,
        timestamp: Date.now(),
        subsetKind,
      });
    },
    onUpdate: (snapshot) => {
      activeSlotMounted = snapshot.activeSlotMounted;
      activeSlotVisible = snapshot.activeSlotVisible;
      feedbackBlockingAssetReady = snapshot.feedbackBlockingAssetReady;
      stimulusBlockingAssetReady = snapshot.stimulusBlockingAssetReady;
    },
    primeFadeStart: () => {
      primeTrialContentFadeStart();
    },
    readTransitionDurationMs: () => getElementTransitionDurationMs(
      trialContentFadeElement,
      (element) => getComputedStyle(element),
    ),
    waitForBrowserPaint,
    waitForDomUpdate: tick,
  });
  const trialFadeTransitionController = createTrialFadeTransitionController({
    finishFirstRevealFromTransitionEvent: firstTrialReveal.finishFromTransitionEvent,
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
  $: sparcOwnsResponse = sparcTrialDisplayOwnsInteraction(context.currentDisplay) && baseTrialSubsetKind === 'question';
  $: trialDisplaySubmissionController.resetForDisplay(baseTrialSubsetKind === 'question' ? context.currentDisplay : undefined);
  let studyInteractionText = '';
  $: if (!isStudyState && studyInteractionText) {
    studyInteractionText = '';
  }
  $: inputEnabled = state.matches('presenting.awaiting') || state.matches('feedback.forceCorrecting');
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
    formatAnswerText: (answer) => Answers.getDisplayAnswerText(answer),
    h5pOwnsResponse,
    isCorrect: context.isCorrect,
    isForceCorrecting: baseIsForceCorrecting,
    isStudyState,
    originalAnswer: context.originalAnswer,
    skipStudyEnabled: toBoolean(deliverySettings.skipstudy),
    sparcOwnsResponse,
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
  $: activeTrialContent = buildTrialContentPropsFromSubset({
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
    sparcNodeValues: context.sparcNodeValues,
    learningProgressSnapshot,
    subset: trialSubset,
    userAnswer: textAnswer,
  });
  $: expectedStimulusBlockerSrc = activeTrialContent.expectedStimulusBlockerSrc;
  $: expectedFeedbackBlockerSrc = activeTrialContent.expectedFeedbackBlockerSrc;
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
  $: cardVisualReady = trialContentMounted || state.matches('videoWaiting') || videoEnded;
  $: trialContentProps = activeTrialContent.props;
  $: videoEnded = state.matches('videoEnded');
  $: videoEndOverlayController.syncVideoEnded(videoEnded);

  let standardCardLaunchFinishKey = '';
  $: if (
    !testMode &&
    initializedForRender &&
    sessionContentSurface.showStandardCardSession &&
    trialContentVisible &&
    isLaunchLoadingActive() &&
    trialSubsetKey &&
    trialSubsetKey !== 'none' &&
    standardCardLaunchFinishKey !== trialSubsetKey
  ) {
    standardCardLaunchFinishKey = trialSubsetKey;
    void (async (key, subsetKind) => {
      await tick();
      await waitForBrowserPaint();
      if (
        isLaunchLoadingActive() &&
        isFirstTrialRevealStable({ key, subsetKind })
      ) {
        markLaunchLoadingTiming('standardCard:firstTrialVisible', {
          key,
          subsetKind,
        });
        finishLaunchLoading('standard-card-first-trial-visible');
      }
    })(trialSubsetKey, trialSubsetKind);
  }

  $: activeTrialRevealController.syncStage({
    expectedFeedbackBlockerSrc,
    expectedStimulusBlockerSrc,
    isFadingOut,
    isOutgoingFreezeState,
    showOverlay: trialSubset.showOverlay,
    trialSubsetKey,
    trialSubsetKind,
  });

  $: activeTrialRevealController.queueRevealIfReady({
    allBlockingAssetsReady,
    isOutgoingFreezeState,
  });

  $: if (
    sessionContentSurface.showStandardCardSession &&
    state.matches('presenting.awaiting') &&
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
    formatAnswerText: (answer) => Answers.getDisplayAnswerText(answer),
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
  const learningProgressRuntimeController = createLearningProgressRuntimeController({
    defaultDeliverySettings: DEFAULT_DELIVERY_SETTINGS,
    documentRef: () => typeof document === 'undefined' ? null : document,
    getHiddenItems: () => CardStore.getHiddenItems(),
  });
  $: currentSparcProgressReporter = context.currentDisplay?.type === 'sparc'
    && context.currentDisplay?.progressReporter
    && typeof context.currentDisplay.progressReporter === 'object'
    ? context.currentDisplay.progressReporter
    : null;
  $: currentSparcRequestsProgressSidebar = currentSparcProgressReporter?.placement === 'sidebar';
  $: learningProgressDeliverySettings = sparcTrialDisplayOwnsInteraction(context.currentDisplay)
    && !currentSparcRequestsProgressSidebar
      ? {
          ...deliverySettings,
          disableProgressReport: true,
        }
      : deliverySettings;
  $: learningProgressRuntimeSnapshot = (learningProgressRequestVersion, learningProgressRuntimeController.buildRuntimeSnapshot({
    deliverySettings: learningProgressDeliverySettings,
    engine: context.engine,
    feedbackEnd: context.timestamps?.feedbackEnd || 0,
    refreshSignal: context.h5pResult?.batchId || '',
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
  const cardTextInputController = createCardTextInputController({
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
  const cardTrialEventController = createCardTrialEventController({
    getContext: () => context,
    loadTtsPlayback: async () => {
      const { ttsPlaybackService } = await import('../services/ttsService');
      return ttsPlaybackService;
    },
    send,
  });
  const cardReviewEventController = createCardReviewEventController({
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

  $: cardTextInputController.resetForRuntimeState(state);
  $: cardTextInputController.syncTrialStart(context.timestamps?.trialStart);
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
    cardTrialEventController.handleSubmit(event);
  }

  function handleChoice(event) {
    cardTrialEventController.handleChoice(event);
  }

  function handleH5PResult(event) {
    trialDisplaySubmissionController.handleH5PResult(event.detail || {});
  }

  function handleSparcSubmit(event) {
    trialDisplaySubmissionController.handleSparcSubmit(event.detail || {});
  }

  function handleInput(event) {
    cardTextInputController.handleInput(event.detail);
  }

  function handleInputActivity(event) {
    cardTextInputController.handleInputActivity(event.detail);
  }

  function handleBlockingAssetState(event, slot = 'active') {
    cardBlockingAssetController.handleBlockingAssetState(event.detail, slot);
  }

  function handleFeedbackContent(event) {
    cardReviewEventController.handleFeedbackContent(event.detail);
  }

  function handleReviewRevealStarted(event) {
    cardReviewEventController.handleReviewRevealStarted(event.detail);
  }

  function primeTrialContentFadeStart() {
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
    cardTrialEventController.handleFirstKeypress(event);
  }

  function handleSkipStudy() {
    cardTrialEventController.handleSkipStudy();
  }

  async function handleReplay(event) {
    await cardTrialEventController.handleReplay(event);
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
  const cardVideoEventRuntime = createCardVideoEventRuntime({
    getVideoPlayer: () => videoPlayer,
    machineBridge: videoMachineBridge,
    send,
    sessionBridge: videoSessionBridge,
    sessionRuntime: videoSessionRuntimeController,
    stateMatches: (path) => state.matches(path),
  });

  const cardLaunchEnvironment = createCardLaunchEnvironment({
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
  const startPayload = {
    type: 'START',
    sessionId,
    unitId,
    tdfId,
    engineIndices
  };
  cardMachineRuntimeController = createCardMachineRuntimeController({
    machine: cardMachine,
    createActor: (machine) => createActor(machine),
    setState: (snapshot) => {
      state = snapshot;
    },
    sendStartEvent: send,
    startEvent: startPayload,
    log: clientConsole,
  });
  const cardRuntimeLifecycleController = createCardRuntimeLifecycleController({
    startRuntimeWindowEvents: startRuntimeWindowEventController,
    machineRuntime: cardMachineRuntimeController,
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

  let cardScreenElement;
  const cardScreenLifecycleRuntime = createCardScreenLifecycleRuntime({
    applyTestPerformance: () => {
      performanceData = { ...performanceData, ...testPerformance };
    },
    cleanupAudioRecorder,
    clearDisplayTimeoutClock: displayTimeoutController.stopClock,
    clearLearningProgressViewport: learningProgressRuntimeController.closeViewport,
    clearTimeoutCountdown: timeoutCountdownSyncController.stopInterval,
    completeCleanup,
    launch: runCardLaunchOrchestration,
    launchDeps: {
      initializeCard: initializeSvelteCard,
      waitForCardReadiness: waitForCardReadinessService,
      getReadinessDependencies: cardLaunchEnvironment.getReadinessDependencies,
      buildReadinessDiagnostic: cardLaunchEnvironment.buildReadinessDiagnostic,
      buildInitializeFailureDiagnostic: cardLaunchEnvironment.buildInitializeFailureDiagnostic,
      setFailureDiagnostic: cardLaunchEnvironment.setFailureDiagnostic,
      log: clientConsole,
      routeInitializationFailure: cardLaunchEnvironment.routeInitializationFailure,
      setLaunchLoadingMessage,
      markLaunchLoadingTiming,
      prepareRender: async () => undefined,
      resolveLaunchCompletion: () => resolveSessionSurfaceLaunchCompletion({
        contentSurface: sessionContentSurface,
        isLaunchLoadingActive: isLaunchLoadingActive(),
        showVideoInstructionOverlay,
        videoPlayerReady,
      }),
      waitForBrowserPaint,
      finishLaunchLoading,
    },
    lifecycle: cardRuntimeLifecycleController,
    normalizeTestSnapshot,
    setInitializedForRender: (value) => {
      initializedForRender = value;
    },
    setSessionUnitModeVersion: (updater) => {
      sessionUnitModeVersion = updater(sessionUnitModeVersion);
    },
    setState: (nextState) => {
      state = nextState;
    },
    startDisplayTimeoutClock: displayTimeoutController.startClock,
    stopStimDisplayTypeMapVersionSync,
    testMode: () => testMode,
    testPerformance: () => testPerformance,
    testSnapshot: () => testSnapshot,
    waitForDomUpdate: tick,
  });

  onMount(() => {
    cardScreenLifecycleRuntime.mount();
  });

  // Lifecycle: Cleanup on unmount
  onDestroy(() => {
    cardScreenLifecycleRuntime.unmount();
  });

  // Video player reference
  let videoPlayer;
  let videoCheckpoints = null;
  $: videoRuntimeSnapshot = buildCardVideoRuntimeSnapshot({
    currentState,
    currentTdfUnit,
    getVideoResumeAnchor,
    state,
    videoCheckpoints,
  });
  $: preventScrubbingEnabled = videoRuntimeSnapshot.preventScrubbingEnabled;
  $: rewindOnIncorrectEnabled = videoRuntimeSnapshot.rewindOnIncorrectEnabled;
  $: repeatQuestionsSinceCheckpointEnabled = videoRuntimeSnapshot.repeatQuestionsSinceCheckpointEnabled;
  $: cardVideoEventRuntime.syncPendingResume();
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
  class="card-screen"
  class:video-mode={sessionSurfaceShell.cardScreenClasses.videoMode}
  class:auto-tutor-mode={sessionSurfaceShell.cardScreenClasses.autoTutorMode}
  bind:this={cardScreenElement}
  style={cardFontSizeStyle}
>
  {#if sessionContentSurface.showAutoTutorSession}
    <AutoTutorSession on:complete={() => forceAdvanceToNextUnit('AutoTutor Complete')} />
  {:else if sessionContentSurface.showVideoSession}
    <VideoCardSessionSurface
      bind:videoPlayer={videoPlayer}
      bind:trialContentFadeElement={trialContentFadeElement}
      checkpointGateState={videoRuntimeSnapshot.checkpointGateState}
      continueButtonText={deliverySettings.continueButtonText || 'Continue'}
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
      trialContentProps={trialContentProps}
      trialTimerProps={trialTimerProps}
      videoCanAcceptCheckpoint={videoRuntimeSnapshot.canAcceptCheckpoint}
      videoEndOverlayMounted={videoEndOverlayMounted}
      videoEndOverlayVisible={videoEndOverlayVisible}
      videoPlayerReady={videoPlayerReady}
      on:checkpoint={(event) => cardVideoEventRuntime.handleCheckpoint(event)}
      on:ready={() => cardVideoEventRuntime.handleReady(showVideoInstructionOverlay)}
      on:ended={() => cardVideoEventRuntime.handleEnded()}
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
      on:sparcsubmit={handleSparcSubmit}
      on:sparcaction={handleSparcAction}
      on:instructioncontinue={(event) => cardVideoEventRuntime.handleInstructionContinue(event)}
      on:videocontinue={() => cardVideoEventRuntime.handleContinue()}
    />
  {:else if sessionContentSurface.showStandardCardSession}
    <StandardCardSessionSurface
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
      trialContentProps={trialContentProps}
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
      on:sparcsubmit={handleSparcSubmit}
      on:sparcaction={handleSparcAction}
      on:skipstudy={handleSkipStudy}
      on:learningprogresstoggle={handleLearningProgressPanelToggle}
    />
  {/if}

  {#if hasDisplayTimeout}
    <DisplayTimeoutFooter
      canContinue={displayTimeoutCanContinue}
      continueButtonText={deliverySettings.continueButtonText || 'Continue'}
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
  .card-screen {
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

  .card-screen.video-mode {
    background-color: var(--app-text-color);
  }

  .card-screen.auto-tutor-mode {
    background-color: var(--app-background-color);
  }

  .card-screen.video-mode :global(.video-session-mode) {
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

