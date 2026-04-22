import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { Session } from 'meteor/session';
import { meteorCallAsync } from '../..';
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
  Session.setDefault('verificationStatusMessage', 'Check your email for a verification link.');
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
    setVerificationStatus('Check your email for a verification link, or request a new verification email below.');
    setVerificationError('');
    Session.set('showVerificationResend', true);
    return;
  }

  setVerificationStatus('Verifying your email now...');
  setVerificationError('');
  Session.set('showVerificationResend', false);
  void verifyEmailTokenOnClient(token).then(() => {
    setVerificationStatus('Your email has been verified. You can now sign in.', 'success');
    setTimeout(() => {
      FlowRouter.go('/auth/login');
    }, 1200);
  }).catch((error: { error?: string; reason?: string }) => {
    if (error?.error === 'invalid-token') {
      setVerificationStatus('That verification link is invalid or expired. Request a new verification email below.');
      setVerificationError('');
    } else {
      setVerificationStatus('We could not complete email verification.');
      setVerificationError(error?.reason || 'Request a new verification email below.');
    }
    Session.set('showVerificationResend', true);
  });
});

Template.verifyEmail.events({
  'click #resendVerificationEmailButton': async function(event: Event) {
    event.preventDefault();
    const email = String($('#verificationEmailAddress').val() || '').trim().toLowerCase();
    if (!email) {
      setVerificationError('Enter the email address for the account you want to verify.');
      return;
    }
    setVerificationError('');
    try {
      await meteorCallAsync('resendVerificationEmail', email);
      setVerificationStatus('If that account exists and still needs verification, a new verification email has been sent.', 'success');
      setVerificationError('');
    } catch (error: any) {
      if (error?.error === 'verification-rate-limit') {
        setVerificationError(error?.reason || 'A verification email was sent recently. Please wait before trying again.');
        return;
      }
      setVerificationError('We could not send a verification email right now. Please try again.');
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
