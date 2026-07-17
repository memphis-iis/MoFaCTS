import './resetPassword.html';
import { translatePlatformString, type TranslationValues } from '../../lib/interfaceI18n';
import { getActiveUiLocale } from '../../lib/interfaceLocaleState';

declare const Template: {
  resetPassword: {
    onRendered(callback: () => void): void;
    events(map: Record<string, (event: Event) => void | Promise<void>>): void;
    helpers(map: Record<string, (...args: any[]) => unknown>): void;
  };
};
declare const Session: {
  get<T = unknown>(key: string): T;
  set(key: string, value: unknown): void;
};
declare const $: (selector: string) => {
  val(): unknown;
  val(value: string): void;
  prop(name: string, value: boolean): void;
  hide(): void;
  show(): void;
  text(value: string): void;
};

type MeteorWithCallAsync = {
  callAsync<T = unknown>(name: string, ...args: unknown[]): Promise<T>;
  user(): { loginParams?: { loginMode?: string } } | null;
};
declare const Meteor: MeteorWithCallAsync;
const { FlowRouter } = require('meteor/ostrio:flow-router-extra') as {
  FlowRouter: {
    go(path: string): void;
    current(): { route?: { name?: string }; queryParams?: Record<string, string | undefined> };
  };
};

const MIN_PASSWORD_LENGTH = 8;
const RESET_STATUS_KEY = 'resetPasswordStatusMessage';
const RESET_ERROR_KEY = 'resetPasswordErrorMessage';
const RESET_ERROR_FIELD_KEY = 'resetPasswordErrorField';
const RESET_TOKEN_KEY = 'resetPasswordLinkToken';
const RESET_EMAIL_KEY = 'resetPasswordLinkEmail';

function authText(key: Parameters<typeof translatePlatformString>[1], values?: TranslationValues): string {
  return translatePlatformString(getActiveUiLocale(), key, values);
}

function normalizeEmailForReset(rawValue: unknown): string {
  return String(rawValue || '').trim().toLowerCase();
}

function showResetStage(stage: 'request' | 'reset') {
  if (stage === 'reset') {
    $('#sendPasswordEmail').prop('hidden', true);
    $('#sendPasswordEmail').hide();
    $('#resetPasswordForm').prop('hidden', false);
    $('#resetPasswordForm').show();
    return;
  }
  $('#sendPasswordEmail').prop('hidden', false);
  $('#sendPasswordEmail').show();
  $('#resetPasswordForm').prop('hidden', true);
  $('#resetPasswordForm').hide();
}

function setResetStatus(message: string) {
  Session.set(RESET_STATUS_KEY, message);
}

function setResetError(message: string, field = 'form') {
  Session.set(RESET_ERROR_KEY, message);
  Session.set(RESET_ERROR_FIELD_KEY, message ? field : '');
}

function clearResetMessages() {
  setResetStatus('');
  setResetError('');
}

function focusResetField(fieldId: string): void {
  document.getElementById(fieldId)?.focus();
}

Template.resetPassword.onRendered(function() {
  clearResetMessages();
  Session.set(RESET_TOKEN_KEY, '');
  Session.set(RESET_EMAIL_KEY, '');
  if (Session.get('loginMode') !== 'experiment') {
    Session.set('loginMode', 'password');
  }
  void Meteor.callAsync<{
    requireEmailVerification?: boolean;
    minPasswordLength?: number;
  }>('getAuthClientConfig').then((authClientConfig) => {
    Session.set('requireEmailVerification', !!authClientConfig?.requireEmailVerification);
    Session.set('minPasswordLength', Number(authClientConfig?.minPasswordLength) || 8);
  }).catch(() => {
    Session.set('minPasswordLength', 8);
  });
  const routeName = FlowRouter.current()?.route?.name || '';
  const queryParams = FlowRouter.current()?.queryParams || {};
  const resetToken = String(queryParams.token || '');
  const resetEmail = normalizeEmailForReset(queryParams.email || '');
  const stage = routeName === 'client.authResetPassword' || resetToken ? 'reset' : 'request';
  showResetStage(stage);
  if (resetEmail) {
    Session.set(RESET_EMAIL_KEY, resetEmail);
    $('#email').val(resetEmail);
    $('#email2').val(resetEmail);
  }
  if (resetToken) {
    Session.set(RESET_TOKEN_KEY, resetToken);
    if (resetEmail) {
      setResetStatus(authText('auth.resetChooseNewPassword'));
    } else {
      setResetStatus(authText('auth.resetEnterEmailAndChooseNewPassword'));
    }
    return;
  }
  if (stage === 'reset') {
    setResetStatus(authText('auth.resetCheckEmailLink'));
  }
});

// //////////////////////////////////////////////////////////////////////////
// Template Events

Template.resetPassword.events({
  'click #sendSecret': async function(event: Event) {
      event.preventDefault();
      clearResetMessages();
      const email = normalizeEmailForReset($('#email').val());
      if (!email) {
        setResetError(authText('auth.resetEnterEmailForLink'), 'request-email');
        focusResetField('email');
        return;
      }
      try {
        await Meteor.callAsync<{ success?: boolean }>('requestPasswordReset', email);
        setResetStatus(authText('auth.resetLinkSentIfAccountExists'));
        FlowRouter.go(`/auth/reset-password?email=${encodeURIComponent(email)}`);
      } catch (err: unknown) {
        const errorCode = (err as { error?: string })?.error;
        if (errorCode === 'rate-limit') {
          setResetError(authText('auth.resetRateLimit'));
        } else {
          setResetError(authText('auth.resetEmailSendFailed'));
        }
      }
  },
  'click #resetPasswordButton': async function(event: Event) {
    event.preventDefault();
    clearResetMessages();
    const email = normalizeEmailForReset($('#email2').val());
    const token = String(Session.get(RESET_TOKEN_KEY) || '');
    const newPassword = String($('#password').val() || '');
    const confirmPassword = String($('#passwordVerify').val() || '');

    if (!email) {
      if (token) {
        setResetError(authText('auth.resetEnterAccountEmail'), 'reset-email');
        focusResetField('email2');
      } else {
        setResetError(authText('auth.resetOpenEmailLink'));
      }
      return;
    }
    if (!token) {
      setResetError(authText('auth.resetLinkIncompleteExpired'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError(authText('auth.passwordsMustMatch'), 'password-verify');
      focusResetField('passwordVerify');
      return;
    }
    const minPasswordLength = Number(Session.get('minPasswordLength')) || MIN_PASSWORD_LENGTH;
    if (newPassword.length < minPasswordLength) {
      setResetError(authText('auth.passwordTooShort', { min: minPasswordLength }), 'password');
      focusResetField('password');
      return;
    }

    try {
      await Meteor.callAsync('resetPasswordWithToken', email, token, newPassword);
      setResetStatus(authText('auth.resetPasswordResetRedirect'));
      Session.set(RESET_TOKEN_KEY, '');
      setTimeout(() => {
        FlowRouter.go('/auth/login');
      }, 1200);
    } catch (err: unknown) {
      const errorCode = (err as { error?: string })?.error;
      if (errorCode === 'invalid-token') {
        setResetError(authText('auth.resetLinkInvalidExpired'));
      } else if (errorCode === 'weak-password') {
        setResetError(authText('auth.passwordTooWeak'), 'password');
      } else {
        setResetError(authText('auth.genericTryAgain'));
      }
    }
  },
});

// //////////////////////////////////////////////////////////////////////////
// Template Helpers

Template.resetPassword.helpers({
  secret: function() {
    return Meteor.user()?.loginParams?.loginMode === 'experiment';
  },
  resetPasswordStatusMessage() {
    return Session.get(RESET_STATUS_KEY);
  },
  resetPasswordErrorMessage() {
    return Session.get(RESET_ERROR_KEY);
  },
  resetFieldErrorAttrs(field: string, errorId: string) {
    return Session.get(RESET_ERROR_FIELD_KEY) === field
      ? { 'aria-invalid': 'true', 'aria-describedby': errorId }
      : { 'aria-invalid': 'false' };
  },
  requestEmailErrorMessage() {
    return Session.get(RESET_ERROR_FIELD_KEY) === 'request-email' ? Session.get(RESET_ERROR_KEY) : '';
  },
  resetEmailErrorMessage() {
    return Session.get(RESET_ERROR_FIELD_KEY) === 'reset-email' ? Session.get(RESET_ERROR_KEY) : '';
  },
  resetPasswordFieldErrorMessage() {
    return Session.get(RESET_ERROR_FIELD_KEY) === 'password' ? Session.get(RESET_ERROR_KEY) : '';
  },
  resetPasswordVerifyErrorMessage() {
    return Session.get(RESET_ERROR_FIELD_KEY) === 'password-verify' ? Session.get(RESET_ERROR_KEY) : '';
  },
  resetFormErrorMessage() {
    return Session.get(RESET_ERROR_FIELD_KEY) === 'form' ? Session.get(RESET_ERROR_KEY) : '';
  },
  resetPasswordLinkReady() {
    return !!Session.get(RESET_TOKEN_KEY);
  },
  resetPasswordHasPrefilledEmail() {
    return !!Session.get(RESET_EMAIL_KEY);
  },
  minPasswordLength() {
    return Number(Session.get('minPasswordLength')) || MIN_PASSWORD_LENGTH;
  }
});

