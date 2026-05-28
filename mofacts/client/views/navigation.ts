import {meteorCallAsync, clientConsole} from '../index';
import { Meteor } from 'meteor/meteor';
import { Cookie } from '../lib/cookies';
import { currentUserHasRole } from '../lib/roleUtils';
import { getUserInitials } from '../lib/userIdentity';
import './navigation.html';
/** @typedef {import('../../server/methods/dashboardCacheMethods.contracts').UpdateDashboardCacheResult} UpdateDashboardCacheResult */

type NavTemplateInstance = {
  autorun(callback: () => void): void;
  find(selector: string): Element | null;
};
declare const Template: {
  nav: {
    onRendered(callback: (this: NavTemplateInstance) => void): void;
    helpers(map: Record<string, () => unknown>): void;
    events(map: Record<string, (event: Event) => void | Promise<void>>): void;
  };
};
declare const Session: {
  get<T = unknown>(key: string): T;
  set(key: string, value: unknown): void;
};
declare const Tracker: {
  autorun(callback: () => void): { stop(): void };
  afterFlush(callback: () => void): void;
};
const { FlowRouter } = require('meteor/ostrio:flow-router-extra') as {
  FlowRouter: { go(path: string): void };
};

const ACCOUNT_MENU_OPEN_KEY = 'navbarAccountMenuOpen';
const PRACTICE_SIDEBAR_OPEN_KEY = 'practiceSidebarOpen';

async function leavePracticeForHome(): Promise<boolean> {
  const currentPath = document.location.pathname;
  if (currentPath !== '/card' && currentPath !== '/instructions') {
    return false;
  }

  const { leavePage } = await import('./experiment/svelte/services/navigationCleanup');
  await leavePage('/home');
  return true;
}

function isPracticePath(): boolean {
  return document.location.pathname === '/card' || document.location.pathname === '/instructions';
}

function closeAccountMenu(): void {
  Session.set(ACCOUNT_MENU_OPEN_KEY, false);
}

function routeAfterLogout(target = '/'): void {
  let handle: { stop(): void } | null = null;
  handle = Tracker.autorun(() => {
    if (!Meteor.userId()) {
      handle?.stop();
      FlowRouter.go(target);
    }
  });
  Meteor.setTimeout(() => {
    handle?.stop();
    FlowRouter.go(target);
  }, 3000);
}

async function navigateFromAction(action: string): Promise<void> {
  closeAccountMenu();
  const routeByAction: Record<string, string> = {
    home: '/home',
    audioSettings: '/audioSettings',
    classSelection: '/classSelection',
    help: '/help',
    contentUpload: '/contentUpload',
    dataDownload: '/dataDownload',
    classEdit: '/classEdit',
    instructorReporting: '/instructorReporting',
    tdfAssignmentEdit: '/tdfAssignmentEdit',
    adminControls: '/adminControls',
    userAdmin: '/userAdmin',
    turkWorkflow: '/turkWorkflow',
    theme: '/theme',
    adminTests: '/admin/tests',
  };

  if (action === 'tour') {
    FlowRouter.go('/home');
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('mofacts:startHomeTour'));
    }, 150);
    return;
  }

  if (action === 'documentation') {
    window.open('https://github.com/memphis-iis/mofacts/wiki', '_blank');
    return;
  }

  if (action === 'logout') {
    Session.set('loginMode', 'normal');
    Cookie.set('isExperiment', '0', 1);
    Cookie.set('experimentTarget', '', 1);
    Cookie.set('experimentXCond', '', 1);
    Meteor.logout(() => {
      Session.set('curModule', 'signinoauth');
      Session.set('currentTemplate', 'signIn');
      Session.set('appLoading', false);
      routeAfterLogout('/');
    });
    return;
  }

  const route = routeByAction[action];
  if (!route) {
    clientConsole(1, '[Navigation] Unknown navigation action:', action);
    return;
  }

  if (isPracticePath()) {
    const { leavePage } = await import('./experiment/svelte/services/navigationCleanup');
    await leavePage(route);
    return;
  }
  FlowRouter.go(route);
}

// Handle navbar rendering - show immediately once theme is ready
// Logo loads naturally in background (no need to wait for small 30x30 image)
Template.nav.onRendered(function(this: NavTemplateInstance) {
  const template = this;
  Session.set(ACCOUNT_MENU_OPEN_KEY, false);
  Session.set(PRACTICE_SIDEBAR_OPEN_KEY, false);

  template.autorun(() => {
    if (!Session.get('themeReady')) return;

    // Show navbar immediately after theme is ready
    Tracker.afterFlush(() => {
      const container = template.find('.container-fluid.page-loading');
      if (container) {
        container.classList.remove('page-loading');
        container.classList.add('page-loaded');
      }
    });
  });

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.unified-navbar-right')) {
      closeAccountMenu();
    }
  });
});

// Provide reactive access to theme ready state
// Note: currentTheme helper is provided globally in index.js and uses Session
Template.nav.helpers({
  'themeReady': function() {
    // Wait for theme subscription to be ready before rendering navbar
    // This prevents layout shift from default to actual theme values
    return Session.get('themeReady') === true;
  },

  'isExperiment': function() {
    // Check if user is in experiment mode (locked-down mode for research studies)
    // In experiment mode, navbar should not be clickable to prevent navigation
    return Session.get('loginMode') === 'experiment';
  },

  'isPracticeRoute': function() {
    return isPracticePath();
  },

  'isHomeRoute': function() {
    return document.location.pathname === '/home' || document.location.pathname === '/';
  },

  'showPracticeSidebar': function() {
    return isPracticePath() && Session.get('loginMode') !== 'experiment';
  },

  'practiceSidebarOpen': function() {
    return Session.get(PRACTICE_SIDEBAR_OPEN_KEY) === true;
  },

  'accountMenuOpen': function() {
    return Session.get(ACCOUNT_MENU_OPEN_KEY) === true;
  },

  'practiceLessonTitle': function() {
    const tdfFile = Session.get<any>('currentTdfFile');
    const title = tdfFile?.tdfs?.tutor?.setspec?.lessonname || Session.get('currentLessonName');
    return typeof title === 'string' && title.trim() ? title.trim() : 'Practice';
  },

  'userRoleLabel': function() {
    if (currentUserHasRole('admin')) return 'Admin';
    if (currentUserHasRole('teacher')) return 'Teacher';
    return 'Learner';
  },

  'userInitials': function() {
    return getUserInitials(Meteor.user() as any);
  }
});

// Simple navigation with just logo click handler
Template.nav.events({
  async 'click .home-link'(event: Event) {
    event.preventDefault();

    if (await leavePracticeForHome()) {
      return;
    }

    // Update dashboard cache when leaving from card/practice page
    const currentPath = document.location.pathname;
    if (currentPath === '/card' || currentPath === '/instructions') {
      const currentTdfId = Session.get('currentTdfId');
      if (currentTdfId) {
        clientConsole(2, '[Cache] Nav logo: Updating dashboard cache for TDF:', currentTdfId);
        try {
          /** @type {UpdateDashboardCacheResult} */
          const result = await meteorCallAsync('updateDashboardCacheForTdf', currentTdfId);
          clientConsole(2, '[Cache] Nav logo: Cache updated:', result);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          clientConsole(1, '[Cache] Nav logo: Failed to update cache:', message);
        }
      }
    }

    // Route to home page
    FlowRouter.go('/home');
  },

  async 'click #saveReturnPracticeMenuButton'(event: Event) {
    event.preventDefault();
    await leavePracticeForHome();
  },

  'click #navbarAccountToggle'(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    Session.set(ACCOUNT_MENU_OPEN_KEY, Session.get(ACCOUNT_MENU_OPEN_KEY) !== true);
  },

  'keydown #navbarAccountToggle'(event: Event) {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ') {
      return;
    }
    event.preventDefault();
    Session.set(ACCOUNT_MENU_OPEN_KEY, Session.get(ACCOUNT_MENU_OPEN_KEY) !== true);
  },

  async 'click [data-nav-action]'(event: Event) {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    const action = target.getAttribute('data-nav-action');
    if (action) {
      await navigateFromAction(action);
    }
  },

  'click #practiceSidebarToggle'(event: Event) {
    event.preventDefault();
    Session.set(PRACTICE_SIDEBAR_OPEN_KEY, Session.get(PRACTICE_SIDEBAR_OPEN_KEY) !== true);
  }
});


