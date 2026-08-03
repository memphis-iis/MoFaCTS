import { Meteor } from 'meteor/meteor';

const configuredStorage = Meteor.settings?.public?.packages?.accounts?.clientStorage;

if (configuredStorage !== 'session') {
  throw new Error('[AUTH] public.packages.accounts.clientStorage must be "session"');
}

