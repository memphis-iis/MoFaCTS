import { expect } from 'chai';
import { EVENTS, STATES } from './constants';
import { contentRuntimeMachinePresentingState } from './contentRuntimeMachinePresentingState';

type Transition = {
  target?: string;
  guard?: unknown;
  actions?: unknown[];
};

type InvokeConfig = {
  id: string;
  src: string;
  onDone?: Transition | Transition[];
  onError?: Transition;
};

type StateNode = {
  initial?: string;
  type?: string;
  entry?: unknown[];
  exit?: unknown[];
  invoke?: InvokeConfig;
  on?: Record<string, unknown>;
  always?: Transition | Transition[];
  states?: Record<string, StateNode>;
};

describe('card machine presenting state', function() {
  const states = contentRuntimeMachinePresentingState.states as Record<string, StateNode>;

  it('loads selected cards into active context before prompt/display flow', function() {
    const loadingInvoke = states[STATES.LOADING]!.invoke!;
    const transitions = loadingInvoke.onDone as Transition[];

    expect(contentRuntimeMachinePresentingState.initial).to.equal(STATES.LOADING);
    expect(loadingInvoke).to.deep.include({
      id: 'selectCardService',
      src: 'selectCardService',
    });
    expect(transitions[0]!).to.deep.include({
      target: STATES.READY_PROMPT,
      guard: 'isSupportedTrialType',
    });
    expect(transitions[0]!.actions).to.include('syncDeliverySettings');
    expect(transitions[1]!).to.deep.include({
      target: '#contentRuntimeMachine.error',
    });
  });

  it('branches display state to study, audio gate, awaiting, or error', function() {
    const displayInvoke = states[STATES.DISPLAYING]!.invoke!;
    const transitions = displayInvoke.onDone as Transition[];

    expect(displayInvoke).to.deep.include({
      id: 'experimentStateService',
      src: 'experimentStateService',
    });
    expect(transitions.map((transition) => transition.target)).to.deep.equal([
      `#contentRuntimeMachine.${STATES.STUDY}`,
      STATES.AUDIO_GATE,
      STATES.AWAITING,
      '#contentRuntimeMachine.error',
    ]);
    expect(transitions[0]!.guard).to.equal('isStudyTrial');
    expect(transitions[2]!.actions).to.deep.equal(['logStateTransition']);
  });

  it('keeps awaiting input submit and response timeout routed to validation after reveal', function() {
    const awaiting = states[STATES.AWAITING]!;
    const inputMode = awaiting.states!.inputMode!;
    const inputWaitingForReveal = inputMode.states!.waitingForReveal!;
    const inputReady = awaiting.states!.inputMode!.states!.ready!;
    const mainTimeout = awaiting.states!.mainTimeout!;
    const mainTimeoutWaitingForReveal = mainTimeout.states!.waitingForReveal!;
    const mainTimeoutRunning = mainTimeout.states!.running!;

    expect(awaiting.type).to.equal('parallel');
    expect(awaiting.entry).not.to.include('enableInput');
    expect(awaiting.entry).not.to.include('startRecording');
    expect(inputMode.initial).to.equal('waitingForReveal');
    expect(inputWaitingForReveal.on![EVENTS.TRIAL_REVEAL_STARTED]).to.deep.equal({
      target: 'ready',
      actions: ['enableInput', 'markInputEnabled', 'focusInput', 'maybeSpeakQuestion', 'logStateTransition'],
    });
    expect(mainTimeout.initial).to.equal('waitingForReveal');
    expect(mainTimeoutWaitingForReveal.on![EVENTS.TRIAL_REVEAL_STARTED]).to.deep.equal({
      target: 'running',
      actions: ['markTrialRevealStart', 'logStateTransition'],
    });
    expect(mainTimeoutWaitingForReveal.always).to.deep.equal([
      {
        target: 'running',
        guard: 'trialRevealStarted',
      },
    ]);
    expect(inputReady.on![EVENTS.SUBMIT]).to.deep.equal({
      target: '#contentRuntimeMachine.presenting.validating',
      actions: ['captureAnswer', 'logStateTransition'],
    });
    expect(inputReady.on![EVENTS.TIMEOUT]).to.deep.equal({
      target: '#contentRuntimeMachine.presenting.validating',
      actions: ['markTimeout', 'logStateTransition'],
    });
    expect(mainTimeoutRunning.always).to.deep.equal([
      {
        target: 'disabled',
        guard: 'trialDisplaySuppressesStandardTimeout',
      },
      {
        target: 'paused',
        guard: 'waitingForTranscription',
      },
    ]);
  });

  it('keeps speech recognition success and exhaustion auto-submitting to validation', function() {
    const speechRegion = states[STATES.AWAITING]!.states!.speechRecognition!;
    const speechStates = speechRegion.states!;
    const activeStates = speechStates.active!.states!;

    expect(speechRegion.initial).to.equal('waitingForReveal');
    expect(speechStates.waitingForReveal!.on![EVENTS.TRIAL_REVEAL_STARTED]).to.deep.equal({
      target: 'checking',
      actions: ['startRecording', 'logStateTransition'],
    });
    expect(speechStates.checking!.always).to.deep.equal([
      {
        target: 'active',
        guard: 'srEnabled',
      },
      {
        target: 'disabled',
        guard: 'srDisabled',
      },
    ]);
    expect(activeStates.success!.always).to.deep.equal({
      target: '#contentRuntimeMachine.presenting.validating',
    });
    expect(activeStates.exhausted!.entry).to.include('forceSrFailureAnswer');
    expect(activeStates.exhausted!.always).to.deep.equal({
      target: '#contentRuntimeMachine.presenting.validating',
    });
  });

  it('counts speech recognition errors toward retry exhaustion', function() {
    const speechStates = states[STATES.AWAITING]!.states!.speechRecognition!.states!;
    const activeStates = speechStates.active!.states!;

    for (const stateName of ['ready', 'recording', 'processing']) {
      expect(activeStates[stateName]!.on![EVENTS.TRANSCRIPTION_ERROR]).to.deep.equal({
        target: 'error',
        actions: ['incrementSrAttempt', 'clearWaitingForTranscription', 'logError'],
      });
    }
  });

  it('routes answer validation through video and standard feedback branches', function() {
    const validateInvoke = states.validating!.invoke!;
    const transitions = validateInvoke.onDone as Transition[];

    expect(validateInvoke).to.deep.include({
      id: 'evaluateAnswerService',
      src: 'evaluateAnswerService',
    });
    expect(transitions.map((transition) => transition.guard)).to.deep.equal([
      'needsFeedbackAndVideoSession',
      'noFeedbackAndVideoSession',
      'needsFeedback',
      'noFeedback',
    ]);
    expect(transitions[0]!.actions).to.include('notifyVideoAnswer');
    expect(transitions[1]!.actions).to.include('notifyVideoAnswer');
  });
});
