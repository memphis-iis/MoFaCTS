import { expect } from 'chai';
import sinon from 'sinon';
import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { createActor, fromPromise, waitFor, type AnyActorRef, type AnyStateMachine } from 'xstate';
import { DynamicSettings } from '../../../../../common/Collections';
import { loadClientSettings } from '../../../../lib/clientLogger';
import { ExperimentStateStore } from '../../../../lib/state/experimentStateStore';
import { contentRuntimeMachine } from '../machine/contentRuntimeMachine';
import { EVENTS } from '../machine/constants';
import { logError } from '../machine/machineDiagnosticsActions';
import { initialContext } from '../machine/contentRuntimeMachineTypes';
import { enableInput } from '../machine/trialDisplayActions';
import { experimentStateService } from './experimentState';
import { isDisplayReady, isInputReady, setDisplayReady, setInputReady } from './trialReadinessState';

describe('required experiment-state persistence in the content runtime', function() {
  const sessionKeys = [
    'currentExperimentState', 'currentRootTdfId', 'currentTdfId', 'currentUnitNumber',
    'currentTdfUnit', 'courseAssignmentLaunchContext', 'currentDeliverySettings',
    'experimentTarget', 'experimentXCond', 'displayReady', 'inputReady',
  ];
  let sandbox: sinon.SinonSandbox;
  let call: sinon.SinonStub;
  let consoleLog: sinon.SinonStub;
  let savedSession: Map<string, unknown>;
  let savedReadiness: { display: boolean; input: boolean };
  let stopLogging: () => void;
  const actors: AnyActorRef[] = [];

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    savedSession = new Map(sessionKeys.map(key => [key, Session.get(key)]));
    savedReadiness = { display: isDisplayReady(), input: isInputReady() };
    Session.set('currentRootTdfId', 'synthetic-lesson');
    Session.set('currentTdfId', 'synthetic-lesson');
    Session.set('currentUnitNumber', 0);
    Session.set('currentTdfUnit', {});
    Session.set('courseAssignmentLaunchContext', null);
    Session.set('currentDeliverySettings', {});
    Session.set('experimentTarget', '');
    Session.set('experimentXCond', null);
    ExperimentStateStore.clear();
    setInputReady(false);
    setDisplayReady(false);
    sandbox.stub(Meteor, 'userId').returns('synthetic-learner');
    sandbox.stub(Meteor, 'user').returns(null);
    call = sandbox.stub(Meteor, 'callAsync');
    // Exercise the real logging gate at level 1, without a subscription or DB write.
    sandbox.stub(Meteor, 'subscribe').returns({ ready: () => true, stop: () => undefined } as never);
    sandbox.stub(DynamicSettings, 'findOne').returns({ value: 1 } as never);
    consoleLog = sandbox.stub(console, 'log');
    stopLogging = loadClientSettings();
  });

  afterEach(function() {
    for (const actor of actors.splice(0)) actor.stop();
    stopLogging();
    sandbox.restore();
    setDisplayReady(savedReadiness.display);
    setInputReady(savedReadiness.input);
    for (const [key, value] of savedSession) Session.set(key, value);
  });

  function launch(options: { afterHistory?: () => void } = {}) {
    const counts = { prompt: 0, input: 0, timeout: 0, evaluated: 0, history: 0, advanced: 0 };
    // Retain the real machine, persistence actor, rejection wrapper, and terminal
    // error actions. Isolate rendering/media/model side effects at their contracts.
    const machine = contentRuntimeMachine.provide({
      actors: {
        selectCardService: fromPromise(async () => ({
          currentDisplay: { text: 'Synthetic question' }, currentAnswer: 'Synthetic answer',
          originalAnswer: 'Synthetic answer', testType: 'd', questionIndex: 3,
        })),
        readyPromptDelayService: fromPromise(async () => { counts.prompt += 1; }),
        mainCardTimeout: fromPromise(() => {
          counts.timeout += 1;
          return new Promise(() => undefined);
        }),
        evaluateAnswerService: fromPromise(async () => {
          counts.evaluated += 1;
          return { isCorrect: true, matchText: 'Correct.' };
        }),
        prepareIncomingTrialService: fromPromise(async () => ({ preparedAdvanceMode: 'none' })),
        historyLoggingService: fromPromise(async () => {
          counts.history += 1;
          options.afterHistory?.();
        }),
        updateEngineService: fromPromise(async () => { counts.advanced += 1; return { unitFinished: false }; }),
      },
      actions: {
        syncDeliverySettings: () => undefined,
        syncActiveTrialChoiceState: () => undefined,
        syncSessionIndices: () => undefined,
        syncCurrentAnswer: () => undefined,
        resetSrAttempts: () => undefined,
        startEarlyLockForCurrentTrial: () => undefined,
        startRecording: () => undefined,
        stopRecording: () => undefined,
        stopTTS: () => undefined,
        focusInput: () => undefined,
        maybeSpeakQuestion: () => undefined,
        logStateTransition: () => undefined,
        enableInput: () => { counts.input += 1; enableInput(); },
      },
      guards: {
        isVideoSession: () => false,
        srEnabled: () => false,
        srDisabled: () => true,
        needsFeedbackAndVideoSession: () => false,
        noFeedbackAndVideoSession: () => false,
        needsFeedback: () => false,
        noFeedback: () => true,
      },
      delays: { FADE_IN_DURATION: 0 },
    }) as AnyStateMachine;
    const actor = createActor(machine);
    actors.push(actor);
    actor.start();
    actor.send({ type: EVENTS.START, userId: 'synthetic-learner', tdfId: 'synthetic-lesson', unitId: 0, attemptId: 'synthetic-attempt' });
    return { actor, counts };
  }

  it('rejects the actual service when a required save fails and retains the prior local state', async function() {
    const existing = { currentTdfId: 'synthetic-lesson', clusterMapping: [0], currentUnitNumber: 0 };
    ExperimentStateStore.set(existing);
    const failure = new Error('Synthetic save failure');
    call.rejects(failure);
    let caught: unknown;
    try {
      await experimentStateService({}, { stateUpdate: { currentUnitNumber: 1 } });
    } catch (error) { caught = error; }
    expect(caught).to.equal(failure);
    expect(ExperimentStateStore.get()).to.deep.equal(existing);
  });

  it('stops on rejected initialization without enabling input, timers, validation, or advancement', async function() {
    let rejectSave!: (error: Error) => void;
    call.returns(new Promise((_resolve, reject) => { rejectSave = reject; }));
    const { actor, counts } = launch();
    await waitFor(actor, state => state.matches('presenting.displaying'), { timeout: 1000 });
    expect(call.calledOnce).to.equal(true);
    actor.send({ type: EVENTS.TRIAL_REVEAL_STARTED, timestamp: 100 });
    actor.send({ type: EVENTS.SUBMIT, userAnswer: 'Private synthetic learner answer' });
    actor.send({ type: EVENTS.TIMEOUT });
    expect(isInputReady()).to.equal(false);
    expect(counts).to.deep.equal({ prompt: 1, input: 0, timeout: 0, evaluated: 0, history: 0, advanced: 0 });

    rejectSave(Object.assign(new Error('Private synthetic save detail'), { details: { learnerText: 'Private synthetic learner answer' } }));
    await waitFor(actor, state => state.matches('error'), { timeout: 1000 });
    expect(actor.getSnapshot().status).to.equal('done');
    expect(actor.getSnapshot().context.errorMessage).to.contain('Private synthetic save detail');
    expect(isInputReady()).to.equal(false);
    for (const type of [EVENTS.START, EVENTS.SUBMIT, EVENTS.TIMEOUT, EVENTS.TRIAL_REVEAL_STARTED, EVENTS.UNIT_FINISHED]) {
      actor.send({ type, userAnswer: 'Private synthetic learner answer' });
    }
    expect(actor.getSnapshot().matches('error')).to.equal(true);
    expect(actor.getSnapshot().context.questionIndex).to.equal(3);
    expect(counts).to.deep.equal({ prompt: 1, input: 0, timeout: 0, evaluated: 0, history: 0, advanced: 0 });
    expect(ExperimentStateStore.get()).to.equal(undefined);
    // The missing-error diagnostic path must not dump its event or context either.
    logError({ context: { ...initialContext, feedbackTimeoutMs: 0, userAnswer: 'Private synthetic learner answer' }, event: { type: 'synthetic-error', learnerText: 'Private synthetic learner answer' } });
    const diagnostics = JSON.stringify(consoleLog.getCalls().map(entry => entry.args));
    expect(diagnostics).to.contain('failed');
    expect(diagnostics).not.to.contain('Private');
    expect(diagnostics).not.to.contain('Synthetic question');
  });

  for (const acknowledgment of [undefined, {}, { id: '' }, { id: 3 }]) {
    it(`stops when a required save lacks a valid persisted identity (${JSON.stringify(acknowledgment)})`, async function() {
      call.resolves(acknowledgment);
      const { actor, counts } = launch();
      await waitFor(actor, state => state.matches('error'), { timeout: 1000 });
      expect(actor.getSnapshot().context.errorMessage).to.contain('not acknowledged as saved');
      expect(isInputReady()).to.equal(false);
      expect(counts.evaluated).to.equal(0);
      expect(counts.advanced).to.equal(0);
      expect(ExperimentStateStore.get()).to.equal(undefined);
    });
  }

  it('permits input only after the required save is acknowledged', async function() {
    call.resolves({ id: 'synthetic-saved-state', currentTdfId: 'synthetic-lesson' });
    const { actor, counts } = launch();
    await waitFor(actor, state => state.matches('presenting.awaiting'), { timeout: 1000 });
    expect(ExperimentStateStore.get()?.id).to.equal('synthetic-saved-state');
    expect(isInputReady()).to.equal(false);
    actor.send({ type: EVENTS.TRIAL_REVEAL_STARTED, timestamp: 100 });
    expect(isInputReady()).to.equal(true);
    expect(counts.input).to.equal(1);
    expect(call.calledOnce).to.equal(true);
  });

  it('retains an early reveal while waiting for a successful save acknowledgment', async function() {
    let acknowledge!: (state: { id: string; currentTdfId: string }) => void;
    call.returns(new Promise(resolve => { acknowledge = resolve; }));
    const { actor, counts } = launch();
    await waitFor(actor, state => state.matches('presenting.displaying'), { timeout: 1000 });
    actor.send({ type: EVENTS.TRIAL_REVEAL_STARTED, timestamp: 100 });
    expect(isInputReady()).to.equal(false);
    expect(counts.timeout).to.equal(0);

    acknowledge({ id: 'synthetic-saved-state', currentTdfId: 'synthetic-lesson' });
    await waitFor(actor, state => state.matches('presenting.awaiting'), { timeout: 1000 });
    expect(isInputReady()).to.equal(true);
    expect(counts.input).to.equal(1);
    expect(counts.timeout).to.equal(1);
    expect(counts.evaluated).to.equal(0);
  });

  it('reuses saved resume state without attempting another initialization write', async function() {
    const saved = { id: 'synthetic-resume', currentTdfId: 'synthetic-lesson', currentUnitNumber: 2, clusterMapping: [1, 0], schedule: { q: ['saved'] } };
    ExperimentStateStore.set(saved);
    call.rejects(new Error('Resume must not rewrite the saved state'));
    const { actor } = launch();
    await waitFor(actor, state => state.matches('presenting.awaiting'), { timeout: 1000 });
    expect(call.called).to.equal(false);
    expect(ExperimentStateStore.get()).to.deep.equal(saved);
  });

  it('preserves progressive course transient state without requiring a persisted identity', async function() {
    Session.set('courseAssignmentLaunchContext', {
      assignmentId: 'synthetic-assignment', courseId: 'synthetic-course', TDFId: 'synthetic-lesson',
      launchSource: 'courses', launchMode: 'progressive', progressiveEndpointTdfId: 'synthetic-endpoint', progressiveRevisionId: 'synthetic-revision',
    });
    call.rejects(new Error('Progressive state must remain transient'));
    const { actor } = launch();
    await waitFor(actor, state => state.matches('presenting.awaiting'), { timeout: 1000 });
    expect(call.called).to.equal(false);
    expect(ExperimentStateStore.get()?.currentTdfId).to.equal('synthetic-lesson');
    expect(ExperimentStateStore.get()).not.to.have.property('id');
  });

  it('does not update the engine after a required transition save fails', async function() {
    ExperimentStateStore.set({ id: 'synthetic-resume', currentTdfId: 'synthetic-lesson' });
    call.rejects(new Error('Synthetic transition save failure'));
    const { actor, counts } = launch({ afterHistory: () => ExperimentStateStore.clear() });
    await waitFor(actor, state => state.matches('presenting.awaiting'), { timeout: 1000 });
    actor.send({ type: EVENTS.TRIAL_REVEAL_STARTED, timestamp: 100 });
    actor.send({ type: EVENTS.SUBMIT, userAnswer: 'Synthetic answer', timestamp: 200 });
    await waitFor(actor, state => state.matches('error'), { timeout: 1000 });
    expect(counts.evaluated).to.equal(1);
    expect(counts.history).to.equal(1);
    expect(counts.advanced).to.equal(0);
    expect(actor.getSnapshot().context.questionIndex).to.equal(3);
    expect(isInputReady()).to.equal(false);
  });
});
