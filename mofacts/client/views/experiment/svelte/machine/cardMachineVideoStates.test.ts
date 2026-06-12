import { expect } from 'chai';
import { EVENTS, STATES } from './constants';
import { cardMachineVideoStates } from './cardMachineVideoStates';

type VideoTransition = {
  target: string;
  guard?: string;
  actions: unknown[];
};

describe('card machine video states', function() {
  it('routes accepted checkpoints back into presenting and rejects invalid checkpoints clearly', function() {
    const checkpointTransitions = cardMachineVideoStates.videoWaiting.on[EVENTS.VIDEO_CHECKPOINT] as VideoTransition[];

    expect(checkpointTransitions[0]!).to.deep.include({
      target: `#cardMachine.${STATES.PRESENTING}`,
      guard: 'canAcceptVideoCheckpoint',
    });
    expect(checkpointTransitions[0]!.actions).to.include('logStateTransition');
    expect(checkpointTransitions[1]!).to.deep.include({
      target: `#cardMachine.${STATES.ERROR}`,
    });
    expect(checkpointTransitions[1]!.actions).to.include('logError');
  });

  it('marks video completion only for video sessions', function() {
    const videoEndedTransition = cardMachineVideoStates.videoWaiting.on[EVENTS.VIDEO_ENDED] as VideoTransition;

    expect(videoEndedTransition).to.deep.include({
      target: 'videoEnded',
      guard: 'isVideoSession',
    });
    expect(videoEndedTransition.actions).to.include('logStateTransition');
  });

  it('keeps video continue mapped to unit completion', function() {
    expect(cardMachineVideoStates.videoEnded.on[EVENTS.VIDEO_CONTINUE]).to.deep.equal({
      actions: ['handleUnitCompletion', 'logStateTransition'],
    });
  });
});
