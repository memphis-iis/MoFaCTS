import {ENTER_KEY} from '../common/Definitions';
import '../common/Collections';
import '../common/globalHelpers';
import {sessionCleanUp} from './lib/sessionUtils';
import './lib/authStorage';
import { restartMainCardTimeoutIfNecessary } from './views/experiment/modules/cardTimeouts';
import { CardStore } from './views/experiment/modules/cardStore';
import { ExperimentStateStore } from './lib/state/experimentStateStore';
import {instructContinue} from './views/experiment/instructions';
import {routeToSignin} from './lib/router';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import {
  getCurrentTheme
} from './lib/currentTestingHelpers';
import DOMPurify from 'dompurify';
import {audioManager} from './lib/audioContextManager';
import {
  clientConsole,
  initTabDetection,
  loadClientSettings,
  startSessionCheckInterval,
  stopSessionCheckInterval,
} from './lib/userSessionHelpers';
import {Cookie} from './lib/cookies';
import {currentUserHasRole, hasRoleFromAuthFlags} from './lib/roleUtils';
import { getErrorMessage } from './lib/errorUtils';
import './index.html';

// =============================================================================
// Blaze Template Registration
// rspack only bundles files reachable from the import graph. Under the old
// Meteor bundler every file in client/ was auto-included; with rspack we must
// explicitly import each template module so its HTML + helpers/events are
// registered before the router tries to render them.
// =============================================================================

// -- Home / Auth --
import './views/home/home';
import './views/home/learningDashboard';
import './views/home/profileDebugToggles';
import './views/login/signIn';
import './views/login/signUp';
import './views/login/resetPassword';
import './views/login/verifyEmail';

// -- Top-level views --
// Keep navigation eagerly loaded because DefaultLayout references it globally.
import './views/navigation';

// -- Experiment --
import './views/experiment/multiTdfSelect';
import './views/experiment/inputF';
// Lazily loaded route modules are loaded from client/lib/router.js:
// - admin/help/theme/turk/user/test pages
// - experiment setup editor/upload pages
// - experiment reporting pages

// Security: HTML sanitization for user-generated content
// Allow safe formatting tags but block scripts, iframes, and event handlers
function sanitizeHTML(dirty: string | null | undefined) {
  if (!dirty) return '';

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'span', 'div',
                   'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                   'table', 'tr', 'td', 'th', 'thead', 'tbody',
                   'ul', 'ol', 'li', 'center', 'a', 'img', 'audio', 'source'],
    ALLOWED_ATTR: ['style', 'class', 'id', 'border', 'href', 'src', 'alt', 'width', 'height', 'controls', 'preload', 'data-audio-id'],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur']
  });
}

export { clientConsole };

function getSystemName() {
  const configuredName = Meteor.settings.public?.systemName;
  if (typeof configuredName === 'string' && configuredName.trim()) {
    return configuredName.trim();
  }
  return 'MoFaCTS';
}

// This redirects to the SSL version of the page if we're not on it
const forceSSL = Meteor.settings.public.forceSSL || false;
// forceSSL setting logged via clientConsole after it's defined
if (location.protocol !== 'https:' && forceSSL) {
  location.href = location.href.replace(/^http:/, 'https:');
}

// PHASE 1.5: Initialize theme subscription after Meteor is ready
Meteor.startup(() => {
  getCurrentTheme();

  // Modern browsers (Safari 15.4+, Chrome 108+, Firefox 101+) use native dvh/svh units
  // CSS has been updated to use modern viewport units (see classic.css)
  // This code remains active for backwards compatibility with older browsers
  setDynamicViewportHeight();
});


// MO9: Modern CSS now uses dvh/svh units which handle this natively
// This function still runs to support:
//   1. Older browsers without dvh/svh support (pre-2022)
function setDynamicViewportHeight() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);

  clientConsole(2, `[MO9] Set dynamic viewport height (legacy fallback): ${vh}px per 1vh`);
}

let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function isResizeSensitivePhase() {
  // SR/trial-active phases are sensitive to repeated resize work and can race SR callbacks.
  return CardStore.isRecording() ||
    CardStore.isInputReady() ||
    CardStore.getSrValue('waitingForTranscription') === true;
}

function scheduleResizeWork(source: string) {
  const resizeSensitive = isResizeSensitivePhase();
  const debounceMs = resizeSensitive ? 350 : 90;
  if (resizeDebounceTimer) {
    clearTimeout(resizeDebounceTimer);
  }

  resizeDebounceTimer = setTimeout(() => {
    resizeDebounceTimer = null;
    clientConsole(2, `[RESIZE DEBUG] Coalesced resize (${source}) at ${Date.now()} | ${window.innerWidth}x${window.innerHeight} | sensitive=${resizeSensitive}`);
    setDynamicViewportHeight();
    // Skip image layout thrash while SR/trial input is active.
    if (!resizeSensitive) {
      redoCardImage();
    }
  }, debounceMs);
}

// Update on resize (orientation change, window resize)
window.addEventListener('resize', function() {
  scheduleResizeWork('window');
});

// Update on orientation change (mobile rotation)
window.addEventListener('orientationchange', () => {
  // Small delay to let browser finish orientation change
  setTimeout(() => scheduleResizeWork('orientationchange'), 100);
});

// Register the isInRole helper for templates (Meteor 3.0 compatibility)
// Check roles synchronously on client using user.roles array (reactively published)
// Supports comma-separated role lists (e.g., 'admin,teacher')
Session.setDefault('authReady', false);
Session.setDefault('authRoles', { admin: false, teacher: false });
Session.setDefault('authRolesHydrated', false);
Session.setDefault('authRolesSyncedUserId', null);
const AUTH_ROLE_CACHE_KEY = 'mofacts.authRoles.v1';

let authSyncSeq = 0;
let lastAuthSyncedUserId: string | null = null;

function loadCachedAuthRoles() {
  try {
    const raw = localStorage.getItem(AUTH_ROLE_CACHE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    const cachedRoles = {
      admin: !!parsed?.admin,
      teacher: !!parsed?.teacher
    };
    Session.set('authRoles', cachedRoles);
  } catch (_error) {
    // Ignore malformed cache and continue with server sync.
  }
}

function cacheAuthRoles(authRoles: { admin: boolean; teacher: boolean }) {
  try {
    localStorage.setItem(AUTH_ROLE_CACHE_KEY, JSON.stringify({
      admin: !!authRoles.admin,
      teacher: !!authRoles.teacher
    }));
  } catch (_error) {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

async function syncAuthRolesFromServer(reason: string) {
  const userId = Meteor.userId();
  if (!userId) {
    lastAuthSyncedUserId = null;
    const clearedRoles = { admin: false, teacher: false };
    Session.set('authRoles', clearedRoles);
    cacheAuthRoles(clearedRoles);
    Session.set('authRolesSyncedUserId', null);
    Session.set('authRolesHydrated', true);
    Session.set('authReady', true);
    return;
  }

  const seq = ++authSyncSeq;
  Session.set('authRolesHydrated', false);
  Session.set('authRolesSyncedUserId', null);
  try {
    const roleFlags = await MeteorAny.callAsync('getCurrentUserRoleFlags');
    if (seq !== authSyncSeq || Meteor.userId() !== userId) {
      return;
    }
    const syncedRoles = {
      admin: !!roleFlags?.admin,
      teacher: !!roleFlags?.teacher
    };
    Session.set('authRoles', syncedRoles);
    cacheAuthRoles(syncedRoles);
  } catch (error: unknown) {
    clientConsole(1, '[AUTH] Failed to sync role flags from server:', reason, getErrorMessage(error));
    if (seq !== authSyncSeq || Meteor.userId() !== userId) {
      return;
    }
    const failedRoles = { admin: false, teacher: false };
    Session.set('authRoles', failedRoles);
    cacheAuthRoles(failedRoles);
  } finally {
    if (seq === authSyncSeq && Meteor.userId() === userId) {
      lastAuthSyncedUserId = userId;
      Session.set('authRolesSyncedUserId', userId);
      Session.set('authRolesHydrated', true);
      Session.set('authReady', true);
    }
  }
}

Template.registerHelper('isInRole', function(role: string) {
  // Once hydrated, role flags are authoritative to prevent post-paint role pop-in.
  if (Session.get('authRolesHydrated') === true) {
    return hasRoleFromAuthFlags(role);
  }
  return currentUserHasRole(role);
});

import { meteorCallAsync } from './lib/meteorAsync';
/** @typedef {import('../server/methods/dashboardCacheMethods.contracts').UpdateDashboardCacheResult} UpdateDashboardCacheResult */

import { legacyDisplay } from '../common/underscoreCompat';

export { meteorCallAsync };
const MeteorAny = Meteor as any;
const SessionAny = Session as any;
const windowAny = window as any;

function getCardState(key: string) {
  return CardStore.getCardValue(key);
}

function setCardState(key: string, value: unknown) {
  CardStore.setCardValue(key, value);
}

// Make clientConsole globally available for Meteor packages
window.clientConsole = clientConsole;
// Expose FlowRouter for debugging in console
windowAny.FlowRouter = FlowRouter;

// function meteorCallAsync(funcName, ...rest) {
//   const promisedMeteorCall = Promise.promisify(Meteor.call);
//   return promisedMeteorCall.apply(null, [funcName, rest]);
// }

// This will be setup for window resize, but is made global so that the
// card template page can hook it up as well
function redoCardImage() {
  clientConsole(2, `[RESIZE DEBUG] 🖼️  redoCardImage called at ${Date.now()}`);
  // Early exit if no image element exists - prevents unnecessary layout queries on text trials
  const imgElement = $('#cardQuestionImg')[0];
  if (!imgElement) {
    clientConsole(2, `[RESIZE DEBUG]   - Skipped: no #cardQuestionImg element`);
    return;
  }

  clientConsole(2, `[RESIZE DEBUG]   - Image element found, querying window dimensions`);
  // Note that just in case we can't get the height on the window we punt
  // with a default that is reasonable a lot of the time
  const wid = $(window).width() || 640;
  const hgt = $(window).height() || 480;
  clientConsole(2, `[RESIZE DEBUG]   - Window: ${wid}x${hgt}`);
  let heightStr;
  let widthStr;

  if (wid > hgt) {
    // Landscape - assume that we want the image to fit entirely along
    // with the answer box on a fairly sane screen
    heightStr = legacyDisplay(Math.floor(hgt * 0.45)) + 'px';
    widthStr = 'auto';
  } else {
    // Portrait - set the image to be the width of the screen. They'll
    // probably need to scroll for tall images
    heightStr = 'auto';
    widthStr = '90%';
  }

  clientConsole(2, `[RESIZE DEBUG]   - Setting image dimensions: ${widthStr} x ${heightStr}`);
  $('#cardQuestionImg').css('height', heightStr).css('width', widthStr);
  clientConsole(2, `[RESIZE DEBUG]   - ✓ Image resize complete`);
}

//change the theme of the page onlogin
Accounts.onLogin(function() {
  // Use Tracker to wait for user data to be fully loaded
  Tracker.autorun((computation) => {
    const user = Meteor.user();

    // Wait for user AND profile to be loaded
    if (user && user.profile) {
      computation.stop(); // Only run once

      // Check if the user has a profile with an email, first name, and last name
      if (!user.profile.username) {
        (async () => {
          try {
            const result = await MeteorAny.callAsync('populateSSOProfile', Meteor.userId());
            clientConsole(2, 'populateSSOProfile result:', result);
          } catch (error) {
            clientConsole(1, 'populateSSOProfile error:', error);
          }
        })();
      }
    }
  });
});

Accounts.onLogout(function() {
  authSyncSeq++;
  lastAuthSyncedUserId = null;
  const clearedRoles = { admin: false, teacher: false };
  Session.set('authRoles', clearedRoles);
  cacheAuthRoles(clearedRoles);
  Session.set('authRolesSyncedUserId', null);
  Session.set('authRolesHydrated', true);
  Session.set('authReady', true);
  stopSessionCheckInterval('accounts logout');
  Session.set('lastSessionId', null);
  Session.set('lastSessionIdTimestamp', null);
});

const PUBLIC_LOGOUT_PATHS = new Set([
  '/',
  '/auth/login',
  '/auth/signup',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
  '/auth/logout',
  '/signup',
  '/resetPassword',
  '/help',
  '/setTheme',
  '/signIn',
  '/signin',
]);

const PUBLIC_LOGOUT_PREFIXES = [
  '/experiment',
];

function isPublicLogoutPath(path: string | null | undefined) {
  const cleanPath = (path || '').split('?')[0];
  if (!cleanPath) {
    return false;
  }
  if (PUBLIC_LOGOUT_PATHS.has(cleanPath)) {
    return true;
  }
  return PUBLIC_LOGOUT_PREFIXES.some((prefix) => cleanPath.startsWith(prefix));
}

function handleUnexpectedLogout(currentPath: string) {
  if (isPublicLogoutPath(currentPath)) {
    return;
  }

  const expCookie = parseInt(Cookie.get('isExperiment') || '0', 10);
  const isExperiment = Session.get('loginMode') === 'experiment' || expCookie === 1;
  if (!isExperiment) {
    Session.set('loginMode', 'normal');
    Cookie.set('isExperiment', '0', 1);
    Cookie.set('experimentTarget', '', 1);
    Cookie.set('experimentXCond', '', 1);
  }

  clientConsole(1, '[AUTH] Session ended, redirecting to sign-in from', currentPath);
  Session.set('curModule', 'signinoauth');
  Session.set('currentTemplate', 'signIn');
  Session.set('appLoading', false);
  sessionCleanUp();
  routeToSignin();
}

let lastKnownUserId: string | null = null;
let pendingUnexpectedLogoutTimer: ReturnType<typeof setTimeout> | null = null;
let authObserverStartedAt = Date.now();
const AUTH_RESUME_GRACE_MS = 1200;
let authResumePendingSince: number | null = null;

function hasStoredLoginToken(): boolean {
  try {
    const accountsAny = Accounts as any;
    const tokenFromAccounts = typeof accountsAny?._storedLoginToken === 'function'
      ? accountsAny._storedLoginToken()
      : null;
    if (tokenFromAccounts) {
      return true;
    }
  } catch (_error) {
    // Fall through to localStorage checks.
  }

  try {
    const meteorAny = Meteor as any;
    const tokenFromMeteorStorage =
      meteorAny?._localStorage?.getItem?.('Meteor.loginToken') ||
      meteorAny?._localStorage?.getItem?.('Meteor.loginTokenExpires');
    return !!tokenFromMeteorStorage;
  } catch (_error) {
    return false;
  }
}

Meteor.startup(function() {

  Session.set('debugging', true);
  sessionCleanUp();
  loadCachedAuthRoles();

  // Subscribe to user audio settings so they're available on the client
  Tracker.autorun(function() {
    if (Meteor.userId()) {
      Meteor.subscribe('userAudioSettings');
    }
  });

  Accounts.onLoginFailure(function(error: unknown) {
    clientConsole(1, '[AUTH] Login failure:', error);
  });

  // Initialize multi-tab detection
  initTabDetection();

  // Keep a session check running whenever a user is logged in (all routes).
  Tracker.autorun(() => {
    const currentUserId = Meteor.userId();
    if (currentUserId) {
      startSessionCheckInterval('user logged in');
    } else {
      stopSessionCheckInterval('user logged out');
    }
  });

  Tracker.autorun(() => {
    const currentUserId = Meteor.userId();
    const currentUser = Meteor.user();
    const loggingIn = Meteor.loggingIn();
    const hasToken = hasStoredLoginToken();
    const shouldTrackResume = !currentUserId && !loggingIn && hasToken;
    if (shouldTrackResume && authResumePendingSince === null) {
      authResumePendingSince = Date.now();
    }
    if (!shouldTrackResume) {
      authResumePendingSince = null;
    }
    const waitingForResume =
      shouldTrackResume &&
      authResumePendingSince !== null &&
      (Date.now() - authResumePendingSince) < AUTH_RESUME_GRACE_MS;

    if (loggingIn && !currentUserId) {
      Session.set('authReady', false);
      Session.set('authRolesHydrated', false);
      Session.set('authRolesSyncedUserId', null);
      return;
    }

    if (!currentUserId) {
      lastAuthSyncedUserId = null;
      if (!waitingForResume) {
        const clearedRoles = { admin: false, teacher: false };
        Session.set('authRoles', clearedRoles);
        cacheAuthRoles(clearedRoles);
      }
      Session.set('authRolesHydrated', !waitingForResume);
      Session.set('authRolesSyncedUserId', null);
      Session.set('authReady', !waitingForResume);
      return;
    }

    if (!currentUser) {
      Session.set('authReady', false);
      Session.set('authRolesHydrated', false);
      Session.set('authRolesSyncedUserId', null);
      return;
    }

    // Fast path: user doc exists, so UI/routes can proceed immediately.
    if (Session.get('authReady') !== true) {
      Session.set('authReady', true);
    }

    // Background role verification; do not block paint or routing.
    if (lastAuthSyncedUserId !== currentUserId) {
      void syncAuthRolesFromServer('startup-tracker');
    }
  });

  Tracker.autorun(() => {
    const currentUserId = Meteor.userId();
    const currentPath = FlowRouter.current()?.path || window.location.pathname || '';
    const connected = Meteor.status?.().connected ?? true;
    const authReady = Session.get('authReady') === true;
    const observerGraceElapsed = Date.now() - authObserverStartedAt > 5000;

    // Never force logout redirects while reconnecting or while auth state is still settling.
    if (!connected || !authReady || !observerGraceElapsed) {
      if (pendingUnexpectedLogoutTimer) {
        clearTimeout(pendingUnexpectedLogoutTimer);
        pendingUnexpectedLogoutTimer = null;
      }
      lastKnownUserId = currentUserId;
      return;
    }

    if (lastKnownUserId && !currentUserId && !Meteor.loggingIn()) {
      if (pendingUnexpectedLogoutTimer) {
        clearTimeout(pendingUnexpectedLogoutTimer);
      }
      // Final debounce before redirecting; prevents transient auth races.
      pendingUnexpectedLogoutTimer = setTimeout(() => {
        pendingUnexpectedLogoutTimer = null;
        const stillConnected = Meteor.status?.().connected ?? true;
        const stillAuthReady = Session.get('authReady') === true;
        if (stillConnected && stillAuthReady && !Meteor.userId() && !Meteor.loggingIn()) {
          handleUnexpectedLogout(currentPath);
        }
      }, 1500);
    } else if (pendingUnexpectedLogoutTimer) {
      clearTimeout(pendingUnexpectedLogoutTimer);
      pendingUnexpectedLogoutTimer = null;
    }
    lastKnownUserId = currentUserId;
  });

  // Include any special jQuery handling we need (shared debounced scheduler).
  $(window).on('resize', function() {
    scheduleResizeWork('jquery');
  });
});

Template.DefaultLayout.onRendered(function() {
  loadClientSettings();
  $('#errorReportingModal').on('hidden.bs.modal', function() {
    clientConsole(2, 'error reporting modal hidden');
    restartMainCardTimeoutIfNecessary();
  });
  //load css into head based on user's preferences
  $('#helpModal').on('hidden.bs.modal', function() {
    const currentAudio = audioManager.getCurrentAudio();
    if (currentAudio) {
      currentAudio.play();
    }
    restartMainCardTimeoutIfNecessary();
  });

  // Global handler for continue buttons
  $(window).keypress(function(e: JQuery.KeyPressEvent) {
    const key = e.keyCode || e.which;
    if (key == ENTER_KEY && (e.target as any).tagName != 'INPUT') {
      windowAny.keypressEvent = e;
      const curPage = document.location.pathname;
      clientConsole(2, 'global enter key, curPage:', curPage);

      if (!getCardState('enterKeyLock')) {
        setCardState('enterKeyLock', true);
        clientConsole(2, 'grabbed enterKeyLock on global enter handler');
        switch (curPage) {
          case '/instructions':
            e.preventDefault();
            instructContinue();
            break;
          case '/card':
            // Enter key on card page handled by card.js event handlers
            break;
        }
      }
    }
  });
});

Template.DefaultLayout.events({
  'click [data-ui-message-clear]': function(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    Session.set('uiMessage', null);
  },
  'click #homeButton': async function(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    audioManager.pauseCurrentAudio();

    // Update dashboard cache when leaving from card/practice page
    const currentPath = document.location.pathname;
    if (currentPath === '/card' || currentPath === '/instructions') {
      const currentTdfId = Session.get('currentTdfId');
      if (currentTdfId) {
        clientConsole(2, '[Cache] Navbar: Updating dashboard cache for TDF:', currentTdfId);
        try {
          /** @type {UpdateDashboardCacheResult} */
          const result = await meteorCallAsync('updateDashboardCacheForTdf', currentTdfId);
          clientConsole(2, '[Cache] Navbar: Cache updated:', result);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          clientConsole(1, '[Cache] Navbar: Failed to update cache:', errorMessage);
        }
      }
    }

    FlowRouter.go('/home');
  },


  'click #helpButton': function(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    setCardState('pausedLocks', getCardState('pausedLocks')+1);
    Session.set('errorReportStart', new Date());
    audioManager.pauseCurrentAudio();
  },
  'click #helpCloseButton': function(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    ($('#errorReportingModal') as any).modal('hide');
  },

  'click #errorReportButton': function(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    setCardState('pausedLocks', getCardState('pausedLocks')+1);
    Session.set('errorReportStart', new Date());
    //set the modalTemplate session variable to the reportError template
    const templateObject = {
      template: 'errorReportModal',
      title: 'Report an Error',
    }
    Session.set('modalTemplate', templateObject);
    clientConsole(2, 'modalTemplate:', Session.get('modalTemplate'));
  },

  'click #resetFeedbackSettingsButton': function(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    setCardState('pausedLocks', getCardState('pausedLocks')+1);
    setCardState('displayFeedback', true);
    Session.set('resetFeedbackSettingsFromIndex', true);
  }, 
  'click #errorReportingSaveButton': function(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    clientConsole(2, 'save error reporting button pressed');
    const errorDescription = $('#errorDescription').val();
    //if error description is empty, alert the user to enter a description
    if (errorDescription === '') {
      alert('Please enter a description of the error');
      return;
    }
    const curUser = Meteor.userId();
    const curPage = document.location.pathname;
    const sessionVars = SessionAny.all();
    const userAgent = navigator.userAgent;
    const logs = (console as any).logs;
    const currentExperimentState = ExperimentStateStore.get();
    MeteorAny.callAsync('sendUserErrorReport', curUser, errorDescription, curPage, sessionVars,
        userAgent, logs, currentExperimentState);
    ($('#errorReportingModal') as any).modal('hide');
    $('#errorDescription').val('');
  },

  'click #logoutButton': function(event: JQuery.TriggeredEvent) {
    MeteorAny.callAsync('clearLoginData');
    MeteorAny.callAsync('recordSessionRevocation', 'manual-logout');
    Session.set('curUnitInstructionsSeen', undefined);
    Session.set('curSectionId', undefined);
    Session.set('loginMode', 'normal');
    Cookie.set('isExperiment', '0', 1); // 1 day
    Cookie.set('experimentTarget', '', 1);
    Cookie.set('experimentXCond', '', 1);
    event.preventDefault();
    audioManager.pauseCurrentAudio();
    Meteor.logout( function(error) {
      if (typeof error !== 'undefined') {
        // something happened during logout
        clientConsole(1, 'Logout error - User:', Meteor.user(), 'Error:', error);
      } else {
        Session.set('curTeacher', undefined);
        Session.set('curClass', undefined);
        sessionCleanUp();
        Session.set('curModule', 'signinoauth');
        Session.set('currentTemplate', 'signIn');
        Session.set('appLoading', false);
        routeAfterLogout('/');
      }
    });
  },
  'click #wikiButton': function(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    audioManager.pauseCurrentAudio();
    // Instantly hide offcanvas to prevent layout shift during page transition
    const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('navOffcanvas'));
    if (offcanvas) {
      offcanvas.hide();
    }
    FlowRouter.go('/help');
  },
  'click #mechTurkButton': function(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    FlowRouter.go('/turkWorkflow');
  },

  'click #contentUploadButton': function(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    FlowRouter.go('/contentUpload');
  },

  'click #dataDownloadButton': function(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    FlowRouter.go('/dataDownload');
  },

  'click #userAdminButton': function(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    FlowRouter.go('/userAdmin');
  },

  'click #classEditButton': function(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    FlowRouter.go('/classEdit');
  },

  'click #adminControlsBtn': function(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    FlowRouter.go('/adminControls');
  },

  'click #tdfAssignmentEditButton': function(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    FlowRouter.go('/tdfAssignmentEdit');
  },

  'click #instructorReportingButton': function(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    FlowRouter.go('/instructorReporting');
  },

});

// Global template helpers
Template.registerHelper('currentTheme', function() {
  return Session.get('curTheme');
});
Template.registerHelper('systemName', function() {
  return getSystemName();
});
Template.registerHelper('currentTemplate', function() {
  return Session.get('currentTemplate');
});
Template.registerHelper('modalTemplate', function() {
  const modalTemplate = Session.get('modalTemplate');
  clientConsole(2, 'modalTemplate:', JSON.stringify(modalTemplate));
  return modalTemplate.template;
});
Template.registerHelper('isLoggedIn', function() {
  return Meteor.userId() !== null;
});
Template.registerHelper('showPageNumbers', function() {
  return Session.get('showPageNumbers');
})
Template.registerHelper('currentUnitNumber', function() {
  if(Session.get('currentUnitNumber'))
    return parseInt(Session.get('currentUnitNumber')) + 1;
  return 0;
})
Template.registerHelper('lastUnitNumber', function() {
  if(Session.get('currentTdfFile'))
    return Session.get('currentTdfFile').tdfs.tutor.unit.length + 1;
  return 0;
})
Template.registerHelper('currentScore', function() {
  return getCardState('currentScore');
});

Template.registerHelper('isNormal', function() {
  return Session.get('loginMode') !== 'experiment';
});
Template.registerHelper('curStudentPerformance', function() {
  return Session.get('curStudentPerformance');
});
Template.registerHelper('isInTrial', function() {
  return Session.get('curModule') == 'card' || Session.get('curModule') == 'instructions';
});
Template.registerHelper('isInInstructions', function() {
  return Session.get('curModule') == 'instructions';
});
Template.registerHelper('isInSession', function() {
  return (Session.get('curModule') == 'profile');
});
// Memoization cache for curTdfTips to avoid re-sanitizing unchanged tips
let _lastTipsRaw: string[] | null = null;
let _lastTipsSanitized: string[] = [];

Template.registerHelper('curTdfTips', function() {
  const tips = Session.get('curTdfTips');
  if (!tips || tips.length === 0) {
    _lastTipsRaw = null;
    _lastTipsSanitized = [];
    return [];
  }
  // Only re-sanitize if tips array has changed (shallow comparison)
  if (_lastTipsRaw !== tips) {
    _lastTipsRaw = tips;
    _lastTipsSanitized = tips.map((tip: string) => sanitizeHTML(tip));
  }
  return _lastTipsSanitized;
});
Template.registerHelper('and',(a: unknown, b: unknown)=>{
  return a && b;
});
Template.registerHelper('or',(a: unknown, b: unknown)=>{
  return a || b;
});

function routeAfterLogout(target = '/') {
  let handle: Tracker.Computation | null = null;
  handle = Tracker.autorun(() => {
    if (!Meteor.userId()) {
      // Check if handle exists before stopping (prevents race condition)
      if (handle) {
        handle.stop();
      }
      FlowRouter.go(target);
    }
  });
  Meteor.setTimeout(() => {
    if (handle) {
      handle.stop();
      FlowRouter.go(target);
    }
  }, 3000);
}

// Global app loading state for elegant transitions (dashboard → first trial)
Template.registerHelper('appLoading', function() {
  return Session.get('appLoading');
});
Template.registerHelper('appLoadingMessage', function() {
  return Session.get('appLoadingMessage') || 'Loading...';
});
Template.registerHelper('uiMessage', function() {
  const uiMessage = Session.get('uiMessage');
  if (!uiMessage) {
    return null;
  }
  return {
    variant: uiMessage.variant || 'danger',
    text: uiMessage.text || ''
  };
});



