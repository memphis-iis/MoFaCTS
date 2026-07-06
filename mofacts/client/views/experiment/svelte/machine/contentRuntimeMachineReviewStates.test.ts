import { expect } from 'chai';
import { EVENTS, STATES } from './constants';
import { contentRuntimeMachineReviewStates } from './contentRuntimeMachineReviewStates';

type StateNode = {
  initial?: string;
  invoke?: {
    id?: string;
    src?: string;
    onDone?: unknown;
  };
  on?: Record<string, unknown>;
  states?: Record<string, StateNode>;
  entry?: unknown[];
  always?: unknown;
  after?: Record<string, unknown>;
};

type Transition = {
  target: string;
  guard?: string;
  actions?: unknown[];
};

describe('card machine review states', function() {
  const studyState = contentRuntimeMachineReviewStates[STATES.STUDY] as unknown as StateNode;
  const feedbackState = contentRuntimeMachineReviewStates[STATES.FEEDBACK] as unknown as StateNode;

  it('prepares incoming trials during study and feedback review', function() {
    expect(studyState.invoke).to.deep.include({
      id: 'prepareIncomingDuringStudyService',
      src: 'prepareIncomingTrialService',
    });
    expect(feedbackState.invoke).to.deep.include({
      id: 'prepareIncomingDuringFeedbackService',
      src: 'prepareIncomingTrialService',
    });
  });

  it('routes study reveal to audio/TTS speaking before waiting', function() {
    const revealTransitions = studyState.states!.preparing!.on![EVENTS.TRIAL_REVEAL_STARTED] as Transition[];

    expect(revealTransitions[0]).to.deep.include({
      target: 'speaking',
      guard: 'hasQuestionAudio',
    });
    expect(revealTransitions[1]).to.deep.include({
      target: 'speaking',
      guard: 'ttsEnabled',
    });
    expect(revealTransitions[2]).to.deep.include({
      target: 'waiting',
    });
  });

  it('keeps skip-study mapped to the transition pipeline', function() {
    expect(studyState.on![EVENTS.SKIP_STUDY]).to.deep.equal({
      target: `#contentRuntimeMachine.${STATES.TRANSITION}`,
      actions: ['logStateTransition'],
    });
  });

  it('keeps feedback force-correct submission and timeout paths intact', function() {
    const forceCorrecting = feedbackState.states!.forceCorrecting!;

    expect(forceCorrecting.on![EVENTS.SUBMIT]).to.deep.equal({
      target: 'waiting',
      guard: 'isCorrectForceCorrection',
      actions: ['setReviewEntry', 'logStateTransition'],
    });
    expect(forceCorrecting.after!.FORCE_CORRECT_TIMEOUT).to.deep.equal({
      target: 'waiting',
      guard: 'isTimedPromptTrial',
    });
  });

  it('waits for feedback timeout before force-correcting or fading', function() {
    const feedbackTimeout = feedbackState.states!.waiting!.invoke as {
      id: string;
      src: string;
      onDone: Transition[];
    };

    expect(feedbackTimeout).to.deep.include({
      id: 'feedbackTimeout',
      src: 'feedbackTimeout',
    });
    expect(feedbackTimeout.onDone[0]).to.deep.include({
      target: 'forceCorrecting',
      guard: 'needsForceCorrectPrompt',
    });
    expect(feedbackTimeout.onDone[1]).to.deep.include({
      target: 'readyToFade',
    });
  });
});
