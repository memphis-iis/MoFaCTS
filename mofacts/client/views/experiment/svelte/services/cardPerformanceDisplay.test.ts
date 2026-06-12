import { expect } from 'chai';
import {
  buildCardPerformanceData,
  buildCardPerformanceDisplaySnapshot,
} from './cardPerformanceDisplay';

describe('card performance display snapshot', function() {
  it('normalizes raw performance tracker data for display', function() {
    expect(buildCardPerformanceData({
      numCorrect: 3,
      numIncorrect: 1,
      totalTime: 150000,
      stimsSeen: '4',
      totalStimCount: 10,
      count: '5',
    })).to.deep.equal({
      totalTimeDisplay: '2.5',
      percentCorrect: '75.00%',
      cardsSeen: 4,
      totalCards: 10,
      currentTrial: 5,
    });
  });

  it('preserves explicit performance strings and uses empty-data defaults', function() {
    expect(buildCardPerformanceData({
      percentCorrect: 'already formatted',
      totalTimeDisplay: 'custom time',
    })).to.deep.equal({
      totalTimeDisplay: 'custom time',
      percentCorrect: 'already formatted',
      cardsSeen: null,
      totalCards: null,
      currentTrial: 0,
    });

    expect(buildCardPerformanceData()).to.deep.equal({
      totalTimeDisplay: '0.0',
      percentCorrect: 'N/A',
      cardsSeen: null,
      totalCards: null,
      currentTrial: 0,
    });
  });

  it('builds shared performance slot props from delivery settings, performance data, and timeout state', function() {
    const snapshot = buildCardPerformanceDisplaySnapshot({
      deliverySettings: {
        displayPerformance: true,
        displayTimeoutBar: true,
        displayTimeoutCountdown: false,
      },
      performanceData: {
        totalTimeDisplay: '2.5',
        percentCorrect: '80%',
        cardsSeen: 4,
        totalCards: 10,
        currentTrial: 5,
      },
      timeoutMode: 'question',
      timeoutProgress: 42,
      remainingTime: 9,
    });

    expect(snapshot.performanceSlotProps).to.deep.equal({
      showPerformanceStats: true,
      showTimeoutBar: true,
      showTimeoutCountdown: false,
      totalTimeDisplay: '2.5',
      percentCorrect: '80%',
      cardsSeen: 4,
      totalCards: 10,
      currentTrial: 5,
      timeoutMode: 'question',
      timeoutProgress: 42,
      remainingTime: 9,
    });
    expect(snapshot.showTrialTimerArea).to.equal(true);
  });

  it('forces stats-only and timer-only prop variants for the two display locations', function() {
    const snapshot = buildCardPerformanceDisplaySnapshot({
      deliverySettings: {
        displayPerformance: false,
        displayTimeoutBar: false,
        displayTimeoutCountdown: true,
      },
      performanceData: {},
      timeoutMode: 'feedback',
      timeoutProgress: 10,
      remainingTime: 3,
    });

    expect(snapshot.performanceStatsProps).to.deep.include({
      showPerformanceStats: true,
      showTimeoutBar: false,
      showTimeoutCountdown: false,
    });
    expect(snapshot.trialTimerProps).to.deep.include({
      showPerformanceStats: false,
      showTimeoutCountdown: true,
      timeoutMode: 'feedback',
    });
    expect(snapshot.showTrialTimerArea).to.equal(true);
  });

  it('hides the timer area when both timeout displays are disabled', function() {
    const snapshot = buildCardPerformanceDisplaySnapshot({
      deliverySettings: {
        displayTimeoutBar: false,
        displayTimeoutCountdown: false,
      },
      performanceData: {},
      timeoutMode: 'none',
      timeoutProgress: 0,
      remainingTime: 0,
    });

    expect(snapshot.showTrialTimerArea).to.equal(false);
  });
});
