import {meteorCallAsync, clientConsole} from '../index';
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
};
declare const Tracker: {
  afterFlush(callback: () => void): void;
};
const { FlowRouter } = require('meteor/ostrio:flow-router-extra') as {
  FlowRouter: { go(path: string): void };
};

async function leavePracticeForHome(): Promise<boolean> {
  const currentPath = document.location.pathname;
  if (currentPath !== '/card' && currentPath !== '/instructions') {
    return false;
  }

  const { leavePage } = await import('./experiment/svelte/services/navigationCleanup');
  await leavePage('/home');
  return true;
}

// Handle navbar rendering - show immediately once theme is ready
// Logo loads naturally in background (no need to wait for small 30x30 image)
Template.nav.onRendered(function(this: NavTemplateInstance) {
  const template = this;

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
  }
});


