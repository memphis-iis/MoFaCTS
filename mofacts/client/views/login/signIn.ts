import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Tracker } from 'meteor/tracker';
import { Session } from 'meteor/session';
import { ServiceConfiguration } from 'meteor/service-configuration';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { meteorCallAsync, clientConsole } from '../..';
import { sessionCleanUp } from '../../lib/sessionUtils';
import { displayify } from '../../../common/globalHelpers';
import { selectTdf } from '../home/home';
import './signIn.html';
import '../footer.html';
import { setExperimentParticipantContext } from '../../lib/idContext';
import '../../lib/memphisSaml';


import { legacyTrim } from '../../../common/underscoreCompat';

const FlowRouterAny = FlowRouter as any;
const MeteorAny = Meteor as any;

type SignInState = {
  serverErrorMessage: string;
  normalEmailError: string;
  normalPasswordError: string;
  experimentUsernameError: string;
  experimentPasswordError: string;
  showVerificationHelp: boolean;
};

function createEmptySignInState(): SignInState {
  return {
    serverErrorMessage: '',
    normalEmailError: '',
    normalPasswordError: '',
    experimentUsernameError: '',
    experimentPasswordError: '',
    showVerificationHelp: false,
  };
}

function getSignInState(template?: any): SignInState {
  const signInTemplate = template || Template.instance();
  return (signInTemplate as any)?.signInState?.get?.() || createEmptySignInState();
}

function setSignInState(nextState: Partial<SignInState>, template?: any) {
  const signInTemplate = template || Template.instance();
  const stateHandle = (signInTemplate as any)?.signInState;
  if (!stateHandle?.set) return;
  const currentState = stateHandle.get() as SignInState;
  stateHandle.set({ ...currentState, ...nextState });
}

function clearSignInState(template?: any) {
  const signInTemplate = template || Template.instance();
  const stateHandle = (signInTemplate as any)?.signInState;
  if (!stateHandle?.set) return;
  stateHandle.set(createEmptySignInState());
}

function inputStateClass(hasError: boolean): string {
  return hasError ? 'is-invalid' : '';
}

function inputAriaInvalid(hasError: boolean): string {
  return hasError ? 'true' : 'false';
}

function focusFirstSignInError(template?: any) {
  const signInTemplate = template || Template.instance();
  const state = getSignInState(signInTemplate);
  const emailInput = document.getElementById('signInUsername') as HTMLInputElement | null;
  const passwordInput = document.getElementById('password') as HTMLInputElement | null;
  const serverError = document.getElementById('serverErrors') as HTMLElement | null;

  if (state.normalEmailError || state.experimentUsernameError) {
    emailInput?.focus();
    return;
  }
  if (state.normalPasswordError || state.experimentPasswordError) {
    passwordInput?.focus();
    return;
  }
  if (state.serverErrorMessage && serverError) {
    serverError.setAttribute('tabindex', '-1');
    serverError.focus();
  }
}

function getCurrentRouteName(): string | undefined {
  try {
    return FlowRouterAny?.current?.()?.route?.name;
  } catch (_error) {
    return undefined;
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getMeteorErrorCode(error: unknown): string {
  const err = error as { error?: unknown };
  return typeof err?.error === 'string' ? err.error : '';
}

function normalizeLoginIdentifier(rawValue: unknown): string {
  const trimmedValue = legacyTrim(String(rawValue || ''));
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedValue)) {
    return trimmedValue.toLowerCase();
  }
  return trimmedValue;
}

function clearInlineSignInError() {
  clearSignInState();
}

function restoreVisibleSignInScreen(template?: any) {
  const signInTemplate = template || Template.instance();
  signInTemplate?.isLoggingIn?.set?.(false);
  const container = document.getElementById('signInContainer') as HTMLElement | null;
  if (!container) {
    return;
  }
  container.style.display = '';
  container.style.visibility = '';
  container.style.opacity = '';
  container.style.pointerEvents = '';
  container.classList.remove('page-loading');
  container.classList.add('page-loaded');
}

function showInlineSignInError(message: string, options: Partial<SignInState> = {}, template?: any) {
  setSignInState({
    serverErrorMessage: message,
    normalEmailError: '',
    normalPasswordError: '',
    experimentUsernameError: '',
    experimentPasswordError: '',
    showVerificationHelp: false,
    ...options,
  }, template);
}

function showFieldSignInError(nextState: Partial<SignInState>, template?: any) {
  setSignInState({
    serverErrorMessage: '',
    normalEmailError: '',
    normalPasswordError: '',
    experimentUsernameError: '',
    experimentPasswordError: '',
    showVerificationHelp: false,
    ...nextState,
  }, template);
}

const EXPERIMENT_PORTAL_DESCRIPTION =
  'Welcome to the MoFaCTs experiment portal. This page is used to start a new experiment session or continue a previous one.';
const DEFAULT_SIGNIN_DESCRIPTION =
  'Sign in to access your learning dashboard, saved progress, and account tools.';

Session.setDefault('allowPublicSignup', false);
Session.setDefault('requireEmailVerification', false);
Session.setDefault('minPasswordLength', 8);
Session.setDefault('memphisSamlEnabled', false);
Session.setDefault('memphisSamlDisplayName', 'University of Memphis');

Template.signIn.onCreated(function(this: any) {
  // CRITICAL: Subscribe to OAuth service configuration for Google/Microsoft login
  // Store subscription handle so we can check if it's ready
  this.oauthConfigSub = this.subscribe('meteor.loginServiceConfiguration');

  // Track if we're in the process of logging in to prevent flash on re-renders
  this.isLoggingIn = new ReactiveVar(false);
  this.signInState = new ReactiveVar(createEmptySignInState());
});

Template.signIn.onDestroyed(function(this: any) {
  // Cleanup autorun to prevent zombie computations
  if (this._themeAutorunHandle) {
    this._themeAutorunHandle.stop();
    this._themeAutorunHandle = null;
  }

  // CRITICAL: Immediately hide the signIn template when it's being destroyed
  // This prevents the flash where the signIn screen is briefly visible after login
  // while the route transition to /home is still in progress
  const container = document.getElementById('signInContainer');
  if (container) {
    // Remove the fade-in class and force immediate hide
    container.classList.remove('page-loaded');
    container.classList.add('page-loading');
    // Use inline style as final enforcement (overrides any CSS)
    container.style.opacity = '0';
    container.style.pointerEvents = 'none';
    // Also set display none for complete removal from layout
    container.style.display = 'none';
  }
});

Template.signIn.onRendered(async function(this: any) {
  const template = this;
  const isExperimentFlow = Session.get('loginMode') === 'experiment';
  clearInlineSignInError();

  // CRITICAL: Check if user is already logged in OR in the process of logging in
  // If true, hide immediately to prevent flash
  const currentUser = Meteor.user() as any;
  const userLoggedIn = !!currentUser &&
    !isExperimentFlow &&
    currentUser.loginParams?.loginMode !== 'experiment';
  const currentlyLoggingIn = template.isLoggingIn.get();

  if(userLoggedIn || currentlyLoggingIn){
    clientConsole(2, "User logged in or logging in, hiding signIn template", {userLoggedIn, currentlyLoggingIn})
    // Immediately and permanently hide to prevent flash
    const container = document.getElementById('signInContainer');
    if (container) {
      container.style.display = 'none';
      container.style.visibility = 'hidden';
    }
    if(userLoggedIn) {
      FlowRouter.go("/home");
      return; // Exit early - don't load teachers or do anything else
    }
    return; // Exit early if logging in
  }

  // Load data in background, but don't show yet - wait for theme
  try {
    if (Session.get('loginMode') !== 'experiment') {
      clientConsole(2, 'password signin, setting login mode');
      Session.set('loginMode', 'password');
      const authClientConfig = await meteorCallAsync('getAuthClientConfig') as {
        allowPublicSignup?: boolean;
        requireEmailVerification?: boolean;
        minPasswordLength?: number;
        memphisSamlEnabled?: boolean;
        memphisSamlDisplayName?: string;
      };
      Session.set('allowPublicSignup', !!authClientConfig?.allowPublicSignup);
      Session.set('requireEmailVerification', !!authClientConfig?.requireEmailVerification);
      Session.set('minPasswordLength', Number(authClientConfig?.minPasswordLength) || 8);
      Session.set('memphisSamlEnabled', !!authClientConfig?.memphisSamlEnabled);
      Session.set('memphisSamlDisplayName', authClientConfig?.memphisSamlDisplayName || 'University of Memphis');
    }
  } catch (err) {
    clientConsole(1, '[SIGNIN] Async init failed:', err);
  }

  // Wait for theme to be ready, then fade in after CSS is painted
  // Store handle for cleanup
  template._themeAutorunHandle = Tracker.autorun(() => {
    if (!Session.get('themeReady')) return;

    const resolvedUser = Meteor.user() as any;
    const hasUserId = !!Meteor.userId();
    const inExperimentFlow = Session.get('loginMode') === 'experiment';
    const userReadyAndNormal = !!resolvedUser &&
      !inExperimentFlow &&
      resolvedUser.loginParams?.loginMode !== 'experiment';

    // If user is fully loaded and in normal mode, hide and redirect out of sign-in.
    if (userReadyAndNormal) {
      const container = document.getElementById('signInContainer');
      if (container) {
        container.style.display = 'none';
        container.style.visibility = 'hidden';
      }

      const currentRouteName = getCurrentRouteName();
      if (currentRouteName !== 'client.home') {
        clientConsole(2, '[SIGNIN] Authenticated user detected on sign-in route, redirecting to /home');
        FlowRouter.go('/home');
      }
      return;
    }

    if (hasUserId && !resolvedUser) {
      if (!template._waitingForUserDocLogged) {
        clientConsole(2, '[SIGNIN] userId present but user doc not ready; keeping sign-in page visible');
        template._waitingForUserDocLogged = true;
      }
    } else {
      template._waitingForUserDocLogged = false;
    }

    clientConsole(2, '[SIGNIN] Theme ready, waiting for CSS paint before fade-in');

    // Ensure DOM is ready before attempting to show
    Tracker.afterFlush(() => {
      // Use requestAnimationFrame to ensure CSS is painted before making visible
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = document.getElementById('signInContainer');
          if (container) {
            clientConsole(2, '[SIGNIN] CSS painted, fading in sign-in page');
            container.classList.remove('page-loading');
            container.classList.add('page-loaded');
          } else {
            clientConsole(1, '[SIGNIN] WARNING: signInContainer not found after theme ready!');
          }
        });
      });
    });
  });
});


// //////////////////////////////////////////////////////////////////////////
// Template Events

Template.signIn.events({
  'submit .auth-form': function(event: any, template: any) {
    event.preventDefault();
    const isExperimentMode = Session.get('loginMode') === 'experiment';
    const buttonSelector = isExperimentMode ? '#experimentSignin' : '#signInButton';
    $(buttonSelector).prop('disabled', true);
    userPasswordCheck(template);
  },

  'click #signUpButton': function(event: any) {
    if (!Session.get('allowPublicSignup')) {
      showInlineSignInError('Public signup is currently disabled.');
      return;
    }
    clearInlineSignInError();
    Meteor.logout();
    event.preventDefault();
    FlowRouter.go('/auth/signup');
  },
  'click #signInWithMicrosoftSSO': async function(event: any, template: any) {
    //login with the Accounts service microsoft
    event.preventDefault();

    // CRITICAL: Set logging in flag and hide container immediately to prevent flash
    template.isLoggingIn.set(true);
    const container = document.getElementById('signInContainer') as HTMLElement | null;
    if (container) {
      container.style.display = 'none';
      container.style.visibility = 'hidden';
    }

    clientConsole(2, '[MS-LOGIN] Microsoft Login Button Clicked');
    clientConsole(2, '[MS-LOGIN] Current loginMode:', Session.get('loginMode'));
    clientConsole(2, '[MS-LOGIN] Current user:', Meteor.userId());

    // Check if OAuth service configuration is ready
    const msConfig = ServiceConfiguration.configurations.findOne({service: 'microsoft'});
    if (!msConfig) {
      clientConsole(1, '[MS-LOGIN] ERROR: OAuth service configuration not ready yet!');
      restoreVisibleSignInScreen(template);
      showInlineSignInError('OAuth configuration is still loading. Please wait a moment and try again.', {}, template);
      focusFirstSignInError(template);
      return;
    }
    clientConsole(2, '[MS-LOGIN] OAuth config found:', !!msConfig);

    //set the login mode to microsoft
    Session.set('loginMode', 'microsoft');

    // METEOR 3 FIX: Use promisified version instead of callback
    const loginWithMicrosoftAsync = MeteorAny.promisify(MeteorAny.loginWithMicrosoft);

    try {
      clientConsole(2, '[MS-LOGIN] Initiating Meteor.loginWithMicrosoft...');
      await loginWithMicrosoftAsync({
        loginStyle: 'popup',
      });

      clientConsole(2, '[MS-LOGIN] Login successful!');
      clientConsole(2, '[MS-LOGIN] User after login:', Meteor.userId());

      //if we are not in a class and we log in, we need to disable embedded API keys.
      if(!Session.get('curClass')){
        Session.set('useEmbeddedAPIKeys', false);
      }

      // METEOR 3 FIX: Server-side Accounts.onLogin hook automatically sets loginParams
      // We just need to wait for it to sync to the client via DDP
      clientConsole(2, '[MS-LOGIN] Waiting for loginParams to sync from server...');
      const loginParamsFound = await new Promise((resolve) => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const checkLoginParams = Tracker.autorun((computation) => {
          const user = Meteor.user() as any;
          if (user && user.loginParams) {
            clientConsole(2, '[MS-LOGIN] loginParams synced to client:', user.loginParams);
            computation.stop();
            if (timeoutId) clearTimeout(timeoutId);
            resolve(true);
          }
        });
        // Timeout after 5 seconds (should be fast since server sets it immediately)
        timeoutId = setTimeout(() => {
          checkLoginParams.stop();
          clientConsole(1, '[MS-LOGIN] TIMEOUT waiting for loginParams!');
          resolve(false);
        }, 5000);
      });

      if (!loginParamsFound) {
        clientConsole(1, '[MS-LOGIN] WARNING: loginParams never synced, but continuing anyway');
      }

      clientConsole(2, '[MS-LOGIN] Calling logUserAgentAndLoginTime...');
      MeteorAny.callAsync('logUserAgentAndLoginTime', Meteor.userId(), navigator.userAgent);

      clientConsole(2, '[MS-LOGIN] Logging out other clients...');
      Meteor.logoutOtherClients();
      void meteorCallAsync('recordSessionRevocation', 'logout-other-clients-microsoft');

      // Route to /profile like password login does
      clientConsole(2, '[MS-LOGIN] Routing to /profile');
      FlowRouter.go('/home');

    } catch (error) {
      clientConsole(1, '[MS-LOGIN] Login Error:', error);
      clientConsole(1, '[MS-LOGIN] Error details:', JSON.stringify(error, null, 2));
      restoreVisibleSignInScreen(template);
      Session.set('loginMode', 'password');
      showInlineSignInError(getOAuthDuplicateAccountMessage(error, 'Microsoft'), {}, template);
      $('#signInButton').prop('disabled', false);
      focusFirstSignInError(template);
    }
  },

  'click #signInWithMemphisSaml': async function(event: any, template: any) {
    event.preventDefault();

    template.isLoggingIn.set(true);
    const container = document.getElementById('signInContainer') as HTMLElement | null;
    if (container) {
      container.style.display = 'none';
      container.style.visibility = 'hidden';
    }

    clientConsole(2, '[MEMPHIS-SAML] Memphis SAML Login Button Clicked');
    clientConsole(2, '[MEMPHIS-SAML] Current loginMode:', Session.get('loginMode'));
    clientConsole(2, '[MEMPHIS-SAML] Current user:', Meteor.userId());

    Session.set('loginMode', 'memphisSaml');

    const loginWithMemphisSamlAsync = MeteorAny.promisify(MeteorAny.loginWithMemphisSaml);

    try {
      clientConsole(2, '[MEMPHIS-SAML] Initiating Meteor.loginWithMemphisSaml...');
      await loginWithMemphisSamlAsync({
        loginStyle: 'popup',
      });

      clientConsole(2, '[MEMPHIS-SAML] Login successful!');
      clientConsole(2, '[MEMPHIS-SAML] User after login:', Meteor.userId());

      if(!Session.get('curClass')){
        Session.set('useEmbeddedAPIKeys', false);
      }

      clientConsole(2, '[MEMPHIS-SAML] Waiting for loginParams to sync from server...');
      const loginParamsFound = await new Promise((resolve) => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const checkLoginParams = Tracker.autorun((computation) => {
          const user = Meteor.user() as any;
          if (user && user.loginParams) {
            clientConsole(2, '[MEMPHIS-SAML] loginParams synced to client:', user.loginParams);
            computation.stop();
            if (timeoutId) clearTimeout(timeoutId);
            resolve(true);
          }
        });
        timeoutId = setTimeout(() => {
          checkLoginParams.stop();
          clientConsole(1, '[MEMPHIS-SAML] TIMEOUT waiting for loginParams!');
          resolve(false);
        }, 5000);
      });

      if (!loginParamsFound) {
        clientConsole(1, '[MEMPHIS-SAML] WARNING: loginParams never synced, but continuing anyway');
      }

      clientConsole(2, '[MEMPHIS-SAML] Calling logUserAgentAndLoginTime...');
      MeteorAny.callAsync('logUserAgentAndLoginTime', Meteor.userId(), navigator.userAgent);

      clientConsole(2, '[MEMPHIS-SAML] Logging out other clients...');
      Meteor.logoutOtherClients();
      void meteorCallAsync('recordSessionRevocation', 'logout-other-clients-memphis-saml');

      clientConsole(2, '[MEMPHIS-SAML] Routing to /home');
      FlowRouter.go('/home');
    } catch (error) {
      clientConsole(1, '[MEMPHIS-SAML] Login Error:', error);
      clientConsole(1, '[MEMPHIS-SAML] Error details:', JSON.stringify(error, null, 2));
      restoreVisibleSignInScreen(template);
      Session.set('loginMode', 'password');
      showInlineSignInError(getOAuthDuplicateAccountMessage(error, 'University of Memphis'), {}, template);
      $('#signInButton').prop('disabled', false);
      focusFirstSignInError(template);
    }
  },

  'input #signInUsername': function(_event: any, template: any) {
    setSignInState({
      normalEmailError: '',
      experimentUsernameError: '',
      serverErrorMessage: '',
      showVerificationHelp: false,
    }, template);
  },

  'input #password': function(_event: any, template: any) {
    setSignInState({
      normalPasswordError: '',
      experimentPasswordError: '',
      serverErrorMessage: '',
      showVerificationHelp: false,
    }, template);
  },

  'click #signInButtonOAuth': async function(event: any, template: any) {
    event.preventDefault();
    $('#signInButton').prop('disabled', true);

    // CRITICAL: Set logging in flag and hide container immediately to prevent flash
    template.isLoggingIn.set(true);
    const container = document.getElementById('signInContainer') as HTMLElement | null;
    if (container) {
      container.style.display = 'none';
      container.style.visibility = 'hidden';
    }

    clientConsole(2, '[GOOGLE-LOGIN] Google Login Button Clicked');
    clientConsole(2, '[GOOGLE-LOGIN] Current loginMode:', Session.get('loginMode'));
    clientConsole(2, '[GOOGLE-LOGIN] Current user:', Meteor.userId());

    // Check if OAuth service configuration is ready
    const googleConfig = ServiceConfiguration.configurations.findOne({service: 'google'});
    if (!googleConfig) {
      clientConsole(1, '[GOOGLE-LOGIN] ERROR: OAuth service configuration not ready yet!');
      restoreVisibleSignInScreen(template);
      showInlineSignInError('OAuth configuration is still loading. Please wait a moment and try again.', {}, template);
      $('#signInButton').prop('disabled', false);
      focusFirstSignInError(template);
      return;
    }
    clientConsole(2, '[GOOGLE-LOGIN] OAuth config found:', !!googleConfig);

    // Set the login mode to google
    Session.set('loginMode', 'google');

    const options = {
      requestOfflineToken: true,
      requestPermissions: ['email', 'profile'],
      loginStyle: 'popup',
    };

    // METEOR 3 FIX: Use promisified version instead of callback
    const loginWithGoogleAsync = MeteorAny.promisify(Meteor.loginWithGoogle);

    try {
      clientConsole(2, '[GOOGLE-LOGIN] Initiating Meteor.loginWithGoogle...');
      await loginWithGoogleAsync(options);

      clientConsole(2, '[GOOGLE-LOGIN] Login successful!');
      clientConsole(2, '[GOOGLE-LOGIN] User after login:', Meteor.userId());

      if(!Session.get('curClass')){
        //If we are not in a class and we log in, we need to disable embedded API keys.
        Session.set('useEmbeddedAPIKeys', false);
      }

      // METEOR 3 FIX: Server-side Accounts.onLogin hook automatically sets loginParams
      // We just need to wait for it to sync to the client via DDP
      clientConsole(2, '[GOOGLE-LOGIN] Waiting for loginParams to sync from server...');
      const loginParamsFound = await new Promise((resolve) => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const checkLoginParams = Tracker.autorun((computation) => {
          const user = Meteor.user() as any;
          if (user && user.loginParams) {
            clientConsole(2, '[GOOGLE-LOGIN] loginParams synced to client:', user.loginParams);
            computation.stop();
            if (timeoutId) clearTimeout(timeoutId);
            resolve(true);
          }
        });
        // Timeout after 5 seconds (should be fast since server sets it immediately)
        timeoutId = setTimeout(() => {
          checkLoginParams.stop();
          clientConsole(1, '[GOOGLE-LOGIN] TIMEOUT waiting for loginParams!');
          resolve(false);
        }, 5000);
      });

      if (!loginParamsFound) {
        clientConsole(1, '[GOOGLE-LOGIN] WARNING: loginParams never synced, but continuing anyway');
      }

      if (Session.get('debugging')) {
        const currentUser = Meteor.users.findOne({ _id: Meteor.userId() as string });
        const username = currentUser?.username || Meteor.userId();
        clientConsole(2, '[GOOGLE-LOGIN] ' + username + ' was logged in successfully! Current route is ', getCurrentRouteName());
        MeteorAny.callAsync('debugLog', 'Sign in was successful');
      }

      clientConsole(2, '[GOOGLE-LOGIN] Calling logUserAgentAndLoginTime...');
      MeteorAny.callAsync('logUserAgentAndLoginTime', Meteor.userId(), navigator.userAgent);

      clientConsole(2, '[GOOGLE-LOGIN] Logging out other clients...');
      Meteor.logoutOtherClients();
      void meteorCallAsync('recordSessionRevocation', 'logout-other-clients-google');

      // Route to /profile like password login does
      clientConsole(2, '[GOOGLE-LOGIN] Routing to /profile');
      FlowRouter.go('/home');

    } catch (error) {
      clientConsole(1, '[GOOGLE-LOGIN] Login Error:', error);
      clientConsole(1, '[GOOGLE-LOGIN] Error details:', JSON.stringify(error, null, 2));
      restoreVisibleSignInScreen(template);
      Session.set('loginMode', 'password');
      showInlineSignInError(getOAuthDuplicateAccountMessage(error, 'Google'), {}, template);
      $('#signInButton').prop('disabled', false);
      focusFirstSignInError(template);
    }
  },


});

// //////////////////////////////////////////////////////////////////////////
// Template Heleprs

Template.signIn.helpers({
  isExperiment: function() {
    return Session.get('loginMode') === 'experiment';
  },

 experimentLoginText: function() {
    return Session.get('loginPrompt');
  },

  experimentLoginLabel: function() {
    return Session.get('loginPrompt') || 'Participant ID';
  },

  experimentPasswordRequired: function() {
    return Session.get('experimentPasswordRequired');
  },

  isNormal: function() {
    return Session.get('loginMode') !== 'experiment';
  },

  signInDescription: function() {
    if (Session.get('loginMode') === 'experiment') {
      return EXPERIMENT_PORTAL_DESCRIPTION;
    }
    const theme = Session.get('curTheme') as any;
    return theme?.properties?.signInDescription || DEFAULT_SIGNIN_DESCRIPTION;
  },

  canShowSignUp: function() {
    return !!Session.get('allowPublicSignup');
  },

  canShowMemphisSaml: function() {
    return !!Session.get('memphisSamlEnabled');
  },

  memphisSamlButtonLabel: function() {
    return `Sign in with ${Session.get('memphisSamlDisplayName') || 'University of Memphis'}`;
  },

  serverErrorMessage: function() {
    return getSignInState().serverErrorMessage;
  },

  showVerificationHelp: function() {
    return getSignInState().showVerificationHelp;
  },

  normalEmailError: function() {
    return getSignInState().normalEmailError;
  },

  normalPasswordError: function() {
    return getSignInState().normalPasswordError;
  },

  experimentUsernameError: function() {
    return getSignInState().experimentUsernameError;
  },

  experimentPasswordError: function() {
    return getSignInState().experimentPasswordError;
  },

  normalEmailInputStateClass: function() {
    return inputStateClass(!!getSignInState().normalEmailError);
  },

  normalPasswordInputStateClass: function() {
    return inputStateClass(!!getSignInState().normalPasswordError);
  },

  experimentUsernameInputStateClass: function() {
    return inputStateClass(!!getSignInState().experimentUsernameError);
  },

  experimentPasswordInputStateClass: function() {
    return inputStateClass(!!getSignInState().experimentPasswordError);
  },

  normalEmailAriaInvalid: function() {
    return inputAriaInvalid(!!getSignInState().normalEmailError);
  },

  normalPasswordAriaInvalid: function() {
    return inputAriaInvalid(!!getSignInState().normalPasswordError);
  },

  experimentUsernameAriaInvalid: function() {
    return inputAriaInvalid(!!getSignInState().experimentUsernameError);
  },

  experimentPasswordAriaInvalid: function() {
    return inputAriaInvalid(!!getSignInState().experimentPasswordError);
  },

  normalEmailDescribedBy: function() {
    return getSignInState().normalEmailError ? 'normalEmailError' : '';
  },

  normalPasswordDescribedBy: function() {
    return getSignInState().normalPasswordError ? 'normalPasswordError' : '';
  },

  experimentUsernameDescribedBy: function() {
    return getSignInState().experimentUsernameError ? 'experimentUsernameError' : '';
  },

  experimentPasswordDescribedBy: function() {
    return getSignInState().experimentPasswordError ? 'experimentPasswordError' : '';
  },

});

// //////////////////////////////////////////////////////////////////////////
// Implementation functions

// Called after we have signed in
async function signInNotify(landingPage: string | false = '/profile') {
  if (Session.get('debugging')) {
    const currentUser = (Meteor.users.findOne({ _id: Meteor.userId() as string }) as any)?.username;
    clientConsole(2, currentUser + ' was logged in successfully! Current route is ', getCurrentRouteName());
    MeteorAny.callAsync('debugLog', 'Sign in was successful');
    MeteorAny.callAsync('logUserAgentAndLoginTime', Meteor.userId(), navigator.userAgent);
  }
  Meteor.logoutOtherClients();
  void meteorCallAsync('recordSessionRevocation', 'logout-other-clients-password');
  if(landingPage)
    FlowRouter.go(landingPage);
}

async function resolveExperimentTargetForLogin() {
  let experimentTarget = Session.get('experimentTarget');
  if (experimentTarget) experimentTarget = experimentTarget.toLowerCase();
  setExperimentParticipantContext({ experimentTarget, userId: Meteor.userId() }, 'signIn.resolveExperimentTargetForLogin');
  const foundExpTarget = (await meteorCallAsync('getTdfByExperimentTarget', experimentTarget)) as any;

  if (!foundExpTarget?.content?.tdfs?.tutor?.setspec) {
    throw new Error('Experiment target could not be found.');
  }

  const setspec = foundExpTarget.content.tdfs.tutor.setspec;
  const ignoreOutOfGrammarResponses = setspec.speechIgnoreOutOfGrammarResponses ?
    setspec.speechIgnoreOutOfGrammarResponses.toLowerCase() == 'true' : false;
  const speechOutOfGrammarFeedback = setspec.speechOutOfGrammarFeedback ?
    setspec.speechOutOfGrammarFeedback : 'Response not in answer set';

  return {
    experimentTarget,
    foundExpTarget,
    setspec,
    ignoreOutOfGrammarResponses,
    speechOutOfGrammarFeedback
  };
}

async function completeExperimentSignIn() {
  const {
    experimentTarget,
    foundExpTarget,
    setspec,
    ignoreOutOfGrammarResponses,
    speechOutOfGrammarFeedback
  } = await resolveExperimentTargetForLogin();

  // Persist experiment login context before first state mutation in selectTdf().
  // This prevents auth race conditions where updateExperimentState runs with stale loginMode.
  await persistLoginDataAfterLogin('direct', Session.get('loginMode'));

  await selectTdf(
    foundExpTarget._id,
    setspec.lessonname,
    foundExpTarget.stimuliSetId,
    ignoreOutOfGrammarResponses,
    speechOutOfGrammarFeedback,
    'Auto-selected by experiment target ' + experimentTarget,
    foundExpTarget.content.isMultiTdf,
    setspec,
    true
  );

  signInNotify(false);
}

function getExperimentLoginErrorMessage(error: unknown): string {
  const errorCode = getMeteorErrorCode(error);
  if (errorCode === 'already_complete') {
    return 'This participation ID has already completed this experiment.';
  }
  if (errorCode === 'experiment-target-mismatch') {
    return 'This participation ID is already linked to a different experiment.';
  }
  if (errorCode === 'duplicate-user') {
    return 'This participation ID is already in use.';
  }
  return toErrorMessage(error);
}

function getOAuthDuplicateAccountMessage(error: unknown, providerName: string): string {
  const errorCode = getMeteorErrorCode(error);
  if (errorCode === 'popup-closed-by-user') {
    return `${providerName} sign-in was canceled before it finished.`;
  }
  if (errorCode === 'oauth-account-exists-password') {
    return 'This email is already registered with a password. Sign in with your password or use Forgot password to reset it.';
  }
  if (errorCode === 'oauth-account-exists-google') {
    return 'This email is already registered with Google sign-in. Use Google to continue.';
  }
  if (errorCode === 'oauth-account-exists-microsoft') {
    return 'This email is already registered with Microsoft sign-in. Use Microsoft to continue.';
  }
  if (errorCode === 'oauth-account-exists-memphis-saml') {
    return 'This email is already registered with University of Memphis sign-in. Use that button to continue.';
  }
  if (errorCode === 'oauth-account-exists-different-method') {
    return 'This email is already registered with a different sign-in method. Use your existing method to continue.';
  }

  const detailedMessage = toErrorMessage(error).trim();
  if (detailedMessage) {
    return `${providerName} sign-in failed: ${detailedMessage}`;
  }

  return `${providerName} sign-in failed because no error details were returned.`;
}

function isLoginDataRaceError(error: unknown): boolean {
  const errorCode = getMeteorErrorCode(error);
  if (errorCode === 'not-authorized') {
    return true;
  }

  return /Must be logged in to set login data/i.test(toErrorMessage(error));
}

async function persistLoginDataAfterLogin(
  entryPoint: string,
  loginMode: string,
  curTeacher?: unknown,
  curClass?: unknown,
  assignedTdfs?: unknown
) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await meteorCallAsync('setUserLoginData', entryPoint, loginMode, curTeacher, curClass, assignedTdfs);
      return;
    } catch (error: unknown) {
      lastError = error;
      if (!isLoginDataRaceError(error)) {
        throw error;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 125 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(toErrorMessage(lastError));
}

async function userPasswordCheck(template?: any) {
  clearSignInState(template);

  const experiment = Session.get('loginMode') === 'experiment';
  const experimentPasswordRequired = Session.get('experimentPasswordRequired');
  let newUsername = normalizeLoginIdentifier($('#signInUsername').val());
  let newPassword = legacyTrim(experiment && !experimentPasswordRequired ? '' : $('#password').val());

  if (experiment) {
    if (!newUsername) {
      showFieldSignInError({ experimentUsernameError: 'Enter your participation ID.' }, template);
      $('#experimentSignin').prop('disabled', false);
      focusFirstSignInError(template);
      return;
    }

    if (experimentPasswordRequired && !newPassword) {
      showFieldSignInError({ experimentPasswordError: 'Enter your password.' }, template);
      $('#experimentSignin').prop('disabled', false);
      focusFirstSignInError(template);
      return;
    }
  } else {
    if (!newUsername) {
      showFieldSignInError({ normalEmailError: 'Enter your email address.' }, template);
      $('#signInButton').prop('disabled', false);
      focusFirstSignInError(template);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUsername)) {
      showFieldSignInError({ normalEmailError: 'Enter a valid email address.' }, template);
      $('#signInButton').prop('disabled', false);
      focusFirstSignInError(template);
      return;
    }

    if (!newPassword) {
      showFieldSignInError({ normalPasswordError: 'Enter your password.' }, template);
      $('#signInButton').prop('disabled', false);
      focusFirstSignInError(template);
      return;
    }
  }

  if (experiment) {
    if (experimentPasswordRequired) {
      sessionCleanUp();
      Session.set('experimentPasswordRequired', true);
      clientConsole(2, '[EXPERIMENT-LOGIN] credentialed sign-in attempt for', newUsername);

      // METEOR 3 FIX: Use promisified version instead of callback
      const loginWithPasswordAsync = MeteorAny.promisify(Meteor.loginWithPassword);

      try {
        await loginWithPasswordAsync(newUsername, newPassword);
        await completeExperimentSignIn();
        clientConsole(2, '[EXPERIMENT-LOGIN] Complete');
      } catch (error) {
        clientConsole(1, 'ERROR: The user was not logged in on experiment sign in?', newUsername, 'Error:', error);
        showInlineSignInError('It appears that you could not be logged in as ' + newUsername + '.', {}, template);
        $('#experimentSignin').prop('disabled', false);
        focusFirstSignInError(template);
      }

      return;
    } else {
      // Experimental ID's are assumed to be upper case
      newUsername = newUsername.toUpperCase();
      let experimentTarget = Session.get('experimentTarget');
      if (experimentTarget) experimentTarget = experimentTarget.toLowerCase();
      setExperimentParticipantContext({ experimentTarget, userId: Meteor.userId() }, 'signIn.userPasswordCheck.experimentProvision');

      // Experiment mode - provision credentials via dedicated server method.
      try {
        const provisionResult = (await meteorCallAsync('provisionExperimentUser', experimentTarget, newUsername)) as any;

        if (provisionResult?.status === 'already_complete') {
          showInlineSignInError('This participation ID has already completed this experiment.', {}, template);
          $('#experimentSignin').prop('disabled', false);
          focusFirstSignInError(template);
          return;
        }

        if (!provisionResult?.issuedPassword) {
          throw new Error('Provisioning did not return credentials');
        }

        newPassword = provisionResult.issuedPassword;

        // Everything was OK if we make it here - now we init the session,
        // login, and proceed to the profile screen
        sessionCleanUp();

        // METEOR 3 FIX: Use promisified version instead of callback
        const loginWithPasswordAsync = MeteorAny.promisify(Meteor.loginWithPassword);

        try {
          await loginWithPasswordAsync(newUsername, newPassword);
          await completeExperimentSignIn();
          clientConsole(2, '[EXPERIMENT-LOGIN-2] Complete');
        } catch (error) {
          clientConsole(1, 'ERROR: The user was not logged in on experiment sign in?', newUsername, 'Error:', error);
          showInlineSignInError('It appears that you could not be logged in as ' + newUsername + '.', {}, template);
          $('#experimentSignin').prop('disabled', false);
          focusFirstSignInError(template);
        }
      } catch (error) {
        const participantMessage = getExperimentLoginErrorMessage(error);

        clientConsole(1, 'Experiment user login errors:', displayify([error]));
        showInlineSignInError(participantMessage, {}, template);
        $('#experimentSignin').prop('disabled', false);
        focusFirstSignInError(template);
        return;
      }

      // No more processing
      return;
    }
  }

  // If we're here, we're NOT in experimental mode
  // METEOR 3 FIX: Use promisified version instead of callback
  const loginWithPasswordAsync = MeteorAny.promisify(Meteor.loginWithPassword);

  try {
    await loginWithPasswordAsync(newUsername, newPassword);

    if(!Session.get('curClass')){
      //If we are not in a class and we log in, we need to disable embedded API keys.
      Session.set('useEmbeddedAPIKeys', false);
    }

    // Set loginParams BEFORE routing to ensure data is ready
    try {
      await persistLoginDataAfterLogin('direct', Session.get('loginMode'));
      clientConsole(2, '[PASSWORD-LOGIN] setUserLoginData completed');
    } catch (error) {
      clientConsole(1, '[PASSWORD-LOGIN] setUserLoginData failed:', error);
      showInlineSignInError('Failed to save login data: ' + toErrorMessage(error), {}, template);
      $('#signInButton').prop('disabled', false);
      focusFirstSignInError(template);
      return;
    }

    signInNotify();
  } catch (error) {
    clientConsole(1, 'Login error: ' + error);
    if (getMeteorErrorCode(error) === 'email-not-verified') {
      showInlineSignInError(
        'Please verify your email before signing in. You can request a new verification email from the verification page.',
        { showVerificationHelp: true },
        template
      );
      $('#signInButton').prop('disabled', false);
      focusFirstSignInError(template);
      return;
    }
    showFieldSignInError({
      normalPasswordError: "We couldn't sign you in with that email and password.",
    }, template);
    $('#signInButton').prop('disabled', false);
    focusFirstSignInError(template);
  }
}


