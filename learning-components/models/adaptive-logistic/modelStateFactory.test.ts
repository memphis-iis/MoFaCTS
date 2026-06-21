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
  it('builds initial model state only from ordinary cluster stimuli', function() {
    const state = createInitialModelState(createDeps([{
      stims: [{
        clusterKC: 0,
        stimulusKC: 1,
        correctResponse: '__SPARC_COMPLETED__',
        params: '0,0.8',
        display: {
          type: 'sparc',
          clusterTargets: [{
            clusterIndex: 0,
            stimulusKC: 'fractions.lcd',
            clusterKC: 'fractions.addition',
          }, {
            clusterIndex: 1,
            stimulusKC: 'fractions.convert-numerator',
            clusterKC: 'fractions.addition',
          }],
        },
      }],
    }]));

    assert.equal(state.cards.length, 1);
    assert.equal(state.cards[0].stims.length, 1);
    assert.equal(state.cards[0].stims[0].modelPracticeOnly, undefined);
    assert.equal(state.cards[0].stims[0].stimulusKC, 1);
    assert.equal(state.cards[0].stims[0].clusterKC, 0);
    assert.deepEqual(state.probabilities.map((item) => item.stimIndex), [0]);
  });
});
