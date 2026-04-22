import './accessDenied.html';

declare const Template: any;
const { FlowRouter } = require('meteor/ostrio:flow-router-extra') as {
  FlowRouter: { go(path: string): void };
};

Template.accessDenied.events({
  'click #accessDeniedGoHome'(event: Event) {
    event.preventDefault();
    FlowRouter.go('/home');
  }
});
