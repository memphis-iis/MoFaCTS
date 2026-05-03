import {meteorCallAsync} from '..';
import {haveMeteorUser} from '../lib/currentTestingHelpers';
import {instructContinue, unitHasLockout} from '../views/experiment/instructions';
import {Cookie} from './cookies';
import {displayify} from '../../common/globalHelpers';
import {selectTdf} from '../views/home/home';
import {clientConsole} from '../index';
import {CardStore} from '../views/experiment/modules/cardStore';
import { Tracker } from 'meteor/tracker';
import {currentUserHasRole} from './roleUtils';
import { clearMappingRecordFromSession } from '../views/experiment/svelte/services/mappingRecordService';
import { ensureCurrentStimuliSetId } from '../views/experiment/svelte/services/mediaResolver';
import {
  assertIdInvariants,
  setActiveTdfContext,
  setExperimentParticipantContext,
} from './idContext';
import { legacyInt, legacyTrim } from '../../common/underscoreCompat';
import { getErrorMessage } from './errorUtils';
import { CARD_ENTRY_INTENT, setCardEntryIntent } from './cardEntryIntent';
import { isLaunchLoadingActive } from './launchLoading';
const { FlowRouter } = require('meteor/ostrio:flow-router-extra');
const BlazeLayout: any = (globalThis as any).BlazeLayout;
const Tdfs: any = (globalThis as any).Tdfs;

export {routeToSignin};
/* router.js - the routing logic we use for the application.

If you need to create a new route, note that you should specify a name and an
action (at a minimum). This is good practice, but it also works around a bug
in Chrome with certain versions of Iron Router (they routing engine we use).

IMPORTANT: If you are routing someone to the signin screen (i.e. they need to
log in) then you should call the routeToSignin function of calling Router.go
directly. This is important to make sure that both "normal" logins *and*
experimental participant (Mechanical Turk) logins function correctly.

The routes are self-explanatory, but "loginMode" requires a little explanation.
When a user enters the application via a URL of the form /experiment/{target}/{x}
they are placed in "experiment" mode. The following changes are made:

    * The session var "loginMode" is set to "experiment" (instead of "normal")
    * The session var "experimentTarget" is set to whatever is specified in
      {target} in the URL. This is required.
    * The session var "experimentXCond" is set to whatever is specified in {x}
      in the URL. This defaults to 0. The default value is used if the value
      given cannot be interpreted as an int.
    * The user is NOT shown the OAuth "Sign In With Google" screen. Instead a
      screen for user ID entry (which should be their Turk ID) is shown instead
    * The user isn't allowed to select a TDF - the TDF matching {target} is
      always chosen. (This is specified in the <experimentTarget> tag in the
      top TDF setspec section).

As an example, if a user navigates to
    https://mofacts.optimallearning.org/experiment/learning/1
then the following things will happen:

    * Session["loginMode"] == "experiment"
    * Session["experimentTarget"] == "learning"
    * Session["experimentXCond"] == "1"
    * The user is asked for an ID
    * After entering the ID, the user is taken to the TDF with
      <experimentTarget>learning</experimentTarget> in it's setspec

As an example of XCond defaults, the following URL's are ALL equivalent:

    * https://mofacts.optimallearning.org/experiment/learning/
    * https://mofacts.optimallearning.org/experiment/learning/0
    * https://mofacts.optimallearning.org/experiment/learning/abc

A major issue is that once a user enters in experiment mode, the routes (like
instructions and card) look the same. If the user uses the browser's refresh
function, our logic will take them to the "normal" sign in screen. Since we
allow login via Gmail account this could be confusing. As a result, we now use
a cookie scheme to insure experimental participants stay in experiment mode:

    * When a user first hits the URL /experiment/{target}/{x} we write cookies
      (with expiration set so that they outlast the current browser session)
    * Whenever routeToSignin is called, we check the cookies. If they are set
      then we reconstruct the experiment session variables as above.
    * If a user visits the root ("/") route, we reset all cookies back in order
      to allow "normal" login again.
*/

function clearAppLoadingUnlessLaunch(): void {
  if (!isLaunchLoadingActive()) {
    Session.set('appLoading', false);
  }
}

// Note that these three session variables aren't touched by the helpers in
// lib/sessionUtils.js. They are only set here in our client-side routing
Session.set('loginMode', 'normal');
Session.set('experimentTarget', '');
Session.set('experimentXCond', '');
clearMappingRecordFromSession();

// Flow Router doesn't need configure() - this.render() specifies layout per-route
let cardSubsWaitHandle: any = null;
let rootUserWaitHandle: any = null;
const pendingAuthRouteHandles: Record<string, any> = {};
let homeUserHydrationHandle: any = null;

type RouteAccessPolicy = {
  requiresAuth: boolean;
  allowedRoles?: string;
};

type RouteAccessDecision = 'allow' | 'signin' | 'forbidden';
type UserWithLoginParams = Meteor.User & { loginParams?: { loginMode?: string } };
type UserWithAuthState = Meteor.User & {
  profile?: { experiment?: boolean | string };
  authState?: { primaryMethod?: string; emailVerificationRequired?: boolean; emailVerified?: boolean };
  emails?: Array<{ verified?: boolean; address?: string }>;
};

function getUserLoginMode(user: Meteor.User | null | undefined): string {
  return (user as UserWithLoginParams | null | undefined)?.loginParams?.loginMode || 'normal';
}

function shouldRedirectToVerifyEmail(user: Meteor.User | null | undefined): boolean {
  const currentUser = user as UserWithAuthState | null | undefined;
  if (!currentUser || currentUser?.profile?.experiment === true || currentUser?.profile?.experiment === 'true') {
    return false;
  }
  const primaryMethod = String(currentUser?.authState?.primaryMethod || '').toLowerCase();
  if (primaryMethod && primaryMethod !== 'password') {
    return false;
  }
  const verificationRequired = currentUser?.authState?.emailVerificationRequired === true;
  const emailVerified = currentUser?.authState?.emailVerified === true || currentUser?.emails?.[0]?.verified === true;
  return verificationRequired && !emailVerified;
}

function isAuthStateSettled() {
  return Session.get('authReady') === true;
}

function shouldWaitForAuthHydration() {
  const currentUserId = Meteor.userId();
  const currentUser = Meteor.user();
  return !isAuthStateSettled() || Meteor.loggingIn() || (!!currentUserId && !currentUser);
}

function userMatchesAllowedRoles(policy: RouteAccessPolicy): boolean {
  if (!policy.allowedRoles) {
    return true;
  }
  return currentUserHasRole(policy.allowedRoles);
}

function evaluateRouteAccess(policy: RouteAccessPolicy): RouteAccessDecision {
  if (!policy.requiresAuth) {
    return 'allow';
  }

  const userId = Meteor.userId();
  const user = Meteor.user();
  if (!userId || !user) {
    return 'signin';
  }

  if (!userMatchesAllowedRoles(policy)) {
    return 'forbidden';
  }

  return 'allow';
}

// Load infrequently-used route modules on demand to keep the initial client bundle smaller.
const lazyTemplateLoaders: Record<string, any> = {
  card: () => import('../views/experiment/card'),
  classSelection: () => import('../views/home/classSelection'),
  adminControls: () => import('../views/adminControls'),
  audioSettings: () => import('../views/audioSettings'),
  help: () => import('../views/help'),
  accessDenied: () => import('../views/accessDenied'),
  experimentError: () => import('../views/experimentError'),
  testRunner: () => import('../views/testRunner'),
  theme: () => import('../views/theme'),
  setTheme: () => import('../views/theme'),
  turkWorkflow: () => import('../views/turkWorkflow'),
  userAdmin: () => import('../views/userAdmin'),
  classEdit: () => import('../views/experimentSetup/classEdit'),
  contentUpload: () => import('../views/experimentSetup/contentUpload'),
  manualContentCreator: () => import('../views/experimentSetup/manualContentCreator'),
  contentEdit: () => import('../views/experimentSetup/contentEdit'),
  tdfEdit: () => import('../views/experimentSetup/tdfEdit'),
  tdfAssignmentEdit: () => import('../views/experimentSetup/tdfAssignmentEdit'),
  dataDownload: () => import('../views/experimentReporting/dataDownload'),
  instructorReporting: () => import('../views/experimentReporting/instructorReporting'),
};

const loadedLazyTemplates = new Set();

async function ensureTemplateModuleLoaded(templateName: any) {
  const loader = lazyTemplateLoaders[templateName];
  if (!loader || loadedLazyTemplates.has(templateName)) {
    return;
  }

  await loader();
  loadedLazyTemplates.add(templateName);
}

async function renderRouteTemplate(controller: any, templateName: any) {
  try {
    await ensureTemplateModuleLoaded(templateName);
  } catch (error: unknown) {
    clientConsole(1, '[ROUTER] Failed to lazy-load route template module for', templateName, getErrorMessage(error));
  }
  renderLayout(controller, templateName);
}

function renderLayout(controller: any, templateName: any) {
  clientConsole(2, '[ROUTER] renderLayout called with template:', templateName);
  Session.set('currentTemplate', templateName);
  clientConsole(2, '[ROUTER] Session currentTemplate set to:', templateName);

  // Check if template exists
  const templateExists = !!Template[templateName];
  clientConsole(2, '[ROUTER] Template.' + templateName + ' exists:', templateExists);

  if (!templateExists) {
    clientConsole(1, '[ROUTER] ERROR: Template', templateName, 'does not exist!');
    clientConsole(1, '[ROUTER] Available templates:', Object.keys(Template).filter((k: any) => !k.startsWith('_')).slice(0, 20));
  }

  if (controller && typeof controller.render === 'function') {
    try {
      controller.render('DefaultLayout', templateName);
      clientConsole(2, '[ROUTER] Successfully rendered via controller.render(DefaultLayout, template)');
      return;
    } catch (error: unknown) {
      clientConsole(2, '[ROUTER] render(DefaultLayout, template) failed:', getErrorMessage(error));
    }

    try {
      controller.render('DefaultLayout', { main: templateName });
      clientConsole(2, '[ROUTER] Successfully rendered via controller.render(DefaultLayout, {main})');
      return;
    } catch (error: unknown) {
      clientConsole(2, '[ROUTER] render(DefaultLayout, {main}) failed:', getErrorMessage(error));
    }

    try {
      controller.layout('DefaultLayout');
      controller.render(templateName);
      clientConsole(2, '[ROUTER] Successfully rendered via layout+render');
      return;
    } catch (error: unknown) {
      clientConsole(2, '[ROUTER] layout+render failed:', getErrorMessage(error));
    }
  }

  if (typeof BlazeLayout !== 'undefined' && typeof BlazeLayout.render === 'function') {
    BlazeLayout.render('DefaultLayout', { main: templateName });
    clientConsole(2, '[ROUTER] Successfully rendered via BlazeLayout.render');
    return;
  }

  if (controller && typeof controller.render === 'function') {
    try {
      controller.render(templateName);
      return;
    } catch (error: unknown) {
      clientConsole(2, '[ROUTER] render(template) failed:', getErrorMessage(error));
    }
  }

  clientConsole(1, '[ROUTER] No render method available for', templateName);
}

function renderHomeForUser(controller: any, user: any) {
  const loginMode = getUserLoginMode(user);
  clientConsole(2, '[ROUTER] renderHomeForUser - loginMode:', loginMode);
  clientConsole(2, '[ROUTER] renderHomeForUser - user:', user?.username);

  if (loginMode === 'experiment') {
    clientConsole(2, '[ROUTER] Experiment mode detected, redirecting to signIn');
    Cookie.set('isExperiment', '0', 1); // 1 day
    Cookie.set('experimentTarget', '', 1);
    Cookie.set('experimentXCond', '', 1);
    Session.set('curModule', 'signinoauth');
    FlowRouter.go('/auth/login');
    return;
  }

  if (shouldRedirectToVerifyEmail(user)) {
    clientConsole(2, '[ROUTER] Unverified password user detected, redirecting to verify-email');
    FlowRouter.go('/auth/verify-email');
    return;
  }

  clientConsole(2, '[ROUTER] Normal mode, rendering home page');
  Session.set('curModule', 'home');
  renderLayout(controller, 'home');
  clientConsole(2, '[ROUTER] renderLayout returned, currentTemplate should be home');
  clientConsole(2, '[ROUTER] Session.get(currentTemplate):', Session.get('currentTemplate'));
}

function handleIndexRoute(controller: any, user: any) {
  if (user) {
    if (getUserLoginMode(user) === 'experiment') {
      routeToSignin();
      return;
    }
    // Check if user is admin or teacher, redirect to home
    // Otherwise redirect to learning dashboard for students
    if (currentUserHasRole('admin,teacher')) {
      FlowRouter.go('/home');
    } else {
      FlowRouter.go('/learningDashboard');
    }
    return;
  }

  // If no user is logged in and they are navigating to "/" then we clear the
  // (possible) cookie keeping them in experiment mode.
  Cookie.set('isExperiment', '0', 1); // 1 day
  Cookie.set('experimentTarget', '', 1);
  Cookie.set('experimentXCond', '', 1);
  Session.set('curModule', 'signinoauth');
  renderLayout(controller, 'signIn');
}

function routeToSignin() {
  // If the isExperiment cookie is set we always for experiment mode. This
  // handles an experimental participant refreshing the browser
  const expCookie = legacyInt(legacyTrim(Cookie.get('isExperiment')));
  if (expCookie) {
    Session.set('loginMode', 'experiment');
    Session.set('experimentTarget', Cookie.get('experimentTarget'));
    Session.set('experimentXCond', Cookie.get('experimentXCond'));
  }

  const loginMode = Session.get('loginMode');

  if (loginMode === 'experiment') {
    const routeParts = ['/experiment'];

    const target = Session.get('experimentTarget');
    if (target) {
      routeParts.push(target);
      const xcond = Session.get('experimentXCond');
      if (xcond) {
        routeParts.push(xcond);
      }
    }

    FlowRouter.go(routeParts.join('/'));
  } else if (loginMode === 'password') {
    FlowRouter.go('/auth/login');
  } else { // Normal login mode
    FlowRouter.go('/auth/login');
  }
}

function ensureStimuliSetIdSessionInvariant() {
  const currentTdfId = Session.get('currentTdfId') || Session.get('currentRootTdfId');
  if (!currentTdfId) {
    return;
  }

  const currentTdfDoc = Tdfs?.findOne?.({ _id: currentTdfId });
  const tdfStimuliSetId = currentTdfDoc?.stimuliSetId;
  if (tdfStimuliSetId !== undefined && tdfStimuliSetId !== null && String(tdfStimuliSetId).trim() !== '') {
    setActiveTdfContext({
      currentRootTdfId: Session.get('currentRootTdfId'),
      currentTdfId: Session.get('currentTdfId') || Session.get('currentRootTdfId'),
      currentStimuliSetId: tdfStimuliSetId,
    }, 'router.ensureStimuliSetIdSessionInvariant');
    return;
  }
  ensureCurrentStimuliSetId(tdfStimuliSetId);
}

async function logoutCurrentUserForExperimentRoute() {
  if (!Meteor.userId()) {
    return;
  }
  await new Promise<void>((resolve) => {
    Meteor.logout((error?: unknown) => {
      if (error) {
        clientConsole(1, '[ROUTER] Logout before experiment sign-in failed:', getErrorMessage(error));
      }
      resolve();
    });
  });
}

FlowRouter.route('/experiment/:target?/:xcond?', {
  name: 'client.experiment',
  action: async function(params: any) {
    const target = params.target || '';
    const xcond = params.xcond || '';

    // Subscribe to TDF
    Meteor.subscribe('tdfByExperimentTarget', target);

    Session.set('useEmbeddedAPIKeys', true);
    Session.set('curModule', 'experiment');
    // We set our session variable and also set a cookie (so that we still
    // know they're an experimental participant after browser refresh)

    Session.set('loginMode', 'experiment');
    Session.set('experimentTarget', target);
    Session.set('experimentXCond', xcond);
    Session.set('tdfLaunchMode', 'root-random');
    Session.set('tdfFamilyRootTdfId', null);
    setExperimentParticipantContext({ experimentTarget: target }, 'router.experimentRoute');

    Cookie.set('isExperiment', '1', 21); // 21 days
    Cookie.set('experimentTarget', target, 21);
    Cookie.set('experimentXCond', xcond, 21);

    let tdf = Tdfs.findOne({"content.tdfs.tutor.setspec.experimentTarget": target});

    if(!tdf) tdf = await meteorCallAsync('getTdfByExperimentTarget', target);

    if (tdf) {

      if (tdf.content.tdfs.tutor.setspec.condition){
        Session.set('experimentConditions', tdf.content.tdfs.tutor.setspec.condition)
        const condition = tdf.content.tdfs.tutor.setspec.condition;
        Meteor.subscribe('tdfByExperimentTarget', target, condition)
      }
      clientConsole(2, 'tdf found');
      // Security: Replace eval() with safe boolean check
      const experimentPasswordRequired =
        tdf.content.tdfs.tutor.setspec.experimentPasswordRequired === 'true' ||
        tdf.content.tdfs.tutor.setspec.experimentPasswordRequired === true;
      Session.set('experimentPasswordRequired', experimentPasswordRequired);
      Session.set('loginPrompt',tdf.content.tdfs.tutor.setspec.uiSettings?.experimentLoginText || "Amazon Turk ID");
      clientConsole(2, 'experimentPasswordRequired:', experimentPasswordRequired);

      clientConsole(2, 'EXPERIMENT target:', target, 'xcond', xcond);

      clearMappingRecordFromSession();
      Session.set('suppressAuthenticatedChrome', false);
      clearAppLoadingUnlessLaunch();

      // Log out first, then render sign-in to avoid transient route/auth race states.
      await logoutCurrentUserForExperimentRoute();
      renderLayout(this, 'signIn');

    } else {
      clientConsole(1, 'tdf not found');
      alert('The experiment you are trying to access does not exist.');
      if (Meteor.user()) {
        Meteor.logout();
      }
      window.location.href = '/';
    }
  },
});

const defaultBehaviorRoutes = [
  'setTheme',
];

const restrictedRoutes = [
  'multiTdfSelect',
  'profileEdit',
  'userAdmin',
  'tdfAssignmentEdit',
  'instructorReporting',
  'feedback',
  'classControlPanel',
  'contentControlPanel',
];

const routeAccessPolicies: Record<string, RouteAccessPolicy> = {
  'client.turkWorkflow': { requiresAuth: true, allowedRoles: 'admin' },
  'client.userAdmin': { requiresAuth: true, allowedRoles: 'admin,teacher' },
  'client.tdfAssignmentEdit': { requiresAuth: true, allowedRoles: 'admin,teacher' },
  'client.instructorReporting': { requiresAuth: true, allowedRoles: 'admin,teacher' },
  'client.classEdit': { requiresAuth: true, allowedRoles: 'admin,teacher' },
  'client.contentUpload': { requiresAuth: true },
  'client.manualContentCreator': { requiresAuth: true },
  'client.contentEdit': { requiresAuth: true },
  'client.tdfEdit': { requiresAuth: true },
  'client.dataDownload': { requiresAuth: true },
  'client.adminControls': { requiresAuth: true, allowedRoles: 'admin' },
  'client.adminTests': { requiresAuth: true, allowedRoles: 'admin' },
  'client.theme': { requiresAuth: true, allowedRoles: 'admin' },
};

function getRouteAccessPolicy(routeName: string): RouteAccessPolicy {
  return routeAccessPolicies[routeName] || { requiresAuth: true };
}

const getDefaultRouteAction = function(routeName: any) {
  return async function(this: any) {
    await renderRouteTemplate(this, routeName);
  };
};

function waitForAuthenticatedRoute(
  controller: any,
  routeName: string,
  onReady: (user: any) => void | Promise<void>,
  policy: RouteAccessPolicy = { requiresAuth: true }
) {
  const currentDecision = evaluateRouteAccess(policy);
  if (currentDecision === 'allow') {
    const user = Meteor.user();
    const existing = pendingAuthRouteHandles[routeName];
    if (existing) {
      existing.stop();
      delete pendingAuthRouteHandles[routeName];
    }
    void Promise.resolve(onReady(user as any)).catch((error: unknown) => {
      clientConsole(1, '[ROUTER] Auth-ready callback failed for', routeName, getErrorMessage(error));
    });
    return;
  }

  if (currentDecision === 'forbidden') {
    FlowRouter.go('/accessDenied');
    return;
  }

  renderLayout(controller, 'customLoading');
  if (pendingAuthRouteHandles[routeName]) {
    return;
  }

  pendingAuthRouteHandles[routeName] = Tracker.autorun(() => {
    const currentRoute = FlowRouter.current()?.route?.name;
    if (currentRoute !== routeName) {
      pendingAuthRouteHandles[routeName]?.stop();
      delete pendingAuthRouteHandles[routeName];
      return;
    }

    const deferredDecision = evaluateRouteAccess(policy);
    if (deferredDecision === 'allow') {
      const currentUser = Meteor.user();
      pendingAuthRouteHandles[routeName]?.stop();
      delete pendingAuthRouteHandles[routeName];
      void Promise.resolve(onReady(currentUser)).catch((error: unknown) => {
        clientConsole(1, '[ROUTER] Deferred auth-ready callback failed for', routeName, getErrorMessage(error));
      });
      return;
    }

    if (deferredDecision === 'forbidden') {
      pendingAuthRouteHandles[routeName]?.stop();
      delete pendingAuthRouteHandles[routeName];
      FlowRouter.go('/accessDenied');
      return;
    }

    if (!Meteor.userId() && !Meteor.loggingIn()) {
      if (shouldWaitForAuthHydration()) return;
      pendingAuthRouteHandles[routeName]?.stop();
      delete pendingAuthRouteHandles[routeName];
      routeToSignin();
    }
  });
}

const getRestrictedRouteAction = function(routeName: any) {
  return async function(this: any) {
    const fullRouteName = 'client.' + routeName;
    waitForAuthenticatedRoute(this, fullRouteName, async () => {
      await renderRouteTemplate(this, routeName);
    }, getRouteAccessPolicy(fullRouteName));
  };
};


// set up all routes with default behavior
for (const route of restrictedRoutes) {
  FlowRouter.route('/' + route, {
    name: 'client.' + route,
    action: getRestrictedRouteAction(route),
  });
}

for (const route of defaultBehaviorRoutes) {
  FlowRouter.route('/' + route, {
    name: 'client.' + route,
    action: getDefaultRouteAction(route),
  });
}

function renderSignInRoute(controller: any) {
  if (shouldWaitForAuthHydration()) {
    Session.set('currentTemplate', 'customLoading');
    renderLayout(controller, 'customLoading');
    return;
  }

  const userId = Meteor.userId();
  const user = Meteor.user();
  if (userId && !user) {
    Session.set('currentTemplate', 'customLoading');
    renderLayout(controller, 'customLoading');
    return;
  }
  if (user && getUserLoginMode(user) !== 'experiment') {
    FlowRouter.go('/home');
    return;
  }
  Session.set('curModule', 'signinoauth');
  renderLayout(controller, 'signIn');
}

function renderSignUpRoute(controller: any) {
  if (Meteor.userId()) {
    FlowRouter.go('/home');
    return;
  }
  renderLayout(controller, 'signUp');
}

function renderPasswordResetRoute(controller: any, mode: 'request' | 'reset') {
  Session.set('passwordResetMode', mode);
  renderLayout(controller, 'resetPassword');
}

//special routes
FlowRouter.route('/auth/signup', {
  name: 'client.authSignUp',
  action: function() {
    renderSignUpRoute(this);
  }
});

FlowRouter.route('/auth/login', {
  name: 'client.authLogin',
  action: function() {
    renderSignInRoute(this);
  }
});

FlowRouter.route('/auth/forgot-password', {
  name: 'client.authForgotPassword',
  action: function() {
    renderPasswordResetRoute(this, 'request');
  }
});

FlowRouter.route('/auth/reset-password', {
  name: 'client.authResetPassword',
  action: function() {
    renderPasswordResetRoute(this, 'reset');
  }
});

FlowRouter.route('/auth/verify-email', {
  name: 'client.authVerifyEmail',
  action: function() {
    renderLayout(this, 'verifyEmail');
  }
});

FlowRouter.route('/auth/logout', {
  name: 'client.authLogout',
  action: async function() {
    try {
      await meteorCallAsync('recordSessionRevocation', 'auth-route-logout');
    } catch (error) {
      clientConsole(1, '[AUTH] Failed to record logout revocation event:', getErrorMessage(error));
    }
    Meteor.logout();
    Session.set('loginMode', 'normal');
    FlowRouter.go('/auth/login');
  }
});

FlowRouter.route('/signup', {
  name: 'client.signUp',
  action: function() {
    FlowRouter.go('/auth/signup');
  }
});

FlowRouter.route('/signIn', {
  name: 'client.signIn',
  action: function() {
    FlowRouter.go('/auth/login');
  }
});

FlowRouter.route('/signin', {
  name: 'client.signin',
  action: function() {
    FlowRouter.go('/auth/login');
  }
});

FlowRouter.route('/resetPassword', {
  name: 'client.resetPassword',
  action: function() {
    const queryParams = FlowRouter.current()?.queryParams || {};
    const resetToken = queryParams.token;
    if (resetToken) {
      FlowRouter.go(`/auth/reset-password?${new URLSearchParams(queryParams as Record<string, string>).toString()}`);
      return;
    }
    FlowRouter.go('/auth/forgot-password');
  }
});

FlowRouter.route('/turkWorkflow', {
  name: 'client.turkWorkflow',
  action: getRestrictedRouteAction('turkWorkflow'),
})

FlowRouter.route('/studentReporting', {
  name: 'client.studentReporting',
  action: function() {
    const routeName = 'studentReporting';
    Session.set('curModule', routeName.toLowerCase());
    renderLayout(this, routeName);
  }
})


FlowRouter.route('/dataDownload', {
  name: 'client.dataDownload',
  action: async function(this: any) {
    waitForAuthenticatedRoute(this, 'client.dataDownload', async () => {
      Session.set('curModule', 'dataDownload');
      await renderRouteTemplate(this, 'dataDownload');
    }, getRouteAccessPolicy('client.dataDownload'));
  }
})

FlowRouter.route('/accessDenied', {
  name: 'client.accessDenied',
  action: async function(this: any) {
    Session.set('curModule', 'accessDenied');
    await renderRouteTemplate(this, 'accessDenied');
  }
})

FlowRouter.route('/experimentError', {
  name: 'client.experimentError',
  action: async function(this: any) {
    Session.set('curModule', 'experimentError');
    Session.set('suppressAuthenticatedChrome', true);
    clearAppLoadingUnlessLaunch();
    await renderRouteTemplate(this, 'experimentError');
  }
})

FlowRouter.route('/learningDashboard', {
  name: 'client.learningDashboard',
  action: function() {
    waitForAuthenticatedRoute(this, 'client.learningDashboard', async (user: any) => {
      if (getUserLoginMode(user) === 'experiment') {
        Session.set('experimentError', {
          title: 'Experiment paused',
          message: 'This experiment link does not provide access to the general learning dashboard.',
          note: 'Please email the experiment coordinator or study contact with your participant ID.',
        });
        FlowRouter.go('/experimentError');
        return;
      }
      Session.set('curModule', 'learningDashboard');
      renderLayout(this, 'learningDashboard');
    });
  }
})

FlowRouter.route('/classSelection', {
  name: 'client.classSelection',
  action: function() {
    waitForAuthenticatedRoute(this, 'client.classSelection', async (_readyUser: any) => {
      Session.set('curModule', 'classSelection');
      await renderRouteTemplate(this, 'classSelection');
    });
  }
})

FlowRouter.route('/help', {
  name: 'client.help',
  action: async function() {
    Session.set('curModule', 'help');
    await renderRouteTemplate(this, 'help');
  }
})

FlowRouter.route('/audioSettings', {
  name: 'client.audioSettings',
  action: async function() {
    waitForAuthenticatedRoute(this, 'client.audioSettings', async () => {
      Session.set('curModule', 'audioSettings');
      await renderRouteTemplate(this, 'audioSettings');
    });
  }
})

FlowRouter.route('/', {
  name: 'client.index',
  action: function() {
    if (shouldWaitForAuthHydration()) {
      Session.set('currentTemplate', 'customLoading');
      renderLayout(this, 'customLoading');
      if (!rootUserWaitHandle) {
        const controller = this;
        rootUserWaitHandle = Tracker.autorun(() => {
          const isRootRoute = FlowRouter.current()?.route?.name === 'client.index';
          if (!isRootRoute) {
            rootUserWaitHandle?.stop();
            rootUserWaitHandle = null;
            return;
          }
          if (!shouldWaitForAuthHydration()) {
            rootUserWaitHandle?.stop();
            rootUserWaitHandle = null;
            handleIndexRoute(controller, Meteor.user());
          }
        });
      }
      return;
    }

    const userId = Meteor.userId();
    const user = Meteor.user();

    if (userId && !user) {
      Session.set('currentTemplate', 'customLoading');
      renderLayout(this, 'customLoading');
      if (!rootUserWaitHandle) {
        const controller = this;
        rootUserWaitHandle = Tracker.autorun(() => {
          const readyUser = Meteor.user();
          const isRootRoute = FlowRouter.current()?.route?.name === 'client.index';
          const isLoggedOut = !Meteor.userId();
          if ((readyUser || isLoggedOut) && isRootRoute) {
            rootUserWaitHandle.stop();
            rootUserWaitHandle = null;
            handleIndexRoute(controller, readyUser);
          } else if (!isRootRoute) {
            rootUserWaitHandle.stop();
            rootUserWaitHandle = null;
          }
        });
      }
      return;
    }

    handleIndexRoute(this, user);
  },
});

FlowRouter.route('/contentUpload', {
  name: 'client.contentUpload',
  action: async function(this: any) {
    waitForAuthenticatedRoute(this, 'client.contentUpload', async () => {
      await renderRouteTemplate(this, 'contentUpload');
    }, getRouteAccessPolicy('client.contentUpload'));
  }
})

FlowRouter.route('/contentCreate', {
  name: 'client.manualContentCreator',
  action: async function(this: any) {
    waitForAuthenticatedRoute(this, 'client.manualContentCreator', async () => {
      await renderRouteTemplate(this, 'manualContentCreator');
    }, getRouteAccessPolicy('client.manualContentCreator'));
  }
})

FlowRouter.route('/contentEdit/:tdfId', {
  name: 'client.contentEdit',
  action: async function(params: any) {
    waitForAuthenticatedRoute(this, 'client.contentEdit', async () => {
      Session.set('editingTdfId', params.tdfId);
      await renderRouteTemplate(this, 'contentEdit');
    }, getRouteAccessPolicy('client.contentEdit'));
  }
})

FlowRouter.route('/tdfEdit/:tdfId', {
  name: 'client.tdfEdit',
  action: async function(params: any) {
    waitForAuthenticatedRoute(this, 'client.tdfEdit', async () => {
      Session.set('editingTdfId', params.tdfId);
      await renderRouteTemplate(this, 'tdfEdit');
    }, getRouteAccessPolicy('client.tdfEdit'));
  }
})

FlowRouter.route('/adminControls', {
  name: 'client.adminControls',
  action: async function() {
    waitForAuthenticatedRoute(this, 'client.adminControls', async () => {
      await renderRouteTemplate(this, 'adminControls');
    }, getRouteAccessPolicy('client.adminControls'));
  }
})

FlowRouter.route('/admin/tests', {
  name: 'client.adminTests',
  action: async function() {
    waitForAuthenticatedRoute(this, 'client.adminTests', async () => {
      await renderRouteTemplate(this, 'testRunner');
    }, getRouteAccessPolicy('client.adminTests'));
  }
})

FlowRouter.route('/theme', {
  name: 'client.theme',
  action: async function() {
    waitForAuthenticatedRoute(this, 'client.theme', async () => {
      Session.set('curModule', 'theme');
      await renderRouteTemplate(this, 'theme');
    }, getRouteAccessPolicy('client.theme'));
  }
})

FlowRouter.route('/home', {
  name: 'client.home',
  action: function() {
    clientConsole(2, '[ROUTER] /home - rendering home');
    const userId = Meteor.userId();
    const user = Meteor.user();

    if (userId) {
      if (getUserLoginMode(user) === 'experiment') {
        routeToSignin();
        return;
      }

      if (shouldRedirectToVerifyEmail(user)) {
        FlowRouter.go('/auth/verify-email');
        return;
      }

      Session.set('curModule', 'home');
      renderLayout(this, 'home');

      if (!user && !homeUserHydrationHandle) {
        homeUserHydrationHandle = Tracker.autorun(() => {
          const hydratedUser = Meteor.user();
          const isHomeRoute = FlowRouter.current()?.route?.name === 'client.home';
          if (!isHomeRoute) {
            homeUserHydrationHandle?.stop();
            homeUserHydrationHandle = null;
            return;
          }
          if (getUserLoginMode(hydratedUser) === 'experiment') {
            homeUserHydrationHandle?.stop();
            homeUserHydrationHandle = null;
            routeToSignin();
            return;
          }
          if (shouldRedirectToVerifyEmail(hydratedUser)) {
            homeUserHydrationHandle?.stop();
            homeUserHydrationHandle = null;
            FlowRouter.go('/auth/verify-email');
            return;
          }
          if (hydratedUser) {
            homeUserHydrationHandle?.stop();
            homeUserHydrationHandle = null;
          }
        });
      }
      return;
    }

    waitForAuthenticatedRoute(this, 'client.home', async (readyUser: any) => {
      renderHomeForUser(this, readyUser);
    });
  },
});

// Legacy redirect: /profile -> /home
FlowRouter.route('/profile', {
  name: 'client.profile',
  action: function() {
    FlowRouter.go('/home');
  }
});

FlowRouter.route('/classEdit', {
  name: 'client.classEdit',
  action: async function() {
    waitForAuthenticatedRoute(this, 'client.classEdit', async () => {
      await renderRouteTemplate(this, 'classEdit');
    }, getRouteAccessPolicy('client.classEdit'));
  }
});
FlowRouter.route('/card', {
  name: 'client.card',
  action: async function() {
    const userId = Meteor.userId();
    const user = Meteor.user();
    if (!userId || !user) {
      waitForAuthenticatedRoute(this, 'client.card', async () => {
        FlowRouter.go('/card');
      });
      return;
    }
    assertIdInvariants('router.card.entry', { requireCurrentTdfId: false, requireStimuliSetId: false });
    ensureStimuliSetIdSessionInvariant();
    Session.set('suppressAuthenticatedChrome', false);
    clearAppLoadingUnlessLaunch();
    const refreshCardRequested = Boolean(FlowRouter.current()?.queryParams?.refreshCard);
    if(!Session.get('currentTdfId')){
      const userId = Meteor.userId();
      const tdfId =  await meteorCallAsync('getLastTDFAccessed', userId);
      if (!tdfId) {
        FlowRouter.go('/');
        return;
      }
      const tdf: any = await meteorCallAsync('getTdfById', tdfId);
      if(tdf) {
        const setspec = tdf.content.tdfs.tutor.setspec ? tdf.content.tdfs.tutor.setspec : null;
        const ignoreOutOfGrammarResponses = setspec.speechIgnoreOutOfGrammarResponses ?
        setspec.speechIgnoreOutOfGrammarResponses.toLowerCase() == 'true' : false;
        const speechOutOfGrammarFeedback = setspec.speechOutOfGrammarFeedback ?
        setspec.speechOutOfGrammarFeedback : 'Response not in answer set';

        // Render a loading template while selectTdf processes
        renderLayout(this, 'customLoading');

        Session.set('cardBootstrapInProgress', true);
        try {
          await selectTdf(
            tdfId,
            setspec.lessonname,
            tdf.stimuliSetId,
            ignoreOutOfGrammarResponses,
            speechOutOfGrammarFeedback,
            'User button click',
            tdf.content.isMultiTdf,
            setspec,
            false,
            true);
        } finally {
          Session.set('cardBootstrapInProgress', false);
        }
        setCardEntryIntent(CARD_ENTRY_INTENT.CARD_REFRESH_REBUILD, {
          source: 'router.card.bootstrapMissingCurrentTdfId',
        });
        // After selectTdf completes with isRefresh=true, show the card
        Session.set('curModule', 'card');
        await renderRouteTemplate(this, 'card');
        return;
      } else {
        // No TDF found, redirect to home
        FlowRouter.go('/');
        return;
      }
    } else {
      const subs = [
        Meteor.subscribe('files.assets.all'),
        Meteor.subscribe('currentTdf', Session.get('currentTdfId')),
        Meteor.subscribe('tdfByExperimentTarget', Session.get('experimentTarget'), Session.get('experimentConditions')),
      ];
      const subsReady = subs.every((handle) => handle && handle.ready());
      if(subsReady){
        if (Meteor.user()) {
          // Restore CardStore settings from TDF on page refresh (CardStore resets but Session persists)
          const tdfFile = Session.get('currentTdfFile');
          if (tdfFile && tdfFile.tdfs && tdfFile.tdfs.tutor && tdfFile.tdfs.tutor.setspec) {
            const setspec = tdfFile.tdfs.tutor.setspec;
            const ignoreOutOfGrammarResponses = setspec.speechIgnoreOutOfGrammarResponses ?
              setspec.speechIgnoreOutOfGrammarResponses.toLowerCase() === 'true' : false;
            CardStore.setIgnoreOutOfGrammarResponses(ignoreOutOfGrammarResponses);
            clientConsole(2, '[Router] Restored ignoreOutOfGrammarResponses from TDF:', ignoreOutOfGrammarResponses);
          }
          if (refreshCardRequested) {
            setCardEntryIntent(CARD_ENTRY_INTENT.CARD_REFRESH_REBUILD, {
              source: 'router.card.refreshQuery',
            });
          }
          Session.set('curModule', 'card');
          await renderRouteTemplate(this, 'card');
        } else {
          FlowRouter.go('/');
          return;
        }
      } else {
        renderLayout(this, 'customLoading');
        if (!cardSubsWaitHandle) {
          const controller = this;
          cardSubsWaitHandle = Tracker.autorun(() => {
            const ready = subs.every((handle) => handle && handle.ready());
            const user = Meteor.user();
            const isCardRoute = FlowRouter.current()?.route?.name === 'client.card';
            if (ready && user && isCardRoute) {
              cardSubsWaitHandle.stop();
              cardSubsWaitHandle = null;
              if (refreshCardRequested) {
                setCardEntryIntent(CARD_ENTRY_INTENT.CARD_REFRESH_REBUILD, {
                  source: 'router.card.refreshQuery.waited',
                });
              }
              Session.set('curModule', 'card');
              // card.js was already requested by lazyTemplateLoaders when this
              // route first fired, so the module should be cached by now.
              ensureTemplateModuleLoaded('card').then(() => {
                renderLayout(controller, 'card');
              });
            } else if (!isCardRoute) {
              cardSubsWaitHandle.stop();
              cardSubsWaitHandle = null;
            }
          });
        }
        return;
      }
    }
  },
});

// We track the start time for instructions, which means we need to track
// them here at the instruction route level
Session.set('instructionClientStart', 0);
FlowRouter.route('/instructions', {
  name: 'client.instructions',
  action: function() {
    assertIdInvariants('router.instructions.entry', { requireCurrentTdfId: true, requireStimuliSetId: false });
    ensureStimuliSetIdSessionInvariant();
    Meteor.subscribe('files.assets.all');
    Session.set('instructionClientStart', Date.now());
    Session.set('curModule', 'instructions');
    Session.set('fromInstructions', true);
    Session.set('suppressAuthenticatedChrome', false);
    clearAppLoadingUnlessLaunch();
    renderLayout(this, 'instructions');
  },
  triggersEnter: [function(context: any, redirect: any, stop: any) {
    ensureStimuliSetIdSessionInvariant();
    Meteor.subscribe('files.assets.all');
    if (!haveMeteorUser()) {
      clientConsole(2, 'No one logged in - allowing template to handle');
      return;
    }

    const unit: any = Session.get('currentTdfUnit');

    // IMPORTANT: If unit is not yet loaded, always show instructions page
    // to avoid race condition where instructions are skipped on first unit
    if (!unit) {
      clientConsole(2, 'Unit not yet loaded - showing instructions page to avoid race');
      return;
    }

    const lockout = Number(unitHasLockout()) > 0;
    const txt = unit.unitinstructions ? unit.unitinstructions.trim() : undefined;
    const pic = unit.picture ? unit.picture.trim() : undefined;
    const instructionsq = unit.unitinstructionsquestion ? unit.unitinstructionsquestion.trim() : undefined;
    if (!txt && !pic && !instructionsq && !lockout) {
      clientConsole(2, 'Instructions empty: skipping', displayify(unit));
      Session.set('instructionClientStart', Date.now());
      instructContinue();
      if (typeof stop === 'function') {
        stop();
      }
    }
  }],
});







