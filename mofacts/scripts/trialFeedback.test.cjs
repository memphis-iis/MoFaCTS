// Pure learner feedback, presentation and assessment tests. DDP integration belongs to CI.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const nodeTest = require('node:test');
const Module = require('node:module');

// Only logging and unrelated global state are isolated; the tested feedback,
// XState transitions, assessment engine, and player bridge are the real modules.
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'meteor/session') {
    return { Session: { get: () => undefined } };
  }
  if (request.endsWith('/clientLogger') || request === './clientLogger') {
    return { clientConsole: () => undefined };
  }
  if (request === './guards' && parent.filename.endsWith('contentRuntimeMachineTransitionGuards.ts')) {
    return {}; // Question/audio guards are not exercised by the video transition tests below.
  }
  if (request === '../services/cardRuntimeState' && parent.filename.endsWith('contentRuntimeMachineServiceInputs.ts')) {
    return { getOverallOutcomeHistory: () => [] };
  }
  return originalLoad.call(this, request, parent, isMain);
};

for (const name of ['describe', 'it', 'beforeEach', 'afterEach']) global[name] = nodeTest[name];
require.extensions['.ts'] = (module, filename) => {
  module.paths.push(path.resolve(__dirname, '../node_modules'));
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText, filename);
};
for (const filename of [
  '../client/views/experiment/svelte/services/trialFeedbackHistory.test.ts',
  '../client/views/experiment/svelte/services/activeTrialDisplayState.test.ts',
  '../client/views/experiment/svelte/services/incomingTrialSlotDisplay.test.ts',
  '../client/views/experiment/svelte/services/incomingTrialSlotController.test.ts',
  '../client/views/experiment/svelte/services/trialFadeTransitionController.test.ts',
  '../client/views/experiment/svelte/machine/contentRuntimeMachineTransitionState.test.ts',
  '../client/views/experiment/svelte/services/flashcardControllerProps.test.ts',
  '../client/views/experiment/svelte/services/flashcardReviewEventController.test.ts',
  '../common/fieldRegistrySections.test.ts',
  '../common/lib/deliverySettings.test.ts',
  '../client/lib/deliverySettingsValidator.test.ts',
  '../client/lib/deliverySettingsResolver.test.ts',
  '../client/lib/instructionLaunchMapping.test.ts',
  '../client/views/experiment/assessmentPreparedInput.test.ts',
  '../client/views/experiment/assessmentSettings.contracts.test.ts',
  '../../learning-components/runtime/blocksGameEngine.test.ts',
]) require(path.resolve(__dirname, filename));

const assert = require('node:assert/strict');
const { createMachine, createActor, fromPromise, waitFor, SimulatedClock } = require('xstate');
const { contentRuntimeMachineTransitionState } = require('../client/views/experiment/svelte/machine/contentRuntimeMachineTransitionState.ts');
const { buildTrialFeedbackHistory } = require('../client/views/experiment/svelte/services/trialFeedbackHistory.ts');
const { createVideoMachineBridge } = require('../client/views/experiment/svelte/services/videoMachineBridge.ts');
const { createTrialFadeTransitionController } = require('../client/views/experiment/svelte/services/trialFadeTransitionController.ts');

function fadeMachineHarness() {
  let finish, fail, signal, actor;
  let opacity = '1';
  let commits = 0;
  let handoffs = 0;
  let failure;
  const finished = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  const element = { isConnected: true, getAnimations: () => [{ transitionProperty: 'opacity',
    effect: { target: element, pseudoElement: null }, finished }] };
  const controller = createTrialFadeTransitionController({
    getFadeElement: () => element, getComputedOpacity: () => opacity,
    getFadeContext: () => ({ key: 'synthetic', subsetKind: 'feedback', configuredDurationMs: 200, visibleSetAt: 1 }),
    getRuntimeState: () => ({ isFadingOut: actor.getSnapshot().matches('transition.fadingOut'),
      isPreparedFadingOut: true, isTestMode: false, trialContentVisible: true,
      feedbackReadyForPreparedHandoff: true, stimulusReadyForPreparedHandoff: true }),
    log: () => undefined, now: () => 0, waitForDomUpdate: async () => undefined,
    markPreparedHandoffOnNextReveal: () => { handoffs++; },
  });
  const machine = createMachine({ id: 'contentRuntimeMachine', initial: 'transition',
    context: { questionIndex: 1, preparedTrial: { currentDisplay: { text: 'Next card' }, questionIndex: 2 } },
    on: { QUIT: '.exited' },
    states: {
      transition: { initial: 'fadingOut', states: {
        fadingOut: contentRuntimeMachineTransitionState.states.fadingOut, clearing: {} } },
      presenting: { initial: 'displaying', states: { displaying: {}, blocksBoard: {} } }, error: {}, exited: {},
    },
  }, {
    actors: { waitForTrialFadeOut: fromPromise(({ signal: invocationSignal }) => {
      signal = invocationSignal; return controller.waitForFadeOut(signal);
    }) },
    guards: { shouldEnterBlocksBoardFromPreparedAdvance: () => false, hasPreparedTrial: () => true },
    actions: { commitPreparedTrialRuntime: () => { commits++; }, setErrorMessage: ({ event }) => { failure = event.error; } },
  });
  const clock = new SimulatedClock();
  actor = createActor(machine, { clock });
  actor.start();
  return { actor, clock, finish: () => { opacity = '0'; finish(); }, fail,
    signal: () => signal, commits: () => commits, handoffs: () => handoffs, failure: () => failure };
}

nodeTest.test('fade actor waits through throttled rendering beyond the old deadline and commits exactly once', async () => {
  const h = fadeMachineHarness();
  try {
    await Promise.resolve();
    h.clock.increment(5000);
    assert.ok(h.actor.getSnapshot().matches('transition.fadingOut'));
    assert.equal(h.commits(), 0);
    h.finish();
    await waitFor(h.actor, state => state.matches('presenting.displaying'));
    assert.equal(h.commits(), 1);
    assert.equal(h.handoffs(), 1);
    assert.equal(h.actor.getSnapshot().context.questionIndex, 2);
    h.finish();
    await Promise.resolve();
    assert.equal(h.commits(), 1);
  } finally { h.actor.stop(); }
});

nodeTest.test('leaving fadingOut aborts its actor and prevents a late commit or handoff', async () => {
  const h = fadeMachineHarness();
  try {
    await Promise.resolve();
    h.actor.send({ type: 'QUIT' });
    assert.equal(h.signal().aborted, true);
    h.finish();
    await Promise.resolve();
    await Promise.resolve();
    assert.ok(h.actor.getSnapshot().matches('exited'));
    assert.equal(h.commits(), 0);
    assert.equal(h.handoffs(), 0);
  } finally { h.actor.stop(); }
});

nodeTest.test('an unexpectedly cancelled animation takes the machine error path without committing', async () => {
  const h = fadeMachineHarness();
  try {
    await Promise.resolve();
    h.fail(new Error('Outgoing animation cancelled'));
    await waitFor(h.actor, state => state.matches('error'));
    assert.match(h.failure().message, /Outgoing animation cancelled/);
    assert.equal(h.commits(), 0);
    assert.equal(h.handoffs(), 0);
  } finally { h.actor.stop(); }
});

for (const isCorrect of [true, false]) {
  for (const duration of [0, 2000]) {
    nodeTest.test(`video resumes after durable ${isCorrect ? 'correct' : 'incorrect'} answer logging with ${duration}ms feedback`, async () => {
      const operations = [];
      let record;
      let actor;
      const bridge = createVideoMachineBridge({
        getCurrentState: () => actor.getSnapshot().value,
        getRewindOnIncorrectEnabled: () => false,
        getVideoCheckpoints: () => ({ times: [63, 88] }),
        getVideoPlayer: () => ({ resumeAfterQuestion: () => { operations.push('resume'); } }),
        log: () => undefined,
        scheduleRetry: () => { throw new Error('Expected resume in videoWaiting'); },
        stateMatches: (state) => actor.getSnapshot().matches(state),
        waitForDomUpdate: async () => undefined,
      });
      const machine = createMachine({
        id: 'contentRuntimeMachine', initial: 'transition',
        context: {
          testType: 'd', isCorrect,
          deliverySettings: { isVideoSession: true, correctprompt: duration, reviewstudy: duration },
          feedbackText: duration > 0 ? 'Feedback.' : '',
          incomingPreparationComplete: true,
          videoSession: { isActive: false, currentCheckpointIndex: 0, pendingQuestionIndex: 0, ended: false },
          timestamps: { trialStart: 1, trialEnd: 2 },
        },
        states: {
          transition: contentRuntimeMachineTransitionState,
          videoWaiting: {}, error: {},
          presenting: { initial: 'displaying', states: { displaying: {}, blocksBoard: {} } },
        },
      }).provide({
        actors: {
          historyLoggingService: fromPromise(async ({ input }) => {
            record = buildTrialFeedbackHistory(input.context);
            operations.push('history');
          }),
          experimentStateService: fromPromise(async () => { operations.push('state'); }),
          updateEngineService: fromPromise(async () => { operations.push('engine'); return { unitFinished: false }; }),
        },
        guards: { isVideoSession: () => true, hasPreparedTrial: () => false },
        actions: Object.fromEntries([
          'markFeedbackEnd', 'markTrialEnd', 'logStateTransition', 'incrementQuestionIndex', 'clearFeedback', 'resetTimers', 'logError',
        ].map(name => [name, () => undefined]).concat([['resumeVideoPlayback', () => bridge.requestResume('test')]])),
      });
      actor = createActor(machine).start();
      try {
        await waitFor(actor, state => state.matches('videoWaiting'), { timeout: 1000 });
        await bridge.flushPendingResume('test-completion');
        assert.deepEqual(operations, ['history', 'state', 'engine', 'resume']);
        assert.deepEqual(record, duration > 0
          ? { feedbackText: 'Feedback.', feedbackType: isCorrect ? 'correct' : 'incorrect' }
          : { feedbackText: '', feedbackType: '' });
        assert.equal(actor.getSnapshot().context.videoSession.pendingQuestionIndex, null);
      } finally { actor.stop(); }
    });
  }
}
