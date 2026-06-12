import { expect } from 'chai';
import { createCardTextInputController } from './cardTextInputController';

function createHarness() {
  let statePath = 'presenting.awaiting';
  const context: { timestamps?: { trialStart?: unknown }; userAnswer?: unknown } = {
    timestamps: {
      trialStart: 100,
    },
  };
  let textAnswer = 'initial';
  const sent: Array<{ type: 'INPUT_ACTIVITY'; timestamp: number }> = [];
  const controller = createCardTextInputController({
    getContext: () => context,
    getState: () => ({
      matches: (path) => path === statePath,
    }),
    now: () => 999,
    send: (event) => sent.push(event),
    setContextUserAnswer: (value) => {
      context.userAnswer = value;
    },
    setTextAnswer: (value) => {
      textAnswer = value;
    },
  });

  return {
    context,
    controller,
    sent,
    setStatePath: (path: string) => {
      statePath = path;
    },
    setTrialStart: (trialStart: unknown) => {
      context.timestamps = { trialStart };
    },
    textAnswer: () => textAnswer,
  };
}

describe('card text input controller', function() {
  it('updates local and context answer from input detail', function() {
    const harness = createHarness();

    harness.controller.handleInput({ value: 'alpha' });

    expect(harness.textAnswer()).to.equal('alpha');
    expect(harness.context.userAnswer).to.equal('alpha');
  });

  it('clears local text while loading or clearing runtime states', function() {
    const harness = createHarness();
    harness.controller.handleInput({ value: 'alpha' });

    harness.setStatePath('presenting.loading');
    harness.controller.resetForRuntimeState();

    expect(harness.textAnswer()).to.equal('');
  });

  it('clears local and context answers once when trial start changes', function() {
    const harness = createHarness();
    harness.controller.handleInput({ value: 'alpha' });

    harness.controller.syncTrialStart();
    harness.controller.handleInput({ value: 'beta' });
    harness.controller.syncTrialStart();

    expect(harness.textAnswer()).to.equal('beta');
    expect(harness.context.userAnswer).to.equal('beta');

    harness.setTrialStart(200);
    harness.controller.syncTrialStart();

    expect(harness.textAnswer()).to.equal('');
    expect(harness.context.userAnswer).to.equal('');
  });

  it('emits input activity only while awaiting and defaults missing timestamps', function() {
    const harness = createHarness();

    harness.controller.handleInputActivity({ timestamp: 123 });
    harness.controller.handleInputActivity({});
    harness.setStatePath('feedback.waiting');
    harness.controller.handleInputActivity({ timestamp: 456 });

    expect(harness.sent).to.deep.equal([
      { type: 'INPUT_ACTIVITY', timestamp: 123 },
      { type: 'INPUT_ACTIVITY', timestamp: 999 },
    ]);
  });
});
