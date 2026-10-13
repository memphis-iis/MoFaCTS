import { expect } from 'chai';
import { createActor, createMachine } from 'xstate';
import {
  resolvePreparedQuestionIndex,
  resolvePreparedQuestionIndexRoute,
  resolveSelectedQuestionIndex,
  storePreparedIncomingTrial,
} from './preparedAdvanceMachine';
import { commitPreparedTrialToActiveContext } from './trialContextMachine';
import { initialContext } from './contentRuntimeMachineTypes';
import type { ContentRuntimeMachineContext, CardSelectionDoneArgs } from './contentRuntimeMachineTypes';

describe('prepared advance machine helpers', function() {
  it('keeps the active answer-list identity until the prepared trial is committed', function() {
    const activeButtons = [{ buttonName: 'A', buttonValue: 'A', verbalChoice: 'a', isImage: false }];
    const incomingButtons = activeButtons.map(button => ({ ...button }));
    const actor = createActor(createMachine({
      context: { ...initialContext, buttonList: activeButtons },
      on: {
        PREPARED: { actions: storePreparedIncomingTrial },
        COMMIT: { actions: commitPreparedTrialToActiveContext },
      },
    }));
    actor.start();
    try {
      actor.send({ type: 'PREPARED', output: {
        currentDisplay: { text: 'Next question' },
        buttonList: incomingButtons,
        preparedAdvanceMode: 'direct',
        testType: 't',
      } });
      expect(actor.getSnapshot().context.buttonList).to.equal(activeButtons);
      expect(actor.getSnapshot().context.preparedTrial?.buttonList).to.equal(incomingButtons);
      actor.send({ type: 'COMMIT' });
      expect(actor.getSnapshot().context.buttonList).to.equal(incomingButtons);
      expect(actor.getSnapshot().context.preparedTrial).to.equal(null);
    } finally {
      actor.stop();
    }
  });

  it('names question-index routing by transition behavior', function() {
    expect(resolvePreparedQuestionIndexRoute({ unitType: 'schedule' })).to.equal('schedule-live-index');
    expect(resolvePreparedQuestionIndexRoute({ unitType: 'model' })).to.equal('context-counter');
    expect(resolvePreparedQuestionIndexRoute({ unitType: 'video' })).to.equal('context-counter');
    expect(resolvePreparedQuestionIndexRoute(null)).to.equal('context-counter');
  });

  it('requires live selected question index for schedule card selection', function() {
    expect(resolveSelectedQuestionIndex(
      { questionIndex: 2, engine: { unitType: 'schedule' } } as ContentRuntimeMachineContext,
      { output: { questionIndex: 7 } } as CardSelectionDoneArgs['event'],
    )).to.equal(7);

    expect(() => resolveSelectedQuestionIndex(
      { questionIndex: 2, engine: { unitType: 'schedule' } } as ContentRuntimeMachineContext,
      { output: {} } as CardSelectionDoneArgs['event'],
    )).to.throw(/live questionIndex/);
  });

  it('uses the context counter when selected non-schedule output omits question index', function() {
    expect(resolveSelectedQuestionIndex(
      { questionIndex: 3, engine: { unitType: 'model' } } as ContentRuntimeMachineContext,
      { output: {} } as CardSelectionDoneArgs['event'],
    )).to.equal(3);
  });

  it('requires live prepared question index for schedule prepared transitions', function() {
    expect(resolvePreparedQuestionIndex({
      questionIndex: 2,
      engine: { unitType: 'schedule' },
      preparedTrial: {
        questionIndex: 9,
        engine: { unitType: 'schedule' },
      },
    } as ContentRuntimeMachineContext)).to.equal(9);

    expect(() => resolvePreparedQuestionIndex({
      questionIndex: 2,
      engine: { unitType: 'schedule' },
      preparedTrial: {
        engine: { unitType: 'schedule' },
      },
    } as ContentRuntimeMachineContext)).to.throw(/Prepared schedule transition/);
  });
});
