import { expect } from 'chai';
import {
  buildActiveTrialCurrentDisplayValues,
  buildActiveTrialDisplaySnapshot,
  createActiveTrialDisplayStateController,
  createInitialActiveTrialDisplayValues,
  type ActiveTrialDisplayValues,
} from './activeTrialDisplayState';

function values(overrides: Partial<ActiveTrialDisplayValues> = {}): ActiveTrialDisplayValues {
  return {
    ...createInitialActiveTrialDisplayValues(),
    display: { text: 'current' },
    displayVisible: true,
    feedbackCorrectAnswer: 'A',
    feedbackCorrectColor: 'green',
    feedbackIsCorrect: true,
    feedbackText: 'Good',
    feedbackVisible: true,
    responseVisible: true,
    trialSubsetKind: 'feedback',
    ...overrides,
  };
}

describe('active trial display state', function() {
  it('builds current question display values and suppresses response for owned interactive displays', function() {
    expect(buildActiveTrialCurrentDisplayValues({
      correctColor: 'green',
      currentAnswer: 'A',
      currentDisplay: { text: 'Prompt' },
      displayCorrectFeedback: true,
      displayIncorrectFeedback: true,
      feedbackMessage: 'Feedback',
      formatAnswerText: (answer) => `fmt:${answer}`,
      h5pOwnsResponse: false,
      isCorrect: false,
      isForceCorrecting: false,
      isStudyState: false,
      originalAnswer: '',
      skipStudyEnabled: true,
      sparcOwnsResponse: false,
      studyInteractionText: '',
      trialSubsetKind: 'question',
    })).to.deep.include({
      displayVisible: true,
      feedbackCorrectAnswer: 'fmt:A',
      feedbackCorrectColor: 'green',
      feedbackIsCorrect: false,
      feedbackText: 'Feedback',
      feedbackVisible: false,
      responseVisible: true,
      showSkipStudyButton: false,
      trialSubsetKind: 'question',
    });

    expect(buildActiveTrialCurrentDisplayValues({
      correctColor: 'green',
      currentAnswer: 'A',
      currentDisplay: { text: 'Prompt' },
      displayCorrectFeedback: true,
      displayIncorrectFeedback: true,
      feedbackMessage: '',
      formatAnswerText: (answer) => answer,
      h5pOwnsResponse: true,
      isCorrect: false,
      isForceCorrecting: false,
      isStudyState: false,
      originalAnswer: '',
      skipStudyEnabled: false,
      sparcOwnsResponse: false,
      studyInteractionText: '',
      trialSubsetKind: 'question',
    }).responseVisible).to.equal(false);
  });

  it('builds study values with study-specific colors, feedback, and skip button visibility', function() {
    expect(buildActiveTrialCurrentDisplayValues({
      correctColor: 'green',
      currentAnswer: 'A',
      currentDisplay: { text: 'Study' },
      displayCorrectFeedback: false,
      displayIncorrectFeedback: true,
      feedbackMessage: 'ignored',
      formatAnswerText: (answer) => `fmt:${answer}`,
      h5pOwnsResponse: false,
      isCorrect: false,
      isForceCorrecting: false,
      isStudyState: true,
      originalAnswer: 'B',
      skipStudyEnabled: true,
      sparcOwnsResponse: false,
      studyInteractionText: 'spoken',
      trialSubsetKind: 'study',
    })).to.deep.include({
      displayCorrectFeedback: true,
      displayIncorrectFeedback: false,
      feedbackCorrectAnswer: 'fmt:B',
      feedbackCorrectColor: 'var(--app-text-color)',
      feedbackIsCorrect: true,
      feedbackText: 'spoken',
      feedbackVisible: true,
      responseVisible: false,
      showSkipStudyButton: true,
      trialSubsetKind: 'study',
    });
  });

  it('refreshes the frozen snapshot from current display values outside outgoing transition states', function() {
    const current = values({
      display: { text: 'new', h5p: { nested: { value: 1 } } },
    });
    const previousFrozen = values({
      display: { text: 'old' },
      feedbackText: 'Old',
    });

    const snapshot = buildActiveTrialDisplaySnapshot({
      current,
      isOutgoingFreezeState: false,
      previousFrozen,
    });

    expect(snapshot.active).to.deep.include({
      feedbackText: 'Good',
      trialSubsetKind: 'feedback',
    });
    expect(snapshot.active.display).to.deep.equal({
      text: 'new',
      clozeText: '',
      imgSrc: '',
      videoSrc: '',
      audioSrc: '',
      h5p: { nested: { value: 1 } },
    });
    expect(snapshot.active.display).to.not.equal(current.display);
    expect(snapshot.frozen).to.deep.equal(snapshot.active);
  });

  it('keeps rendering the previous frozen snapshot during outgoing transition states', function() {
    const current = values({
      display: { text: 'new' },
      feedbackText: 'New',
    });
    const previousFrozen = values({
      display: { text: 'old' },
      feedbackText: 'Old',
      trialSubsetKind: 'question',
    });

    const snapshot = buildActiveTrialDisplaySnapshot({
      current,
      isOutgoingFreezeState: true,
      previousFrozen,
    });

    expect(snapshot.active).to.equal(previousFrozen);
    expect(snapshot.frozen).to.equal(previousFrozen);
    expect(snapshot.active.feedbackText).to.equal('Old');
    expect(snapshot.active.trialSubsetKind).to.equal('question');
  });

  it('tracks the frozen snapshot inside the display state controller', function() {
    const controller = createActiveTrialDisplayStateController();
    const previous = values({
      display: { text: 'old' },
      feedbackText: 'Old',
      trialSubsetKind: 'question',
    });
    const current = values({
      display: { text: 'new' },
      feedbackText: 'New',
      trialSubsetKind: 'feedback',
    });

    controller.buildSnapshot({
      current: previous,
      isOutgoingFreezeState: false,
    });
    const snapshot = controller.buildSnapshot({
      current,
      isOutgoingFreezeState: true,
    });

    expect(snapshot.active.display.text).to.equal('old');
    expect(snapshot.active.feedbackText).to.equal('Old');
    expect(snapshot.active.trialSubsetKind).to.equal('question');
    expect(controller.getFrozen()).to.deep.equal(snapshot.frozen);
    expect(controller.getFrozen()).to.not.equal(snapshot.frozen);
  });
});
