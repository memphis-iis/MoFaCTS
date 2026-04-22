import { expect } from 'chai';
import {
  createServices,
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
      deliveryParams: { readyPromptStringDisplayTime: '0' },
    });

    expect(result).to.deep.equal({ delayMs: 0 });
  });

  it('prestimulusDelayService returns delay contract payload', async function() {
    const result = await prestimulusDelayService({
      deliveryParams: { prestimulusdisplaytime: '0' },
    });

    expect(result).to.deep.equal({ delayMs: 0 });
  });

  it('questionAudioGateService skips when no audio payload exists', async function() {
    const result = await questionAudioGateService({
      currentDisplay: { text: 'no audio' },
      deliveryParams: {},
    });

    expect(result).to.deep.equal({ skipped: true });
  });
});

