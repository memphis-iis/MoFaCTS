import { expect } from 'chai';
import { EVENTS } from '../machine/constants';
import { createFlashcardReviewEventController } from './flashcardReviewEventController';

function createHarness(options: {
  testMode?: boolean;
  statePath?: string;
  subsetKind?: string;
} = {}) {
  const sent: unknown[] = [];
  const logs: Array<{ level: number; message: string; details?: unknown }> = [];
  const controller = createFlashcardReviewEventController({
    getSubsetKind: () => options.subsetKind || 'feedback',
    isTestMode: () => options.testMode === true,
    log: (level, message, details) => {
      logs.push({ level, message, details });
    },
    now: () => 1234,
    send: (event) => {
      sent.push(event);
    },
    stateMatches: (path) => path === (options.statePath || ''),
  });

  return {
    controller,
    logs,
    sent,
  };
}

describe('card review event controller', function() {
  it('normalizes feedback content before sending it to the machine', function() {
    const harness = createHarness();

    harness.controller.handleFeedbackContent({
      feedbackText: '  Good work  ',
      feedbackHtml: '<b>Good work</b>',
      suppressed: true,
    });

    expect(harness.sent).to.deep.equal([{
      type: 'FEEDBACK_CONTENT',
      feedbackText: 'Good work',
      feedbackHtml: '<b>Good work</b>',
      feedbackSuppressed: true,
    }]);
  });

  it('maps study reveal events to trial reveal events with subset kind', function() {
    const harness = createHarness({ statePath: 'study.preparing', subsetKind: 'study' });

    harness.controller.handleReviewRevealStarted({
      timestamp: 5678,
      transitionDurationMs: 100,
    });

    expect(harness.sent).to.deep.equal([{
      type: EVENTS.TRIAL_REVEAL_STARTED,
      timestamp: 5678,
      subsetKind: 'study',
    }]);
    expect(harness.logs[0]).to.deep.equal({
      level: 2,
      message: '[ContentSurface][StudyReveal] started',
      details: {
        subsetKind: 'study',
        transitionDurationMs: 100,
      },
    });
  });

  it('maps feedback reveal events to review reveal events', function() {
    const harness = createHarness({ statePath: 'feedback.preparing' });

    harness.controller.handleReviewRevealStarted({
      subsetKind: 'feedback',
    });

    expect(harness.sent).to.deep.equal([{
      type: EVENTS.REVIEW_REVEAL_STARTED,
      timestamp: 1234,
    }]);
    expect(harness.logs[0]!.message).to.equal('[ContentSurface][ReviewReveal] started');
  });

  it('ignores reveal events outside preparing states and in test mode', function() {
    const outside = createHarness({ statePath: 'feedback.waiting' });
    outside.controller.handleReviewRevealStarted({ timestamp: 1 });
    expect(outside.sent).to.deep.equal([]);
    expect(outside.logs).to.deep.equal([]);

    const testMode = createHarness({ testMode: true, statePath: 'study.preparing' });
    testMode.controller.handleReviewRevealStarted({ timestamp: 1 });
    expect(testMode.sent).to.deep.equal([]);
    expect(testMode.logs).to.deep.equal([]);
  });
});
