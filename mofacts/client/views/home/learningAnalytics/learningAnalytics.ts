import { Template } from 'meteor/templating';
import { Meteor } from 'meteor/meteor';
import { getActiveUiLocale } from '../../../lib/interfaceLocaleState';
import { selectTdf } from '../../../lib/lessonLaunchRunner';
import { createBlazeMount } from '../../experiment/svelte/meteorIntegration';
import LearnerAnalyticsPage from './LearnerAnalyticsPage.svelte';
import type {
  LearnerAnalyticsLaunchDescriptor,
  LearnerAnalyticsOverview,
  LearnerLessonAnalyticsSnapshot,
  RefreshLearnerLessonAnalyticsRequest,
} from '../../../../common/learnerAnalytics.contracts';
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
      refreshLesson: (request: RefreshLearnerLessonAnalyticsRequest) => (
        Meteor.callAsync('refreshLearnerLessonAnalytics', request) as Promise<LearnerLessonAnalyticsSnapshot>
      ),
      continuePractice,
    }),
  );
});

Template.learningAnalytics.onDestroyed(function (this: LearningAnalyticsTemplateInstance) {
  this.svelteMount?.cleanup();
  this.svelteMount = null;
});
