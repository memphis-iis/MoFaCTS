// Extracted to break circular dependency between index.js and home.js
import { clientConsole, loadClientSettings } from './clientLogger';
import { sessionCleanUp } from './sessionUtils';
import { Cookie } from './cookies';

export { clientConsole, loadClientSettings };

const SESSION_CHECK_INTERVAL_MS = 1000;

declare const Session: any;
declare const Meteor: any;
const { FlowRouter } = require('meteor/ostrio:flow-router-extra') as {
  FlowRouter: { go(path: string): void };
};

export function startSessionCheckInterval(reason = '') {
  const existingInterval = Session.get('sessionCheckInterval');
  if (existingInterval) {
    return existingInterval;
  }

  const runSessionCheck = async () => {
    try {
      await checkUserSession();
    } catch (error) {
      clientConsole(1, '[SESSION] Session check failed:', error);
    }
  };

  // Run once immediately to register the session quickly.
  runSessionCheck();

  const intervalId = Meteor.setInterval(runSessionCheck, SESSION_CHECK_INTERVAL_MS);
  Session.set('sessionCheckInterval', intervalId);
  clientConsole(2, '[SESSION] Session check interval started', reason || '(no reason)');
  return intervalId;
}

export function stopSessionCheckInterval(reason = '') {
  const intervalId = Session.get('sessionCheckInterval');
  if (!intervalId) {
    return;
  }

  Meteor.clearInterval(intervalId);
  Session.set('sessionCheckInterval', null);
  clientConsole(2, '[SESSION] Session check interval stopped', reason || '(no reason)');
}

export function initTabDetection() {
  // With per-tab auth storage, we rely on server session invalidation.
  clientConsole(2, '[SESSION] Per-tab auth storage active; tab broadcast not required');
}

function forceLogoutForNewTab(reason: string) {
  if (Session.get('multiTabLogoutInProgress')) {
    clientConsole(2, '[SESSION] Logout already in progress, skipping:', reason);
    return;
  }

  Session.set('multiTabLogoutInProgress', true);
  clientConsole(1, '[SESSION] ' + reason + ' - logging out this tab to enforce single session');

  Session.set('loginMode', 'normal');
  Cookie.set('isExperiment', '0', 1);
  Cookie.set('experimentTarget', '', 1);
  Cookie.set('experimentXCond', '', 1);
  Session.set('lastSessionId', null);
  Session.set('lastSessionIdTimestamp', null);

  const finalizeLogout = () => {
    sessionCleanUp();
    Session.set('curModule', 'signinoauth');
    Session.set('currentTemplate', 'signIn');
    Session.set('appLoading', false);
    FlowRouter.go('/');
    Meteor.setTimeout(() => {
      Session.set('multiTabLogoutInProgress', false);
    }, 3000);
  };

  if (Meteor.userId()) {
    Meteor.logout((error: unknown) => {
      if (error) {
        clientConsole(1, '[SESSION] Logout error:', error);
      }
      finalizeLogout();
    });
  } else {
    finalizeLogout();
  }
}

export async function checkUserSession(): Promise<void> {
  // Guard against null user or connection
  if (!Meteor.user() || !Meteor.default_connection || !Meteor.default_connection._lastSessionId) {
    return;
  }

  const currentSessionId = Meteor.default_connection._lastSessionId;
  const lastSessionId = Meteor.user().lastSessionId;
  const lastSessionIdTimestampServer = Meteor.user().lastSessionIdTimestamp;
  const lastSessionIdTimestampClient = Session.get('lastSessionIdTimestamp');
  const storedSessionId = Session.get('lastSessionId');

  if (lastSessionIdTimestampClient && lastSessionId && lastSessionIdTimestampServer && lastSessionIdTimestampClient < lastSessionIdTimestampServer) {
    forceLogoutForNewTab('Server session updated by another login');
    return;
  }

  if (!lastSessionIdTimestampClient || currentSessionId !== storedSessionId) {
    const currentSessionIdTimestamp = Date.now();
    Meteor.callAsync('setUserSessionId', currentSessionId, currentSessionIdTimestamp);
    Session.set('lastSessionId', currentSessionId);
    Session.set('lastSessionIdTimestamp', currentSessionIdTimestamp);
  }
}

