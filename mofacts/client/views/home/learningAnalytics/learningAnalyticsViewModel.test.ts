import { expect } from 'chai';
import type { LearnerLessonAnalyticsSnapshot } from '../../../../common/learnerAnalytics.contracts';
import { buildLearningAnalyticsViewModel } from './learningAnalyticsViewModel';

function snapshot(overrides: Partial<LearnerLessonAnalyticsSnapshot> = {}): LearnerLessonAnalyticsSnapshot {
  const days = Array.from({ length: 28 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 6, 12 + index)).toISOString().slice(0, 10),
    attempts: index === 27 ? 2 : 0,
    activeMinutes: index === 27 ? 3 : 0,
  }));
  return {
    version: 1,
    lesson: { rootTdfId: 'lesson', title: 'Lesson', measurementContract: 'retrieval', lastPracticedAt: '2026-08-08T12:00:00.000Z', launch: { rootTdfId: 'lesson', lessonName: 'Lesson', currentStimuliSetId: 'set', isMultiTdf: false } },
    calculatedAt: '2026-08-08T12:00:00.000Z',
    timeZone: 'UTC',
    lastPracticedAt: '2026-08-08T12:00:00.000Z',
    periods: {
      '7d': { attempts: 2, accuracy: { correct: 1, total: 2 }, uniqueItems: 1, practiceDays: 1, activeMinutes: 3 },
      '30d': { attempts: 2, accuracy: { correct: 1, total: 2 }, uniqueItems: 1, practiceDays: 1, activeMinutes: 3 },
      all: { attempts: 2, accuracy: { correct: 1, total: 2 }, uniqueItems: 1, practiceDays: 1, activeMinutes: 3 },
    },
    latest28Days: days,
    availability: { accuracy: true, modelProgress: false, modelProgressReason: 'not-supported' },
    ...overrides,
  };
}

describe('learningAnalyticsViewModel', function() {
  it('never exceeds five headline factors and omits unavailable metrics', function() {
    const retrieval = buildLearningAnalyticsViewModel(snapshot(), '30d');
    expect(retrieval.headlineFactors).to.deep.equal(['accuracy', 'uniqueItems', 'activeMinutes', 'practiceDays']);

    const autotutorSnapshot = snapshot({
      lesson: { ...snapshot().lesson, measurementContract: 'autotutor' },
      periods: {
        '7d': { attempts: 2, uniqueItems: 1, practiceDays: 1, activeMinutes: 3 },
        '30d': { attempts: 2, uniqueItems: 1, practiceDays: 1, activeMinutes: 3 },
        all: { attempts: 2, uniqueItems: 1, practiceDays: 1, activeMinutes: 3 },
      },
      availability: { accuracy: false, modelProgress: false, modelProgressReason: 'not-supported' },
    });
    expect(buildLearningAnalyticsViewModel(autotutorSnapshot, '30d').headlineFactors)
      .to.deep.equal(['uniqueItems', 'activeMinutes', 'practiceDays']);
  });

  it('consolidates model probability and counts into one headline factor', function() {
    const view = buildLearningAnalyticsViewModel(snapshot({
      modelProgress: { meanProbability: 0.79, challengeTarget: 0.8, reachedChallengeTargetCount: 31, belowChallengeTargetCount: 11, histogramBins: [], modeledItemCount: 42 },
      availability: { accuracy: true, modelProgress: true },
    }), '30d');
    expect(view.headlineFactors).to.have.length(5);
    expect(view.metrics.modelProgress).to.deep.include({ atTarget: 31, belowTarget: 11, targetProbability: 0.8 });
  });
});
