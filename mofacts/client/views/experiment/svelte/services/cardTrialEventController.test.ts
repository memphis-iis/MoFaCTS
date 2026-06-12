import { expect } from 'chai';
import { createCardTrialEventController, type CardTrialMachineEvent } from './cardTrialEventController';

describe('cardTrialEventController', () => {
  it('translates submit and choice UI events into machine submit events', () => {
    const sent: CardTrialMachineEvent[] = [];
    const controller = createCardTrialEventController({
      getContext: () => ({}),
      loadTtsPlayback: async () => () => undefined,
      send: (event) => sent.push(event),
    });

    controller.handleSubmit({ detail: { answer: 'typed', timestamp: 10 } });
    controller.handleChoice({ detail: { answer: 'clicked', timestamp: 20 } });

    expect(sent).to.deep.equal([
      {
        type: 'SUBMIT',
        userAnswer: 'typed',
        timestamp: 10,
        source: 'keypress',
      },
      {
        type: 'SUBMIT',
        userAnswer: 'clicked',
        timestamp: 20,
        source: 'buttonClick',
      },
    ]);
  });

  it('translates first-keypress and skip-study events', () => {
    const sent: CardTrialMachineEvent[] = [];
    const controller = createCardTrialEventController({
      getContext: () => ({}),
      loadTtsPlayback: async () => () => undefined,
      send: (event) => sent.push(event),
    });

    controller.handleFirstKeypress({ detail: { timestamp: 15 } });
    controller.handleSkipStudy();

    expect(sent).to.deep.equal([
      {
        type: 'FIRST_KEYPRESS',
        timestamp: 15,
      },
      {
        type: 'SKIP_STUDY',
      },
    ]);
  });

  it('plays replay audio with question SR restart options', async () => {
    const calls: unknown[] = [];
    const context = { currentAnswer: 'A' };
    const controller = createCardTrialEventController({
      getContext: () => context,
      loadTtsPlayback: async () => (playContext, options) => {
        calls.push({ playContext, options });
      },
      send: () => undefined,
    });

    await controller.handleReplay({ detail: { audioSrc: '/audio/prompt.mp3' } });

    expect(calls).to.deep.equal([
      {
        playContext: context,
        options: {
          audioSrc: '/audio/prompt.mp3',
          isQuestion: true,
          autoRestartSr: true,
        },
      },
    ]);
  });

  it('ignores replay events without an audio source', async () => {
    let loadCount = 0;
    const controller = createCardTrialEventController({
      getContext: () => ({}),
      loadTtsPlayback: async () => {
        loadCount += 1;
        return () => undefined;
      },
      send: () => undefined,
    });

    await controller.handleReplay({ detail: {} });

    expect(loadCount).to.equal(0);
  });
});
