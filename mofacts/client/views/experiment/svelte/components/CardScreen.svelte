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
  import { Tracker } from 'meteor/tracker';
  import { Session } from 'meteor/session';
  import { Meteor } from 'meteor/meteor';
  import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
  import DOMPurify from 'dompurify';
  import { currentUserHasRole } from '../../../../lib/roleUtils';
  import { evaluateSrAvailability } from '../../../../lib/audioAvailability';
  import { stopStimDisplayTypeMapVersionSync } from '../../../../lib/stimDisplayTypeMapSync';
  import { DeliveryParamsStore } from '../../../../lib/state/deliveryParamsStore';
  import { UiSettingsStore } from '../../../../lib/state/uiSettingsStore';
  import { clientConsole } from '../../../../lib/clientLogger';
  import { Answers } from '../../answerAssess';
  import { cardMachine } from '../machine/cardMachine';
  import { DEFAULT_UI_SETTINGS, EVENTS } from '../machine/constants';
  import { initializeSvelteCard } from '../services/svelteInit';
  import { createExperimentState } from '../services/experimentState';
  import { waitForBrowserPaint } from '../utils/paintTiming';
  import { deriveSrStatus } from '../utils/srStatus';
  import { getMainTimeoutMs, getFeedbackTimeoutMs } from '../utils/timeoutUtils';
  import { recordCurrentInstructionContinue } from '../../instructions';
  import PerformanceArea from './PerformanceArea.svelte';
  import TrialContent from './TrialContent.svelte';
  import VideoSessionMode from './VideoSessionMode.svelte';

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

  function createMachineActor(machine) {
    return createActor(machine);
  }

  function getInitialState() {
    return {
      value: 'idle',
      context: {},
      matches: (state) => state === 'idle',
    };
  }

  function getActorSnapshot(actorInstance) {
    if (!actorInstance) {
      return getInitialState();
    }
    try {
      return actorInstance.getSnapshot();
    } catch (err) {
      clientConsole(1, '[CardScreen] Failed to read actor snapshot, using initial state', err);
    }
    return getInitialState();
  }

  function sanitizeInstructionHtml(dirty) {
    if (!dirty) return '';
    return DOMPurify.sanitize(String(dirty), {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'span', 'div',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'tr', 'td', 'th',
        'thead', 'tbody', 'ul', 'ol', 'li', 'center', 'a', 'img', 'audio',
        'source'],
      ALLOWED_ATTR: ['style', 'class', 'id', 'border', 'href', 'src', 'alt',
        'width', 'height', 'controls', 'preload', 'data-audio-id'],
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    });
  }

  function subscribeToActor(actorInstance, handler) {
    if (!actorInstance || typeof handler !== 'function') {
      return null;
    }
    return actorInstance.subscribe(handler);
  }

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

  function normalizeVideoBoolean(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
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

  function cloneAttribution(attribution) {
    if (!attribution || typeof attribution !== 'object') {
      return undefined;
    }

    const cloned = {
      creatorName: attribution.creatorName || '',
      sourceName: attribution.sourceName || '',
      sourceUrl: attribution.sourceUrl || '',
      licenseName: attribution.licenseName || '',
      licenseUrl: attribution.licenseUrl || '',
    };

    return Object.values(cloned).some(Boolean) ? cloned : undefined;
  }

  function cloneDisplay(display) {
    const cloned = {
      text: display?.text || '',
      clozeText: display?.clozeText || '',
      imgSrc: display?.imgSrc || '',
      videoSrc: display?.videoSrc || '',
      audioSrc: display?.audioSrc || '',
    };

    const attribution = cloneAttribution(display?.attribution);
    if (attribution) {
      cloned.attribution = attribution;
    }

    return cloned;
  }

  function buildTrialSubset(args) {
    const kind = args.kind || 'none';
    return {
      kind,
      display: cloneDisplay(args.display),
      displayVisible: Boolean(args.displayVisible),
      feedbackVisible: Boolean(args.feedbackVisible),
      responseVisible: Boolean(args.responseVisible),
      isForceCorrecting: Boolean(args.isForceCorrecting),
      showQuestionNumber: Boolean(args.showQuestionNumber),
      questionNumber: Number.isFinite(Number(args.questionNumber)) ? Number(args.questionNumber) : 0,
      replayEnabled: Boolean(args.replayEnabled),
      showOverlay: kind !== 'none',
      showSkipStudyButton: Boolean(args.showSkipStudyButton) && kind === 'study',
    };
  }

  function buildTrialSlotProps(trialLike, slotState = {}) {
    const trial = trialLike || {};
    const subset = buildTrialSubset({
      kind: slotState.kind || 'none',
      display: trial.currentDisplay,
      displayVisible: slotState.displayVisible,
      feedbackVisible: slotState.feedbackVisible,
      responseVisible: slotState.responseVisible,
      isForceCorrecting: slotState.isForceCorrecting,
      showQuestionNumber: slotState.showQuestionNumber,
      questionNumber: slotState.questionNumber,
      replayEnabled: slotState.replayEnabled,
      showSkipStudyButton: slotState.showSkipStudyButton,
    });
    const buttonList = Array.isArray(trial.buttonList) ? trial.buttonList : [];
    const correctAnswer = String(trial.currentAnswer || '');
    const feedbackIsCorrect = Boolean(slotState.isCorrect);
    const correctAnswerImageSrc = getCorrectAnswerImageSrc(buttonList, correctAnswer);

    return {
      subset,
      correctAnswerImageSrc,
      expectedStimulusBlockerSrc: subset.displayVisible ? String(subset.display?.imgSrc || '') : '',
      expectedFeedbackBlockerSrc: subset.feedbackVisible && !feedbackIsCorrect ? String(correctAnswerImageSrc || '') : '',
      props: {
        layoutMode,
        subsetKind: subset.kind,
        displayVisible: subset.displayVisible,
        display: subset.display,
        isForceCorrecting: subset.isForceCorrecting,
        showQuestionNumber: subset.showQuestionNumber,
        questionNumber: subset.questionNumber,
        inputMode: slotState.inputMode || inputMode,
        inputEnabled: Boolean(slotState.inputEnabled),
        responseVisible: subset.responseVisible,
        userAnswer: slotState.userAnswer || '',
        feedbackUserAnswer: slotState.feedbackUserAnswer || '',
        showSubmitButton: uiSettings.displaySubmitButton,
        inputPlaceholder: uiSettings.inputPlaceholderText,
        showButtons: true,
        buttonList,
        buttonColumns: uiSettings.choiceButtonCols,
        displayConfirmButton: uiSettings.displayConfirmButton,
        confirmEnabled: Boolean(slotState.confirmEnabled),
        selectedChoiceIndex: slotState.selectedChoiceIndex ?? null,
        srStatus: slotState.srStatus || 'idle',
        srAttempt: Number.isFinite(slotState.srAttempt) ? slotState.srAttempt : 0,
        srMaxAttempts: Number.isFinite(slotState.srMaxAttempts) ? slotState.srMaxAttempts : 0,
        srError: '',
        srTranscript: '',
        feedbackVisible: subset.feedbackVisible,
        isCorrect: feedbackIsCorrect,
        isTimeout: Boolean(slotState.isTimeout),
        correctAnswer,
        correctAnswerImageSrc,
        correctMessage: uiSettings.correctMessage,
        incorrectMessage: uiSettings.incorrectMessage,
        feedbackMessage: slotState.feedbackMessage || '',
        forceCorrectPrompt: deliveryParams.forcecorrectprompt || 'Please type the correct answer to continue',
        correctColor: slotState.correctColor || uiSettings.correctColor,
        incorrectColor: uiSettings.incorrectColor,
        displayCorrectFeedback: Boolean(slotState.displayCorrectFeedback),
        displayIncorrectFeedback: Boolean(slotState.displayIncorrectFeedback),
        displayUserAnswerInFeedback: uiSettings.displayUserAnswerInFeedback,
        displayUserAnswerInCorrectFeedback: uiSettings.displayUserAnswerInCorrectFeedback,
        displayUserAnswerInIncorrectFeedback: uiSettings.displayUserAnswerInIncorrectFeedback,
        singleLineFeedback: uiSettings.singleLineFeedback,
        onlyShowSimpleFeedback: Boolean(slotState.onlyShowSimpleFeedback),
        replayEnabled: subset.replayEnabled,
      },
    };
  }

  function matchesStatePath(snapshot, value) {
    if (!snapshot || typeof snapshot.matches !== 'function') {
      return false;
    }
    return snapshot.matches(value);
  }

  function getRewindCheckpointTimes(checkpoints) {
    const source = Array.isArray(checkpoints?.rewindCheckpoints)
      ? checkpoints.rewindCheckpoints
      : checkpoints?.times;

    if (!Array.isArray(source)) {
      throw new Error('[CardScreen] Video checkpoints missing rewind times');
    }

    return source
      .map((time, index) => {
        const parsed = Number(time);
        if (!Number.isFinite(parsed)) {
          throw new Error(`[CardScreen] Video rewind checkpoint time at index ${index} is invalid`);
        }
        return parsed;
      })
      .sort((a, b) => a - b);
  }

  function getCheckpointResetIndex(questionTimes, rewindTime) {
    if (!Array.isArray(questionTimes)) {
      throw new Error('[CardScreen] Video checkpoints missing question times');
    }
    const normalizedTimes = questionTimes.map((time, index) => {
      const parsed = Number(time);
      if (!Number.isFinite(parsed)) {
        throw new Error(`[CardScreen] Video question time at index ${index} is invalid`);
      }
      return parsed;
    });
    const nextCheckpointIndex = normalizedTimes.findIndex((time) => time >= (rewindTime - 0.001));
    return nextCheckpointIndex >= 0 ? nextCheckpointIndex : normalizedTimes.length;
  }

  // Initialize XState machine using a local actor to avoid version mismatches
  let actor = null;
  let state = getInitialState();
  let videoInstructionDismissed = false;
  let videoInstructionStartBlocked = false;
  let videoInstructionsShownAt = 0;
  let videoPlayerReady = false;
  const send = (event) => {
    if (testMode) {
      clientConsole(2, '[CardScreen] Ignoring event in test mode:', event?.type || event);
      return;
    }
    if (actor && typeof actor.send === 'function') {
      actor.send(event);
    }
  };

  $: if (testMode) {
    state = normalizeTestSnapshot(testSnapshot);
  }

  // Reactive state selectors
  $: context = state.context;
  $: currentState = state.value;
  $: preparedTrial = context.preparedTrial || null;
  $: uiSettings = { ...DEFAULT_UI_SETTINGS, ...(context.uiSettings || {}) };
  $: deliveryParams = context.deliveryParams || {};
  $: audioState = context.audio || { waitingForTranscription: false, srAttempts: 0, maxSrAttempts: 0 };
  $: isVideoSession = uiSettings.isVideoSession === true ||
    Session.get('isVideoSession') === true ||
    !!Session.get('currentTdfUnit')?.videosession;
  $: currentTdfUnit = Session.get('currentTdfUnit') || {};
  $: rawVideoInstructionText = typeof currentTdfUnit?.unitinstructions === 'string'
    ? currentTdfUnit.unitinstructions.trim()
    : '';
  $: sanitizedVideoInstructionText = sanitizeInstructionHtml(rawVideoInstructionText);
  $: videoInstructionsSeen = Session.get('curUnitInstructionsSeen') === true || videoInstructionDismissed;
  $: showVideoInstructionOverlay = isVideoSession &&
    !!rawVideoInstructionText &&
    !videoInstructionsSeen;
  $: if (showVideoInstructionOverlay && !videoInstructionsShownAt) {
    videoInstructionsShownAt = Date.now();
    Session.set('instructionClientStart', videoInstructionsShownAt);
  }
  $: layoutMode = uiSettings.stimuliPosition;
  $: fontSizePx = parsePositiveNumber(deliveryParams?.fontsize) ?? 24;
  $: cardFontSizeStyle = `--card-font-size: ${fontSizePx}px;`;

  // Timeout bar visibility - controlled by displayTimeoutBar boolean
  $: showTimeoutBar = uiSettings.displayTimeoutBar;

  // Audio & SR settings
  let user = null;
  $: srAvailability = evaluateSrAvailability({
    user,
    tdfFile: Session.get('currentTdfFile'),
    sessionSpeechApiKey: Session.get('speechAPIKey'),
    requireTextTrial: true,
    isTextTrial: !context.buttonTrial,
  });
  $: isSrEnabled = srAvailability.status === 'available';
  $: isSrReady = isSrEnabled && matchesStatePath(state, {
    presenting: {
      awaiting: {
        speechRecognition: {
          active: 'ready'
        }
      }
    }
  });
  $: isSrProcessing = isSrEnabled && matchesStatePath(state, {
    presenting: {
      awaiting: {
        speechRecognition: {
          active: 'processing'
        }
      }
    }
  });
  $: inputMode = !context.buttonTrial ? (isSrEnabled ? 'sr' : 'text') : 'buttons';
  $: isSrRecording = isSrEnabled && matchesStatePath(state, {
    presenting: {
      awaiting: {
        speechRecognition: {
          active: 'recording'
        }
      }
    }
  });
  $: isVoiceValidating = isSrEnabled &&
    state.matches('presenting.validating') &&
    context.source === 'voice';
  $: srStatus = deriveSrStatus({
    isSrEnabled,
    isReady: isSrReady,
    isRecording: isSrRecording,
    isProcessing: isSrProcessing,
    isVoiceValidating,
  });
  $: if (typeof window !== 'undefined' && inputMode !== undefined) {
    void syncScreenWakeLock('reactive update');
  }

  let frozenDisplayVisible = false;
  let frozenFeedbackVisible = false;
  let frozenIsForceCorrecting = false;
  let frozenResponseVisible = false;
  let frozenTrialSubsetKind = 'none';
  let trialSubsetVisible = false;
  let stagedTrialSubsetKey = 'none';
  let revealSequence = 0;
  let queuedRevealKey = '';
  let queuedRevealSequence = 0;
  let stagedStimulusBlockerSrc = '';
  let stagedFeedbackBlockerSrc = '';
  let trialContentFadeElement;
  let lastFadeLogContext = {
    key: 'none',
    subsetKind: 'none',
    visibleSetAt: 0,
    configuredDurationMs: 0,
  };
  let stimulusBlockingAssetReady = true;
  let feedbackBlockingAssetReady = true;
  let incomingStimulusBlockingAssetReady = true;
  let incomingFeedbackBlockingAssetReady = true;
  let activeSlotMounted = false;
  let activeSlotVisible = false;
  let incomingSlotMounted = false;
  let incomingSlotSequence = 0;
  let lastIncomingSlotKey = 'none';
  let incomingReadySent = false;
  let transitionCompleteSent = false;
  let preservePreparedHandoffOnNextReveal = false;
  let preparedHandoffStimulusReady = false;
  let preparedHandoffFeedbackReady = false;
  let videoEndOverlayMounted = false;
  let videoEndOverlayVisible = false;
  let videoEndOverlaySequence = 0;
  let frozenDisplay = cloneDisplay({});

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
  $: baseTrialSubsetKind = baseIsForceCorrecting
    ? 'forceCorrect'
    : (isStudyState
      ? 'study'
      : (isFeedbackState
        ? 'feedback'
        : (isQuestionState
          ? (isPrestimulusState ? 'prestimulus' : 'question')
          : 'none')));
  $: baseDisplayVisible = baseTrialSubsetKind !== 'none';
  $: baseFeedbackVisible = baseTrialSubsetKind === 'feedback' || baseTrialSubsetKind === 'study';
  $: baseResponseVisible = baseTrialSubsetKind === 'question' || baseTrialSubsetKind === 'forceCorrect';
  let studyInteractionText = '';
  $: showSkipStudyButton = isStudyState && toBoolean(deliveryParams.skipstudy);
  $: feedbackIsCorrect = isStudyState ? true : context.isCorrect;
  $: feedbackCorrectColor = isStudyState ? 'var(--text-color)' : uiSettings.correctColor;
  $: studyAnswerText = isStudyState
    ? Answers.getDisplayAnswerText(String(context.originalAnswer || context.currentAnswer || '')) || String(context.currentAnswer || '')
    : '';
  $: feedbackText = isStudyState ? (studyInteractionText || studyAnswerText) : context.feedbackMessage;
  $: if (!isStudyState && studyInteractionText) {
    studyInteractionText = '';
  }
  $: onlyShowSimpleFeedback = isStudyState ? false : uiSettings.onlyShowSimpleFeedback;
  $: displayCorrectFeedback = isStudyState ? true : uiSettings.displayCorrectFeedback;
  $: displayIncorrectFeedback = isStudyState ? false : uiSettings.displayIncorrectFeedback;
  $: inputEnabled = state.matches('presenting.awaiting') || state.matches('feedback.forceCorrecting');
  $: isOutgoingFreezeState = state.matches('transition.logging') ||
    state.matches('transition.updatingState') ||
    state.matches('transition.trackingPerformance') ||
    state.matches('transition.maybePrepareIncoming') ||
    state.matches('transition.prepareIncoming') ||
    state.matches('transition.seamlessAdvance') ||
    state.matches('transition.fallbackAdvance') ||
    state.matches('transition.fadingOut');
  $: isPreparedAdvanceWaitState =
    state.matches('study') ||
    state.matches('feedback') ||
    state.matches('transition.seamlessAdvance') ||
    state.matches('transition.fallbackAdvance');
  $: isFadingOut = state.matches('transition.fadingOut');
  $: isPreparedFadingOut = isFadingOut && Boolean(preparedTrial);

  $: if (!isOutgoingFreezeState) {
    frozenTrialSubsetKind = baseTrialSubsetKind;
    frozenDisplayVisible = baseDisplayVisible;
    frozenFeedbackVisible = baseFeedbackVisible;
    frozenIsForceCorrecting = baseIsForceCorrecting;
    frozenResponseVisible = baseResponseVisible;
    frozenDisplay = cloneDisplay(context.currentDisplay);
  }

  $: trialSubsetKind = isOutgoingFreezeState ? frozenTrialSubsetKind : baseTrialSubsetKind;
  $: displayVisible = isOutgoingFreezeState ? frozenDisplayVisible : baseDisplayVisible;
  $: feedbackVisible = isOutgoingFreezeState ? frozenFeedbackVisible : baseFeedbackVisible;
  $: isForceCorrecting = isOutgoingFreezeState ? frozenIsForceCorrecting : baseIsForceCorrecting;
  $: responseVisible = isOutgoingFreezeState ? frozenResponseVisible : baseResponseVisible;
  $: trialSubset = buildTrialSubset({
    kind: trialSubsetKind,
    display: isOutgoingFreezeState ? frozenDisplay : context.currentDisplay,
    displayVisible,
    feedbackVisible,
    responseVisible,
    isForceCorrecting,
    showQuestionNumber: uiSettings.displayQuestionNumber,
    questionNumber: performanceData?.currentTrial || 0,
    replayEnabled: !feedbackVisible,
    showSkipStudyButton,
  });
  $: expectedStimulusBlockerSrc = trialSubset.displayVisible ? String(trialSubset.display?.imgSrc || '') : '';
  $: expectedFeedbackBlockerSrc = trialSubset.feedbackVisible && !feedbackIsCorrect ? String(correctAnswerImageSrc || '') : '';
  $: trialSubsetKey = trialSubset.showOverlay
    ? [
        context.timestamps?.trialStart || 0,
        isVideoSession ? context.videoSession?.currentCheckpointIndex ?? '' : '',
        isVideoSession ? context.engineIndices?.clusterIndex ?? '' : '',
        isVideoSession ? context.questionIndex ?? '' : '',
        trialSubset.display?.text || '',
        trialSubset.display?.clozeText || '',
        trialSubset.display?.imgSrc || '',
        trialSubset.display?.videoSrc || '',
        trialSubset.display?.audioSrc || '',
        trialSubset.display?.attribution?.creatorName || '',
        trialSubset.display?.attribution?.sourceName || '',
        trialSubset.display?.attribution?.sourceUrl || '',
        trialSubset.display?.attribution?.licenseName || '',
        trialSubset.display?.attribution?.licenseUrl || '',
      ].join('::')
    : 'none';
  $: allBlockingAssetsReady = (!expectedStimulusBlockerSrc || stimulusBlockingAssetReady) &&
    (!expectedFeedbackBlockerSrc || feedbackBlockingAssetReady);
  $: if (isOutgoingFreezeState) {
    activeSlotMounted = true;
    activeSlotVisible = true;
  }
  $: if (!isOutgoingFreezeState && !trialSubset.showOverlay) {
    activeSlotMounted = false;
    activeSlotVisible = false;
  }
  $: trialContentMounted = activeSlotMounted;
  $: trialContentVisible = activeSlotVisible;
  $: cardVisualReady = trialContentMounted || state.matches('videoWaiting') || videoEnded;
  $: trialContentProps = {
    layoutMode,
    subsetKind: trialSubset.kind,
    displayVisible: trialSubset.displayVisible,
    display: trialSubset.display,
    isForceCorrecting: trialSubset.isForceCorrecting,
    showQuestionNumber: trialSubset.showQuestionNumber,
    questionNumber: trialSubset.questionNumber,
    inputMode,
    inputEnabled,
    responseVisible: trialSubset.responseVisible,
    userAnswer: textAnswer,
    feedbackUserAnswer: context.userAnswer,
    showSubmitButton: uiSettings.displaySubmitButton,
    inputPlaceholder: uiSettings.inputPlaceholderText,
    showButtons: true,
    buttonList: context.buttonList,
    buttonColumns: uiSettings.choiceButtonCols,
    displayConfirmButton: uiSettings.displayConfirmButton,
    confirmEnabled,
    selectedChoiceIndex,
    srStatus,
    srAttempt: audioState.srAttempts,
    srMaxAttempts: audioState.maxSrAttempts,
    srError: '',
    srTranscript: '',
    feedbackVisible: trialSubset.feedbackVisible,
    isCorrect: feedbackIsCorrect,
    isTimeout: context.isTimeout,
    correctAnswer: context.currentAnswer,
    correctAnswerImageSrc,
    correctMessage: uiSettings.correctMessage,
    incorrectMessage: uiSettings.incorrectMessage,
    feedbackMessage: feedbackText,
    forceCorrectPrompt: deliveryParams.forcecorrectprompt || 'Please type the correct answer to continue',
    correctColor: feedbackCorrectColor,
    incorrectColor: uiSettings.incorrectColor,
    displayCorrectFeedback,
    displayIncorrectFeedback,
    displayUserAnswerInFeedback: uiSettings.displayUserAnswerInFeedback,
    displayUserAnswerInCorrectFeedback: uiSettings.displayUserAnswerInCorrectFeedback,
    displayUserAnswerInIncorrectFeedback: uiSettings.displayUserAnswerInIncorrectFeedback,
    singleLineFeedback: uiSettings.singleLineFeedback,
    onlyShowSimpleFeedback,
    replayEnabled: trialSubset.replayEnabled,
  };
  $: videoEnded = state.matches('videoEnded');
  $: if (videoEnded) {
    videoEndOverlayMounted = true;
    videoEndOverlayVisible = false;
    videoEndOverlaySequence += 1;
    queueVideoEndOverlayReveal(videoEndOverlaySequence);
  } else {
    videoEndOverlayMounted = false;
    videoEndOverlayVisible = false;
  }

  $: if (!isOutgoingFreezeState && trialSubsetKey !== stagedTrialSubsetKey) {
    const nextStimulusBlockerSrc = expectedStimulusBlockerSrc;
    const nextFeedbackBlockerSrc = expectedFeedbackBlockerSrc;
    const preservePreparedHandoff = preservePreparedHandoffOnNextReveal;
    const preserveStimulusReady = Boolean(nextStimulusBlockerSrc) &&
      nextStimulusBlockerSrc === stagedStimulusBlockerSrc &&
      stimulusBlockingAssetReady;
    const preserveFeedbackReady = Boolean(nextFeedbackBlockerSrc) &&
      nextFeedbackBlockerSrc === stagedFeedbackBlockerSrc &&
      feedbackBlockingAssetReady;

    clientConsole(2, '[CardScreen][Reveal] stage-reset', {
      trialSubsetKind,
      trialSubsetKey,
      stagedTrialSubsetKey,
      isFadingOut,
      preservePreparedHandoff,
      preserveStimulusReady,
      preserveFeedbackReady,
    });
    stagedTrialSubsetKey = trialSubsetKey;
    stagedStimulusBlockerSrc = nextStimulusBlockerSrc;
    stagedFeedbackBlockerSrc = nextFeedbackBlockerSrc;
    revealSequence += 1;
    queuedRevealKey = '';
    queuedRevealSequence = 0;
    trialSubsetVisible = preservePreparedHandoff;
    activeSlotMounted = trialSubset.showOverlay || preservePreparedHandoff;
    activeSlotVisible = preservePreparedHandoff;
    stimulusBlockingAssetReady = preservePreparedHandoff
      ? (!nextStimulusBlockerSrc || preparedHandoffStimulusReady)
      : (!nextStimulusBlockerSrc || preserveStimulusReady);
    feedbackBlockingAssetReady = preservePreparedHandoff
      ? (!nextFeedbackBlockerSrc || preparedHandoffFeedbackReady)
      : (!nextFeedbackBlockerSrc || preserveFeedbackReady);
    if (preservePreparedHandoff) {
      const preparedRevealKey = trialSubsetKey;
      const preparedRevealSequence = revealSequence;
      preservePreparedHandoffOnNextReveal = false;
      preparedHandoffStimulusReady = false;
      preparedHandoffFeedbackReady = false;
      void (async () => {
        await tick();
        await waitForBrowserPaint();
        if (
          testMode ||
          preparedRevealSequence !== revealSequence ||
          preparedRevealKey !== stagedTrialSubsetKey ||
          isFadingOut
        ) {
          clientConsole(2, '[CardScreen][Reveal] prepared handoff reveal skipped', {
            testMode,
            preparedRevealSequence,
            revealSequence,
            preparedRevealKey,
            stagedTrialSubsetKey,
            isFadingOut,
            subsetKind: trialSubset.kind,
          });
          return;
        }
        clientConsole(2, '[CardScreen][Reveal] prepared handoff reveal started', {
          preparedRevealKey,
          subsetKind: trialSubset.kind,
        });
        send({
          type: EVENTS.TRIAL_REVEAL_STARTED,
          timestamp: Date.now(),
          subsetKind: trialSubset.kind,
        });
      })();
    }
  }

  $: if (!isOutgoingFreezeState && activeSlotMounted && !trialSubsetVisible && allBlockingAssetsReady) {
    queueTrialSubsetReveal(stagedTrialSubsetKey, revealSequence);
  }

  $: incomingPreparedSubsetKind = preparedTrial
    ? (String(preparedTrial.testType || '').trim().toLowerCase() === 's' ? 'study' : 'question')
    : 'none';
  $: incomingSlot = preparedTrial
    ? buildTrialSlotProps(preparedTrial, {
        kind: incomingPreparedSubsetKind,
        displayVisible: incomingPreparedSubsetKind !== 'none',
        feedbackVisible: incomingPreparedSubsetKind === 'study',
        responseVisible: incomingPreparedSubsetKind === 'question',
        isForceCorrecting: false,
        showQuestionNumber: uiSettings.displayQuestionNumber,
        questionNumber: (performanceData?.currentTrial || 0) + 1,
        replayEnabled: incomingPreparedSubsetKind === 'question',
        showSkipStudyButton: incomingPreparedSubsetKind === 'study' && toBoolean(deliveryParams.skipstudy),
        inputEnabled: false,
        userAnswer: '',
        feedbackUserAnswer: '',
        srStatus: 'idle',
        srAttempt: 0,
        srMaxAttempts: 0,
        isCorrect: incomingPreparedSubsetKind === 'study',
        isTimeout: false,
        feedbackMessage: '',
        correctColor: incomingPreparedSubsetKind === 'study' ? 'var(--text-color)' : uiSettings.correctColor,
        displayCorrectFeedback: incomingPreparedSubsetKind === 'study' ? true : uiSettings.displayCorrectFeedback,
        displayIncorrectFeedback: incomingPreparedSubsetKind === 'study' ? false : uiSettings.displayIncorrectFeedback,
        onlyShowSimpleFeedback: incomingPreparedSubsetKind === 'study' ? false : uiSettings.onlyShowSimpleFeedback,
      })
    : null;
  $: incomingExpectedStimulusBlockerSrc = incomingSlot?.expectedStimulusBlockerSrc || '';
  $: incomingExpectedFeedbackBlockerSrc = incomingSlot?.expectedFeedbackBlockerSrc || '';
  $: incomingAllBlockingAssetsReady = (!incomingExpectedStimulusBlockerSrc || incomingStimulusBlockingAssetReady) &&
    (!incomingExpectedFeedbackBlockerSrc || incomingFeedbackBlockingAssetReady);
  $: incomingSlotKey = incomingSlot?.subset?.showOverlay
    ? [
        preparedTrial?.questionIndex || 0,
        incomingSlot.props.display?.text || '',
        incomingSlot.props.display?.clozeText || '',
        incomingSlot.props.display?.imgSrc || '',
        incomingSlot.props.display?.videoSrc || '',
        incomingSlot.props.display?.audioSrc || '',
      ].join('::')
    : 'none';
  $: if (incomingSlotKey !== lastIncomingSlotKey) {
    lastIncomingSlotKey = incomingSlotKey;
    incomingSlotMounted = false;
    incomingReadySent = false;
    transitionCompleteSent = false;
    incomingStimulusBlockingAssetReady = !incomingExpectedStimulusBlockerSrc;
    incomingFeedbackBlockingAssetReady = !incomingExpectedFeedbackBlockerSrc;

    if (incomingSlotKey !== 'none') {
      incomingSlotSequence += 1;
      const sequence = incomingSlotSequence;
      void (async () => {
        await tick();
        await waitForBrowserPaint();
        if (sequence !== incomingSlotSequence || incomingSlotKey === 'none') {
          return;
        }
        incomingSlotMounted = true;
      })();
    }
  }
  $: if (!preparedTrial) {
    incomingSlotMounted = false;
    incomingReadySent = false;
    transitionCompleteSent = false;
  }
  $: if (
    !testMode &&
    isPreparedAdvanceWaitState &&
    preparedTrial &&
    incomingSlotMounted &&
    incomingAllBlockingAssetsReady &&
    !incomingReadySent
  ) {
    incomingReadySent = true;
    send({ type: 'INCOMING_READY' });
  }

  // Keep the global loading overlay in place until the card has visible content.
  $: if (Session.get('appLoading') && cardVisualReady) {
    Session.set('appLoading', false);
  }

  $: displayMinSeconds = getDisplayTimeoutValue(
    deliveryParams.displayMinSeconds ??
      deliveryParams.displayminseconds ??
      deliveryParams.displayMinSecs ??
      deliveryParams.displayminsecs ??
      deliveryParams.minSecs ??
      0
  );
  $: displayMaxSeconds = getDisplayTimeoutValue(
    deliveryParams.displayMaxSeconds ??
      deliveryParams.displaymaxseconds ??
      deliveryParams.displayMaxSecs ??
      deliveryParams.displaymaxsecs ??
      deliveryParams.maxSecs ??
      0
  );
  $: hasDisplayTimeout = displayMinSeconds > 0 || displayMaxSeconds > 0;
  $: footerMessage = buildDisplayTimeoutMessage(displayMinSeconds, displayMaxSeconds);

  $: correctAnswerImageSrc = getCorrectAnswerImageSrc(context.buttonList, context.currentAnswer);

  let performanceData = buildPerformanceData();

  // Timeout tracking
  $: timeoutMode = testMode && testTimeout?.mode ? testTimeout.mode : getTimeoutMode(state);
  let timeoutProgress = 0;
  let remainingTime = 0;
  let timeoutInterval;
  let timeoutStart = null;
  let timeoutDuration = 0;
  let lastTimeoutResetCounter = 0;
  let selectedChoice = null;
  let selectedChoiceIndex = null;
  let textAnswer = '';
  let lastInputTrialStart = null;

  $: {
    if (state.matches('presenting.loading') || state.matches('transition.clearing')) {
      selectedChoice = null;
      selectedChoiceIndex = null;
      textAnswer = '';
    }
    if (!context.buttonTrial) {
      selectedChoice = null;
      selectedChoiceIndex = null;
    }
  }

  $: {
    const currentTrialStart = context.timestamps?.trialStart ?? null;
    if (currentTrialStart !== lastInputTrialStart) {
      lastInputTrialStart = currentTrialStart;
      selectedChoice = null;
      selectedChoiceIndex = null;
      textAnswer = '';
      context.userAnswer = '';
    }
  }

  $: confirmEnabled = uiSettings.displayConfirmButton === true &&
    (context.buttonTrial ? !!selectedChoice : textAnswer.trim().length > 0);
  let timeoutModeState = 'none';

  function getTimeoutMode(currentState) {
    if (currentState.matches('presenting.awaiting')) return 'question';
    if (currentState.matches('presenting.readyPrompt')) return 'feedback';
    if (currentState.matches('feedback.waiting') || currentState.matches('study.waiting')) return 'feedback';
    return 'none';
  }

  function getDisplayTimeoutValue(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function buildDisplayTimeoutMessage(minSecs, maxSecs) {
    if (minSecs > 0 && maxSecs > 0) {
      return `You can continue in ${minSecs}s or wait up to ${maxSecs}s`;
    }
    if (minSecs > 0) {
      return `You can continue in ${minSecs}s`;
    }
    if (maxSecs > 0) {
      return `Time remaining: ${maxSecs}s`;
    }
    return '';
  }

  function clearTimeoutInterval() {
    if (timeoutInterval) {
      clearInterval(timeoutInterval);
      timeoutInterval = null;
    }
  }

  function updateTimeoutCountdown() {
    if (!timeoutStart || !timeoutDuration) {
      timeoutProgress = 0;
      remainingTime = 0;
      return;
    }

    const elapsed = Date.now() - timeoutStart;
    const remaining = Math.max(0, timeoutDuration - elapsed);
    timeoutProgress = Math.min(100, (elapsed / timeoutDuration) * 100);
    remainingTime = Math.ceil(remaining / 1000);

    if (remaining <= 0) {
      clearTimeoutInterval();
    }
  }

  function startTimeoutCountdown(duration, mode) {
    if (!duration || duration <= 0) {
      timeoutProgress = 0;
      remainingTime = 0;
      timeoutModeState = 'none';
      clearTimeoutInterval();
      return;
    }

    timeoutStart = Date.now();
    timeoutDuration = duration;
    timeoutModeState = mode;
    updateTimeoutCountdown();
    clearTimeoutInterval();
    timeoutInterval = setInterval(updateTimeoutCountdown, 100);
  }

  // Event handlers
  function handleSubmit(event) {
    send({
      type: 'SUBMIT',
      userAnswer: event.detail.answer,
      timestamp: event.detail.timestamp,
      source: 'keypress'
    });
  }

  function handleChoice(event) {
    const isConfirmMode = uiSettings.displayConfirmButton === true;
    if (isConfirmMode) {
      selectedChoice = event.detail;
      selectedChoiceIndex = event.detail?.index ?? null;
      return;
    }

    if (!event.detail?.selectionOnly) {
      send({
        type: 'SUBMIT',
        userAnswer: event.detail.answer,
        timestamp: event.detail.timestamp,
        source: 'buttonClick'
      });
    }
  }

  function handleInput(event) {
    // Update context with current input (for SR)
    textAnswer = event.detail.value;
    context.userAnswer = event.detail.value;
  }

  function handleInputActivity(event) {
    if (!state.matches('presenting.awaiting')) {
      return;
    }
    send({
      type: 'INPUT_ACTIVITY',
      timestamp: event.detail?.timestamp || Date.now()
    });
  }

  function handleConfirm(event) {
    const isConfirmMode = uiSettings.displayConfirmButton === true;
    if (!isConfirmMode) {
      clientConsole(1, '[CardScreen] Confirm requested but displayConfirmButton is false');
      return;
    }

    if (context.buttonTrial) {
      if (!selectedChoice) {
        clientConsole(1, '[CardScreen] Confirm requested without a selected choice');
        return;
      }
      send({
        type: 'SUBMIT',
        userAnswer: selectedChoice.answer,
        timestamp: event.detail?.timestamp || Date.now(),
        source: 'confirmButton'
      });
      return;
    }

    const answer = textAnswer.trim();
    if (!answer) {
      clientConsole(1, '[CardScreen] Confirm requested without text input');
      return;
    }
    send({
      type: 'SUBMIT',
      userAnswer: answer,
      timestamp: event.detail?.timestamp || Date.now(),
      source: 'confirmButton'
    });
  }

  function handleBlockingAssetState(event, slot = 'active') {
    const detail = event.detail || {};
    const owner = detail.owner;
    const blocking = detail.blocking === true;
    const ready = detail.ready !== false;
    const src = String(detail.src || '');
    const expectedStimulusSrc = slot === 'incoming'
      ? incomingExpectedStimulusBlockerSrc
      : expectedStimulusBlockerSrc;
    const expectedFeedbackSrc = slot === 'incoming'
      ? incomingExpectedFeedbackBlockerSrc
      : expectedFeedbackBlockerSrc;

    if (owner === 'stimulus') {
      if (blocking && src !== expectedStimulusSrc) {
        return;
      }
      if (!blocking && expectedStimulusSrc) {
        return;
      }
      if (slot === 'incoming') {
        incomingStimulusBlockingAssetReady = ready;
      } else {
        stimulusBlockingAssetReady = ready;
      }
      return;
    }

    if (owner === 'feedback') {
      if (blocking && src !== expectedFeedbackSrc) {
        return;
      }
      if (!blocking && expectedFeedbackSrc) {
        return;
      }
      if (slot === 'incoming') {
        incomingFeedbackBlockingAssetReady = ready;
      } else {
        feedbackBlockingAssetReady = ready;
      }
    }
  }

  function handleReviewRevealStarted(event) {
    if (testMode) {
      return;
    }

    const subsetKind = event.detail?.subsetKind || trialSubset.kind;
    const timestamp = event.detail?.timestamp || Date.now();
    const transitionDurationMs = event.detail?.transitionDurationMs ?? null;

    if (state.matches('study.preparing')) {
      clientConsole(2, '[CardScreen][StudyReveal] started', {
        subsetKind,
        transitionDurationMs,
      });

      send({
        type: EVENTS.TRIAL_REVEAL_STARTED,
        timestamp,
        subsetKind,
      });
      return;
    }

    if (!state.matches('feedback.preparing')) {
      return;
    }

    clientConsole(2, '[CardScreen][ReviewReveal] started', {
      subsetKind,
      transitionDurationMs,
    });

    send({
      type: 'REVIEW_REVEAL_STARTED',
      timestamp,
    });
  }

  function queueTrialSubsetReveal(key, sequence) {
    if (!key || key === 'none') {
      return;
    }
    if (queuedRevealKey === key && queuedRevealSequence === sequence) {
      return;
    }

    queuedRevealKey = key;
    queuedRevealSequence = sequence;

    void (async () => {
      await tick();
      await waitForBrowserPaint();

      if (sequence !== revealSequence || key !== stagedTrialSubsetKey || isFadingOut || !allBlockingAssetsReady) {
        clientConsole(2, '[CardScreen][Reveal] queued reveal skipped', {
          key,
          stagedTrialSubsetKey,
          sequence,
          revealSequence,
          isFadingOut,
          allBlockingAssetsReady,
          subsetKind: trialSubset.kind,
        });
        return;
      }

      clientConsole(2, '[CardScreen][Reveal] visible', {
        key,
        sequence,
        subsetKind: trialSubset.kind,
        isFadingOut,
        allBlockingAssetsReady,
      });
      lastFadeLogContext = {
        key,
        subsetKind: trialSubset.kind,
        visibleSetAt: performance.now(),
        configuredDurationMs: getElementTransitionDurationMs(trialContentFadeElement),
      };
      clientConsole(2, '[CardScreen][FadeTiming] reveal-trigger', {
        key,
        subsetKind: trialSubset.kind,
        configuredDurationMs: lastFadeLogContext.configuredDurationMs,
        visibleSetAt: lastFadeLogContext.visibleSetAt,
      });
      trialSubsetVisible = true;
      activeSlotMounted = true;
      activeSlotVisible = true;
      if (!testMode) {
        send({
          type: EVENTS.TRIAL_REVEAL_STARTED,
          timestamp: Date.now(),
          subsetKind: trialSubset.kind,
        });
      }
    })();
  }

  function getElementTransitionDurationMs(element) {
    if (!element || typeof window === 'undefined') {
      return 0;
    }

    const style = getComputedStyle(element);
    const durationValue = style.transitionDuration?.split(',')?.[0]?.trim() || '';
    const delayValue = style.transitionDelay?.split(',')?.[0]?.trim() || '';

    return parseCssTimeToMs(durationValue) + parseCssTimeToMs(delayValue);
  }

  function parseCssTimeToMs(value) {
    if (!value) {
      return 0;
    }
    if (value.endsWith('ms')) {
      const parsed = Number(value.slice(0, -2));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (value.endsWith('s')) {
      const parsed = Number(value.slice(0, -1));
      return Number.isFinite(parsed) ? parsed * 1000 : 0;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function logTrialFadeEvent(event) {
    if (!event || event.target !== trialContentFadeElement || event.propertyName !== 'opacity') {
      return;
    }

    const now = performance.now();
    const computedOpacity = trialContentFadeElement
      ? getComputedStyle(trialContentFadeElement).opacity
      : 'unknown';

    clientConsole(2, '[CardScreen][FadeTiming]', {
      eventType: event.type,
      key: lastFadeLogContext.key,
      subsetKind: lastFadeLogContext.subsetKind,
      elapsedSinceRevealTriggerMs: lastFadeLogContext.visibleSetAt
        ? Math.round(now - lastFadeLogContext.visibleSetAt)
        : null,
      configuredDurationMs: lastFadeLogContext.configuredDurationMs,
      trialContentVisible,
      isFadingOut,
      opacity: computedOpacity,
      pseudoElement: event.pseudoElement || '',
    });

    if (!testMode && event.type === 'transitionend' && isFadingOut && !transitionCompleteSent) {
      if (isPreparedFadingOut) {
        preservePreparedHandoffOnNextReveal = true;
        preparedHandoffStimulusReady = incomingStimulusBlockingAssetReady;
        preparedHandoffFeedbackReady = incomingFeedbackBlockingAssetReady;
      }
      transitionCompleteSent = true;
      send({ type: EVENTS.TRANSITION_COMPLETE, timestamp: Date.now() });
    }
  }

  function queueVideoEndOverlayReveal(sequence) {
    void (async () => {
      await tick();
      await waitForBrowserPaint();

      if (!videoEnded || sequence !== videoEndOverlaySequence) {
        return;
      }

      videoEndOverlayVisible = true;
    })();
  }

  function handleFirstKeypress(event) {
    send({
      type: 'FIRST_KEYPRESS',
      timestamp: event.detail.timestamp
    });
  }

  function handleSkipStudy() {
    send({ type: 'SKIP_STUDY' });
  }

  /**
   * Replay stimulus audio.
   * respepcts timer: stopped implicitly by stopTts() in cardMachine.js
   * when leaving AWAITING state.
   */
  async function handleReplay(event) {
    const audioSrc = event.detail?.audioSrc;
    if (!audioSrc) return;

    const { ttsPlaybackService } = await import('../services/ttsService');
    // We don't await here because it would block the UI, but stopTts 
    // in navigationCleanup/stopTts will handle stopping it if state changes.
    void ttsPlaybackService(context, {
      audioSrc,
      isQuestion: true,
      autoRestartSr: true,
    });
  }

  function buildPerformanceData(rawPerformance = {}) {
    const performance = rawPerformance || {};
    const numCorrect = Number(performance.numCorrect);
    const numIncorrect = Number(performance.numIncorrect);
    const divisor = Number.isFinite(numCorrect) && Number.isFinite(numIncorrect)
      ? numCorrect + numIncorrect
      : 0;

    const percentCorrect = typeof performance.percentCorrect === 'string' && performance.percentCorrect
      ? performance.percentCorrect
      : divisor > 0
        ? `${((numCorrect / divisor) * 100).toFixed(2)}%`
        : 'N/A';

    const totalTimeDisplay = performance.totalTimeDisplay != null && performance.totalTimeDisplay !== ''
      ? String(performance.totalTimeDisplay)
      : Number.isFinite(Number(performance.totalTime))
        ? (Number(performance.totalTime) / (1000 * 60)).toFixed(1)
        : '0.0';

    const cardsSeen = Number.isFinite(Number(performance.stimsSeen)) ? Number(performance.stimsSeen) : null;
    const totalCards = Number.isFinite(Number(performance.totalStimCount)) ? Number(performance.totalStimCount) : null;
    const currentTrial = Number.isFinite(Number(performance.count)) ? Number(performance.count) : 0;

    return {
      totalTimeDisplay,
      percentCorrect,
      cardsSeen,
      totalCards,
      currentTrial,
    };
  }

  let performanceTracker;
  let userTracker;
  let videoCheckpointTracker;
  let startRecordingHandler;
  let stopRecordingHandler;
  let displayAnswerHandler;
  let visibilityChangeHandler;
  let pageHideHandler;
  let beforeUnloadHandler;
  let screenWakeLock = null;
  let screenWakeLockReleaseHandler = null;
  let resumeVideoHandler;
  let videoAnswerHandler;
  let forceUnitAdvanceShortcutHandler;
  let completedVideoQuestions = new Set();
  let pendingMachineVideoResume = false;
  let flushingMachineVideoResume = false;

  function getCorrectAnswerImageSrc(buttonList, correctAnswer) {
    if (!Array.isArray(buttonList) || !correctAnswer) return '';

    const match = buttonList.find((button) => (
      button &&
      button.isImage &&
      (button.buttonValue === correctAnswer ||
        button.buttonName === correctAnswer ||
        button.verbalChoice === correctAnswer)
    ));

    return match ? match.buttonName : '';
  }

  function canUseScreenWakeLock() {
    if (typeof navigator === 'undefined' || typeof document === 'undefined') {
      return false;
    }
    return typeof navigator.wakeLock?.request === 'function';
  }

  function shouldHoldScreenWakeLock() {
    if (testMode) {
      return false;
    }
    if (typeof document === 'undefined') {
      return false;
    }
    return document.visibilityState === 'visible';
  }

  function clearScreenWakeLockListener() {
    if (
      screenWakeLock &&
      screenWakeLockReleaseHandler &&
      typeof screenWakeLock.removeEventListener === 'function'
    ) {
      screenWakeLock.removeEventListener('release', screenWakeLockReleaseHandler);
    }
    screenWakeLockReleaseHandler = null;
  }

  async function requestScreenWakeLock(reason = 'unspecified') {
    if (!canUseScreenWakeLock() || !shouldHoldScreenWakeLock()) {
      return;
    }
    if (screenWakeLock && !screenWakeLock.released) {
      return;
    }

    try {
      const nextWakeLock = await navigator.wakeLock.request('screen');
      clearScreenWakeLockListener();
      screenWakeLock = nextWakeLock;
      screenWakeLockReleaseHandler = () => {
        if (screenWakeLock === nextWakeLock) {
          screenWakeLock = null;
        }
        screenWakeLockReleaseHandler = null;
        clientConsole(2, `[CardScreen] Screen wake lock released (${reason})`);
      };
      if (typeof nextWakeLock.addEventListener === 'function') {
        nextWakeLock.addEventListener('release', screenWakeLockReleaseHandler);
      }
      clientConsole(2, `[CardScreen] Screen wake lock acquired (${reason})`);
    } catch (error) {
      clientConsole(2, `[CardScreen] Screen wake lock request skipped (${reason})`, error);
    }
  }

  async function releaseScreenWakeLock(reason = 'unspecified') {
    if (!screenWakeLock) {
      return;
    }

    const wakeLockToRelease = screenWakeLock;
    clearScreenWakeLockListener();
    screenWakeLock = null;

    try {
      if (!wakeLockToRelease.released && typeof wakeLockToRelease.release === 'function') {
        await wakeLockToRelease.release();
      }
      clientConsole(2, `[CardScreen] Screen wake lock released by app (${reason})`);
    } catch (error) {
      clientConsole(2, `[CardScreen] Screen wake lock release failed (${reason})`, error);
    }
  }

  async function syncScreenWakeLock(reason = 'unspecified') {
    if (shouldHoldScreenWakeLock()) {
      await requestScreenWakeLock(reason);
      return;
    }
    await releaseScreenWakeLock(reason);
  }

  function hasDeliveryParamsReady() {
    const deliveryParamsState = DeliveryParamsStore.get();
    return !!deliveryParamsState &&
      typeof deliveryParamsState === 'object' &&
      Object.keys(deliveryParamsState).length > 0;
  }

  function hasVideoSessionReadiness() {
    const unit = Session.get('currentTdfUnit');
    if (!unit?.videosession) {
      return true;
    }

    const checkpoints = Session.get('videoCheckpoints');
    const times = checkpoints?.times;
    const questions = checkpoints?.questions;
    const uiSettingsState = UiSettingsStore.get() || {};
    const hasVideoUrl = typeof uiSettingsState.videoUrl === 'string' &&
      uiSettingsState.videoUrl.trim().length > 0;

    return Array.isArray(times) &&
      times.length > 0 &&
      Array.isArray(questions) &&
      questions.length === times.length &&
      hasVideoUrl;
  }

  function hasCardReadiness() {
    return !!Session.get('currentTdfUnit') &&
      hasDeliveryParamsReady() &&
      hasVideoSessionReadiness();
  }

  async function waitForCardReadiness(timeoutMs = 4000, pollMs = 50) {
    const start = Date.now();
    while ((Date.now() - start) < timeoutMs) {
      if (hasCardReadiness()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    return false;
  }

  function getCardReadinessState() {
    return {
      hasCurrentTdfUnit: !!Session.get('currentTdfUnit'),
      hasDeliveryParams: hasDeliveryParamsReady(),
      hasVideoReadiness: hasVideoSessionReadiness(),
      isVideoUnit: !!Session.get('currentTdfUnit')?.videosession
    };
  }

  function isExperimentParticipantSession() {
    return Meteor.user()?.loginParams?.loginMode === 'experiment' ||
      Session.get('loginMode') === 'experiment';
  }

  function routeInitializationFailure() {
    Session.set('appLoading', false);

    if (isExperimentParticipantSession()) {
      Session.set('uiMessage', null);
      Session.set('experimentError', {
        title: 'Experiment paused',
        message: 'This practice activity did not start correctly.',
        note: 'Please email the experiment coordinator or study contact with your participant ID.',
      });
      Session.set('suppressAuthenticatedChrome', true);
      FlowRouter.go('/experimentError');
      return;
    }

    Session.set('uiMessage', {
      text: 'Lesson did not initialize correctly. Please restart from the Learning Dashboard.',
      variant: 'danger'
    });
    FlowRouter.go('/learningDashboard');
  }

  async function flushPendingMachineVideoResume(reason) {
    if (flushingMachineVideoResume || !pendingMachineVideoResume) {
      return;
    }

    flushingMachineVideoResume = true;
    await tick();
    flushingMachineVideoResume = false;

    if (!pendingMachineVideoResume) {
      return;
    }
    if (!state.matches('videoWaiting')) {
      clientConsole(1, '[CardScreen] Machine video resume command is pending outside videoWaiting', {
        reason,
        state: currentState,
      });
      setTimeout(() => {
        void flushPendingMachineVideoResume('retry-state');
      }, 50);
      return;
    }
    if (!videoPlayer || typeof videoPlayer.resumeAfterQuestion !== 'function') {
      clientConsole(1, '[CardScreen] Machine video resume command is pending before player is ready', {
        reason,
        hasVideoPlayer: !!videoPlayer,
      });
      setTimeout(() => {
        void flushPendingMachineVideoResume('retry-player');
      }, 50);
      return;
    }

    pendingMachineVideoResume = false;
    videoPlayer.resumeAfterQuestion();
  }

  function handleMachineVideoAnswer(event) {
    const { isCorrect, checkpointIndex } = event.detail || {};
    clientConsole(2, '[VIDEO-REWIND-DEBUG] videoAnswerHandler received:', {
      isCorrect,
      checkpointIndex,
      rewindOnIncorrectEnabled,
      hasVideoCheckpoints: !!videoCheckpoints,
      hasVideoPlayer: !!videoPlayer,
      videoCheckpointsTimes: videoCheckpoints?.times,
      videoCheckpointsRewind: videoCheckpoints?.rewindCheckpoints,
    });
    const questionIndex = Number.isFinite(checkpointIndex)
      ? videoCheckpoints?.questions?.[checkpointIndex]
      : undefined;
    if (isCorrect && Number.isFinite(questionIndex)) {
      completedVideoQuestions.add(questionIndex);
      clientConsole(2, '[VIDEO-REWIND-DEBUG] Correct answer, marking completed:', questionIndex);
      return;
    }
    if (!rewindOnIncorrectEnabled) {
      clientConsole(1, '[VIDEO-REWIND-DEBUG] rewindOnIncorrect disabled, skipping rewind');
      return;
    }
    if (!Number.isFinite(checkpointIndex)) {
      throw new Error('[CardScreen] Video answer missing checkpoint index');
    }
    if (!videoCheckpoints || !Array.isArray(videoCheckpoints.times)) {
      throw new Error('[CardScreen] Video checkpoints not initialized');
    }
    if (!videoPlayer) {
      throw new Error('[CardScreen] Video player missing for rewind');
    }
    const currentTime = videoPlayer.getCurrentTime?.() ?? 0;
    const currentQuestionTime = Number(videoCheckpoints.times[checkpointIndex]);
    if (!Number.isFinite(currentQuestionTime)) {
      throw new Error('[CardScreen] Video checkpoint time is invalid for rewind');
    }

    const checkpointTimes = [0, ...getRewindCheckpointTimes(videoCheckpoints)]
      .filter((time) => Number.isFinite(time))
      .sort((a, b) => a - b);
    let previousCheckpointTime = 0;
    for (const time of checkpointTimes) {
      if (time < (currentQuestionTime - 0.001)) {
        previousCheckpointTime = time;
      } else {
        break;
      }
    }
    const rewindTime = Math.max(0, previousCheckpointTime + 0.1);
    const rewindIndex = getCheckpointResetIndex(videoCheckpoints.times, rewindTime);
    clientConsole(2, '[VIDEO-REWIND-DEBUG] Rewind calculation:', {
      currentTime,
      currentQuestionTime,
      previousCheckpointTime,
      rewindTime,
      rewindIndex,
      checkpointTimes,
    });
    if (repeatQuestionsSinceCheckpointEnabled) {
      markQuestionsForRepetition(rewindTime, currentTime);
    }
    if (typeof videoPlayer.resetCheckpointTo === 'function') {
      clientConsole(2, '[VIDEO-REWIND-DEBUG] Calling resetCheckpointTo:', rewindIndex);
      videoPlayer.resetCheckpointTo(rewindIndex);
    } else {
      clientConsole(1, '[VIDEO-REWIND-DEBUG] resetCheckpointTo is not a function');
    }
    if (typeof videoPlayer.rewindTo === 'function') {
      clientConsole(2, '[VIDEO-REWIND-DEBUG] Calling rewindTo:', rewindTime);
      videoPlayer.rewindTo(rewindTime);
    } else {
      clientConsole(1, '[VIDEO-REWIND-DEBUG] rewindTo is not a function');
    }
    if (typeof videoPlayer.logAction === 'function') {
      videoPlayer.logAction('rewind_to_checkpoint');
    }
  }

  function registerMachineWindowListeners() {
    if (typeof window === 'undefined') {
      return;
    }

    if (!resumeVideoHandler) {
      resumeVideoHandler = () => {
        pendingMachineVideoResume = true;
        void flushPendingMachineVideoResume('cardMachine:resumeVideo');
      };
      window.addEventListener('cardMachine:resumeVideo', resumeVideoHandler);
    }

    if (!videoAnswerHandler) {
      videoAnswerHandler = handleMachineVideoAnswer;
      window.addEventListener('cardMachine:videoAnswer', videoAnswerHandler);
    }
  }

  // Lifecycle: Start machine on mount
  let actorSubscription;
  let startDispatched = false;
  let initializedForRender = false;
  const startPayload = {
    type: 'START',
    sessionId,
    unitId,
    tdfId,
    engineIndices
  };

  let cardScreenElement;

  onMount(() => {
    if (testMode) {
      state = normalizeTestSnapshot(testSnapshot);
      if (testPerformance) {
        performanceData = { ...performanceData, ...testPerformance };
      }
      return;
    }

    (async () => {
      let initResult;
      try {
        initResult = await initializeSvelteCard();
      } catch (error) {
        const diagnostic = {
          error,
          currentTdfName: Session.get('currentTdfFile')?.name || Session.get('currentTdfFile')?.fileName || null,
          currentTdfId: Session.get('currentTdfId') || null,
          currentRootTdfId: Session.get('currentRootTdfId') || null,
          currentStimuliSetId: Session.get('currentStimuliSetId') || null,
          currentUnitNumber: Session.get('currentUnitNumber') ?? null,
          currentUnitName: Session.get('currentTdfUnit')?.unitname || null,
          clusterlist: Session.get('currentTdfUnit')?.learningsession?.clusterlist ||
            Session.get('currentTdfUnit')?.videosession?.questions ||
            Session.get('currentTdfUnit')?.assessmentsession?.clusterlist ||
            null,
          stimuliCount: Array.isArray(Session.get('currentStimuliSet'))
            ? Session.get('currentStimuliSet').length
            : null,
        };
        Session.set('cardInitFailureDiagnostic', {
          stage: 'initializeSvelteCard',
          capturedAt: Date.now(),
          ...diagnostic,
          errorMessage: error?.message || String(error),
          errorStack: error?.stack || null,
        });
        clientConsole(1, '[CardScreen] initializeSvelteCard failed', diagnostic);
        routeInitializationFailure();
        return;
      }
      if (initResult?.redirected) {
        return;
      }

      const ready = await waitForCardReadiness();
      if (!ready) {
        const diagnostic = {
          ...getCardReadinessState(),
          currentTdfId: Session.get('currentTdfId') || null,
          currentRootTdfId: Session.get('currentRootTdfId') || null,
          currentStimuliSetId: Session.get('currentStimuliSetId') || null,
          currentUnitNumber: Session.get('currentUnitNumber') ?? null,
          currentUnitName: Session.get('currentTdfUnit')?.unitname || null,
          deliveryParamKeys: Object.keys(DeliveryParamsStore.get() || {}),
        };
        Session.set('cardInitFailureDiagnostic', {
          stage: 'cardReadinessTimeout',
          capturedAt: Date.now(),
          ...diagnostic,
        });
        clientConsole(1, '[CardScreen] Readiness timeout before machine start', diagnostic);
        routeInitializationFailure();
        return;
      }

      initializedForRender = true;
      await tick();

      // Clear the global launch spinner as soon as card bootstrap is complete.
      // Tying overlay dismissal to later visual machine states can leave the
      // spinner covering the screen if SR/audio startup perturbs sequencing.
      if (Session.get('appLoading')) {
        Session.set('appLoading', false);
      }

      if (typeof window !== 'undefined') {
        startRecordingHandler = () => {
          try {
            startSrRecording();
          } catch (error) {
            clientConsole(1, '[SR] startRecording failed', error);
          }
        };
        stopRecordingHandler = () => {
          try {
            stopSrRecording();
          } catch (error) {
            clientConsole(1, '[SR] stopRecording failed', error);
          }
        };
        displayAnswerHandler = (event) => {
          const next = String(event?.detail?.answer || '').trim();
          studyInteractionText = next;
        };
        window.addEventListener('cardMachine:startRecording', startRecordingHandler);
        window.addEventListener('cardMachine:stopRecording', stopRecordingHandler);
        window.addEventListener('cardMachine:displayAnswer', displayAnswerHandler);

        visibilityChangeHandler = () => {
          if (document.visibilityState === 'hidden') {
            cleanupAudioRecorder();
          } else if (document.visibilityState === 'visible') {
            clientConsole(2, '[CardScreen] visibilitychange visible; preserving card flow for mobile interruption recovery');
          }
          void syncScreenWakeLock('visibilitychange');
        };
        pageHideHandler = () => {
          cleanupAudioRecorder();
        };
        beforeUnloadHandler = () => {
          cleanupAudioRecorder();
        };
        document.addEventListener('visibilitychange', visibilityChangeHandler);
        window.addEventListener('pagehide', pageHideHandler);
        window.addEventListener('beforeunload', beforeUnloadHandler);
      }

      registerMachineWindowListeners();

      if (!actor) {
        actor = createMachineActor(cardMachine);
      }
      state = getActorSnapshot(actor);

      actorSubscription = subscribeToActor(actor, (snapshot) => {
        state = snapshot;
        if (!startDispatched && snapshot?.matches?.('idle.ready')) {
          startDispatched = true;
          send(startPayload);
        }
      });
      if (actor && typeof actor.start === 'function') {
        actor.start();
      }

      performanceTracker = Tracker.autorun(() => {
        const performance = Session.get('curStudentPerformance');
        performanceData = buildPerformanceData(performance);
      });

      userTracker = Tracker.autorun(() => {
        user = Meteor.user();
      });

      videoCheckpointTracker = Tracker.autorun(() => {
        videoCheckpoints = Session.get('videoCheckpoints');
        completedVideoQuestions = new Set();
      });

      forceUnitAdvanceShortcutHandler = async (event) => {
        const saveShortcutPressed =
          (event.ctrlKey || event.metaKey) &&
          event.shiftKey &&
          String(event.key || '').toLowerCase() === 's';
        if (!saveShortcutPressed || event.repeat) {
          return;
        }

        if (!currentUserHasRole('admin,teacher')) {
          return;
        }

        event.preventDefault();
        await forceAdvanceToNextUnit('Admin Teacher Shortcut Ctrl+Shift+S');
      };
      window.addEventListener('keydown', forceUnitAdvanceShortcutHandler);

      // START is dispatched when the machine reaches idle.ready.
    })();
  });

  // Lifecycle: Cleanup on unmount
  onDestroy(() => {
    if (typeof window !== 'undefined') {
      if (startRecordingHandler) {
        window.removeEventListener('cardMachine:startRecording', startRecordingHandler);
        startRecordingHandler = null;
      }
      if (stopRecordingHandler) {
        window.removeEventListener('cardMachine:stopRecording', stopRecordingHandler);
        stopRecordingHandler = null;
      }
      if (displayAnswerHandler) {
        window.removeEventListener('cardMachine:displayAnswer', displayAnswerHandler);
        displayAnswerHandler = null;
      }
      if (visibilityChangeHandler) {
        document.removeEventListener('visibilitychange', visibilityChangeHandler);
        visibilityChangeHandler = null;
      }
      if (pageHideHandler) {
        window.removeEventListener('pagehide', pageHideHandler);
        pageHideHandler = null;
      }
      if (beforeUnloadHandler) {
        window.removeEventListener('beforeunload', beforeUnloadHandler);
        beforeUnloadHandler = null;
      }
      void releaseScreenWakeLock('card destroy');
    }
    if (actorSubscription && typeof actorSubscription.unsubscribe === 'function') {
      actorSubscription.unsubscribe();
      actorSubscription = null;
    }
    if (actor && typeof actor.stop === 'function') {
      actor.stop();
      actor = null;
    }
    clearTimeoutInterval();
    if (performanceTracker) {
      performanceTracker.stop();
      performanceTracker = null;
    }
    if (userTracker) {
      userTracker.stop();
      userTracker = null;
    }
    if (videoCheckpointTracker) {
      videoCheckpointTracker.stop();
      videoCheckpointTracker = null;
    }
    if (typeof window !== 'undefined' && resumeVideoHandler) {
      window.removeEventListener('cardMachine:resumeVideo', resumeVideoHandler);
      resumeVideoHandler = null;
    }
    if (typeof window !== 'undefined' && videoAnswerHandler) {
      window.removeEventListener('cardMachine:videoAnswer', videoAnswerHandler);
      videoAnswerHandler = null;
    }
    if (typeof window !== 'undefined' && forceUnitAdvanceShortcutHandler) {
      window.removeEventListener('keydown', forceUnitAdvanceShortcutHandler);
      forceUnitAdvanceShortcutHandler = null;
    }
    if (!testMode) {
      stopStimDisplayTypeMapVersionSync('svelte card destroy');
      completeCleanup();
      cleanupAudioRecorder();
    }
    // Machine cleanup handled by XState
  });

  // Video player reference
  let videoPlayer;
  let videoCheckpoints = null;
  let videoResumeAnchor = null;
  $: videoSession = Session.get('currentTdfUnit')?.videosession;
  $: videoResumeAnchor = Session.get('videoResumeAnchor');
  $: preventScrubbingEnabled = normalizeVideoBoolean(videoSession?.preventScrubbing);
  $: rewindOnIncorrectEnabled = normalizeVideoBoolean(videoSession?.rewindOnIncorrect);
  $: repeatQuestionsSinceCheckpointEnabled = normalizeVideoBoolean(videoSession?.repeatQuestionsSinceCheckpoint);
  $: if (pendingMachineVideoResume && videoPlayer && state.matches('videoWaiting')) {
    void flushPendingMachineVideoResume('reactive-ready');
  }

  // Meteor provides an environment flag we can safely use in Svelte
  const isDev = Meteor.isDevelopment;

  $: {
    if (testMode) {
      timeoutModeState = testTimeout?.mode || getTimeoutMode(state);
      timeoutProgress = Number.isFinite(testTimeout?.progress) ? testTimeout.progress : 0;
      remainingTime = Number.isFinite(testTimeout?.remainingTime) ? testTimeout.remainingTime : 0;
      clearTimeoutInterval();
    } else {
      const mode = getTimeoutMode(state);
      if (mode === 'question') {
        const duration = getMainTimeoutMs({ ...context, deliveryParams });
        const resetCounter = Number.isFinite(context.timeoutResetCounter) ? context.timeoutResetCounter : 0;
        if (timeoutModeState !== mode || timeoutDuration !== duration || resetCounter !== lastTimeoutResetCounter) {
          lastTimeoutResetCounter = resetCounter;
          startTimeoutCountdown(duration, mode);
        }
      } else if (mode === 'feedback') {
        let duration;
        if (state.matches('presenting.readyPrompt')) {
          duration = parseInt(deliveryParams.readyPromptStringDisplayTime, 10) || 0;
        } else {
          duration = getFeedbackTimeoutMs({ ...context, deliveryParams });
        }
        if (timeoutModeState !== mode || timeoutDuration !== duration) {
          startTimeoutCountdown(duration, mode);
        }
      } else if (timeoutModeState !== 'none') {
        timeoutModeState = 'none';
        timeoutStart = null;
        timeoutDuration = 0;
        timeoutProgress = 0;
        remainingTime = 0;
        clearTimeoutInterval();
      }
    }
  }

  $: if (testMode && testPerformance) {
    performanceData = { ...performanceData, ...testPerformance };
  }

  async function handleVideoCheckpoint(event) {
    const { index, questionIndex } = event.detail || {};
    if (!state.matches('videoWaiting')) {
      clientConsole(1, '[CardScreen] Rejected video checkpoint outside videoWaiting', {
        state: currentState,
        index,
        questionIndex,
      });
      if (videoPlayer && typeof videoPlayer.recoverRejectedCheckpoint === 'function') {
        videoPlayer.recoverRejectedCheckpoint();
      }
      return;
    }
    if (!Number.isFinite(questionIndex)) {
      throw new Error('[CardScreen] Video checkpoint missing question index');
    }
    const checkpointTime = Number(videoCheckpoints?.times?.[index]);
    if (!Number.isFinite(checkpointTime)) {
      throw new Error('[CardScreen] Video checkpoint missing checkpoint time');
    }
    Session.set('engineIndices', { clusterIndex: questionIndex, stimIndex: 0 });
    if (!testMode) {
      Session.set('videoResumeAnchor', {
        resumeStartTime: checkpointTime,
        resumeCheckpointIndex: index,
      });
    }
    send({ type: 'VIDEO_CHECKPOINT', checkpointIndex: index, questionIndex });
  }

  function handleVideoEnded() {
    Session.set('engineIndices', undefined);
    send({ type: 'VIDEO_ENDED' });
  }

  function handleVideoReady() {
    videoPlayerReady = true;
    void flushPendingMachineVideoResume('video-ready');
    if (!state.matches('videoWaiting') || !videoPlayer) return;
    const player = typeof videoPlayer.getPlayer === 'function'
      ? videoPlayer.getPlayer()
      : null;
    if (player) {
      player.muted = false;
      player.volume = Number.isFinite(player.volume) && player.volume > 0
        ? player.volume
        : 1;
    }
  }

  function markVideoInstructionsContinued() {
    videoInstructionDismissed = true;
    videoInstructionStartBlocked = false;
    Session.set('curUnitInstructionsSeen', true);
    Session.set('fromInstructions', true);

    const currentUnitNumber = Session.get('currentUnitNumber') || 0;
    const currentTdfUnit = Session.get('currentTdfUnit');
    void recordCurrentInstructionContinue(videoInstructionsShownAt || Date.now()).catch((error) => {
      clientConsole(1, '[CardScreen] Failed to record video instructions continue:', error);
    });
    void createExperimentState({
      currentUnitNumber,
      currentTdfUnit,
      lastUnitStarted: currentUnitNumber,
    }).catch((error) => {
      clientConsole(1, '[CardScreen] Failed to persist video instructions state:', error);
    });
  }

  function handleVideoInstructionContinue(event) {
    event?.preventDefault?.();

    if (!videoPlayer || typeof videoPlayer.play !== 'function') {
      videoInstructionStartBlocked = true;
      clientConsole(1, '[CardScreen] Video instructions continue clicked before player was ready');
      return;
    }

    videoInstructionStartBlocked = false;
    let playResult;
    try {
      playResult = videoPlayer.play();
    } catch (error) {
      videoInstructionStartBlocked = true;
      clientConsole(1, '[CardScreen] Video start from instructions threw:', error?.message || error);
      return;
    }

    if (playResult?.then) {
      playResult
        .then(() => {
          markVideoInstructionsContinued();
        })
        .catch((error) => {
          videoInstructionStartBlocked = true;
          clientConsole(1, '[CardScreen] Video start from instructions was blocked:', error?.message || error);
        });
      return;
    }

    markVideoInstructionsContinued();
  }

  function handleVideoContinue() {
    send({ type: 'VIDEO_CONTINUE' });
  }

  let continuingToNextUnit = false;

  async function forceAdvanceToNextUnit(reason) {
    if (testMode || continuingToNextUnit) {
      return;
    }

    continuingToNextUnit = true;
    try {
      const { unitIsFinished } = await import('../services/unitProgression');
      await unitIsFinished(reason);
    } catch (error) {
      continuingToNextUnit = false;
      clientConsole(1, '[CardScreen] Failed to continue to next unit:', error);
    }
  }

  async function handleFooterContinue(event) {
    event?.preventDefault?.();
    await forceAdvanceToNextUnit('Continue Button Pressed');
  }

  function markQuestionsForRepetition(checkpointTime, currentTime) {
    if (!videoCheckpoints || !Array.isArray(videoCheckpoints.times)) {
      return;
    }
    const questionsToRepeat = [];
    const times = videoCheckpoints.times;
    const questions = videoCheckpoints.questions || [];

    for (let i = 0; i < times.length; i++) {
      const time = Number(times[i]);
      if (!Number.isFinite(time)) continue;
      if (time >= checkpointTime && time <= currentTime) {
        const questionIndex = questions[i];
        if (!Number.isFinite(questionIndex)) continue;
        if (!completedVideoQuestions.has(questionIndex)) {
          questionsToRepeat.push({
            index: i,
            time,
            question: questionIndex,
          });
        }
      }
    }

    Session.set('questionsToRepeat', questionsToRepeat);
  }
</script>

{#if testMode || initializedForRender}
<div class="card-screen" class:video-mode={isVideoSession} bind:this={cardScreenElement} style={cardFontSizeStyle}>
  {#if isVideoSession}
    <VideoSessionMode
      bind:this={videoPlayer}
      videoUrl={uiSettings.videoUrl}
      questionTimes={videoCheckpoints?.times || []}
      questionIndices={videoCheckpoints?.questions || []}
      resumeStartTime={videoResumeAnchor?.resumeStartTime}
      resumeCheckpointIndex={videoResumeAnchor?.resumeCheckpointIndex}
      preventScrubbing={preventScrubbingEnabled}
      canAcceptCheckpoint={state.matches('videoWaiting')}
      checkpointGateState={JSON.stringify(currentState)}
      overlayMounted={trialContentMounted}
      overlayVisible={trialContentVisible}
      on:checkpoint={handleVideoCheckpoint}
      on:ready={handleVideoReady}
      on:play
      on:pause
      on:timeupdate
      on:ended={handleVideoEnded}
    >
      {#if uiSettings.displayPerformance}
      <PerformanceArea
        {showTimeoutBar}
        {...performanceData}
        {timeoutMode}
        {timeoutProgress}
        {remainingTime}
      />
      {/if}

      <div
        class="trial-content-fade"
        bind:this={trialContentFadeElement}
        class:trial-content-visible={trialContentVisible}
        class:trial-content-fading-out={isFadingOut}
        on:transitionrun={logTrialFadeEvent}
        on:transitionstart={logTrialFadeEvent}
        on:transitionend={logTrialFadeEvent}
      >
        <TrialContent
          {...trialContentProps}
          parentVisible={trialContentVisible}
          on:submit={handleSubmit}
          on:choice={handleChoice}
          on:confirm={handleConfirm}
          on:input={handleInput}
          on:activity={handleInputActivity}
          on:firstKeypress={handleFirstKeypress}
          on:blockingassetstate={handleBlockingAssetState}
          on:reviewrevealstarted={handleReviewRevealStarted}
        />
      </div>

    </VideoSessionMode>

    {#if showVideoInstructionOverlay}
      <div class="video-instruction-overlay" role="dialog" aria-modal="true" aria-live="polite">
        <div class="video-instruction-panel">
          <div class="video-instruction-copy">
            {@html sanitizedVideoInstructionText}
          </div>
          {#if videoInstructionStartBlocked}
            <p class="video-instruction-warning">
              The browser blocked automatic video start. Press Continue again to start the video.
            </p>
          {/if}
          <button
            type="button"
            class="video-instruction-continue"
            disabled={!videoPlayerReady}
            on:click={handleVideoInstructionContinue}
          >
            {videoPlayerReady ? (uiSettings.continueButtonText || 'Continue') : 'Loading video...'}
          </button>
        </div>
      </div>
    {/if}

    {#if videoEndOverlayMounted}
      <div class="video-end-overlay" class:video-end-overlay-visible={videoEndOverlayVisible}>
        <button type="button" class="video-continue-button" on:click={handleVideoContinue}>
          {uiSettings.continueButtonText || 'Continue'}
        </button>
      </div>
    {/if}
  {:else}
    {#if uiSettings.displayPerformance}
    <PerformanceArea
      {showTimeoutBar}
      {...performanceData}
      {timeoutMode}
      {timeoutProgress}
      {remainingTime}
    />
    {/if}

    <div class="trial-content-stack">
      <div
        class="trial-content-fade trial-content-slot"
        bind:this={trialContentFadeElement}
        class:trial-content-visible={trialContentVisible}
        class:trial-content-fading-out={isFadingOut}
        on:transitionrun={logTrialFadeEvent}
        on:transitionstart={logTrialFadeEvent}
        on:transitionend={logTrialFadeEvent}
      >
        <TrialContent
          {...trialContentProps}
          parentVisible={trialContentVisible}
          on:submit={handleSubmit}
          on:choice={handleChoice}
          on:confirm={handleConfirm}
          on:input={handleInput}
          on:activity={handleInputActivity}
          on:firstKeypress={handleFirstKeypress}
          on:replay={handleReplay}
          on:blockingassetstate={handleBlockingAssetState}
          on:reviewrevealstarted={handleReviewRevealStarted}
        />
        {#if trialSubset.showSkipStudyButton}
          <div class="skip-study-container">
            <button type="button" class="skip-study-button" on:click={handleSkipStudy}>
              {uiSettings.skipStudyButtonText || 'Skip'}
            </button>
          </div>
        {/if}
      </div>

      {#if incomingSlot}
        <div
          class="trial-content-fade trial-content-slot trial-content-slot-incoming-prepared"
          aria-hidden="true"
        >
          <TrialContent
            {...incomingSlot.props}
            parentVisible={false}
            on:blockingassetstate={(event) => handleBlockingAssetState(event, 'incoming')}
          />
        </div>
      {/if}
    </div>
  {/if}

  {#if hasDisplayTimeout}
    <div class="fixed-footer" role="contentinfo">
      <div class="fixed-footer__message">{footerMessage}</div>
      <div class="fixed-footer__controls">
        <button
          type="button"
          class="fixed-footer__button"
          on:click={handleFooterContinue}
          disabled={continuingToNextUnit}
          aria-busy={continuingToNextUnit}
        >
          {uiSettings.continueButtonText || 'Continue'}
        </button>
      </div>
    </div>
  {/if}

  <!-- Debug state display (development only) -->
  {#if isDev}
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
    background-color: var(--background-color);
    font-family: var(--font-family);
    font-size: var(--font-size-base);
  }

  .card-screen.video-mode {
    background-color: var(--text-color);
  }

  .video-instruction-overlay {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: clamp(16px, 4vw, 48px);
    background: color-mix(in srgb, var(--background-color) 94%, transparent);
  }

  .video-instruction-panel {
    width: min(760px, 100%);
    max-height: min(78vh, 720px);
    overflow: auto;
    padding: clamp(18px, 3vw, 32px);
    border: 1px solid var(--secondary-color);
    background: var(--card-background-color);
    color: var(--text-color);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18);
  }

  .video-instruction-copy {
    font-size: clamp(1rem, 1.6vw, 1.2rem);
    line-height: 1.5;
  }

  .video-instruction-warning {
    margin: 16px 0 0;
    color: var(--alert-color);
    font-weight: 600;
  }

  .video-instruction-continue {
    display: block;
    width: min(420px, 100%);
    min-height: 44px;
    margin: 24px auto 0;
    border: 1px solid var(--secondary-color);
    border-radius: var(--border-radius-sm);
    background: var(--main-button-color);
    color: var(--main-button-text-color);
    font-weight: 700;
    cursor: pointer;
  }

  .video-instruction-continue:disabled {
    opacity: 0.65;
    cursor: wait;
  }

  .trial-content-stack {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  .trial-content-fade {
    display: flex;
    flex-direction: column;
    width: 100%;
    opacity: 0;
    transition: opacity var(--transition-smooth) ease;
  }

  .trial-content-slot {
    position: absolute;
    inset: 0;
    min-height: 0;
  }

  .trial-content-slot-incoming-prepared {
    pointer-events: none;
    visibility: hidden;
  }

  .trial-content-fade.trial-content-visible {
    opacity: 1;
  }

  .trial-content-fade.trial-content-fading-out {
    opacity: 0;
    transition-duration: var(--transition-smooth);
    pointer-events: none;
  }

  .fixed-footer {
    flex-shrink: 0;
    height: 30px;
    background: var(--card-background-color);
    border-top: 1px solid var(--secondary-color);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .fixed-footer__message {
    color: var(--secondary-text-color);
    font-size: 12px;
  }

  .fixed-footer__button {
    padding: 4px 16px;
    border: 1px solid var(--secondary-color);
    border-radius: var(--border-radius-sm);
    font-size: 12px;
    font-weight: 600;
    background: var(--main-button-color);
    color: var(--main-button-text-color);
    cursor: pointer;
  }

  .debug-state {
    position: fixed;
    bottom: 10px;
    right: 10px;
    background: color-mix(in srgb, var(--text-color) 80%, transparent);
    color: var(--accent-color);
    padding: 0.5rem;
    border-radius: var(--border-radius-sm);
    font-family: monospace;
    font-size: 0.7rem;
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
    margin: 0.5rem 0 0 0;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .video-end-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--text-color) 60%, transparent);
    z-index: 120;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--transition-smooth) ease;
  }

  .video-end-overlay.video-end-overlay-visible {
    opacity: 1;
    pointer-events: auto;
  }

  .video-continue-button {
    padding: 0.75rem 2rem;
    border: 1px solid var(--secondary-color);
    border-radius: var(--border-radius-lg);
    font-size: 1rem;
    font-weight: 600;
    background: var(--main-button-color);
    color: var(--main-button-text-color);
    cursor: pointer;
  }

  .skip-study-container {
    display: flex;
    justify-content: center;
    padding: var(--card-spacing-sm) var(--card-spacing-md);
    flex-shrink: 0;
  }

  .skip-study-button {
    padding: 0.5rem 1.5rem;
    border: 1px solid var(--secondary-color);
    border-radius: var(--border-radius-lg);
    font-size: 0.875rem;
    font-weight: 500;
    background: var(--main-button-color);
    color: var(--main-button-text-color);
    cursor: pointer;
    opacity: 0.85;
    transition: opacity 0.15s ease;
  }

  .skip-study-button:hover {
    opacity: 1;
  }
</style>

