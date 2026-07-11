import assert from 'node:assert/strict';
import {
  collectCurrentStimulusAnswers,
  interpretRuntimeStimulusClusters,
  resolveStimulusAnswerDisplayCase,
} from './runtimeStimulusInterpretation';

describe('runtime stimulus interpretation', function() {
  it('preserves nested source identity and flat runtime metadata by position', function() {
    const clusters = interpretRuntimeStimulusClusters({
      tdfFile: {
        stimuliSetId: 'set-a',
        rawStimuliFile: { setspec: { clusters: [{
          clusterKC: 'kc-a',
          stims: [{
            parameter: '0.5',
            response: { correctResponse: 'Alpha', incorrectResponses: ['Beta'] },
            display: { text: 'Prompt' },
          }],
        }] } },
      },
      currentStimuliSet: [{ customRuntimeField: true }],
      currentStimuliSetId: 'set-a',
    });
    assert.equal(clusters[0]?.clusterKC, 'kc-a');
    assert.deepEqual(clusters[0]?.stims[0], {
      customRuntimeField: true,
      stimuliSetId: 'set-a',
      stimulusKC: 'set-a:0:0',
      clusterKC: 'kc-a',
      params: '0.5',
      correctResponse: 'Alpha',
      incorrectResponses: ['Beta'],
      clozeStimulus: undefined,
      textStimulus: 'Prompt',
      audioStimulus: undefined,
      imageStimulus: undefined,
      videoStimulus: undefined,
      display: { text: 'Prompt' },
      autoTutor: undefined,
      alternateDisplays: undefined,
    });
  });

  it('fails clearly instead of inventing numeric cluster identity', function() {
    assert.throws(() => interpretRuntimeStimulusClusters({
      tdfFile: {},
      currentStimuliSet: [],
      currentStimuliSetId: 'set-a',
      currentTdfId: 'tdf-a',
    }), /refusing numeric clusterKC fallback/);
  });

  it('owns authored answer enumeration and display casing', function() {
    const stimuli = [
      { correctResponse: 'Alpha|A;incorrect~No' },
      { correctResponse: 'Beta~Yes;incorrect~No' },
    ];
    assert.deepEqual(collectCurrentStimulusAnswers(stimuli), ['alpha|a', 'beta']);
    assert.equal(resolveStimulusAnswerDisplayCase('a', stimuli), 'A');
  });
});
