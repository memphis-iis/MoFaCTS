import { expect } from 'chai';
import { buildLearningProgressPanelSnapshot } from './learningProgressPanel';

describe('learningProgressPanel', function() {
  it('builds learner-safe item progress from model probability estimates', function() {
    const snapshot = buildLearningProgressPanelSnapshot({
      unitType: 'model',
      currentCardRef: { clusterIndex: 0, stimIndex: 1 },
      getCardProbabilitiesNoCalc: () => ({
        cards: [
          {
            canUse: true,
            stims: [
              { canUse: true, stimulusKC: 1001, probabilityEstimate: 0.91, hasBeenIntroduced: true },
              { canUse: true, stimulusKC: 1002, probabilityEstimate: 0.62, timesSeen: 0 },
            ],
          },
          {
            canUse: false,
            stims: [
              { canUse: true, stimulusKC: 1003, probabilityEstimate: 0.99 },
            ],
          },
          {
            canUse: true,
            stims: [
              { canUse: true, stimulusKC: 1004, probabilityEstimate: 0.81, priorCorrect: 1 },
              { canUse: true, stimulusKC: 1005, probabilityEstimate: 0.2 },
            ],
          },
        ],
      }),
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
      { id: '0:0', percent: 91, band: 'at-or-above-threshold', current: false },
      { id: '0:1', percent: 62, band: 'below-threshold', current: true },
      { id: '2:0', percent: 81, band: 'at-or-above-threshold', current: false },
    ]);
    expect(snapshot.rows.every((row) => !Object.prototype.hasOwnProperty.call(row, 'label'))).to.equal(true);
  });

  it('returns unavailable for non-model units', function() {
    const snapshot = buildLearningProgressPanelSnapshot({
      unitType: 'schedule',
      getCardProbabilitiesNoCalc: () => ({ cards: [] }),
    }, { optimalThreshold: 0.75 });

    expect(snapshot.available).to.equal(false);
    expect(snapshot.reason).to.equal('Progress is available for adaptive learning sessions only.');
    expect(snapshot.rows).to.deep.equal([]);
    expect(snapshot.thresholdPercent).to.equal(75);
  });

  it('waits until visible items have valid probability estimates', function() {
    const snapshot = buildLearningProgressPanelSnapshot({
      unitType: 'model',
      getCardProbabilitiesNoCalc: () => ({
        cards: [
          {
            canUse: true,
            stims: [
              { canUse: true, stimulusKC: 1001 },
            ],
          },
        ],
      }),
    }, { optimalThreshold: 0.8 });

    expect(snapshot.available).to.equal(false);
    expect(snapshot.reason).to.equal('Item probability estimates are not ready yet.');
  });
});
