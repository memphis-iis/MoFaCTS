import { expect } from 'chai';
import {
  buildLearningProgressPanelSnapshot,
  isLearningProgressPanelEngine,
} from './learningProgressPanel';

describe('learningProgressPanel', function() {
  it('builds learner-safe item progress from model probability estimates', function() {
    const snapshot = buildLearningProgressPanelSnapshot({
      unitType: 'sparcsession',
      getModelProgressItems: () => [
        {
          id: '0:0:1001',
          stimulusKC: 1001,
          probability: 0.91,
          introduced: true,
          current: false,
          canUse: true,
        },
        {
          id: '0:1:1002',
          stimulusKC: 1002,
          probability: 0.62,
          introduced: false,
          current: true,
          canUse: true,
        },
        {
          id: '1:0:1003',
          stimulusKC: 1003,
          probability: 0.99,
          introduced: true,
          current: false,
          canUse: false,
        },
        {
          id: '2:0:1004',
          stimulusKC: 1004,
          probability: 0.81,
          introduced: true,
          current: false,
          canUse: true,
        },
        {
          id: '2:1:1005',
          stimulusKC: 1005,
          probability: 0.2,
          introduced: false,
          current: false,
          canUse: true,
        },
      ],
    }, { optimalThreshold: 0.8 }, { hiddenItems: [1005] });

    expect(snapshot.available).to.equal(true);
    expect(snapshot.thresholdPercent).to.equal(80);
    expect(snapshot.meanPercent).to.equal(78);
    expect(snapshot.stats).to.deep.equal({
      totalItems: 3,
      atOrAboveThreshold: 2,
      belowThreshold: 1,
      introducedItems: 2,
      unintroducedItems: 1,
    });
    expect(snapshot.rows.map((row) => ({
      id: row.id,
      percent: row.percent,
      band: row.band,
      current: row.current,
    }))).to.deep.equal([
      { id: '0:0:1001', percent: 91, band: 'at-or-above-threshold', current: false },
      { id: '0:1:1002', percent: 62, band: 'below-threshold', current: true },
      { id: '2:0:1004', percent: 81, band: 'at-or-above-threshold', current: false },
    ]);
    expect(snapshot.rows.every((row) => !Object.prototype.hasOwnProperty.call(row, 'label'))).to.equal(true);
  });

  it('returns unavailable when the model-progress provider is absent', function() {
    expect(isLearningProgressPanelEngine({
      unitType: 'sparcsession',
      getModelProgressItems: () => [],
    })).to.equal(true);
    expect(isLearningProgressPanelEngine({ unitType: 'model' })).to.equal(false);
    expect(isLearningProgressPanelEngine(null)).to.equal(false);

    const snapshot = buildLearningProgressPanelSnapshot({
      unitType: 'schedule',
    }, { optimalThreshold: 0.75 });

    expect(snapshot.available).to.equal(false);
    expect(snapshot.reason).to.equal('Progress requires a model-progress provider.');
    expect(snapshot.rows).to.deep.equal([]);
    expect(snapshot.thresholdPercent).to.equal(75);
  });

  it('builds progress from legacy adaptive card probability providers', function() {
    const snapshot = buildLearningProgressPanelSnapshot({
      unitType: 'sparc',
      getCardProbabilitiesNoCalc: () => ({
        cards: [
          {
            canUse: true,
            clusterKC: 'fractions.addition',
            stims: [
              {
                canUse: true,
                stimulusKC: 'fractions.lcd',
                probabilityEstimate: 0.64,
                timesSeen: 1,
              },
            ],
          },
        ],
      }),
    }, { optimalThreshold: 0.8 });

    expect(snapshot.available).to.equal(true);
    expect(snapshot.rows).to.have.length(1);
    expect(snapshot.rows[0]).to.deep.include({
      id: '0:0:fractions.lcd',
      probability: 0.64,
      percent: 64,
      introduced: true,
      band: 'below-threshold',
    });
  });

  it('waits until visible items have valid probability estimates', function() {
    const snapshot = buildLearningProgressPanelSnapshot({
      unitType: 'model',
      getModelProgressItems: () => [
        {
          id: '0:0:1001',
          stimulusKC: 1001,
          probability: Number.NaN,
          introduced: false,
          current: false,
          canUse: true,
        },
      ],
    }, { optimalThreshold: 0.8 });

    expect(snapshot.available).to.equal(false);
    expect(snapshot.reason).to.equal('Item probability estimates are not ready yet.');
  });

  it('reports provider failures explicitly', function() {
    const snapshot = buildLearningProgressPanelSnapshot({
      unitType: 'sparcsession',
      getModelProgressItems: () => {
        throw new Error('Adaptive logistic model progress requires cardProbabilities.cards');
      },
    }, {});

    expect(snapshot.available).to.equal(false);
    expect(snapshot.reason).to.equal('Adaptive logistic model progress requires cardProbabilities.cards');
  });
});
