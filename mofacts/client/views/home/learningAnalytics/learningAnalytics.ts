import { Template } from 'meteor/templating';
import { Meteor } from 'meteor/meteor';
import { getActiveUiLocale } from '../../../lib/interfaceLocaleState';
import { selectTdf } from '../../../lib/lessonLaunchRunner';
import { createBlazeMount } from '../../experiment/svelte/meteorIntegration';
import LearnerAnalyticsPage from './LearnerAnalyticsPage.svelte';
import type {
  GetLearnerLessonAnalyticsHistoryPageRequest,
  GetLearnerLessonAnalyticsSourceRequest,
  LearnerAnalyticsHistoryPage,
  LearnerAnalyticsHistoryRow,
  LearnerAnalyticsLaunchDescriptor,
  LearnerAnalyticsOverview,
  LearnerLessonAnalyticsSource,
  LearnerLessonAnalyticsSnapshot,
} from '../../../../common/learnerAnalytics.contracts';
import { buildLearnerLessonAnalyticsSnapshot } from './learnerAnalyticsCalculation';
import './learningAnalytics.html';

type LearningAnalyticsTemplateInstance = {
  svelteMount?: { cleanup(): void } | null;
  $(selector: string): HTMLElement[];
};

async function continuePractice(launch: LearnerAnalyticsLaunchDescriptor): Promise<void> {
  await selectTdf(
    launch.rootTdfId,
    launch.lessonName,
    launch.currentStimuliSetId,
    null,
    null,
    'learningAnalytics',
    launch.isMultiTdf,
    {},
  );
}

async function loadLessonAnalytics(
  request: GetLearnerLessonAnalyticsSourceRequest & { timeZone: string },
): Promise<LearnerLessonAnalyticsSnapshot> {
  const source = await Meteor.callAsync(
    'getLearnerLessonAnalyticsSource',
    { rootTdfId: request.rootTdfId } satisfies GetLearnerLessonAnalyticsSourceRequest,
  ) as LearnerLessonAnalyticsSource;
  if (source?.version !== 1 || source.historyPage?.version !== 1
    || !Number.isSafeInteger(source.historyRowCount) || source.historyRowCount < 0) {
    throw new Error('Learner analytics source contract is invalid.');
  }
  const historyRows: LearnerAnalyticsHistoryRow[] = [];
  let previousHistoryId: string | null = null;
  const appendPage = (page: LearnerAnalyticsHistoryPage): void => {
    if (page?.version !== 1 || !Array.isArray(page.rows)
      || (page.nextCursor !== null && typeof page.nextCursor !== 'string')
      || (page.nextCursor !== null && page.rows.length === 0)) {
      throw new Error('Learner analytics history pagination is invalid.');
    }
    for (const row of page.rows) {
      if (typeof row?._id !== 'string' || !row._id || (previousHistoryId !== null && row._id <= previousHistoryId)) {
        throw new Error('Learner analytics history pagination is incomplete or out of order.');
      }
      historyRows.push(row);
      previousHistoryId = row._id;
    }
  };
  appendPage(source.historyPage);
  const seenCursors = new Set<string>();
  let cursor = source.historyPage.nextCursor;
  while (cursor) {
    if (seenCursors.has(cursor)) throw new Error('Learner analytics history pagination did not advance.');
    seenCursors.add(cursor);
    const page = await Meteor.callAsync(
      'getLearnerLessonAnalyticsHistoryPage',
      { rootTdfId: request.rootTdfId, cursor } satisfies GetLearnerLessonAnalyticsHistoryPageRequest,
    ) as LearnerAnalyticsHistoryPage;
    appendPage(page);
    cursor = page.nextCursor;
  }
  if (historyRows.length !== source.historyRowCount) {
    throw new Error('Learner analytics history pagination is incomplete.');
  }
  return buildLearnerLessonAnalyticsSnapshot({ source, historyRows, timeZone: request.timeZone });
}

Template.learningAnalytics.onRendered(function (this: LearningAnalyticsTemplateInstance) {
  const target = this.$('#learning-analytics-root')[0];
  if (!target) {
    throw new Error('Learning analytics mount target is missing.');
  }
  this.svelteMount = createBlazeMount(
    target,
    LearnerAnalyticsPage,
    {},
    () => ({
      uiLocale: getActiveUiLocale(),
      loadOverview: () => Meteor.callAsync('getLearnerAnalyticsOverview') as Promise<LearnerAnalyticsOverview>,
      loadLesson: loadLessonAnalytics,
      continuePractice,
    }),
  );
});

Template.learningAnalytics.onDestroyed(function (this: LearningAnalyticsTemplateInstance) {
  this.svelteMount?.cleanup();
  this.svelteMount = null;
});
