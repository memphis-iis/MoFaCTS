import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { Session } from 'meteor/session';
import { meteorCallAsync } from '../..';
import { translatePlatformString } from '../../lib/interfaceI18n';
import { getActiveUiLocale } from '../../lib/interfaceLocaleState';
import './verifyEmail.html';

declare const Template: {
  verifyEmail: {
    onRendered(callback: () => void): void;
    events(map: Record<string, (event: Event) => void | Promise<void>>): void;
    helpers(map: Record<string, () => unknown>): void;
  };
};
declare const $: (selector: string) => {
  val(): unknown;
  val(value: string): void;
};

const { FlowRouter } = require('meteor/ostrio:flow-router-extra') as {
  FlowRouter: {
    current(): { queryParams?: Record<string, string | undefined> };
    go(path: string): void;
  };
};

function getVerificationEmailAddress(): string {
  const user = Meteor.user() as { email_canonical?: string; emails?: Array<{ address?: string }> } | null;
  return user?.email_canonical || user?.emails?.[0]?.address || '';
}

function authText(key: any) {
  return translatePlatformString(getActiveUiLocale(), key);
}

function setVerificationStatus(message: string, tone: 'muted' | 'success' = 'muted') {
  Session.set('verificationStatusMessage', message);
  Session.set('verificationStatusTone', tone);
}

function setVerificationError(message: string) {
  Session.set('verificationErrorMessage', message);
}

async function verifyEmailTokenOnClient(token: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    Accounts.verifyEmail(token, (error?: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

Template.verifyEmail.onRendered(function() {
  Session.setDefault('verificationStatusMessage', authText('auth.checkEmailForVerification'));
  Session.setDefault('verificationStatusTone', 'muted');
  Session.setDefault('verificationErrorMessage', '');
  Session.setDefault('showVerificationResend', true);

  const queryParams = FlowRouter.current()?.queryParams || {};
  const token = String(queryParams.token || '').trim();
  const defaultEmail = getVerificationEmailAddress() || String(queryParams.email || '').trim().toLowerCase();
  if (defaultEmail) {
    $('#verificationEmailAddress').val(defaultEmail);
  }

  if (!token) {
    setVerificationStatus(authText('auth.checkEmailOrRequestVerification'));
    setVerificationError('');
    Session.set('showVerificationResend', true);
    return;
  }

  setVerificationStatus(authText('auth.verifyingEmailNow'));
  setVerificationError('');
  Session.set('showVerificationResend', false);
  void verifyEmailTokenOnClient(token).then(() => {
    setVerificationStatus(authText('auth.emailVerifiedSignIn'), 'success');
    setTimeout(() => {
      FlowRouter.go('/auth/login');
    }, 1200);
  }).catch((error: { error?: string; reason?: string }) => {
    if (error?.error === 'invalid-token') {
      setVerificationStatus(authText('auth.invalidVerificationLink'));
      setVerificationError('');
    } else {
      setVerificationStatus(authText('auth.emailVerificationFailed'));
      setVerificationError(authText('auth.requestNewVerificationEmail'));
    }
    Session.set('showVerificationResend', true);
  });
});

Template.verifyEmail.events({
  'click #resendVerificationEmailButton': async function(event: Event) {
    event.preventDefault();
    const email = String($('#verificationEmailAddress').val() || '').trim().toLowerCase();
    if (!email) {
      setVerificationError(authText('auth.enterVerificationEmail'));
      return;
    }
    setVerificationError('');
    try {
      await meteorCallAsync('resendVerificationEmail', email);
      setVerificationStatus(authText('auth.verificationEmailSentIfNeeded'), 'success');
      setVerificationError('');
    } catch (error: any) {
      if (error?.error === 'verification-rate-limit') {
        setVerificationError(authText('auth.verificationEmailRateLimit'));
        return;
      }
      setVerificationError(authText('auth.verificationEmailSendFailed'));
    }
  }
});

Template.verifyEmail.helpers({
  verificationStatusMessage() {
    return Session.get('verificationStatusMessage');
  },
  verificationStatusClass() {
    return Session.get('verificationStatusTone') === 'success' ? 'text-success' : '';
  },
  verificationErrorMessage() {
    return Session.get('verificationErrorMessage');
  },
  showVerificationResend() {
    return Session.get('showVerificationResend');
  }
});
