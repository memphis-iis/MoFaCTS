import assert from 'node:assert/strict';
import { createInitialModelState } from './modelStateFactory';

function createDeps(stimClusters: any[]) {
  return {
    stimClusters,
    responseKCMap: {
      '__sparc_completed__': 'response-kc',
    },
    getStimParameterArrayFromCluster: (cluster: any, whichStim: number) =>
      String(cluster.stims[whichStim].params).split(',').map(Number),
    normalizeResponseText: (rawResponse: unknown) => String(rawResponse || '').trim().toLowerCase(),
  };
}

describe('modelStateFactory', function() {
  it('adds SPARC stimulusRegistry entries as non-selectable adaptive model targets', function() {
    const state = createInitialModelState(createDeps([{
      stims: [{
        clusterKC: 0,
        stimulusKC: 1,
        correctResponse: '__SPARC_COMPLETED__',
        params: '0,0.8',
        display: {
          type: 'sparc',
          stimulusRegistry: [{
            stimulusId: 'determine-lcd',
            stimulusKC: 'fractions.lcd',
            clusterKC: 'fractions.addition',
          }, {
            stimulusId: 'convert-numerator',
            stimulusKC: 'fractions.convert-numerator',
            clusterKC: 'fractions.addition',
          }],
        },
      }],
    }]));

    assert.equal(state.cards.length, 1);
    assert.equal(state.cards[0].stims.length, 3);
    assert.equal(state.cards[0].stims[0].modelPracticeOnly, undefined);
    assert.equal(state.cards[0].stims[1].modelPracticeOnly, true);
    assert.equal(state.cards[0].stims[1].stimulusKC, 'fractions.lcd');
    assert.equal(state.cards[0].stims[1].clusterKC, 'fractions.addition');
    assert.equal(state.cards[0].stims[1].probabilityEstimate, 0.5);
    assert.equal(state.cards[0].stims[2].stimulusKC, 'fractions.convert-numerator');
    assert.deepEqual(state.probabilities.map((item) => item.stimIndex), [0, 1, 2]);
  });

  it('requires explicit SPARC registry KC identities', function() {
    assert.throws(
      () => createInitialModelState(createDeps([{
        stims: [{
          clusterKC: 0,
          stimulusKC: 1,
          correctResponse: '__SPARC_COMPLETED__',
          params: '0,0.8',
          display: {
            type: 'sparc',
            stimulusRegistry: [{
              stimulusId: 'determine-lcd',
              stimulusKC: '',
              clusterKC: 'fractions.addition',
            }],
          },
        }],
      }])),
      /SPARC stimulusRegistry entry/,
    );
  });
});
