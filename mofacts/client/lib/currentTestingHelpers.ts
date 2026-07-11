import { _ as underscore } from 'meteor/underscore';
import { Meteor } from 'meteor/meteor';
import { clientConsole } from './userSessionHelpers';
import { Tracker } from 'meteor/tracker';
import { Session } from 'meteor/session';
import { meteorCallAsync } from './meteorAsync';
import { deliverySettingsStore } from './state/deliverySettingsStore';
import { resolveCurrentDeliverySettings } from './deliverySettingsResolver';
import { loadSessionMappingRecord, resolveOriginalClusterIndex } from '../views/experiment/svelte/services/mappingRecordService';
import { createStimClusterMapping as createStimClusterMappingCore } from './clusterMappingUtils';
import { normalizeThemePropertyValue } from '../../common/themePropertyNormalization';
import { resolveThemeBrandLabel } from '../../common/themeBranding';
import defaultTheme from '../../public/themes/mofacts-default.json';
import {
  clearSavedUserThemeSelection,
  findAvailableUserTheme,
  getSavedUserThemeId,
  serializeThemeSelection,
} from './userThemeSelection';
import { legacyInt, legacyTrim } from '../../common/underscoreCompat';
import { resolveLearningSessionClusterListSource } from '../../../learning-components/units/learning-session/learningSessionRuntimeConfig';
import { resolveSparcSessionPageId } from '../../../learning-components/units/sparcsession/sparcSessionRuntimeConfig';

type IntValFn = (src: unknown, defaultVal?: unknown) => number;
const _ = underscore as typeof underscore & { intval?: IntValFn };

declare const DynamicSettings: {
  findOne: (query: { key: string }) =>
    | { value?: Record<string, unknown> & { enabled?: boolean } }
    | undefined;
};
declare const UserDashboardCache: {
  findOne: (query: { userId: string }) =>
    | { tdfStats?: Record<string, { totalTimeMs?: unknown; totalTimeMinutes?: unknown }> }
    | undefined;
};

if (typeof _.intval !== 'function') {
  _.intval = (src: unknown, defaultVal: unknown) => {
    const n = parseInt(String(src), 10);
    if (Number.isFinite(n)) return n;
    const defaultNum = Number(defaultVal);
    return Number.isFinite(defaultNum) ? defaultNum : 0;
  };
}
function getCurrentClusterAndStimIndices() {
  const curClusterIndex = Session.get('clusterIndex');
  const curStimIndex = Session.get('whichStim');
  return {curClusterIndex, curStimIndex};
}

type CurrentStudentPerformance = {
  count: number;
  numCorrect: number;
  numIncorrect: number;
  percentCorrect: string;
  stimsSeen: number | string;
  totalStimCount: number | string;
  totalTime: number | string;
  totalTimeDisplay: string | number;
};

type ThemeData = {
  activeThemeId?: string;
  metadata?: {
    updatedAt?: string;
  };
  themeName?: string;
  properties?: Record<string, unknown>;
};

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function updateFaviconLink(rel: string, sizes: string | null, href: string) {
  let selector = `link[rel="${rel}"][type="image/png"]`;
  if (sizes) {
    selector = `link[rel="${rel}"][sizes="${sizes}"]`;
  } else {
    selector = `link[rel="${rel}"][type="image/png"]:not([sizes])`;
  }

  let link = document.querySelector(selector) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    if (sizes) {
      link.sizes = sizes;
    }
    link.type = 'image/png';
    document.head.appendChild(link);
  }
  link.href = href;
}

function updateManifestLink(href: string) {
  let link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'manifest';
    document.head.appendChild(link);
  }
  link.href = href;
}

function updateAppleTouchIconLink(href: string) {
  let link = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'apple-touch-icon';
    link.sizes = '180x180';
    document.head.appendChild(link);
  }
  if (!link.sizes.contains('180x180')) {
    link.setAttribute('sizes', '180x180');
  }
  link.href = href;
}

function updateThemeColorMeta(content: string) {
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = content;
}

type StimCluster = {
  shufIndex: number;
  clusterIndex: number;
  clusterKC?: unknown;
  stims: unknown[];
};

type StudentPerformanceAccumulator = {
  username: string;
  numCorrect: number;
  numIncorrect: number;
  stimsSeen: number;
  lastSeen: number;
  totalStimCount: number;
  totalTime: number;
  count: number;
  allTimeNumCorrect: number;
  allTimeNumIncorrect: number;
  allTimePracticeDuration: number;
  percentCorrect: string;
  totalTimeDisplay: string;
  stimsIntroduced: number;
};

type DeliverySettings = Record<string, unknown>;

type RawStimulus = Record<string, any> & {
  response?: {
    correctResponse?: unknown;
    incorrectResponses?: unknown;
  };
  display?: Record<string, unknown>;
  parameter?: unknown;
};

type RawStimulusCluster = Record<string, any> & {
  clusterKC?: unknown;
  stims?: RawStimulus[];
};

type FlatStimulus = Record<string, any> & {
  clusterKC?: unknown;
  stimulusKC?: unknown;
};

type NestedStimulusClusterSourceParams = {
  tdfFile: any;
  currentStimuliSet: unknown;
  currentStimuliSetId: unknown;
  currentTdfId?: unknown;
  currentTdfDoc?: any;
};

export { extractDelimFields, rangeVal, shuffle, randomChoice, search, getUserDisplayIdentifier, haveMeteorUser, updateCurStudentPerformance, updateCurStudedentPracticeTime, setStudentPerformance, getStimCount, getStimCluster, createStimClusterMapping, getAllCurrentStimAnswers, getStimAnswerDisplayCase, getTestType, getCurrentDeliverySettings, refreshCurrentDeliverySettingsStore, getCurrentTheme, applyThemeCSSProperties, getNestedStimulusClustersFromTdfFile };


// ===== PHASE 1.5 OPTIMIZATION: Theme Subscription =====
// Subscribe to theme publication and set up reactive updates
// This replaces the old method call pattern with reactive publications

// Track if CSS has been applied this page session (resets on refresh, unlike Session)
let themeCssAppliedThisSession = false;
const THEME_FONT_STYLESHEET_LINK_ID = 'mofacts-theme-font-stylesheet';

function applyThemeCssVariable(property: string, rawValue: unknown) {
  const propConverted = '--' + property.replace(/_/g, '-');
  const normalizedValue = normalizeThemePropertyValue(property, rawValue);
  const normalizedText = typeof normalizedValue === 'string' ? normalizedValue.trim() : normalizedValue;

  if (normalizedText == null || normalizedText === '') {
    document.documentElement.style.removeProperty(propConverted);
    return;
  }

  document.documentElement.style.setProperty(propConverted, String(normalizedText));
}

function applyThemeFontStylesheet(rawValue: unknown) {
  const href = asNonEmptyString(rawValue);
  const existingLink = document.getElementById(THEME_FONT_STYLESHEET_LINK_ID) as HTMLLinkElement | null;

  if (!href) {
    existingLink?.remove();
    return;
  }

  const link = existingLink || document.createElement('link');
  link.id = THEME_FONT_STYLESHEET_LINK_ID;
  link.rel = 'stylesheet';

  if (!existingLink) {
    document.head.appendChild(link);
  }

  if (link.getAttribute('href') !== href) {
    link.href = href;
  }
}

// Helper function to apply theme CSS properties
function applyThemeCSSProperties(themeData: ThemeData | null | undefined) {
  if (!themeData) {
    clientConsole(2, 'applyThemeCSSProperties - no theme data');
    return;
  }

  clientConsole(2, 'applyThemeCSSProperties', themeData);

  // Only update Session if theme has actually changed (prevents unnecessary re-renders)
  const currentTheme = Session.get('curTheme');
  const themeChanged = JSON.stringify(currentTheme) !== JSON.stringify(themeData);

  // Apply CSS if: first run this session OR theme actually changed
  // This handles page refresh (DOM resets but Session persists) without spam on navigation
  const needsCssApplication = !themeCssAppliedThisSession || themeChanged;

  if (needsCssApplication) {
    clientConsole(2, 'Applying theme CSS variables');

    const themeProps = themeData.properties;
    if (themeProps) {
      for (const prop in themeProps) {
        applyThemeCssVariable(prop, themeProps[prop]);
      }
      applyThemeFontStylesheet(themeProps.app_font_stylesheet_url);
    }

    // Set document title
    const titleValue = resolveThemeBrandLabel(themeData, Meteor.settings.public?.systemName);
    clientConsole(2, 'Setting document.title to:', titleValue);
    document.title = titleValue;

    const themePropsForIcons = themeData.properties || {};
    const favicon32 = asNonEmptyString(themePropsForIcons.brand_favicon_32_url);
    const favicon16 = asNonEmptyString(themePropsForIcons.brand_favicon_16_url);
    const logoUrl = asNonEmptyString(themePropsForIcons.brand_logo_url);
    const defaultFavicon = favicon32 || favicon16 || logoUrl;

    if (favicon32) {
      updateFaviconLink('icon', '32x32', favicon32);
    }
    if (favicon16) {
      updateFaviconLink('icon', '16x16', favicon16);
    }
    if (defaultFavicon) {
      updateFaviconLink('icon', null, defaultFavicon);
    }

    const manifestVersionParts = [
      asNonEmptyString(themeData.activeThemeId),
      asNonEmptyString((themeData as { metadata?: { updatedAt?: string } }).metadata?.updatedAt),
      asNonEmptyString(themeData.themeName),
    ].filter(Boolean);
    const manifestVersion = manifestVersionParts.length > 0
      ? encodeURIComponent(manifestVersionParts.join(':'))
      : 'default';
    updateManifestLink(`/site.webmanifest?v=${manifestVersion}`);
    updateAppleTouchIconLink(`/apple-touch-icon.png?v=${manifestVersion}`);

    const themeColor = asNonEmptyString(themePropsForIcons.app_background_color) || '#F2F2F2';
    updateThemeColorMeta(themeColor);

    themeCssAppliedThisSession = true;
  }

  if (themeChanged) {
    clientConsole(2, 'Theme changed, updating Session');
    Session.set('curTheme', themeData);
  }

  // Mark theme as ready (enables navbar rendering without layout shift)
  Session.set('themeReady', true);
}

// Subscribe to theme and set up reactive autorun
// This function should be called once on app startup
function getCurrentTheme() {
  clientConsole(2, 'getCurrentTheme - setting up theme subscription');
  // Never paint a cached or temporary theme: either can be stale. The layout
  // remains non-visible until this subscription supplies the authoritative one.
  Session.set('themeReady', false);

  // Subscribe to theme publication and track when ready
  const themeSubscription = Meteor.subscribe('theme');
  const themeLibrarySubscription = Meteor.subscribe('themeLibrary');

  // Set up reactive autorun to apply theme whenever it changes
  Tracker.autorun(() => {
    clientConsole(2, 'getCurrentTheme - autorun triggered');

    // Wait for subscription to be ready before applying theme
    // This prevents flash of default theme before actual theme loads
    if (!themeSubscription.ready()) {
      clientConsole(2, 'getCurrentTheme - subscription not ready, waiting...');
      return;
    }

    const themeSetting = DynamicSettings.findOne({key: 'customTheme'});
    let themeData: ThemeData | undefined;

    if (themeSetting && themeSetting.value && themeSetting.value.enabled !== false) {
      // Use active custom theme
      themeData = themeSetting.value as ThemeData;
      Session.set('serverActiveTheme', themeData);
      clientConsole(2, 'getCurrentTheme - using custom theme');
    } else {
      // No custom theme; use MoFaCTS default theme
      clientConsole(2, 'getCurrentTheme - no custom theme found, using MoFaCTS default');
      themeData = {
        ...(defaultTheme as ThemeData),
        activeThemeId: 'mofacts-default',
        themeName: 'MoFaCTS',
      };
      Session.set('serverActiveTheme', themeData);
    }

    const savedThemeId = getSavedUserThemeId();
    if (savedThemeId) {
      if (!themeLibrarySubscription.ready()) {
        clientConsole(2, 'getCurrentTheme - theme library not ready, waiting for local theme selection');
        return;
      }
      const selectedTheme = findAvailableUserTheme(savedThemeId);
      if (!selectedTheme) {
        clearSavedUserThemeSelection(savedThemeId);
        Session.set('userThemeOverrideActive', false);
        clientConsole(1, `[ThemeToggle] Saved theme "${savedThemeId}" is no longer configured.`);
      } else {
        Session.set('userThemeOverrideActive', true);
        applyThemeCSSProperties(serializeThemeSelection(selectedTheme));
        return;
      }
    }

    if (Session.get('userThemeOverrideActive') === true) {
      clientConsole(2, 'getCurrentTheme - user theme override active');
      return;
    }

    applyThemeCSSProperties(themeData);
  });
}

// Extract space-delimited fields from src and push them to dest. Note that
// dest is changed, but is NOT cleared before commencing. Also note that
// false-ish values and whitespace-only strings are silently discarded
function extractDelimFields(src: unknown, dest: string[]) {
  if (!src) {
    return;
  }
  const fields = legacyTrim(String(src)).split(/\s/);
  for (let i = 0; i < fields.length; ++i) {
    const fld = legacyTrim(fields[i] ?? '');
    if (fld && fld.length > 0) {
      dest.push(fld);
    }
  }
}

// Given a string of format "a-b", return an array containing all
// numbers from a to b inclusive.  On errors, return an empty array
function rangeVal(src: unknown): number[] {
  const srcText = legacyTrim(String(src));
  const idx = srcText.indexOf('-');
  if (idx < 1) {
    return [];
  }

  const first = legacyInt(srcText.substring(0, idx));
  const last = legacyInt(srcText.substring(idx+1));
  if (last < first) {
    return [];
  }

  const range: number[] = [];
  for (let r = first; r <= last; ++r) {
    range.push(r);
  }

  return range;
}

// Given an array, shuffle IN PLACE and then return the array
function shuffle<T>(array: T[]): T[] {
  if (!array || !array.length) {
    return array;
  }

  let currentIndex = array.length;

  while (currentIndex > 0) {
    const randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    const tmp = array[currentIndex];
    const randomValue = array[randomIndex];
    if (tmp !== undefined && randomValue !== undefined) {
      array[currentIndex] = randomValue;
      array[randomIndex] = tmp;
    }
  }

  return array;
}

// Given an array, select and return one item at random. If the array is
// empty, then undefined is returned
function randomChoice<T>(array: T[] | null | undefined): T | undefined {
  let choice: T | undefined;
  if (array && array.length) {
    choice = array[Math.floor(Math.random() * array.length)];
  }
  return choice;
}

function search<T extends object, K extends keyof T>(key: T[K], prop: K, searchObj: T[]): T | undefined {
  for (const item of searchObj) {
    if (item[prop] == key) {
      return item;
    }
  }
}

function haveMeteorUser() {
  const currentUser = Meteor.user() as any;
  return !!Meteor.userId() && !!currentUser && !!(currentUser.username || currentUser.email_canonical || currentUser.emails?.[0]?.address);
}

function getUserDisplayIdentifier(user: any) {
  if (!user) {
    return '';
  }
  return String(user.username || user.email_canonical || user.emails?.[0]?.address || '').trim();
}

function updateCurStudentPerformance(isCorrect: boolean, practiceTime: number, testType: string) {
  // Update running user metrics total,
  // note this assumes curStudentPerformance has already been initialized on initial page entry
  const curUserPerformance = Session.get('curStudentPerformance') as CurrentStudentPerformance;
  curUserPerformance.count = curUserPerformance.count + 1;
  clientConsole(2, 'updateCurStudentPerformance', isCorrect, practiceTime,
      'count:', curUserPerformance.count);
  if (testType !== 's') {
    if (isCorrect) curUserPerformance.numCorrect = curUserPerformance.numCorrect + 1;
    else curUserPerformance.numIncorrect = curUserPerformance.numIncorrect + 1;
    curUserPerformance.percentCorrect = ((curUserPerformance.numCorrect / (curUserPerformance.numCorrect + curUserPerformance.numIncorrect))*100).toFixed(2) + '%';
    curUserPerformance.stimsSeen = Number(curUserPerformance.stimsSeen);
    curUserPerformance.totalStimCount = Number(curUserPerformance.totalStimCount);
  }
  curUserPerformance.totalTime = Number(curUserPerformance.totalTime) + practiceTime;
  curUserPerformance.totalTimeDisplay = (curUserPerformance.totalTime / (1000*60)).toFixed(1);
  Session.set('constantTotalTime',curUserPerformance.totalTimeDisplay);
  Session.set('curStudentPerformance', curUserPerformance);
}

function updateCurStudedentPracticeTime(practiceTime: number) {
  // Update running user metrics total,
  // note this assumes curStudentPerformance has already been initialized on initial page entry
  const curUserPerformance = Session.get('curStudentPerformance') as CurrentStudentPerformance;
  clientConsole(2, 'updateCurStudentPerformance', practiceTime,
      'totalTime:', curUserPerformance.totalTime);
  curUserPerformance.totalTime = Number(curUserPerformance.totalTime) + practiceTime;
  curUserPerformance.totalTimeDisplay = (curUserPerformance.totalTime / (1000*60)).toFixed(1);
  Session.set('constantTotalTime',curUserPerformance.totalTimeDisplay);
  Session.set('curStudentPerformance', curUserPerformance);
}

function getDashboardCacheTotalTimeMs(tdfId: string | null | undefined) {
  if (typeof UserDashboardCache === 'undefined') {
    return null;
  }
  const userId = Meteor.userId();
  if (!userId || !tdfId) {
    return null;
  }
  const cache = UserDashboardCache.findOne({ userId });
  const stats = cache?.tdfStats?.[tdfId];
  if (!stats) {
    return null;
  }
  const totalTimeMs = Number(stats.totalTimeMs);
  if (Number.isFinite(totalTimeMs)) {
    return totalTimeMs;
  }
  const totalTimeMinutes = Number(stats.totalTimeMinutes);
  if (Number.isFinite(totalTimeMinutes)) {
    return totalTimeMinutes * 60000;
  }
  return null;
}

function addActiveClusterIndex(value: unknown, activeClusterIndexes: Set<number>) {
  const clusterIndex = Number(value);
  if (Number.isInteger(clusterIndex) && clusterIndex >= 0) {
    activeClusterIndexes.add(clusterIndex);
  }
}

function collectSparcPageClusterReferences(source: unknown, activeClusterIndexes: Set<number>) {
  if (!source || typeof source !== 'object') {
    return;
  }
  if (Array.isArray(source)) {
    for (const item of source) {
      collectSparcPageClusterReferences(item, activeClusterIndexes);
    }
    return;
  }
  const record = source as Record<string, unknown>;
  if (record.clusterIndex !== undefined && typeof record.clusterIndex !== 'object') {
    addActiveClusterIndex(record.clusterIndex, activeClusterIndexes);
  }
  if (Array.isArray(record.clusterIndices)) {
    for (const clusterIndex of record.clusterIndices) {
      addActiveClusterIndex(clusterIndex, activeClusterIndexes);
    }
  }
  for (const value of Object.values(record)) {
    collectSparcPageClusterReferences(value, activeClusterIndexes);
  }
}

function getActiveClusterIndexesFromClusterList(clusterListSource: unknown) {
  const activeClusterIndexes = new Set<number>();
  if (!clusterListSource) {
    return activeClusterIndexes;
  }
  const clusterFields: string[] = [];
  extractDelimFields(clusterListSource, clusterFields);
  for (const field of clusterFields) {
    if (field.includes('-')) {
      for (const value of rangeVal(field)) {
        addActiveClusterIndex(value, activeClusterIndexes);
      }
    } else {
      addActiveClusterIndex(legacyInt(field, Number.NaN), activeClusterIndexes);
    }
  }
  return activeClusterIndexes;
}

function getActiveClusterIndexesForCurrentUnit(currentUnit: any) {
  if (!currentUnit?.sparcsession) {
    return getActiveClusterIndexesFromClusterList(resolveLearningSessionClusterListSource(currentUnit, false));
  }
  const pageId = resolveSparcSessionPageId(currentUnit);
  const tdfDoc = Session.get('currentTdfDoc') as { rawStimuliFile?: { setspec?: { sparcPages?: unknown[] } } } | null | undefined;
  const sparcPages = tdfDoc?.rawStimuliFile?.setspec?.sparcPages;
  const page = Array.isArray(sparcPages) && pageId
    ? sparcPages.find((candidate) =>
      candidate && typeof candidate === 'object' && (candidate as Record<string, unknown>).pageId === pageId
    )
    : Array.isArray(sparcPages) && sparcPages.length === 1
      ? sparcPages[0]
    : null;
  const activeClusterIndexes = new Set<number>();
  collectSparcPageClusterReferences(page && typeof page === 'object'
    ? (page as Record<string, unknown>).display
    : null, activeClusterIndexes);
  return activeClusterIndexes;
}

function getCurrentUnitStimulusCount(): number {
  const currentUnit = Session.get('currentTdfUnit');
  const currentStimuliSet = Session.get('currentStimuliSet');
  if (!Array.isArray(currentStimuliSet)) {
    return 0;
  }
  const activeClusterIndexes = getActiveClusterIndexesForCurrentUnit(currentUnit);
  if (activeClusterIndexes.size === 0) return 0;

  const nestedClusters = getNestedStimulusClustersFromTdfFile({
    tdfFile: Session.get('currentTdfFile'),
    currentStimuliSet,
    currentStimuliSetId: Session.get('currentStimuliSetId'),
    currentTdfId: Session.get('currentTdfId'),
  });
  let totalStimCount = 0;
  for (const clusterIndex of activeClusterIndexes) {
    const cluster = nestedClusters[clusterIndex];
    if (cluster) {
      totalStimCount += cluster.stims.length;
    }
  }
  return totalStimCount;
}

async function setStudentPerformance(
  studentID: string,
  studentUsername: string,
  tdfId: string,
  unitNumber = Number(Session.get('currentUnitNumber')),
  unitScopedOnly = Boolean((deliverySettingsStore.get() as Record<string, unknown>)?.resetStudentPerformance)
) {
  clientConsole(2, 'setStudentPerformance:', studentID, studentUsername, tdfId);
  const historyPerformance = await meteorCallAsync<Record<string, unknown> | null>(
    'getStudentPerformanceForUnitFromHistory',
    studentID,
    tdfId,
    unitNumber,
    unitScopedOnly
  );
  
  const studentPerformance: StudentPerformanceAccumulator = {
    username: studentUsername,
    numCorrect: 0,
    numIncorrect: 0,
    stimsSeen: 0,
    lastSeen: 0,
    totalStimCount: 0,
    totalTime: 0,
    count: 0,
    allTimeNumCorrect: 0,
    allTimeNumIncorrect: 0,
    allTimePracticeDuration: 0,
    percentCorrect: 'N/A',
    totalTimeDisplay: '0.0',
    stimsIntroduced: 0,
  };

  studentPerformance.totalStimCount = getCurrentUnitStimulusCount();

  if (historyPerformance) {
    studentPerformance.numCorrect = Number(historyPerformance.numCorrect) || 0;
    studentPerformance.numIncorrect = Number(historyPerformance.numIncorrect) || 0;
    studentPerformance.totalTime = Number(historyPerformance.totalPracticeDuration) || 0;
    studentPerformance.allTimeNumCorrect = Number(historyPerformance.allTimeNumCorrect) || studentPerformance.numCorrect;
    studentPerformance.allTimeNumIncorrect = Number(historyPerformance.allTimeNumIncorrect) || studentPerformance.numIncorrect;
    studentPerformance.allTimePracticeDuration = Number(historyPerformance.allTimePracticeDuration) || studentPerformance.totalTime;
    studentPerformance.stimsIntroduced = Number(historyPerformance.stimsIntroduced) || 0;
    studentPerformance.count = Number(historyPerformance.count) || 0;
  }
  const divisor = studentPerformance.numCorrect + studentPerformance.numIncorrect
  studentPerformance.percentCorrect = (divisor > 0) ? ((studentPerformance.numCorrect / divisor)*100).toFixed(2) + '%' : 'N/A';;
  const cachedTotalTimeMs = getDashboardCacheTotalTimeMs(tdfId);
  if (cachedTotalTimeMs !== null) {
    studentPerformance.totalTime = cachedTotalTimeMs;
  }
  studentPerformance.totalTimeDisplay = (studentPerformance.totalTime / (1000*60)).toFixed(1);
  Session.set('curStudentPerformance', studentPerformance);
  clientConsole(2, 'setStudentPerformance,output:', 'correct:', studentPerformance.numCorrect,
    'incorrect:', studentPerformance.numIncorrect, 'percent:', studentPerformance.percentCorrect);
}

function getRawStimulusClustersFromTdfDocument(tdfDocument: any): RawStimulusCluster[] | null {
  const clusters = tdfDocument?.rawStimuliFile?.setspec?.clusters;
  return Array.isArray(clusters) ? clusters : null;
}

function findCanonicalTdfDocument(tdfId: unknown): any | null {
  const normalizedTdfId = typeof tdfId === 'string' ? tdfId.trim() : '';
  if (!normalizedTdfId) {
    return null;
  }
  return (globalThis as any).Tdfs?.findOne?.({ _id: normalizedTdfId }) ?? null;
}

function getRawStimulusClusters(params: Pick<NestedStimulusClusterSourceParams, 'tdfFile' | 'currentTdfId' | 'currentTdfDoc'>): RawStimulusCluster[] {
  const directClusters = getRawStimulusClustersFromTdfDocument(params.tdfFile);
  if (directClusters) {
    return directClusters;
  }

  const canonicalTdf = params.currentTdfDoc ?? findCanonicalTdfDocument(params.currentTdfId);
  const canonicalClusters = getRawStimulusClustersFromTdfDocument(canonicalTdf);
  if (canonicalClusters) {
    return canonicalClusters;
  }

  throw new Error(
    `[Unit Engine] Current TDF ${String(params.currentTdfId ?? '')} is missing rawStimuliFile.setspec.clusters; refusing numeric clusterKC fallback.`
  );
}

function flattenLegacyStimuliByNestedPosition(flatStimuli: unknown): FlatStimulus[] {
  return Array.isArray(flatStimuli)
    ? flatStimuli.filter((stim): stim is FlatStimulus => Boolean(stim) && typeof stim === 'object' && !Array.isArray(stim))
    : [];
}

function resolveRawStimCorrectResponse(rawStim: RawStimulus): unknown {
  if (rawStim.response && Object.prototype.hasOwnProperty.call(rawStim.response, 'correctResponse')) {
    return rawStim.response.correctResponse;
  }
  return undefined;
}

function resolveRawStimIncorrectResponses(rawStim: RawStimulus): unknown {
  if (rawStim.response && Object.prototype.hasOwnProperty.call(rawStim.response, 'incorrectResponses')) {
    return rawStim.response.incorrectResponses;
  }
  return undefined;
}

function requireStimuliSetIdForNestedIdentity(value: unknown): string | number {
  if (value === undefined || value === null || value === '') {
    throw new Error('Nested stimulus identity generation requires stimuliSetId');
  }
  return typeof value === 'number' ? value : String(value);
}

function generateNestedStimulusKC(params: {
  stimuliSetId: unknown;
  clusterIndex: number;
  stimIndex: number;
}): string {
  const stimuliSetId = requireStimuliSetIdForNestedIdentity(params.stimuliSetId);
  return `${String(stimuliSetId)}:${params.clusterIndex}:${params.stimIndex}`;
}

function createRuntimeStimulusFromNestedSource(params: {
  rawCluster: RawStimulusCluster;
  rawStim: RawStimulus;
  flatStim?: FlatStimulus;
  stimuliSetId: unknown;
  clusterIndex: number;
  stimIndex: number;
}): FlatStimulus {
  const clusterKC = params.rawCluster.clusterKC ?? params.flatStim?.clusterKC;
  if (clusterKC === undefined || clusterKC === null || clusterKC === '') {
    throw new Error(`Nested stimulus cluster ${params.clusterIndex} is missing clusterKC`);
  }
  const stimulusKC = params.rawStim.stimulusKC ?? params.flatStim?.stimulusKC ?? generateNestedStimulusKC(params);
  const correctResponse = resolveRawStimCorrectResponse(params.rawStim);
  return {
    ...(params.flatStim ?? {}),
    stimuliSetId: params.flatStim?.stimuliSetId ?? params.stimuliSetId,
    stimulusKC,
    clusterKC,
    params: params.rawStim.parameter ?? params.flatStim?.params,
    correctResponse: correctResponse ?? params.flatStim?.correctResponse,
    incorrectResponses: resolveRawStimIncorrectResponses(params.rawStim) ?? params.flatStim?.incorrectResponses,
    clozeStimulus: params.rawStim.display?.clozeText ?? params.rawStim.display?.clozeStimulus ?? params.flatStim?.clozeStimulus,
    textStimulus: params.rawStim.display?.text ?? params.rawStim.display?.textStimulus ?? params.flatStim?.textStimulus ?? '',
    audioStimulus: params.rawStim.display?.audioSrc ?? params.flatStim?.audioStimulus,
    imageStimulus: params.rawStim.display?.imgSrc ?? params.flatStim?.imageStimulus,
    videoStimulus: params.rawStim.display?.videoSrc ?? params.flatStim?.videoStimulus,
    display: params.rawStim.display ?? params.flatStim?.display,
    autoTutor: params.rawStim.autoTutor ?? params.flatStim?.autoTutor,
    alternateDisplays: params.rawStim.alternateDisplays ?? params.flatStim?.alternateDisplays,
  };
}

function getNestedStimulusClustersFromTdfFile(params: NestedStimulusClusterSourceParams): StimCluster[] {
  const rawClusters = getRawStimulusClusters(params);
  const flatStimuli = flattenLegacyStimuliByNestedPosition(params.currentStimuliSet);
  let flatIndex = 0;
  return rawClusters.map((rawCluster, clusterIndex) => {
    if (!Array.isArray(rawCluster?.stims)) {
      throw new Error(`Nested stimulus cluster ${clusterIndex} is missing stims`);
    }
    const clusterKC = rawCluster.clusterKC ?? flatStimuli[flatIndex]?.clusterKC;
    const stims = rawCluster.stims.map((rawStim, stimIndex) => {
      const flatStim = flatStimuli[flatIndex];
      flatIndex += 1;
      return createRuntimeStimulusFromNestedSource({
        rawCluster,
        rawStim,
        ...(flatStim ? { flatStim } : {}),
        stimuliSetId: params.tdfFile?.stimuliSetId ?? params.currentStimuliSetId,
        clusterIndex,
        stimIndex,
      });
    });
    return {
      shufIndex: clusterIndex,
      clusterIndex,
      clusterKC,
      stims,
    };
  });
}

// Return the total number of stim clusters
function getStimCount() {
  const nestedClusters = getNestedStimulusClustersFromTdfFile({
    tdfFile: Session.get('currentTdfFile'),
    currentStimuliSet: Session.get('currentStimuliSet'),
    currentStimuliSetId: Session.get('currentStimuliSetId'),
    currentTdfId: Session.get('currentTdfId'),
  });
  return nestedClusters.length;
}

// Return the stim file cluster matching the index AFTER mapping it per the
// current sessions cluster mapping.
// Note that the cluster mapping goes from current session index to raw index in order of the stim file
function getStimCluster(clusterMappedIndex=0): StimCluster {
  const mappingRecord = loadSessionMappingRecord();
  const rawIndex = resolveOriginalClusterIndex(clusterMappedIndex, mappingRecord);
  const cluster: StimCluster = {
    shufIndex: clusterMappedIndex, // Tack these on for later logging purposes
    clusterIndex: typeof rawIndex === 'number' ? rawIndex : -1,
    stims: [],
  };
  if (typeof rawIndex !== 'number') {
    clientConsole(1, '[Mapping] Missing/invalid mapping record during cluster retrieval', {
      clusterMappedIndex,
    });
    return cluster;
  }
  const nestedClusters = getNestedStimulusClustersFromTdfFile({
    tdfFile: Session.get('currentTdfFile'),
    currentStimuliSet: Session.get('currentStimuliSet'),
    currentStimuliSetId: Session.get('currentStimuliSetId'),
    currentTdfId: Session.get('currentTdfId'),
  });
  const nestedCluster = nestedClusters[rawIndex];
  if (!nestedCluster) {
    return cluster;
  }
  return {
    ...nestedCluster,
    shufIndex: clusterMappedIndex,
  };
}

// Given a cluster count, a shuffleclusters string, and a swapclusters string,
// create a mapping vector. The idea is that for cluster x, mapping[x] returns
// a translated index. Note that the default mapping is identity, so that
// mapping[x] = x HOWEVER, the user may submit a different default mapping.
// This is mainly so that multiple shuffle/swap pairs can be run. ALSO important
// is the fact that additional elements will be added if
// mapping.length < stimCount
function createStimClusterMapping(stimCount: number, shuffleclusters: unknown, swapclusters: unknown, startMapping: number[] | null | undefined) {
  return createStimClusterMappingCore(stimCount, shuffleclusters, swapclusters, startMapping);
}

function getAllCurrentStimAnswers(removeExcludedPhraseHints = false) {
  const {curClusterIndex, curStimIndex} = getCurrentClusterAndStimIndices();
  const stims = Session.get('currentStimuliSet');
  let allAnswers: string[] = [];

  for (const stim of stims) {
    const responseParts = stim.correctResponse.toLowerCase().split(';');
    const answerArray = responseParts.filter(function(entry: string) {
      return entry.indexOf('incorrect') == -1;
    });
    if (answerArray.length > 0) {
      const singularAnswer = answerArray[0].split('~')[0];
      if (!allAnswers.includes(singularAnswer)) {
        allAnswers.push(singularAnswer);
      }
    }
  }

  if (removeExcludedPhraseHints) {
    const currentCluster = getStimCluster(curClusterIndex);
    const currentStim = currentCluster.stims[curStimIndex] as { speechHintExclusionList?: string } | undefined;
    const curSpeechHintExclusionListText =
        currentStim?.speechHintExclusionList || '';
    const exclusionList = curSpeechHintExclusionListText.split(',');
    // Remove the optional phrase hint exclusions
    allAnswers = allAnswers.filter((el: string)=>exclusionList.indexOf(el)==-1);
  }

  return allAnswers;
}

/**
 * Look up the original-case version of a user answer from the current stim set.
 * Returns the stim file's casing if the answer (case-insensitively) matches any
 * known correct response, otherwise returns the input unchanged.
 */
function getStimAnswerDisplayCase(userAnswer: string): string {
  if (!userAnswer) return userAnswer;
  const stims = Session.get('currentStimuliSet');
  if (!stims) return userAnswer;
  const userLower = userAnswer.trim().toLowerCase();
  for (const stim of stims) {
    const raw = stim.correctResponse;
    if (typeof raw !== 'string') continue;
    // Split on ';' to get branches, take first (correct) branch
    const branches = raw.split(';');
    for (const branch of branches) {
      if (branch.toLowerCase().indexOf('incorrect') !== -1) continue;
      // Handle '~' (regex~message) — take the match part
      const matchPart = branch.split('~')[0] ?? '';
      // Handle '|' (alternative answers)
      const alternatives = matchPart.split('|');
      for (const alt of alternatives) {
        const trimmed = alt.trim();
        if (trimmed.toLowerCase() === userLower) {
          return trimmed;
        }
      }
    }
  }
  return userAnswer;
}

function getTestType() {
  return legacyTrim(Session.get('testType')).toLowerCase();
}

// Return the delivery settings for the current unit. Note that we provide default
// values AND eliminate the single-value array issue from our XML-2-JSON mapping
//
// Note that the default mode is to use the current unit (thus the name), but we
// allow callers to override the unit assumed to be current
//
// IMPORTANT: we also support selecting one of multiple delivery settings entries via
// experimentXCond (which can be specified in the URL or system-assigned)
function getCurrentDeliverySettings() {
  let currUnit = Session.get('currentTdfUnit');
  const currentTdfFile = Session.get('currentTdfFile');
  const currentUnitNumber = Number(Session.get('currentUnitNumber') || 0);
  const tutor = currentTdfFile?.tdfs?.tutor;

  if (!currUnit && currentTdfFile?.tdfs?.tutor?.unit && Array.isArray(currentTdfFile.tdfs.tutor.unit)) {
    const fallbackUnit = currentTdfFile.tdfs.tutor.unit[currentUnitNumber];
    if (fallbackUnit) {
      currUnit = fallbackUnit;
      Session.set('currentTdfUnit', fallbackUnit);
      clientConsole(1, '[DeliverySettings] currentTdfUnit missing; restored from currentTdfFile/currentUnitNumber', {
        currentUnitNumber,
        unitname: fallbackUnit.unitname,
      });
    }
  }

  const resolved = resolveCurrentDeliverySettings({
    tdfFile: currentTdfFile,
    tutor,
    unit: currUnit,
    unitIndex: currentUnitNumber,
    experimentXCond: Session.get('experimentXCond'),
    unitType: Session.get('unitType'),
  });

  clientConsole(2, 'getCurrentDeliverySettings:', currUnit ? 'unit found' : 'no unit', resolved.settings.scoringEnabled);

  return resolved.settings as DeliverySettings;
}

function refreshCurrentDeliverySettingsStore() {
  const settings = getCurrentDeliverySettings();
  deliverySettingsStore.set(settings);
  return settings;
}






