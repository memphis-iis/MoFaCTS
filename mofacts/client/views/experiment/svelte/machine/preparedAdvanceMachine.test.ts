import { expect } from 'chai';
import {
  resolvePreparedQuestionIndex,
  resolvePreparedQuestionIndexRoute,
  resolveSelectedQuestionIndex,
} from './preparedAdvanceMachine';
import type { CardMachineContext, CardSelectionDoneArgs } from './cardMachineTypes';

describe('prepared advance machine helpers', function() {
  it('names question-index routing by transition behavior', function() {
    expect(resolvePreparedQuestionIndexRoute({ unitType: 'schedule' })).to.equal('schedule-live-index');
    expect(resolvePreparedQuestionIndexRoute({ unitType: 'model' })).to.equal('context-counter');
    expect(resolvePreparedQuestionIndexRoute({ unitType: 'video' })).to.equal('context-counter');
    expect(resolvePreparedQuestionIndexRoute(null)).to.equal('context-counter');
  });

  it('requires live selected question index for schedule card selection', function() {
    expect(resolveSelectedQuestionIndex(
      { questionIndex: 2, engine: { unitType: 'schedule' } } as CardMachineContext,
      { output: { questionIndex: 7 } } as CardSelectionDoneArgs['event'],
    )).to.equal(7);

    expect(() => resolveSelectedQuestionIndex(
      { questionIndex: 2, engine: { unitType: 'schedule' } } as CardMachineContext,
      { output: {} } as CardSelectionDoneArgs['event'],
    )).to.throw(/live questionIndex/);
  });

  it('uses the context counter when selected non-schedule output omits question index', function() {
    expect(resolveSelectedQuestionIndex(
      { questionIndex: 3, engine: { unitType: 'model' } } as CardMachineContext,
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
    } as CardMachineContext)).to.equal(9);

    expect(() => resolvePreparedQuestionIndex({
      questionIndex: 2,
      engine: { unitType: 'schedule' },
      preparedTrial: {
        engine: { unitType: 'schedule' },
      },
    } as CardMachineContext)).to.throw(/Prepared schedule transition/);
  });
});
