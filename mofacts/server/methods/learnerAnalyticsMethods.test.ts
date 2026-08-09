import { expect } from 'chai';
import { buildLearnerAnalyticsOverview } from './learnerAnalyticsMethods';

describe('learnerAnalyticsMethods', function() {
  it('offers only practiced study sets and defaults to the most recent one', function() {
    const overview = buildLearnerAnalyticsOverview({
      lessons: [
        { TDFId: 'unused', displayName: 'Unused', firstContentUnitType: 'learning', progress: { lastPracticed: null } },
        { TDFId: 'older', displayName: 'Older', firstContentUnitType: 'learning', progress: { lastPracticed: '2026-08-01T12:00:00.000Z' } },
        { TDFId: 'newer', displayName: 'Newer', firstContentUnitType: 'autotutor', progress: { lastPracticed: '2026-08-08T12:00:00.000Z' } },
      ],
    });

    expect(overview.lessons.map((lesson) => lesson.rootTdfId)).to.deep.equal(['newer', 'older']);
    expect(overview.defaultLessonId).to.equal('newer');
  });
});
