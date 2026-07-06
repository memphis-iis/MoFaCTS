import { expect } from 'chai';
import { EVENTS, STATES } from './constants';
import { contentRuntimeMachineTransitionState } from './contentRuntimeMachineTransitionState';

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

describe('card machine transition state', function() {
  it('logs history before state and engine updates', function() {
    const loggingInvoke = contentRuntimeMachineTransitionState.states.logging.invoke as InvokeConfig;
    const updatingInvoke = contentRuntimeMachineTransitionState.states.updatingState.invoke as InvokeConfig;

    expect(loggingInvoke).to.deep.include({
      id: 'historyLoggingService',
      src: 'historyLoggingService',
    });
    expect(loggingInvoke.onDone).to.deep.include({
      target: 'updatingState',
    });
    expect(updatingInvoke).to.deep.include({
      id: 'experimentStateService',
      src: 'experimentStateService',
    });
    expect(updatingInvoke.onDone).to.deep.include({
      target: 'trackingPerformance',
    });
  });

  it('routes engine update results through finish, video, prepared, and default paths', function() {
    const trackingInvoke = contentRuntimeMachineTransitionState.states.trackingPerformance.invoke as InvokeConfig;
    const transitions = trackingInvoke.onDone as Transition[];

    expect(trackingInvoke).to.deep.include({
      id: 'updateEngineService',
      src: 'updateEngineService',
    });
    expect(transitions[0]!).to.deep.include({
      target: '#contentRuntimeMachine.transition.fadingOut',
    });
    expect(transitions[1]!).to.deep.include({
      target: '#contentRuntimeMachine.videoWaiting',
      guard: 'isVideoSession',
    });
    expect(transitions[2]!).to.deep.include({
      target: '#contentRuntimeMachine.transition.fadingOut',
      guard: 'hasPreparedTrial',
    });
    expect(transitions[3]!).to.deep.include({
      target: 'fadingOut',
    });
    expect(transitions[3]!.actions).to.deep.equal(['incrementQuestionIndex', 'logStateTransition']);
  });

  it('routes prepared incoming results by authored advance mode', function() {
    const prepareInvoke = contentRuntimeMachineTransitionState.states.prepareIncoming.invoke as InvokeConfig;
    const transitions = prepareInvoke.onDone as Transition[];

    expect(prepareInvoke).to.deep.include({
      id: 'prepareIncomingTrialService',
      src: 'prepareIncomingTrialService',
    });
    expect(transitions.map((transition) => transition.target)).to.deep.equal([
      'logging',
      'logging',
      'directAdvance',
      'seamlessAdvance',
    ]);
  });

  it('commits prepared trials on transition completion before displaying', function() {
    const transitions = contentRuntimeMachineTransitionState.states.fadingOut.on[EVENTS.TRANSITION_COMPLETE] as Transition[];

    expect(transitions[0]!).to.deep.include({
      target: `#contentRuntimeMachine.${STATES.PRESENTING}.${STATES.DISPLAYING}`,
      guard: 'hasPreparedTrial',
    });
    expect(transitions[0]!.actions).to.include('commitPreparedTrialRuntime');
    expect(transitions[0]!.actions).to.include('setDisplayReady');
    expect(transitions[1]).to.deep.equal({
      target: 'clearing',
      actions: ['logStateTransition'],
    });
  });

  it('clears runtime state before finishing, video resume, or next presentation', function() {
    const clearing = contentRuntimeMachineTransitionState.states.clearing;

    expect(clearing.entry).to.include('setDisplayNotReady');
    expect(clearing.entry).to.include('resetTimers');
    expect(clearing.always[0]).to.deep.include({
      guard: 'unitFinished',
    });
    expect(clearing.always[1]).to.deep.include({
      guard: 'isVideoSession',
      target: '#contentRuntimeMachine.videoWaiting',
    });
    expect(clearing.always[2]).to.deep.include({
      target: `#contentRuntimeMachine.${STATES.PRESENTING}`,
    });
  });
});
