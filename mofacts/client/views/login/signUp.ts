import {sessionCleanUp} from '../../lib/sessionUtils';
import {routeToSignin} from '../../lib/router';
import './signUp.html';
import '../footer.html';

import { legacyTrim } from '../../../common/underscoreCompat';

declare const Template: any;
declare const Session: any;
declare const Meteor: {
  logout(): void;
  callAsync<T = unknown>(name: string, ...args: unknown[]): Promise<T>;
  userId(): string | null;
};
declare const $: any;
declare const _: { each<T>(arr: T[], fn: (item: T) => void): void };
const { FlowRouter } = require('meteor/ostrio:flow-router-extra') as {
  FlowRouter: { go(path: string): void };
};

function normalizeEmailForAuth(rawValue: unknown): string {
  return legacyTrim(String(rawValue || '')).toLowerCase();
}

function clearServerMessage() {
  $('#serverErrors')
    .removeClass('text-danger text-success auth-message-error auth-message-success')
    .text('')
    .prop('hidden', true)
    .hide();
}

function showServerError(message: string) {
  $('#serverErrors')
    .removeClass('text-success auth-message-success')
    .addClass('text-danger auth-message-error')
    .text(message)
    .prop('hidden', false)
    .show();
}

function showServerSuccess(message: string) {
  $('#serverErrors')
    .removeClass('text-danger auth-message-error')
    .addClass('text-success auth-message-success')
    .text(message)
    .prop('hidden', false)
    .show();
}

function showFieldMessage(selector: string) {
  $(selector).prop('hidden', false).show();
}

function hideFieldMessage(selector: string) {
  $(selector).prop('hidden', true).hide();
}

Template.signUp.events({
  'click #backkTosignInButton': function(event: Event) {
    Meteor.logout();
    event.preventDefault();
    routeToSignin();
  },

  'click #signUpButton': async function(event: Event) {
    Meteor.logout();
    event.preventDefault();

    const formUsername = normalizeEmailForAuth($('#signUpUsername').val());
    const formPassword1 = legacyTrim(String($('#password1').val() || ''));
    const formPassword2 = legacyTrim(String($('#password2').val() || ''));

    // Hide previous errors
    hideFieldMessage('#usernameInvalid');
    hideFieldMessage('#passwordTooShort');
    hideFieldMessage('#passwordMustMatch');
    clearServerMessage();

    const checks = [];

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formUsername)) {
      checks.push('#usernameInvalid');
    }

    // "Regular" password checks
    const minPasswordLength = Number(Session.get('minPasswordLength')) || 8;
    if (formPassword1.length < minPasswordLength) {
      checks.push('#passwordTooShort');
    }

    if (formPassword1 !== formPassword2) {
      checks.push('#passwordMustMatch');
    }

    // Show any and all errors
    if (checks.length > 0) {
      _.each(checks, function(ele) {
        showFieldMessage(ele);
      });
      return;
    }

    try {
      await Meteor.callAsync('signUpUser', formUsername, formPassword1);
      sessionCleanUp();
      const requireEmailVerification = !!Session.get('requireEmailVerification');
      if (requireEmailVerification) {
        showServerSuccess('Your account has been created. Check your email for a verification link before signing in.');
        setTimeout(() => {
          FlowRouter.go('/auth/verify-email');
        }, 1200);
        return;
      }

      showServerSuccess('Your account has been created. You can now sign in.');
      setTimeout(() => {
        FlowRouter.go('/auth/login');
      }, 1200);
    } catch (error: unknown) {
      const code = (error as { error?: string })?.error;
      const reason = (error as { reason?: string })?.reason || '';
      if (code === 'signup-disabled') {
        showServerError('Public signup is currently disabled.');
        return;
      }
      if (code === 'weak-password') {
        const minPasswordLength = Number(Session.get('minPasswordLength')) || 8;
        showServerError(reason || `Password must be at least ${minPasswordLength} characters long.`);
        return;
      }
      if (code === 'invalid-email') {
        showServerError('Enter a valid email address.');
        return;
      }
      if (code === 'duplicate-user') {
        showServerError('We could not create that account. If you already have one, sign in or reset your password.');
        return;
      }
      showServerError('We could not create that account right now. Please try again.');
    }
  },

  'blur #signUpUsername': function() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String($('#signUpUsername').val() || '').trim())) {
      showFieldMessage('#usernameInvalid');
    } else {
      hideFieldMessage('#usernameInvalid');
    }
  },

  'blur #password1': function() {
    const minPasswordLength = Number(Session.get('minPasswordLength')) || 8;
    const len = $('#password1').val().length;
    if (len < minPasswordLength) {
      showFieldMessage('#passwordTooShort');
    } else {
      hideFieldMessage('#passwordTooShort');
    }
  },

  'blur #password2': function() {
    if ($('#password1').val() !== $('#password2').val()) {
      showFieldMessage('#passwordMustMatch');
    } else {
      hideFieldMessage('#passwordMustMatch');
    }
  },
});

Template.signUp.onRendered(function() {
  //check if the user is already logged in
  if (Meteor.userId()) {
    FlowRouter.go('/home');
  }
  clearServerMessage();
  void Meteor.callAsync<{
    allowPublicSignup?: boolean;
    requireEmailVerification?: boolean;
    minPasswordLength?: number;
  }>('getAuthClientConfig').then((authClientConfig) => {
    Session.set('allowPublicSignup', !!authClientConfig?.allowPublicSignup);
    Session.set('requireEmailVerification', !!authClientConfig?.requireEmailVerification);
    Session.set('minPasswordLength', Number(authClientConfig?.minPasswordLength) || 8);
  });
});

Template.signUp.helpers({
  minPasswordLength() {
    return Number(Session.get('minPasswordLength')) || 8;
  },
  signUpInstructionCopy() {
    return Session.get('requireEmailVerification')
      ? 'If email verification is enabled, we’ll email you a confirmation link before you can sign in.'
      : 'You can sign in as soon as your account is created.';
  }
});


