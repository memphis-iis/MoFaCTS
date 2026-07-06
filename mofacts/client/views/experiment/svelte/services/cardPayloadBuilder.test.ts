import { expect } from 'chai';
import { Session } from 'meteor/session';
import type { UnitEngineLike } from '../../../../../common/types';
import {
  firstNonEmptyString,
  getPreparedCardDataFromSelection,
  getStimIncorrectResponses,
  normalizeButtonOptions,
  normalizeDisplayAttribution,
  resolveCardPayloadDeliverySettings,
  resolveStimMediaSource,
  shouldUseScheduleButtonTrial,
} from './cardPayloadBuilder';

describe('card payload builder helpers', function() {
  it('uses the first non-empty string candidate', function() {
    expect(firstNonEmptyString('', '  ', 'image.png', 'other.png')).to.equal('image.png');
    expect(firstNonEmptyString(null, undefined)).to.equal('');
  });

  it('resolves media source from display before legacy stimulus fields', function() {
    expect(resolveStimMediaSource({
      display: { imgSrc: 'display.png' },
      imageStimulus: 'legacy.png',
    }, 'image')).to.equal('display.png');
    expect(resolveStimMediaSource({
      audioStimulus: 'legacy.mp3',
    }, 'audio')).to.equal('legacy.mp3');
  });

  it('normalizes button options and incorrect responses', function() {
    expect(normalizeButtonOptions('alpha, beta ,, gamma')).to.deep.equal(['alpha', 'beta', 'gamma']);
    expect(normalizeButtonOptions(['a', 'b'])).to.deep.equal(['a', 'b']);
    expect(getStimIncorrectResponses({
      response: { incorrectResponses: 'x, y' },
    })).to.deep.equal(['x', 'y']);
  });

  it('keeps only populated attribution fields', function() {
    expect(normalizeDisplayAttribution(
      { creatorName: ' ', sourceName: 'Source' },
      { licenseUrl: 'https://license.test' },
    )).to.deep.equal({
      sourceName: 'Source',
      licenseUrl: 'https://license.test',
    });
    expect(normalizeDisplayAttribution({ creatorName: ' ' })).to.equal(undefined);
  });

  it('uses the session surface adapter to preserve active video delivery settings', function() {
    expect(resolveCardPayloadDeliverySettings({
      baseDeliverySettings: { displayQuestionNumber: true },
      existingDeliverySettings: { videoUrl: '/video.mp4' },
      sessionIsVideoSession: true,
    })).to.deep.equal({
      displayQuestionNumber: true,
      isVideoSession: true,
      videoUrl: '/video.mp4',
    });
    expect(resolveCardPayloadDeliverySettings({
      baseDeliverySettings: { isVideoSession: true, videoUrl: '/tdf-video.mp4' },
      existingDeliverySettings: { videoUrl: '/store-video.mp4' },
    })).to.deep.equal({
      isVideoSession: true,
      videoUrl: '/tdf-video.mp4',
    });
    expect(resolveCardPayloadDeliverySettings({
      baseDeliverySettings: { displayQuestionNumber: true },
      existingDeliverySettings: { videoUrl: '/video.mp4' },
      sessionIsVideoSession: false,
    })).to.deep.equal({
      displayQuestionNumber: true,
    });
  });

  it('keeps schedule button-trial policy behind a named assessment boundary', function() {
    expect(shouldUseScheduleButtonTrial({
      currentUnit: { assessmentsession: {} },
      schedule: { isButtonTrial: true },
    })).to.equal(true);

    expect(shouldUseScheduleButtonTrial({
      currentUnit: {},
      schedule: { isButtonTrial: true },
    })).to.equal(false);

    expect(shouldUseScheduleButtonTrial({
      currentUnit: { assessmentsession: {} },
      schedule: { isButtonTrial: false },
    })).to.equal(false);
  });

  it('preserves structured SPARC displays instead of flattening them to legacy prompt fields', function() {
    const originalGet = {
      currentTdfFile: Session.get('currentTdfFile'),
      currentStimuliSetId: Session.get('currentStimuliSetId'),
      testType: Session.get('testType'),
    };

    Session.set('currentTdfFile', { tdfs: { tutor: { setspec: {} } } });
    Session.set('currentStimuliSetId', 'set-1');
    Session.set('testType', 'd');

    const engine = {
      findCurrentCardInfo() {
        return { whichStim: 0, clusterIndex: 0 };
      },
    } satisfies UnitEngineLike;

    const sparcDisplay = {
      schema: 'tutorscript-sparc/1.0',
      nodes: [{ id: 'node-1', nodeType: 'atomic', atomType: 'text-input', value: '' }],
      response: { gradingMode: 'node-intent', scoredNodes: ['node-1'], intentByNode: [{ node: 'node-1', expected: '2' }] },
    };

    const selection = {
      clusterIndex: 0,
      stimIndex: 0,
      preparedState: {
        currentDisplay: sparcDisplay,
        currentAnswer: '',
        newExperimentState: {},
      },
    };

    const cluster = {
      stims: [{ display: sparcDisplay, correctResponse: '' }],
    };

    const globalWithStimCluster = globalThis as typeof globalThis & {
      getStimCluster: (() => typeof cluster) | undefined;
    };
    const originalGetStimCluster = globalWithStimCluster.getStimCluster;
    globalWithStimCluster.getStimCluster = () => cluster;

    try {
      const result = getPreparedCardDataFromSelection(engine, selection, 1) as Record<string, unknown>;
      expect(result.currentDisplay).to.deep.equal(sparcDisplay);
    } finally {
      globalWithStimCluster.getStimCluster = originalGetStimCluster;
      Session.set('currentTdfFile', originalGet.currentTdfFile);
      Session.set('currentStimuliSetId', originalGet.currentStimuliSetId);
      Session.set('testType', originalGet.testType);
    }
  });
});
