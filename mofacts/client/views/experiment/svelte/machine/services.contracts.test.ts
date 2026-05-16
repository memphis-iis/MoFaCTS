import { expect } from 'chai';
import {
  createServices,
  getFeedbackTimeoutRemainingMs,
  getMainTimeoutRemainingMs,
  readyPromptDelayService,
  prestimulusDelayService,
  questionAudioGateService,
} from './services';

describe('machine services contracts', function() {
  it('exposes the expected actor map keys used by cardMachine', function() {
    const services = createServices();

    expect(services).to.have.property('historyLoggingService');
    expect(services).to.have.property('experimentStateService');
    expect(services).to.have.property('selectCardService');
    expect(services).to.have.property('updateEngineService');
    expect(services).to.have.property('prepareIncomingTrialService');
    expect(services).to.have.property('ttsService');
    expect(services).to.have.property('speechRecognitionService');
    expect(services).to.have.property('videoPlayerService');
    expect(services).to.have.property('evaluateAnswerService');
    expect(services).to.have.property('readyPromptDelayService');
    expect(services).to.have.property('prestimulusDelayService');
    expect(services).to.have.property('questionAudioGateService');
  });

  it('readyPromptDelayService returns delay contract payload', async function() {
    const result = await readyPromptDelayService({
      deliverySettings: { readyPromptStringDisplayTime: '0' },
    });

    expect(result).to.deep.equal({ delayMs: 0 });
  });

  it('prestimulusDelayService returns delay contract payload', async function() {
    const result = await prestimulusDelayService({
      deliverySettings: { prestimulusdisplaytime: '0' },
    });

    expect(result).to.deep.equal({ delayMs: 0 });
  });

  it('questionAudioGateService skips when no audio payload exists', async function() {
    const result = await questionAudioGateService({
      currentDisplay: { text: 'no audio' },
      deliverySettings: {},
    });

    expect(result).to.deep.equal({ skipped: true });
  });

  it('includes fade-out lead time in study countdown envelopes', function() {
    const remaining = getFeedbackTimeoutRemainingMs({
      testType: 's',
      deliverySettings: { purestudy: '30000' },
    }, 28000, 2000);

    expect(remaining).to.equal(0);
  });

  it('includes fade-out lead time in regular feedback countdown envelopes', function() {
    const remaining = getFeedbackTimeoutRemainingMs({
      testType: 'd',
      feedbackTimeoutMs: 10000,
    }, 7000, 2000);

    expect(remaining).to.equal(1000);
  });

  it('anchors response timeout to reveal start until input activity resets it', function() {
    const fromReveal = getMainTimeoutRemainingMs({
      testType: 'd',
      deliverySettings: { drill: '10000' },
      timestamps: { trialStart: 1000 },
    }, 4000);
    const fromReset = getMainTimeoutRemainingMs({
      testType: 'd',
      deliverySettings: { drill: '10000' },
      timestamps: { trialStart: 1000, timeoutStart: 3500 },
    }, 4000);

    expect(fromReveal).to.equal(7000);
    expect(fromReset).to.equal(9500);
  });
});

