import { expect } from 'chai';
import {
  buildCardReadinessDiagnostic,
  getCardReadinessState,
  hasCardReadiness,
  hasDeliverySettingsReady,
  hasVideoSessionReadiness,
  waitForCardReadiness,
  type CardReadinessDependencies,
} from './cardReadiness';

describe('card readiness service', function() {
  it('requires non-empty delivery settings', function() {
    expect(hasDeliverySettingsReady(null)).to.equal(false);
    expect(hasDeliverySettingsReady({})).to.equal(false);
    expect(hasDeliverySettingsReady({ displayQuestionNumber: true })).to.equal(true);
  });

  it('treats non-video units as video-ready', function() {
    expect(hasVideoSessionReadiness(
      { unitname: 'Practice', learningsession: {} },
      null,
      {},
    )).to.equal(true);
  });

  it('requires matched video checkpoint arrays and video URL for video units', function() {
    const unit = { unitname: 'Video', videosession: {} };

    expect(hasVideoSessionReadiness(
      unit,
      { times: [10, 20], questions: [0] },
      { videoUrl: '/video.mp4' },
    )).to.equal(false);
    expect(hasVideoSessionReadiness(
      unit,
      { times: [10], questions: [0] },
      { videoUrl: '' },
    )).to.equal(false);
    expect(hasVideoSessionReadiness(
      unit,
      { times: [10], questions: [0] },
      { videoUrl: '/video.mp4' },
    )).to.equal(true);
  });

  it('summarizes card readiness state from injected runtime dependencies', function() {
    const deps: CardReadinessDependencies = {
      getCurrentTdfUnit: () => ({ unitname: 'Practice', learningsession: {} }),
      getDeliverySettings: () => ({ displayQuestionNumber: true }),
      getVideoCheckpoints: () => null,
    };

    expect(getCardReadinessState(deps)).to.deep.equal({
      hasCurrentTdfUnit: true,
      hasDeliverySettings: true,
      hasVideoReadiness: true,
      isVideoUnit: false,
    });
    expect(hasCardReadiness(deps)).to.equal(true);
  });

  it('polls until readiness is available', async function() {
    let attempts = 0;
    let currentTime = 0;
    const deps: CardReadinessDependencies = {
      getCurrentTdfUnit: () => ({ unitname: 'Practice', learningsession: {} }),
      getDeliverySettings: () => {
        attempts += 1;
        return attempts >= 3 ? { displayQuestionNumber: true } : {};
      },
      getVideoCheckpoints: () => null,
    };

    const ready = await waitForCardReadiness(
      deps,
      100,
      10,
      () => currentTime,
      async (delayMs) => {
        currentTime += delayMs;
      },
    );

    expect(ready).to.equal(true);
  });

  it('builds launch diagnostics without reading global state', function() {
    const diagnostic = buildCardReadinessDiagnostic({
      readiness: {
        hasCurrentTdfUnit: true,
        hasDeliverySettings: false,
        hasVideoReadiness: true,
        isVideoUnit: false,
      },
      currentTdfId: 'tdf-1',
      currentRootTdfId: undefined,
      currentStimuliSetId: 'stim-set-1',
      currentUnitNumber: 2,
      currentUnitName: 'Unit 3',
      deliverySettingsState: { displayQuestionNumber: true },
    });

    expect(diagnostic).to.deep.equal({
      hasCurrentTdfUnit: true,
      hasDeliverySettings: false,
      hasVideoReadiness: true,
      isVideoUnit: false,
      currentTdfId: 'tdf-1',
      currentRootTdfId: null,
      currentStimuliSetId: 'stim-set-1',
      currentUnitNumber: 2,
      currentUnitName: 'Unit 3',
      deliveryParamKeys: ['displayQuestionNumber'],
    });
  });
});
