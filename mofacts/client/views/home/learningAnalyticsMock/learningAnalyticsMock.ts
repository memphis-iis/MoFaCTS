import { Template } from 'meteor/templating';
import { getActiveUiLocale } from '../../../lib/interfaceLocaleState';
import { createBlazeMount } from '../../experiment/svelte/meteorIntegration';
import LearnerAnalyticsMock from './LearnerAnalyticsMock.svelte';
import './learningAnalyticsMock.html';

type LearningAnalyticsMockTemplateInstance = {
  svelteMount?: { cleanup(): void } | null;
  $(selector: string): HTMLElement[];
};

Template.learningAnalyticsMock.onRendered(function (this: LearningAnalyticsMockTemplateInstance) {
  const target = this.$('#learning-analytics-mock-root')[0];
  if (!target) {
    throw new Error('Learning analytics mock mount target is missing.');
  }
  this.svelteMount = createBlazeMount(
    target,
    LearnerAnalyticsMock,
    {},
    () => ({ uiLocale: getActiveUiLocale() }),
  );
});

Template.learningAnalyticsMock.onDestroyed(function (this: LearningAnalyticsMockTemplateInstance) {
  this.svelteMount?.cleanup();
  this.svelteMount = null;
});
