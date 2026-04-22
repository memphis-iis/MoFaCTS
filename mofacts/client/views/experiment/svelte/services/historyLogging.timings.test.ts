import { expect } from 'chai';
import { calculateTrialTimings } from './historyLogging';

describe('history logging timing semantics', function() {
  it('computes start and end latency from trial start and submit time', function() {
    const result = calculateTrialTimings(
      2000, // submitAt
      1000, // trialStart
      1300, // firstInputStart
      2050,
      2450,
      'd'
    );

    expect(result.startLatency).to.equal(300);
    expect(result.endLatency).to.equal(1000);
    expect(result.responseDuration).to.equal(700);
    expect(result.feedbackLatency).to.equal(400);
  });

  it('keeps end latency independent of feedback duration', function() {
    const shortFeedback = calculateTrialTimings(1800, 1000, 1200, 1810, 1820, 'd');
    const longFeedback = calculateTrialTimings(1800, 1000, 1200, 1810, 3810, 'd');

    expect(shortFeedback.endLatency).to.equal(800);
    expect(longFeedback.endLatency).to.equal(800);
    expect(shortFeedback.startLatency).to.equal(longFeedback.startLatency);
    expect(longFeedback.feedbackLatency).to.be.greaterThan(shortFeedback.feedbackLatency);
  });

  it('uses submit time as fallback first-input time when no input timestamp exists', function() {
    const result = calculateTrialTimings(
      2500,
      1000,
      undefined as unknown as number,
      undefined as unknown as number,
      2500,
      'd'
    );

    expect(result.startLatency).to.equal(1500);
    expect(result.endLatency).to.equal(1500);
    expect(result.responseDuration).to.equal(0);
  });

  it('applies study semantics sentinel values', function() {
    const result = calculateTrialTimings(2200, 1000, 1300, 0, 2200, 's');

    expect(result.startLatency).to.equal(-1);
    expect(result.endLatency).to.equal(-1);
    expect(result.feedbackLatency).to.equal(1200);
  });
});
