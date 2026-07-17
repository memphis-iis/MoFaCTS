import {sessionCleanUp} from '../../lib/sessionUtils';
import {routeToSignin} from '../../lib/router';
import { translatePlatformString, type TranslationValues } from '../../lib/interfaceI18n';
import { getActiveUiLocale } from '../../lib/interfaceLocaleState';
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

function authText(key: Parameters<typeof translatePlatformString>[1], values?: TranslationValues): string {
  return translatePlatformString(getActiveUiLocale(), key, values);
}

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

function fieldMessageInputId(selector: string): string {
  const messageId = selector.replace(/^#/, '');
  if (messageId === 'usernameInvalid') return 'signUpUsername';
  if (messageId === 'passwordTooShort') return 'password1';
  return 'password2';
}

function showFieldMessage(selector: string) {
  $(selector).prop('hidden', false).show();
  const messageId = selector.replace(/^#/, '');
  const input = document.getElementById(fieldMessageInputId(selector));
  input?.setAttribute('aria-invalid', 'true');
  input?.setAttribute('aria-describedby', messageId);
}

function hideFieldMessage(selector: string) {
  $(selector).prop('hidden', true).hide();
  const input = document.getElementById(fieldMessageInputId(selector));
  input?.setAttribute('aria-invalid', 'false');
  input?.removeAttribute('aria-describedby');
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

    const checks: string[] = [];

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
      const firstCheck = checks[0];
      if (firstCheck) document.getElementById(fieldMessageInputId(firstCheck))?.focus();
      return;
    }

    try {
      await Meteor.callAsync('signUpUser', formUsername, formPassword1);
      sessionCleanUp();
      const requireEmailVerification = !!Session.get('requireEmailVerification');
      if (requireEmailVerification) {
        showServerSuccess(authText('auth.accountCreatedVerifyEmail'));
        setTimeout(() => {
          FlowRouter.go('/auth/verify-email');
        }, 1200);
        return;
      }

      showServerSuccess(authText('auth.accountCreatedCanSignIn'));
      setTimeout(() => {
        FlowRouter.go('/auth/login');
      }, 1200);
    } catch (error: unknown) {
      const code = (error as { error?: string })?.error;
      if (code === 'signup-disabled') {
        showServerError(authText('auth.publicSignupDisabled'));
        return;
      }
      if (code === 'weak-password') {
        const minPasswordLength = Number(Session.get('minPasswordLength')) || 8;
        showServerError(authText('auth.passwordTooShort', { min: minPasswordLength }));
        return;
      }
      if (code === 'invalid-email') {
        showServerError(authText('auth.enterValidEmail'));
        return;
      }
      if (code === 'duplicate-user') {
        showServerError(authText('auth.accountCreateDuplicate'));
        return;
      }
      showServerError(authText('auth.accountCreateFailed'));
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
      ? authText('auth.signUpInstructionVerifyEmail')
      : authText('auth.signUpInstructionImmediate');
  }
});


