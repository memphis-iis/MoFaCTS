import { expect } from 'chai';
import { EVENTS, STATES } from './constants';
import { contentRuntimeMachineGlobalHandlers } from './contentRuntimeMachineGlobalHandlers';

type Transition = {
  target: string;
  guard?: string;
  actions: unknown[];
};

describe('card machine global handlers', function() {
  it('keeps soft errors recoverable and hard errors terminal', function() {
    const errorTransitions = contentRuntimeMachineGlobalHandlers[EVENTS.ERROR] as Transition[];

    expect(errorTransitions[0]!).to.deep.include({
      target: `#contentRuntimeMachine.${STATES.TRANSITION}`,
      guard: 'isSoftError',
    });
    expect(errorTransitions[0]!.actions).to.deep.equal(['logError', 'logStateTransition']);

    expect(errorTransitions[1]!).to.deep.include({
      target: `#contentRuntimeMachine.${STATES.ERROR}`,
      guard: 'isHardError',
    });
    expect(errorTransitions[1]!.actions).to.include('logStateTransition');
  });

  it('routes external unit completion back to idle', function() {
    const unitFinished = contentRuntimeMachineGlobalHandlers[EVENTS.UNIT_FINISHED] as Transition;

    expect(unitFinished.target).to.equal(`#contentRuntimeMachine.${STATES.IDLE}`);
    expect(unitFinished.actions).to.include('logStateTransition');
  });

  it('applies SPARC action results without leaving the active card state', function() {
    const sparcAction = contentRuntimeMachineGlobalHandlers[EVENTS.SPARC_ACTION] as Transition;

    expect(sparcAction.target).to.equal(undefined);
    expect(sparcAction.actions).to.deep.equal(['applySparcActionResult', 'logStateTransition']);
  });

  it('treats top-level video checkpoints as unexpected errors', function() {
    const videoCheckpoint = contentRuntimeMachineGlobalHandlers[EVENTS.VIDEO_CHECKPOINT] as Transition;

    expect(videoCheckpoint.target).to.equal(`#contentRuntimeMachine.${STATES.ERROR}`);
    expect(videoCheckpoint.actions).to.include('logError');
    expect(videoCheckpoint.actions).to.include('logStateTransition');
  });
});
