import {checkUserSession, clientConsole} from '../../lib/userSessionHelpers';
const { FlowRouter } = require('meteor/ostrio:flow-router-extra');
import { Tracker } from 'meteor/tracker';
import DOMPurify from 'dompurify';
import { Cookie } from '../../lib/cookies';
import { currentUserHasRole } from '../../lib/roleUtils';
import { getUserDisplayName, getUserInitials } from '../../lib/userIdentity';
import { getActiveUiLocale } from '../../lib/interfaceLocaleState';
import { translatePlatformString } from '../../lib/interfaceI18n';
import type { PlatformStringKey } from '../../lib/interfaceI18nResources';
import { applyThemeCSSProperties } from '../../lib/currentTestingHelpers';
import {
  clearSavedUserThemeSelection,
  findAvailableUserTheme,
  getAvailableUserThemes,
  getSavedUserThemeId,
  getThemeDisplayName,
  saveUserThemeSelection,
  serializeThemeSelection,
  type ThemeLibraryEntry,
} from '../../lib/userThemeSelection';
import { findProfileAvatarIcon, normalizeProfileAvatarType } from '../../../common/profileAvatar';
import { hydrateHomePracticeStateFromDashboardCache } from './homePracticeState';
import './home.html';
import './home.css';

declare const Template: any;
declare const Session: any;
declare const Meteor: any;

const MAIN_MENU_RETURN_TOUR_DURATION_MS = 5000;
const HOME_SIDEBAR_COLLAPSED_KEY = 'mofacts.home.sidebarCollapsed';
const PRACTICE_MENU_OPEN_KEY = 'mofacts.practice.menuOpen';
const HOME_WELCOME_ALLOWED_TAGS = ['h1', 'h2', 'h3', 'p', 'br', 'span', 'strong', 'em', 'b', 'i', 'u', 'a', 'ul', 'ol', 'li'];
const HOME_WELCOME_ALLOWED_ATTR = ['href', 'title', 'target', 'rel', 'class', 'style'];

type HomeTourStepId =
  | 'main-menu-return'
  | 'learning-dashboard'
  | 'content-manager'
  | 'download-data';
type HomeTourStep = {
  id: HomeTourStepId;
  textKey: PlatformStringKey;
  targetSelector: string;
  targetLabelKey: PlatformStringKey;
  placement: 'sidebar' | 'lesson-action';
};

const SIDEBAR_ACTION_ROUTES: Record<string, string> = {
  coursesButton: '/courses',
  contentUploadButton: '/contentUpload',
  classEditButton: '/classEdit',
  instructorReportingButton: '/instructorReporting',
  tdfAssignmentEditButton: '/tdfAssignmentEdit',
  dataDownloadButton: '/dataDownload',
  adminControlsBtn: '/adminControls',
  userAdminButton: '/userAdmin',
  mechTurkButton: '/turkWorkflow',
  themeButton: '/theme',
  adminTestsButton: '/admin/tests',
  adminBackupsButton: '/admin/backups',
};

const PRACTICE_MENU_ACTION_ROUTES: Record<string, string> = {
  home: '/home',
  courses: '/courses',
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
  adminBackups: '/admin/backups',
};

const SIDEBAR_ACTIVE_MATCHERS: Record<string, string[]> = {
  home: ['/home', '/'],
  courses: ['/courses'],
  content: ['/contentUpload', '/contentCreate', '/contentEdit', '/tdfEdit'],
  data: ['/dataDownload'],
  classEdit: ['/classEdit'],
  instructorReporting: ['/instructorReporting'],
  tdfAssignmentEdit: ['/tdfAssignmentEdit'],
  adminControls: ['/adminControls'],
  userAdmin: ['/userAdmin'],
  turkWorkflow: ['/turkWorkflow'],
  theme: ['/theme'],
  adminTests: ['/admin/tests'],
  adminBackups: ['/admin/backups'],
};

const HOME_TOUR_STEPS: HomeTourStep[] = [
  {
    id: 'main-menu-return',
    textKey: 'home.tourReturnToPractice',
    targetSelector: '#homePracticeButton',
    targetLabelKey: 'home.tourPracticeMenuButton',
    placement: 'sidebar',
  },
  {
    id: 'learning-dashboard',
    textKey: 'home.tourStartLesson',
    targetSelector: '.learning-dashboard-action-button.start-lesson, .learning-dashboard-action-button.continue-lesson, .learning-dashboard-action-button.start-condition-root',
    targetLabelKey: 'home.tourFirstLessonActionButton',
    placement: 'lesson-action',
  },
  {
    id: 'content-manager',
    textKey: 'home.tourCreateContent',
    targetSelector: '#contentUploadButton',
    targetLabelKey: 'home.tourCreateContentMenuButton',
    placement: 'sidebar',
  },
  {
    id: 'download-data',
    textKey: 'home.tourDetailedData',
    targetSelector: '#dataDownloadButton',
    targetLabelKey: 'home.tourDetailedDataMenuButton',
    placement: 'sidebar',
  },
];

function markSidebarToggleTransition(sidebar: HTMLElement | null): void {
  if (!sidebar || window.matchMedia('(max-width: 1024px)').matches) {
    return;
  }

  sidebar.classList.add('sidebar-toggle-transitioning');
  const clearTransitionState = () => {
    sidebar.classList.remove('sidebar-toggle-transitioning');
    sidebar.removeEventListener('transitionend', handleTransitionEnd);
  };
  const handleTransitionEnd = (event: TransitionEvent) => {
    if (event.target === sidebar && (event.propertyName === 'width' || event.propertyName === 'transform')) {
      clearTransitionState();
    }
  };

  sidebar.addEventListener('transitionend', handleTransitionEnd);
  window.setTimeout(clearTransitionState, 360);
}

function toggleDesktopSidebarCollapse(): void {
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('homeMain');
  const nextCollapsed = !sidebar?.classList.contains('sidebar-collapsed');
  markSidebarToggleTransition(sidebar);
  sidebar?.classList.toggle('sidebar-collapsed', nextCollapsed);
  main?.classList.toggle('main-sidebar-collapsed', nextCollapsed);
  window.localStorage.setItem(HOME_SIDEBAR_COLLAPSED_KEY, nextCollapsed ? '1' : '0');
}

function closeMobileSidebar(): void {
  if (!window.matchMedia('(max-width: 1024px)').matches) {
    return;
  }
  const sidebar = document.getElementById('sidebar');
  if (!sidebar?.classList.contains('sidebar-mobile-open')) {
    return;
  }

  sidebar.classList.add('sidebar-mobile-closing');
  sidebar.classList.remove('sidebar-mobile-open');
  const clearClosingState = () => {
    sidebar.classList.remove('sidebar-mobile-closing');
    sidebar.removeEventListener('transitionend', handleTransitionEnd);
  };
  const handleTransitionEnd = (event: TransitionEvent) => {
    if (event.target === sidebar && event.propertyName === 'transform') {
      clearClosingState();
    }
  };
  sidebar.addEventListener('transitionend', handleTransitionEnd);
  window.setTimeout(clearClosingState, 320);
}

function toggleAccountMenu(): void {
  const dropdown = document.getElementById('userDropdown');
  const toggle = document.getElementById('userToggle');
  const open = !dropdown?.classList.contains('open');
  if (open) {
    closeMobileSidebar();
  }
  dropdown?.classList.toggle('open', open);
  toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (!open) {
    Session.set('themeMenuOpen', false);
  }
}

function scrollHomeToTop(): void {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.querySelector('.content')?.scrollTo({ top: 0, behavior: 'smooth' });
}

async function leavePracticeFor(route: string): Promise<void> {
  if (document.location.pathname === '/card' || document.location.pathname === '/instructions') {
    const { leavePage } = await import('../experiment/svelte/services/navigationCleanup');
    await leavePage(route);
    return;
  }
  FlowRouter.go(route);
}

function openSidebarForTour(): number {
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('homeMain');
  if (!sidebar) {
    return 0;
  }

  if (window.matchMedia('(max-width: 1024px)').matches) {
    sidebar.classList.remove('sidebar-mobile-closing');
    sidebar.classList.add('sidebar-mobile-open');
    return 260;
  }

  if (sidebar.classList.contains('sidebar-collapsed')) {
    sidebar.classList.remove('sidebar-collapsed');
    main?.classList.remove('main-sidebar-collapsed');
    window.localStorage.setItem(HOME_SIDEBAR_COLLAPSED_KEY, '0');
    return 320;
  }

  return 0;
}

function applyUserSelectedTheme(theme: ThemeLibraryEntry): void {
  const selectedTheme = serializeThemeSelection(theme);
  Session.set('userThemeOverrideActive', true);
  applyThemeCSSProperties(selectedTheme, { cache: false });
  saveUserThemeSelection(selectedTheme.activeThemeId as string);
}

function restoreUserSelectedTheme(): void {
  const selectedThemeId = getSavedUserThemeId();
  if (!selectedThemeId) {
    Session.set('userThemeOverrideActive', false);
    return;
  }

  const selectedTheme = getAvailableUserThemes().find((theme) => theme.id === selectedThemeId);
  if (!selectedTheme) {
    clearSavedUserThemeSelection(selectedThemeId);
    Session.set('userThemeOverrideActive', false);
    throw new Error(`[ThemeToggle] Saved theme "${selectedThemeId}" is no longer configured.`);
  }

  Session.set('userThemeOverrideActive', true);
  applyThemeCSSProperties(serializeThemeSelection(selectedTheme), { cache: false });
}

function reportThemeToggleError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  clientConsole(1, '[ThemeToggle] Failed to select theme:', message);
  Session.set('uiMessage', {
    variant: 'danger',
    text: message,
  });
}

// //////////////////////////////////////////////////////////////////////////
// Template storage and helpers

Template.home.helpers({
  homeUnderlayStyle(): string {
    const theme = Session.get('curTheme');
    const url = (theme?.properties?.practice_menu_underlay_image_url as string | undefined);
    if (typeof url === 'string' && url.trim().length > 0) {
      const escapedUrl = url.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `--practice-menu-underlay-image: url("${escapedUrl}");`;
    }
    return '';
  },

  homeWelcomeHtml(): string {
    const theme = Session.get('curTheme');
    const hasPracticeRecords = Session.get('homeHasPracticeRecords');
    const html = hasPracticeRecords === false
      ? theme?.properties?.practice_menu_first_practice_welcome_html
      : theme?.properties?.practice_menu_welcome_html;
    if (typeof html !== 'string') {
      clientConsole(1, '[HOME] Missing required theme welcome property');
      return '';
    }

    const practiceMenuHtml = html
      .replace(/\bthe Learning Dashboard\b/g, 'the practice menu')
      .replace(/\bLearning Dashboard\b/g, 'practice menu')
      .replace(/\blearning dashboard\b/g, 'practice menu');

    return DOMPurify.sanitize(practiceMenuHtml, {
      ALLOWED_TAGS: HOME_WELCOME_ALLOWED_TAGS,
      ALLOWED_ATTR: HOME_WELCOME_ALLOWED_ATTR,
    });
  },

});

Template.appSidebar.helpers({
  sidebarActiveClass(action: string): string {
    const path = document.location.pathname;
    const matches = SIDEBAR_ACTIVE_MATCHERS[action] || [];
    return matches.some((candidate) => path === candidate || path.startsWith(`${candidate}/`)) ? 'active' : '';
  },
});

Template.appAccountMenu.helpers({
  userInitials(): string {
    return getUserInitials(Meteor.user());
  },

  userAvatarClass(): string {
    const avatarType = normalizeProfileAvatarType(Meteor.user()?.profile?.avatarType);
    return `avatar-${avatarType}`;
  },

  userAvatarIsImage(): boolean {
    const user = Meteor.user();
    return normalizeProfileAvatarType(user?.profile?.avatarType) === 'image' &&
      typeof user?.profile?.avatarImageData === 'string' &&
      user.profile.avatarImageData.length > 0;
  },

  userAvatarImageData(): string {
    return String(Meteor.user()?.profile?.avatarImageData || '');
  },

  userAvatarIsIcon(): boolean {
    return normalizeProfileAvatarType(Meteor.user()?.profile?.avatarType) === 'icon' &&
      !!findProfileAvatarIcon(Meteor.user()?.profile?.avatarIconId);
  },

  userAvatarIconClass(): string {
    return findProfileAvatarIcon(Meteor.user()?.profile?.avatarIconId)?.className || 'fa-user';
  },

  userDisplayName(): string {
    return getUserDisplayName(Meteor.user());
  },

  userRoleLabel(): string {
    const uiLocale = getActiveUiLocale();
    if (currentUserHasRole('admin')) return translatePlatformString(uiLocale, 'home.admin');
    if (currentUserHasRole('teacher')) return translatePlatformString(uiLocale, 'home.teacher');
    return translatePlatformString(uiLocale, 'home.learner');
  },

  themeMenuOpen(): boolean {
    return Session.get('themeMenuOpen') === true;
  },

  availableUserThemes(): ThemeLibraryEntry[] {
    return getAvailableUserThemes().map((theme) => ({
      ...theme,
      metadata: {
        ...theme.metadata,
        name: getThemeDisplayName(theme),
      },
    }));
  },

  hasAvailableThemes(): boolean {
    return getAvailableUserThemes().length > 0;
  },

  themeSelectionName(theme: ThemeLibraryEntry): string {
    return getThemeDisplayName(theme);
  },

  isSelectedTheme(themeId: string): boolean {
    return Session.get('curTheme')?.activeThemeId === themeId;
  },

  themeSelectionActiveClass(themeId: string): string {
    return Session.get('curTheme')?.activeThemeId === themeId ? 'theme-selection-item-active' : '';
  },
});

Template.appPracticeMenu.helpers({
  practiceMenuOpen(): boolean {
    return Session.get(PRACTICE_MENU_OPEN_KEY) === true;
  },
});

// //////////////////////////////////////////////////////////////////////////
// Template Events

Template.appSidebar.events({
  'click #homePracticeButton': function(event: any) {
    event.preventDefault();
    event.stopPropagation();
    closeMobileSidebar();
    if (document.location.pathname === '/home') {
      scrollHomeToTop();
      return;
    }
    FlowRouter.go('/home');
  },

  'click #sidebarToggle': function(event: any) {
    event.preventDefault();
    event.stopPropagation();
    const sidebar = document.getElementById('sidebar');
    if (
      window.matchMedia('(max-width: 1024px)').matches &&
      sidebar?.classList.contains('sidebar-mobile-open')
    ) {
      closeMobileSidebar();
      return;
    }

    toggleDesktopSidebarCollapse();
  },
});

Object.keys(SIDEBAR_ACTION_ROUTES).forEach((elementId) => {
  Template.appSidebar.events({
    [`click #${elementId}`]: function(event: any) {
      event.preventDefault();
      event.stopPropagation();
      closeMobileSidebar();
      FlowRouter.go(SIDEBAR_ACTION_ROUTES[elementId]);
    },
  });
});

Template.appAccountMenu.events({
  'click #userToggle': function(event: any) {
    event.preventDefault();
    event.stopPropagation();
    toggleAccountMenu();
  },

  'keydown #userToggle': function(event: any) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    toggleAccountMenu();
  },

  'click [data-home-action]': function(event: any) {
    event.preventDefault();
    event.stopPropagation();
    const action = event.currentTarget.getAttribute('data-home-action');
    if (action === 'toggleTheme') {
      Session.set('themeMenuOpen', Session.get('themeMenuOpen') !== true);
      return;
    }
    document.getElementById('userDropdown')?.classList.remove('open');
    document.getElementById('userToggle')?.setAttribute('aria-expanded', 'false');
    Session.set('themeMenuOpen', false);

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
        FlowRouter.go('/');
      });
      return;
    }

    const routes: Record<string, string> = {
      profile: '/profile',
      audioSettings: '/audioSettings',
      classSelection: '/classSelection',
      help: '/help',
    };
    if (routes[action]) {
      FlowRouter.go(routes[action]);
    }
  },

  'click .theme-selection-item': function(event: any) {
    event.preventDefault();
    event.stopPropagation();
    const themeId = event.currentTarget.getAttribute('data-theme-id');
    try {
      const selectedTheme = findAvailableUserTheme(themeId);
      if (!selectedTheme) {
        throw new Error(`Theme "${themeId || ''}" is not configured for selection.`);
      }
      applyUserSelectedTheme(selectedTheme);
      Session.set('themeMenuOpen', false);
      document.getElementById('userDropdown')?.classList.remove('open');
      document.getElementById('userToggle')?.setAttribute('aria-expanded', 'false');
    } catch (error: unknown) {
      reportThemeToggleError(error);
    }
  },
});

Template.appPracticeMenu.events({
  'click #practiceMenuToggle': function(event: any) {
    event.preventDefault();
    Session.set(PRACTICE_MENU_OPEN_KEY, Session.get(PRACTICE_MENU_OPEN_KEY) !== true);
  },

  async 'click [data-practice-menu-action]'(event: any) {
    event.preventDefault();
    const action = event.currentTarget.getAttribute('data-practice-menu-action');
    const route = PRACTICE_MENU_ACTION_ROUTES[action];
    if (!route) {
      clientConsole(1, '[PracticeMenu] Unknown action:', action);
      return;
    }
    Session.set(PRACTICE_MENU_OPEN_KEY, false);
    await leavePracticeFor(route);
  },
});

Template.home.events({
  'click #mainMenuReturnTour': function(_event: any, template: any) {
    advanceMainMenuTour(template);
  },

  'click #homePracticeButton': function(event: any) {
    event.preventDefault();
    closeMobileSidebar();
    scrollHomeToTop();
  },

  'click #contentUploadButton': function(event: any) {
    event.preventDefault();
    FlowRouter.go('/contentUpload');
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
  },

  'click #adminBackupsButton': function(event: any) {
    event.preventDefault();
    FlowRouter.go('/admin/backups');
  },

  'click #sidebarToggle': function(event: any) {
    event.preventDefault();
    toggleDesktopSidebarCollapse();
  },

  'click #mobileSidebarToggle': function(event: any) {
    event.preventDefault();
    document.getElementById('sidebar')?.classList.toggle('sidebar-mobile-open', true);
  },

  'click #userToggle': function(event: any) {
    event.preventDefault();
    event.stopPropagation();
    toggleAccountMenu();
  },

  'click [data-home-action]': function(event: any, template: any) {
    event.preventDefault();
    event.stopPropagation();
    const action = event.currentTarget.getAttribute('data-home-action');
    if (action === 'toggleTheme') {
      Session.set('themeMenuOpen', Session.get('themeMenuOpen') !== true);
      return;
    }
    document.getElementById('userDropdown')?.classList.remove('open');
    document.getElementById('userToggle')?.setAttribute('aria-expanded', 'false');
    Session.set('themeMenuOpen', false);

    if (action === 'tour') {
      startMainMenuTour(template, { manual: true });
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
        FlowRouter.go('/');
      });
      return;
    }

    const routes: Record<string, string> = {
      profile: '/profile',
      audioSettings: '/audioSettings',
      classSelection: '/classSelection',
      help: '/help',
    };
    if (routes[action]) {
      FlowRouter.go(routes[action]);
    }
  }
});

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
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  const overlayWidth = overlay.offsetWidth || 270;
  const overlayHeight = overlay.offsetHeight || 60;
  const stepId = overlay.dataset.tourStepId as HomeTourStepId | undefined;
  const step = HOME_TOUR_STEPS.find((candidate) => candidate.id === stepId);
  const isLessonActionStep = step?.placement === 'lesson-action';
  const targetPointX = isLessonActionStep
    ? targetRect.right
    : targetRect.right - 16;
  const targetPointY = isLessonActionStep
    ? targetRect.top + targetRect.height / 2
    : targetRect.top + targetRect.height / 2;
  const unclampedLeft = isLessonActionStep
    ? targetPointX + 64
    : targetRect.right + 48;
  const unclampedTop = isLessonActionStep
    ? targetPointY - overlayHeight - 44
    : targetPointY + 30;
  const overlayLeft = Math.min(
    Math.max(12, unclampedLeft),
    Math.max(12, viewportWidth - overlayWidth - 12)
  );
  const overlayTop = Math.min(
    Math.max(12, unclampedTop),
    Math.max(12, viewportHeight - overlayHeight - 12)
  );
  const arrowOriginX = targetPointX < overlayLeft ? 0 : overlayWidth;
  const arrowOriginY = targetPointY < overlayTop ? 0 : overlayHeight;
  const arrowDeltaX = targetPointX - (overlayLeft + arrowOriginX);
  const arrowDeltaY = targetPointY - (overlayTop + arrowOriginY);
  const arrowLength = Math.max(24, Math.hypot(arrowDeltaX, arrowDeltaY));
  const arrowAngle = Math.atan2(arrowDeltaY, arrowDeltaX);

  overlay.style.setProperty('--main-menu-tour-left', `${overlayLeft}px`);
  overlay.style.setProperty('--main-menu-tour-top', `${overlayTop}px`);
  overlay.style.setProperty('--main-menu-tour-arrow-origin-x', `${arrowOriginX}px`);
  overlay.style.setProperty('--main-menu-tour-arrow-origin-y', `${arrowOriginY}px`);
  overlay.style.setProperty('--main-menu-tour-arrow-length', `${arrowLength}px`);
  overlay.style.setProperty('--main-menu-tour-arrow-angle', `${arrowAngle}rad`);
  overlay.style.visibility = '';
}

function resolveHomeTourTarget(step: HomeTourStep): HTMLElement {
  const target = document.querySelector<HTMLElement>(step.targetSelector);
  const targetLabel = translatePlatformString(getActiveUiLocale(), step.targetLabelKey);
  if (!target) {
    throw new Error(`[HOME] Tour step "${step.id}" requires ${targetLabel} (${step.targetSelector}), but it was not found.`);
  }

  const targetRect = target.getBoundingClientRect();
  if (targetRect.width <= 0 || targetRect.height <= 0) {
    throw new Error(`[HOME] Tour step "${step.id}" requires visible ${targetLabel} (${step.targetSelector}), but it has no rendered size.`);
  }

  return target;
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
  if (!overlay || !step) {
    hideMainMenuReturnTour(templateInstance);
    throw new Error('[HOME] Main menu tour cannot continue because the overlay or step is missing.');
  }

  let target: HTMLElement;
  try {
    target = resolveHomeTourTarget(step);
  } catch (error: unknown) {
    clientConsole(1, '[HOME] Main menu tour target invariant failed:', error);
    hideMainMenuReturnTour(templateInstance);
    throw error;
  }

  if (templateInstance._mainMenuReturnTourPositionHandler) {
    window.removeEventListener('resize', templateInstance._mainMenuReturnTourPositionHandler);
    window.removeEventListener('scroll', templateInstance._mainMenuReturnTourPositionHandler, true);
    templateInstance._mainMenuReturnTourPositionHandler = null;
  }
  if (templateInstance._mainMenuReturnTourTimeout) {
    clearTimeout(templateInstance._mainMenuReturnTourTimeout);
    templateInstance._mainMenuReturnTourTimeout = null;
  }

  overlay.dataset.tourStepId = step.id;
  const text = overlay.querySelector('.main-menu-return-tour-text');
  if (text) {
    text.textContent = translatePlatformString(getActiveUiLocale(), step.textKey);
  }

  document.querySelectorAll('.main-menu-return-tour-target')
    .forEach((existingTarget) => existingTarget.classList.remove('main-menu-return-tour-target'));

  const positionOverlay = () => positionMainMenuReturnTour(overlay, target);
  positionOverlay();
  target.classList.add('main-menu-return-tour-target');
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
  const sidebarDelay = openSidebarForTour();
  window.setTimeout(() => showCurrentMainMenuTourStep(templateInstance), sidebarDelay);
}

async function hydrateHomePracticeState(): Promise<void> {
  try {
    await hydrateHomePracticeStateFromDashboardCache(Meteor, Session);
  } catch (error: unknown) {
    clientConsole(1, '[HOME] Failed to hydrate practice state for welcome/tour:', error);
  }
}

function restoreHomeSidebarPreference(): void {
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('homeMain');
  if (!sidebar || !main) {
    return;
  }
  const collapsed = window.localStorage.getItem(HOME_SIDEBAR_COLLAPSED_KEY) === '1';
  sidebar.classList.toggle('sidebar-collapsed', collapsed);
  main.classList.toggle('main-sidebar-collapsed', collapsed);
}

Template.appSidebar.onRendered(function() {
  restoreHomeSidebarPreference();
});

Template.appAccountMenu.onRendered(function(this: any) {
  this.subscribe('themeLibrary');
  this._themeLibraryAutorun = this.autorun(() => {
    if (!this.subscriptionsReady()) {
      return;
    }
    try {
      restoreUserSelectedTheme();
    } catch (error: unknown) {
      reportThemeToggleError(error);
    }
  });
  this._appAccountDocumentClickHandler = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('#userToggle')) {
      document.getElementById('userDropdown')?.classList.remove('open');
      document.getElementById('userToggle')?.setAttribute('aria-expanded', 'false');
      Session.set('themeMenuOpen', false);
    }
  };
  document.addEventListener('click', this._appAccountDocumentClickHandler);
});

Template.appAccountMenu.onDestroyed(function(this: any) {
  if (this._themeLibraryAutorun) {
    this._themeLibraryAutorun.stop();
    this._themeLibraryAutorun = null;
  }
  if (this._appAccountDocumentClickHandler) {
    document.removeEventListener('click', this._appAccountDocumentClickHandler);
    this._appAccountDocumentClickHandler = null;
  }
});

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
  void hydrateHomePracticeState();
  restoreHomeSidebarPreference();
  templateInstance._homeDocumentClickHandler = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('#userToggle')) {
      document.getElementById('userDropdown')?.classList.remove('open');
      document.getElementById('userToggle')?.setAttribute('aria-expanded', 'false');
      Session.set('themeMenuOpen', false);
    }
    if (
      window.matchMedia('(max-width: 1024px)').matches &&
      !target?.closest('#sidebar') &&
      !target?.closest('#mobileSidebarToggle')
    ) {
      document.getElementById('sidebar')?.classList.remove('sidebar-mobile-open');
    }
  };
  document.addEventListener('click', templateInstance._homeDocumentClickHandler);
  templateInstance._homeTourRequestHandler = () => startMainMenuTour(templateInstance, { manual: true });
  window.addEventListener('mofacts:startHomeTour', templateInstance._homeTourRequestHandler);
  // Trigger fade-in after theme is ready and CSS is painted
  // Store handle for cleanup
  templateInstance._themeAutorunHandle = Tracker.autorun(() => {
    if (!Session.get('themeReady')) return;
    if (!Session.get('authReady')) return;
    const userId = Meteor.userId();
    if (!userId) return;
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
  if (this._homeDocumentClickHandler) {
    document.removeEventListener('click', this._homeDocumentClickHandler);
    this._homeDocumentClickHandler = null;
  }
  if (this._homeTourRequestHandler) {
    window.removeEventListener('mofacts:startHomeTour', this._homeTourRequestHandler);
    this._homeTourRequestHandler = null;
  }
  hideMainMenuReturnTour(this);
});

