import { expect } from 'chai';
import { TARGET_UI_LOCALES } from '../../../../common/lib/interfaceLocales';
import {
  DEFAULT_ANALYTICS_PERIOD,
  buildLearningAnalyticsMockViewModel,
  getDefaultMockLessonId,
  getMockLessons,
  type AnalyticsMetricKey,
  type AnalyticsPeriod,
} from './learningAnalyticsMockData';
import { getLearningAnalyticsMockStrings } from './learningAnalyticsMockI18n';

describe('learning analytics fake-data mock', function() {
  it('opens the most recently practiced lesson at 30 days', function() {
    expect(DEFAULT_ANALYTICS_PERIOD).to.equal('30d');
    expect(getDefaultMockLessonId()).to.equal('spanish-food-and-dining');

    const viewModel = buildLearningAnalyticsMockViewModel(
      getDefaultMockLessonId(),
      DEFAULT_ANALYTICS_PERIOD,
    );
    expect(viewModel.lesson.title).to.equal('Spanish Vocabulary: Food and Dining');
    expect(viewModel.metrics.attempts).to.equal(186);
    expect(viewModel.accuracyRate).to.equal(156 / 186);
    expect(viewModel.metrics.uniqueItems).to.equal(42);
    expect(viewModel.metrics.practiceDays).to.equal(8);
    expect(viewModel.metrics.activeMinutes).to.equal(74);
    expect(viewModel.daysSinceLastPractice).to.equal(1);
  });

  it('provides every period for every lesson without substituting optional metrics', function() {
    const periods: AnalyticsPeriod[] = ['7d', '30d', 'all'];
    for (const lesson of getMockLessons()) {
      for (const period of periods) {
        const viewModel = buildLearningAnalyticsMockViewModel(lesson.id, period);
        expect(viewModel.metrics.attempts).to.be.greaterThan(0);
        expect(viewModel.metrics.uniqueItems).to.be.greaterThan(0);
        expect(viewModel.metrics.practiceDays).to.be.greaterThan(0);
        expect(viewModel.metrics.activeMinutes).to.be.greaterThan(0);
      }
    }

    const retrieval = buildLearningAnalyticsMockViewModel('biology-cell-structure', '30d');
    expect(retrieval.accuracyRate).to.be.a('number');
    expect(retrieval.metrics.modelProgress).to.equal(undefined);

    const autotutor = buildLearningAnalyticsMockViewModel('autotutor-forces-and-motion', '30d');
    expect(autotutor.metrics.accuracy).to.equal(undefined);
    expect(autotutor.accuracyRate).to.equal(undefined);
    expect(autotutor.metrics.modelProgress).to.equal(undefined);
    expect(autotutor.metrics.updatedAtByMetric.accuracy).to.equal(undefined);
  });

  it('keeps activity fixed at 28 days and reconciles it with each 30-day snapshot', function() {
    for (const lesson of getMockLessons()) {
      const viewModel = buildLearningAnalyticsMockViewModel(lesson.id, '30d');
      expect(lesson.activity).to.have.length(28);
      expect(viewModel.activityWeeks).to.have.length(4);
      expect(viewModel.activityTotals.attempts).to.equal(viewModel.metrics.attempts);
      expect(viewModel.activityTotals.activeMinutes).to.equal(viewModel.metrics.activeMinutes);
      expect(viewModel.activityTotals.activeDays).to.equal(viewModel.metrics.practiceDays);
    }
  });

  it('keeps seven-day totals consistent with the last seven activity days', function() {
    for (const lesson of getMockLessons()) {
      const viewModel = buildLearningAnalyticsMockViewModel(lesson.id, '7d');
      const lastSevenDays = lesson.activity.slice(-7);
      expect(lastSevenDays.reduce((total, day) => total + day.attempts, 0)).to.equal(viewModel.metrics.attempts);
      expect(lastSevenDays.reduce((total, day) => total + day.activeMinutes, 0)).to.equal(viewModel.metrics.activeMinutes);
      expect(lastSevenDays.filter((day) => day.attempts > 0 || day.activeMinutes > 0)).to.have.length(viewModel.metrics.practiceDays);
    }
  });

  it('keeps modeled counts, target, and metric freshness internally consistent', function() {
    const viewModel = buildLearningAnalyticsMockViewModel('spanish-food-and-dining', '30d');
    const progress = viewModel.metrics.modelProgress;
    expect(progress).to.not.equal(undefined);
    expect(progress!.atTarget + progress!.belowTarget).to.equal(viewModel.metrics.uniqueItems);
    expect(progress!.meanProbability).to.equal(0.79);
    expect(progress!.targetProbability).to.equal(0.80);

    const requiredKeys: AnalyticsMetricKey[] = [
      'attempts', 'accuracy', 'uniqueItems', 'practiceDays', 'activeMinutes', 'recency',
      'meanProbability', 'atTarget', 'belowTarget',
    ];
    for (const key of requiredKeys) {
      expect(viewModel.metrics.updatedAtByMetric[key], key).to.be.a('string').and.not.equal('');
    }
  });

  it('has a complete, non-empty string set for every supported interface locale', function() {
    const englishKeys = Object.keys(getLearningAnalyticsMockStrings('en'));
    for (const locale of TARGET_UI_LOCALES) {
      const strings = getLearningAnalyticsMockStrings(locale);
      expect(Object.keys(strings), locale).to.have.members(englishKeys);
      for (const key of englishKeys) {
        expect(strings[key as keyof typeof strings], `${locale}.${key}`).to.be.a('string').and.not.equal('');
      }
    }
  });
});
