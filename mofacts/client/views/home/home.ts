import {checkUserSession, clientConsole} from '../../lib/userSessionHelpers';
const { FlowRouter } = require('meteor/ostrio:flow-router-extra');
import {Cookie} from '../../lib/cookies';
import { Tracker } from 'meteor/tracker';
import './home.html';
import './home.css';

declare const Template: any;
declare const Session: any;
declare const Meteor: any;

const MAIN_MENU_RETURN_TOUR_DURATION_MS = 5000;

// //////////////////////////////////////////////////////////////////////////
// Template storage and helpers

Template.home.helpers({
  homeHeroStyle(): string {
    const theme = Session.get('curTheme');
    const url = (theme?.properties?.home_hero_image_url as string | undefined);
    if (typeof url === 'string' && url.trim().length > 0) {
      return `background-image: url('${url.trim()}');`;
    }
    return '';
  }
});

// //////////////////////////////////////////////////////////////////////////
// Template Events

Template.home.events({
  'click #mainMenuReturnTour': function(_event: any, template: any) {
    hideMainMenuReturnTour(template);
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

function shouldShowMainMenuReturnTour(): boolean {
  return Session.get('showMainMenuReturnTour') === true &&
    Session.get('loginMode') !== 'experiment';
}

function getMainMenuReturnTourTarget(): HTMLElement | null {
  return document.querySelector('.navbar .home-link .navbar-brand-icon') ||
    document.querySelector('.navbar .home-link');
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
  const targetLink = document.querySelector('.navbar .home-link.main-menu-return-tour-target');
  overlay?.classList.remove('is-visible');
  if (overlay) {
    overlay.hidden = true;
  }
  targetLink?.classList.remove('main-menu-return-tour-target');

  if (templateInstance?._mainMenuReturnTourTimeout) {
    clearTimeout(templateInstance._mainMenuReturnTourTimeout);
    templateInstance._mainMenuReturnTourTimeout = null;
  }
  if (templateInstance?._mainMenuReturnTourPositionHandler) {
    window.removeEventListener('resize', templateInstance._mainMenuReturnTourPositionHandler);
    window.removeEventListener('scroll', templateInstance._mainMenuReturnTourPositionHandler, true);
    templateInstance._mainMenuReturnTourPositionHandler = null;
  }

  Session.set('showMainMenuReturnTour', false);
}

function showMainMenuReturnTour(templateInstance: any): void {
  if (!shouldShowMainMenuReturnTour()) {
    return;
  }

  const overlay = document.getElementById('mainMenuReturnTour') as HTMLElement | null;
  const target = getMainMenuReturnTourTarget();
  const targetLink = target?.closest('.home-link') as HTMLElement | null;
  if (!overlay || !target || !targetLink) {
    clientConsole(1, '[HOME] Main menu return tour skipped because the navbar home link was not found.');
    Session.set('showMainMenuReturnTour', false);
    return;
  }

  const positionOverlay = () => positionMainMenuReturnTour(overlay, target);
  positionOverlay();
  targetLink.classList.add('main-menu-return-tour-target');
  templateInstance._mainMenuReturnTourPositionHandler = positionOverlay;
  window.addEventListener('resize', positionOverlay);
  window.addEventListener('scroll', positionOverlay, true);

  requestAnimationFrame(() => {
    overlay.classList.add('is-visible');
  });

  templateInstance._mainMenuReturnTourTimeout = setTimeout(() => {
    hideMainMenuReturnTour(templateInstance);
  }, MAIN_MENU_RETURN_TOUR_DURATION_MS);
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

  const templateInstance = this;
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
            showMainMenuReturnTour(templateInstance);
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
  hideMainMenuReturnTour(this);
});

