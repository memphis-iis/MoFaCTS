import { Session } from 'meteor/session';
import './experimentError.html';

declare const Template: any;

function getExperimentError() {
  return Session.get('experimentError') || {};
}

Template.experimentError.helpers({
  experimentErrorTitle() {
    return getExperimentError().title || 'Experiment paused';
  },
  experimentErrorMessage() {
    return getExperimentError().message ||
      'This practice activity did not start correctly.';
  },
  experimentErrorNote() {
    return getExperimentError().note ||
      'Please email the experiment coordinator or study contact with your participant ID.';
  },
});
