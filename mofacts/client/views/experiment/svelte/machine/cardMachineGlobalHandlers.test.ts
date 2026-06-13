import { expect } from 'chai';
import { EVENTS, STATES } from './constants';
import { cardMachineGlobalHandlers } from './cardMachineGlobalHandlers';

type Transition = {
  target: string;
  guard?: string;
  actions: unknown[];
};

describe('card machine global handlers', function() {
  it('keeps soft errors recoverable and hard errors terminal', function() {
    const errorTransitions = cardMachineGlobalHandlers[EVENTS.ERROR] as Transition[];

    expect(errorTransitions[0]!).to.deep.include({
      target: `#cardMachine.${STATES.TRANSITION}`,
      guard: 'isSoftError',
    });
    expect(errorTransitions[0]!.actions).to.deep.equal(['logError', 'logStateTransition']);

    expect(errorTransitions[1]!).to.deep.include({
      target: `#cardMachine.${STATES.ERROR}`,
      guard: 'isHardError',
    });
    expect(errorTransitions[1]!.actions).to.include('logStateTransition');
  });

  it('routes external unit completion back to idle', function() {
    const unitFinished = cardMachineGlobalHandlers[EVENTS.UNIT_FINISHED] as Transition;

    expect(unitFinished.target).to.equal(`#cardMachine.${STATES.IDLE}`);
    expect(unitFinished.actions).to.include('logStateTransition');
  });

  it('applies SPARC action results without leaving the active card state', function() {
    const sparcAction = cardMachineGlobalHandlers[EVENTS.SPARC_ACTION] as Transition;

    expect(sparcAction.target).to.equal(undefined);
    expect(sparcAction.actions).to.deep.equal(['applySparcActionResult', 'logStateTransition']);
  });

  it('treats top-level video checkpoints as unexpected errors', function() {
    const videoCheckpoint = cardMachineGlobalHandlers[EVENTS.VIDEO_CHECKPOINT] as Transition;

    expect(videoCheckpoint.target).to.equal(`#cardMachine.${STATES.ERROR}`);
    expect(videoCheckpoint.actions).to.include('logError');
    expect(videoCheckpoint.actions).to.include('logStateTransition');
  });
});
