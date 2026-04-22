import './resetPassword.html';

declare const Template: {
  resetPassword: {
    onRendered(callback: () => void): void;
    events(map: Record<string, (event: Event) => void | Promise<void>>): void;
    helpers(map: Record<string, () => unknown>): void;
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
const RESET_TOKEN_KEY = 'resetPasswordLinkToken';
const RESET_EMAIL_KEY = 'resetPasswordLinkEmail';

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

function setResetError(message: string) {
  Session.set(RESET_ERROR_KEY, message);
}

function clearResetMessages() {
  setResetStatus('');
  setResetError('');
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
      setResetStatus('Choose a new password for this account.');
    } else {
      setResetStatus('Enter your email address and choose a new password for this account.');
    }
    return;
  }
  if (stage === 'reset') {
    setResetStatus('Check your email for the password reset link to continue.');
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
        setResetError('Enter your email address to receive a reset link.');
        return;
      }
      try {
        await Meteor.callAsync<{ success?: boolean }>('requestPasswordReset', email);
        setResetStatus('If that account exists, a password reset link has been sent to your email.');
        FlowRouter.go(`/auth/reset-password?email=${encodeURIComponent(email)}`);
      } catch (err: unknown) {
        const errorCode = (err as { error?: string })?.error;
        if (errorCode === 'rate-limit') {
          setResetError('Too many reset requests. Please wait a minute and try again.');
        } else {
          setResetError('We could not send a reset email right now. Please try again later.');
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
        setResetError('Enter the email address for the account you are resetting.');
      } else {
        setResetError('Open the password reset link from your email to continue.');
      }
      return;
    }
    if (!token) {
      setResetError('This reset link is incomplete or expired. Request a new password reset email.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match.');
      return;
    }
    const minPasswordLength = Number(Session.get('minPasswordLength')) || MIN_PASSWORD_LENGTH;
    if (newPassword.length < minPasswordLength) {
      setResetError(`Password must be at least ${minPasswordLength} characters.`);
      return;
    }

    try {
      await Meteor.callAsync('resetPasswordWithToken', email, token, newPassword);
      setResetStatus('Your password has been reset. Redirecting to sign in...');
      Session.set(RESET_TOKEN_KEY, '');
      setTimeout(() => {
        FlowRouter.go('/auth/login');
      }, 1200);
    } catch (err: unknown) {
      const errorCode = (err as { error?: string })?.error;
      const errorReason = (err as { reason?: string })?.reason;
      if (errorCode === 'invalid-token') {
        setResetError('This reset link is invalid or expired. Request a new password reset email.');
      } else if (errorCode === 'weak-password') {
        setResetError(errorReason || 'Password is too weak.');
      } else {
        setResetError('An error occurred. Please try again.');
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

