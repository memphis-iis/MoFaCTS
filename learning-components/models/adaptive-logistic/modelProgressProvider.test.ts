import { strict as assert } from 'assert';
import { buildAdaptiveLogisticModelProgressItems } from './modelProgressProvider';

describe('adaptive logistic model progress provider', function() {
  it('extracts stable learner-safe progress items from card probabilities', function() {
    const items = buildAdaptiveLogisticModelProgressItems({
      currentCardRef: { clusterIndex: 0, stimIndex: 1 },
      cardProbabilities: {
        cards: [
          {
            canUse: true,
            clusterKC: 'cluster-a',
            stims: [
              {
                canUse: true,
                stimulusKC: 'kc-a',
                probabilityEstimate: 0.91,
                hasBeenIntroduced: true,
              },
              {
                canUse: true,
                stimulusKC: 'kc-b',
                probabilityEstimate: 0.62,
                timesSeen: 0,
              },
            ],
          },
          {
            canUse: false,
            stims: [
              {
                canUse: true,
                stimulusKC: 'kc-c',
                probabilityEstimate: 0.99,
              },
            ],
          },
          {
            canUse: true,
            stims: [
              {
                canUse: true,
                stimulusKC: 'kc-d',
                clusterKC: 'cluster-d',
                probabilityEstimate: 0.81,
                priorCorrect: 1,
              },
              {
                canUse: false,
                stimulusKC: 'kc-e',
                probabilityEstimate: 0.2,
              },
            ],
          },
        ],
      },
    });

    assert.deepEqual(items, [
      {
        id: '0:0:kc-a',
        stimulusKC: 'kc-a',
        clusterKC: 'cluster-a',
        probability: 0.91,
        introduced: true,
        current: false,
        canUse: true,
      },
      {
        id: '0:1:kc-b',
        stimulusKC: 'kc-b',
        clusterKC: 'cluster-a',
        probability: 0.62,
        introduced: false,
        current: true,
        canUse: true,
      },
      {
        id: '2:0:kc-d',
        stimulusKC: 'kc-d',
        clusterKC: 'cluster-d',
        probability: 0.81,
        introduced: true,
        current: false,
        canUse: true,
      },
    ]);
  });

  it('rejects invalid probability values instead of clamping them', function() {
    assert.throws(
      () => buildAdaptiveLogisticModelProgressItems({
        cardProbabilities: {
          cards: [
            {
              canUse: true,
              stims: [
                {
                  canUse: true,
                  stimulusKC: 'kc-a',
                  probabilityEstimate: 1.2,
                },
              ],
            },
          ],
        },
      }),
      /Invalid model progress probability for 0:0:kc-a/,
    );
  });

  it('requires stimulus identities for progress items', function() {
    assert.throws(
      () => buildAdaptiveLogisticModelProgressItems({
        cardProbabilities: {
          cards: [
            {
              canUse: true,
              stims: [
                {
                  canUse: true,
                  probabilityEstimate: 0.5,
                },
              ],
            },
          ],
        },
      }),
      /Model progress item 0:0 is missing stimulusKC/,
    );
  });
});

