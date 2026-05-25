import {checkUserSession, clientConsole} from '../../lib/userSessionHelpers';
const { FlowRouter } = require('meteor/ostrio:flow-router-extra');
import {Cookie} from '../../lib/cookies';
import { Tracker } from 'meteor/tracker';
import DOMPurify from 'dompurify';
import './home.html';
import './home.css';

declare const Template: any;
declare const Session: any;
declare const Meteor: any;

const MAIN_MENU_RETURN_TOUR_DURATION_MS = 5000;
const HOME_NAV_HEIGHT_PROPERTY = '--home-nav-height';
const HOME_WELCOME_ALLOWED_TAGS = ['h1', 'h2', 'h3', 'p', 'br', 'span', 'strong', 'em', 'b', 'i', 'u', 'a', 'ul', 'ol', 'li'];
const HOME_WELCOME_ALLOWED_ATTR = ['href', 'title', 'target', 'rel', 'class', 'style'];

type HomeTourStepId =
  | 'main-menu-return'
  | 'learning-dashboard'
  | 'teacher-select'
  | 'content-manager'
  | 'download-data'
  | 'audio-settings'
  | 'help'
  | 'documentation';
type HomeTourStep = {
  id: HomeTourStepId;
  text: string;
  getTarget: () => HTMLElement | null;
};

const HOME_TOUR_STEPS: HomeTourStep[] = [
  {
    id: 'main-menu-return',
    text: 'Return to the main menu at any time. All prior practice is automatically saved.',
    getTarget: () => document.querySelector('.navbar .home-link'),
  },
  {
    id: 'learning-dashboard',
    text: 'Begin practice here',
    getTarget: () => document.getElementById('myLessonsButton'),
  },
  {
    id: 'teacher-select',
    text: 'Ignore this one unless your teacher told you to come here.',
    getTarget: () => document.getElementById('classSelectionButton'),
  },
  {
    id: 'content-manager',
    text: 'Build your own lessons to have complete control over what you learn.',
    getTarget: () => document.getElementById('contentUploadButton'),
  },
  {
    id: 'download-data',
    text: "After you've created your own content, this will become relevant.",
    getTarget: () => document.getElementById('dataDownloadButton'),
  },
  {
    id: 'audio-settings',
    text: 'This is where you get text-to-speech and speech recognition.',
    getTarget: () => document.getElementById('audioSettingsButton'),
  },
  {
    id: 'help',
    text: 'Basic information.',
    getTarget: () => document.getElementById('helpButton'),
  },
  {
    id: 'documentation',
    text: 'The full story.',
    getTarget: () => document.getElementById('wikiProfileButton'),
  },
];

// //////////////////////////////////////////////////////////////////////////
// Template storage and helpers

Template.home.helpers({
  homeUnderlayStyle(): string {
    const theme = Session.get('curTheme');
    const url = (theme?.properties?.home_hero_image_url as string | undefined);
    if (typeof url === 'string' && url.trim().length > 0) {
      const escapedUrl = url.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `--home-underlay-image: url("${escapedUrl}");`;
    }
    return '';
  },

  homeWelcomeHtml(): string {
    const theme = Session.get('curTheme');
    const hasPracticeRecords = Session.get('homeHasPracticeRecords');
    const html = hasPracticeRecords === false
      ? theme?.properties?.home_no_practice_welcome_html
      : theme?.properties?.home_welcome_html;
    if (typeof html !== 'string') {
      clientConsole(1, '[HOME] Missing required theme welcome property');
      return '';
    }

    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: HOME_WELCOME_ALLOWED_TAGS,
      ALLOWED_ATTR: HOME_WELCOME_ALLOWED_ATTR,
    });
  }
});

// //////////////////////////////////////////////////////////////////////////
// Template Events

Template.home.events({
  'click #mainMenuReturnTour': function(_event: any, template: any) {
    advanceMainMenuTour(template);
  },

  'click #tourButton': function(event: any, template: any) {
    event.preventDefault();
    startMainMenuTour(template, { manual: true });
  },

  'click #myLessonsButton': function(event: any) {
    event.preventDefault();
    FlowRouter.go('/learningDashboard');
  },

  'click #classSelectionButton': function(event: any) {
    event.preventDefault();
    FlowRouter.go('/classSelection');
  },

  'click #contentUploadButton': function(event: any) {
    event.preventDefault();
    FlowRouter.go('/contentUpload');
  },

  'click #audioSettingsButton': function(event: any) {
    event.preventDefault();
    FlowRouter.go('/audioSettings');
  },

  'click #helpButton': function(event: any) {
    event.preventDefault();
    FlowRouter.go('/help');
  },

  'click #logoutButton': function(event: any) {
    event.preventDefault();
    Session.set('loginMode', 'normal');
    Cookie.set('isExperiment', '0', 1); // 1 day
    Cookie.set('experimentTarget', '', 1);
    Cookie.set('experimentXCond', '', 1);
    Meteor.logout(function() {
      Session.set('curModule', 'signinoauth');
      Session.set('currentTemplate', 'signIn');
      Session.set('appLoading', false);
      routeAfterLogout('/');
    });
  },

  'click #classEditButton': function(event: any) {
    event.preventDefault();
    FlowRouter.go('/classEdit');
  },

  'click #instructorReportingButton': function(event: any) {
    event.preventDefault();
    FlowRouter.go('/instructorReporting');
  },

  'click #tdfAssignmentEditButton': function(event: any) {
    event.preventDefault();
    FlowRouter.go('/tdfAssignmentEdit');
  },

  'click #dataDownloadButton': function(event: any) {
    event.preventDefault();
    FlowRouter.go('/dataDownload');
  },

  'click #wikiProfileButton': function(event: any) {
    event.preventDefault();
    window.open('https://github.com/memphis-iis/mofacts/wiki', '_blank');
  },

  'click #adminControlsBtn': function(event: any) {
    event.preventDefault();
    FlowRouter.go('/adminControls');
  },

  'click #userAdminButton': function(event: any) {
    event.preventDefault();
    FlowRouter.go('/userAdmin');
  },

  'click #mechTurkButton': function(event: any) {
    event.preventDefault();
    FlowRouter.go('/turkWorkflow');
  },

  'click #themeButton': function(event: any) {
    event.preventDefault();
    FlowRouter.go('/theme');
  },

  'click #adminTestsButton': function(event: any) {
    event.preventDefault();
    FlowRouter.go('/admin/tests');
  }
});

function routeAfterLogout(target = '/') {
  let handle: any = null;
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

// We'll use this in card.js if audio input is enabled and user has provided a
// speech API key
Session.set('speechAPIKey', null);

function shouldShowMainMenuReturnTour(templateInstance?: any): boolean {
  return Boolean(templateInstance?._mainMenuTourActive) &&
    Session.get('loginMode') !== 'experiment';
}

function positionMainMenuReturnTour(overlay: HTMLElement, target: HTMLElement): void {
  const targetRect = target.getBoundingClientRect();
  overlay.hidden = false;
  overlay.style.visibility = 'hidden';

  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const overlayWidth = overlay.offsetWidth || 270;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const overlayLeft = Math.min(
    Math.max(12, targetCenterX - overlayWidth / 2),
    Math.max(12, viewportWidth - overlayWidth - 12)
  );
  const arrowLeft = Math.min(
    Math.max(18, targetCenterX - overlayLeft),
    Math.max(18, overlayWidth - 18)
  );

  overlay.style.setProperty('--main-menu-tour-left', `${overlayLeft}px`);
  overlay.style.setProperty('--main-menu-tour-top', `${targetRect.bottom + 42}px`);
  overlay.style.setProperty('--main-menu-tour-arrow-left', `${arrowLeft}px`);
  overlay.style.visibility = '';
}

function hideMainMenuReturnTour(templateInstance?: any): void {
  const overlay = document.getElementById('mainMenuReturnTour') as HTMLElement | null;
  const highlightedTargets = document.querySelectorAll('.main-menu-return-tour-target');
  overlay?.classList.remove('is-visible');
  if (overlay) {
    overlay.hidden = true;
  }
  highlightedTargets.forEach((target) => target.classList.remove('main-menu-return-tour-target'));

  if (templateInstance?._mainMenuReturnTourTimeout) {
    clearTimeout(templateInstance._mainMenuReturnTourTimeout);
    templateInstance._mainMenuReturnTourTimeout = null;
  }
  if (templateInstance?._mainMenuReturnTourPositionHandler) {
    window.removeEventListener('resize', templateInstance._mainMenuReturnTourPositionHandler);
    window.removeEventListener('scroll', templateInstance._mainMenuReturnTourPositionHandler, true);
    templateInstance._mainMenuReturnTourPositionHandler = null;
  }

  if (templateInstance) {
    templateInstance._mainMenuTourActive = false;
    templateInstance._mainMenuTourStepIndex = 0;
    templateInstance._mainMenuTourManual = false;
  }
  Session.set('showMainMenuReturnTour', false);
}

function getCurrentTourStep(templateInstance: any): HomeTourStep | null {
  const index = Number(templateInstance?._mainMenuTourStepIndex || 0);
  return HOME_TOUR_STEPS[index] || null;
}

function showCurrentMainMenuTourStep(templateInstance: any): void {
  if (!shouldShowMainMenuReturnTour(templateInstance)) {
    return;
  }

  const overlay = document.getElementById('mainMenuReturnTour') as HTMLElement | null;
  const step = getCurrentTourStep(templateInstance);
  const target = step?.getTarget();
  if (!overlay || !step || !target) {
    clientConsole(1, '[HOME] Main menu tour skipped because a target was not found.', step?.id || 'missing-step');
    Session.set('showMainMenuReturnTour', false);
    hideMainMenuReturnTour(templateInstance);
    return;
  }

  const text = overlay.querySelector('.main-menu-return-tour-text');
  if (text) {
    text.textContent = step.text;
  }

  document.querySelectorAll('.main-menu-return-tour-target')
    .forEach((existingTarget) => existingTarget.classList.remove('main-menu-return-tour-target'));

  const positionOverlay = () => positionMainMenuReturnTour(overlay, target);
  positionOverlay();
  const highlightedTarget = step.id === 'main-menu-return'
    ? (target.closest('.home-link') as HTMLElement | null) || target
    : target;
  highlightedTarget.classList.add('main-menu-return-tour-target');
  templateInstance._mainMenuReturnTourPositionHandler = positionOverlay;
  window.addEventListener('resize', positionOverlay);
  window.addEventListener('scroll', positionOverlay, true);

  requestAnimationFrame(() => {
    overlay.classList.add('is-visible');
  });

  templateInstance._mainMenuReturnTourTimeout = setTimeout(() => {
    advanceMainMenuTour(templateInstance);
  }, MAIN_MENU_RETURN_TOUR_DURATION_MS);
}

function advanceMainMenuTour(templateInstance: any): void {
  if (!templateInstance?._mainMenuTourActive) {
    hideMainMenuReturnTour(templateInstance);
    return;
  }
  const nextIndex = Number(templateInstance._mainMenuTourStepIndex || 0) + 1;
  if (nextIndex >= HOME_TOUR_STEPS.length) {
    hideMainMenuReturnTour(templateInstance);
    return;
  }

  const overlay = document.getElementById('mainMenuReturnTour') as HTMLElement | null;
  overlay?.classList.remove('is-visible');
  if (templateInstance._mainMenuReturnTourTimeout) {
    clearTimeout(templateInstance._mainMenuReturnTourTimeout);
    templateInstance._mainMenuReturnTourTimeout = null;
  }
  if (templateInstance._mainMenuReturnTourPositionHandler) {
    window.removeEventListener('resize', templateInstance._mainMenuReturnTourPositionHandler);
    window.removeEventListener('scroll', templateInstance._mainMenuReturnTourPositionHandler, true);
    templateInstance._mainMenuReturnTourPositionHandler = null;
  }

  templateInstance._mainMenuTourStepIndex = nextIndex;
  setTimeout(() => showCurrentMainMenuTourStep(templateInstance), 120);
}

function startMainMenuTour(templateInstance: any, options: { manual?: boolean } = {}): void {
  if (Session.get('loginMode') === 'experiment') {
    return;
  }
  if (!options.manual && Session.get('homeHasPracticeRecords') !== false) {
    return;
  }
  hideMainMenuReturnTour(templateInstance);
  templateInstance._mainMenuTourActive = true;
  templateInstance._mainMenuTourStepIndex = 0;
  templateInstance._mainMenuTourManual = Boolean(options.manual);
  Session.set('showMainMenuReturnTour', true);
  showCurrentMainMenuTourStep(templateInstance);
}

async function hydrateHomePracticeState(templateInstance: any): Promise<void> {
  try {
    const result = await Meteor.callAsync('initializeDashboardCache', null);
    const practicedSystemCount = Number(result?.tdfCount || 0);
    const hasPracticeRecords = practicedSystemCount > 0;
    Session.set('homeHasPracticeRecords', hasPracticeRecords);
    if (Session.get('homeHasPracticeRecords') === false && !templateInstance._mainMenuTourManual) {
      Session.set('showMainMenuReturnTour', true);
      if (templateInstance._homeReadyForTour) {
        startMainMenuTour(templateInstance, { manual: false });
      }
    }
  } catch (error: unknown) {
    clientConsole(1, '[HOME] Failed to hydrate practice state for welcome/tour:', error);
  }
}

function updateHomeNavHeightVariable(): void {
  const navbar = document.querySelector('.navbar') as HTMLElement | null;
  if (!navbar) {
    clientConsole(1, '[HOME] Home underlay could not find the navbar height anchor.');
    document.documentElement.style.removeProperty(HOME_NAV_HEIGHT_PROPERTY);
    return;
  }

  document.documentElement.style.setProperty(HOME_NAV_HEIGHT_PROPERTY, `${navbar.offsetHeight}px`);
}

Template.home.onRendered(async function(this: any) {
  
  clientConsole(2, '[HOME] Template.home.onRendered called');
  // Do not clean launch Session state here. rendered() can fire repeatedly due
  // to reactivity while card/instructions are still using those values.
  void checkUserSession()
    .then(() => {
      clientConsole(2, '[HOME] checkUserSession completed');
    })
    .catch((error: unknown) => {
      clientConsole(1, '[HOME] checkUserSession failed:', error);
    });

  Session.set('showSpeechAPISetup', true);
  Session.set('homeHasPracticeRecords', null);

  const templateInstance = this;
  void hydrateHomePracticeState(templateInstance);
  updateHomeNavHeightVariable();
  templateInstance._homeNavHeightHandler = updateHomeNavHeightVariable;
  window.addEventListener('resize', updateHomeNavHeightVariable);
  // Trigger fade-in after theme is ready and CSS is painted
  // Store handle for cleanup
  templateInstance._themeAutorunHandle = Tracker.autorun(() => {
    if (!Session.get('themeReady')) return;
    if (!Session.get('authReady')) return;
    const userId = Meteor.userId();
    if (!userId) return;
    if (!Session.get('authRolesHydrated')) return;
    if (Session.get('authRolesSyncedUserId') !== userId) return;
    clientConsole(2, '[HOME] Theme ready, waiting for CSS paint before fade-in');

    // Ensure DOM is ready before attempting to show
    Tracker.afterFlush(() => {
      // Use requestAnimationFrame to ensure CSS is painted before making visible
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = document.getElementById("homeContainer");
          if (container) {
            clientConsole(2, '[HOME] CSS painted, fading in home page');
            container.classList.remove("page-loading");
            container.classList.add("page-loaded");
            templateInstance._homeReadyForTour = true;
            if (Session.get('showMainMenuReturnTour') === true && Session.get('homeHasPracticeRecords') === false) {
              startMainMenuTour(templateInstance, { manual: false });
            }
            if (templateInstance._themeAutorunHandle) {
              templateInstance._themeAutorunHandle.stop();
              templateInstance._themeAutorunHandle = null;
            }
          } else {
            clientConsole(1, '[HOME] WARNING: homeContainer not found after theme ready!');
          }
        });
      });
    });
  });
});

// Cleanup autoruns when template is destroyed to prevent zombie computations
Template.home.onDestroyed(function(this: any) {
  if (this._themeAutorunHandle) {
    this._themeAutorunHandle.stop();
    this._themeAutorunHandle = null;
  }
  if (this._homeNavHeightHandler) {
    window.removeEventListener('resize', this._homeNavHeightHandler);
    this._homeNavHeightHandler = null;
  }
  document.documentElement.style.removeProperty(HOME_NAV_HEIGHT_PROPERTY);
  hideMainMenuReturnTour(this);
});

