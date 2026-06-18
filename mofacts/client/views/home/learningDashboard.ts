import {ReactiveVar} from 'meteor/reactive-var';
import './learningDashboard.html';
import './learningDashboard.css';
import {getExperimentState} from '../experiment/svelte/services/experimentState';
import {meteorCallAsync, clientConsole} from '../..';
import {sessionCleanUp} from '../../lib/sessionUtils';
import {checkUserSession} from '../../lib/userSessionHelpers';
const { FlowRouter } = require('meteor/ostrio:flow-router-extra');
import {currentUserHasRole} from '../../lib/roleUtils';
import {
  getAudioPromptFeedbackView,
  setAudioPromptMode, setAudioPromptFeedbackView,
  setAudioEnabledView, setAudioEnabled,
  setAudioPromptFeedbackSpeakingRate, setAudioPromptQuestionSpeakingRate,
  setAudioPromptFeedbackSpeakingRateView, setAudioPromptQuestionSpeakingRateView,
  setAudioPromptVoice, setAudioPromptFeedbackVoice,
  setAudioPromptVoiceView, setAudioPromptFeedbackVoiceView,
  setAudioInputSensitivity, setAudioInputSensitivityView,
  setAudioPromptQuestionVolume, setAudioPromptFeedbackVolume
} from '../../lib/state/audioState';
import { getAudioLaunchPreparationPlan, prepareAudioForLaunchIfNeeded } from '../../lib/audioStartup';
import { unlockAppleMobileAudioForUserGesture } from '../../lib/audioUnlock';
import { shouldLockMultiTdfLaunchToCurrentUnit } from '../../lib/lessonLaunchLockPolicy';
import { CARD_ENTRY_INTENT, setCardEntryIntent, type CardEntryIntent } from '../../lib/cardEntryIntent';
import { normalizeTutorUnits } from '../../lib/tdfUtils';
import { prepareLessonLaunchContext } from '../../lib/lessonLaunchInitializer';
import {
  LEARNER_TDF_FIELD_DEFINITIONS,
  applyLearnerTdfConfig,
  learnerTdfFieldAppliesToUnit,
  type LearnerTdfConfig
} from '../../../common/lib/learnerTdfConfig';
import { detectTdfUnitType } from '../../../common/fieldApplicability';
import {
  finishLaunchLoading,
  markLaunchLoadingTiming,
  setLaunchLoadingMessage,
  startLaunchLoading,
} from '../../lib/launchLoading';

declare const Template: any;
declare const Meteor: any;
declare const Session: any;
declare const $: any;
declare const UserDashboardCache: any;

type LearnerConfigState = {
  tdfId: string | null;
  loading: boolean;
  error: string | null;
  step: 'scope' | 'settings';
  content: any | null;
  scope: 'setspec' | 'unit' | null;
  unitIndex: number | null;
  family: 'deliverySettings' | null;
  saving: boolean;
  closing: boolean;
  dirty: boolean;
  resetConfirming: boolean;
  resettingProgress: boolean;
};

const EMPTY_CONFIG_STATE: LearnerConfigState = {
  tdfId: null,
  loading: false,
  error: null,
  step: 'scope',
  content: null,
  scope: null,
  unitIndex: null,
  family: null,
  saving: false,
  closing: false,
  dirty: false,
  resetConfirming: false,
  resettingProgress: false,
};

const PRACTICE_DASHBOARD_SNAPSHOT_VERSION = 1;
const LEARNER_CONFIG_CLOSE_FALLBACK_MS = 200;
const LEARNER_CONFIG_AUTOSAVE_DELAY_MS = 500;
const LEARNER_CONFIG_SLIDER_DISPLAY_SESSION_KEY = 'learnerConfigSliderDisplayValues';

type PracticeDashboardSnapshot = {
  version: number;
  userId: string;
  generatedAt: number;
  lessons: any[];
};

function dashboardSnapshotStorageKey(userId: string) {
  if (!userId) {
    throw new Error('[LearningDashboard] Cannot build dashboard snapshot key without a user id');
  }
  return `mofacts.practiceDashboardSnapshot.v${PRACTICE_DASHBOARD_SNAPSHOT_VERSION}.${userId}`;
}

function loadLocalPracticeDashboardSnapshot(userId: string): PracticeDashboardSnapshot | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  const raw = window.localStorage.getItem(dashboardSnapshotStorageKey(userId));
  if (!raw) {
    return null;
  }
  const snapshot = JSON.parse(raw) as PracticeDashboardSnapshot;
  if (snapshot?.version !== PRACTICE_DASHBOARD_SNAPSHOT_VERSION || snapshot.userId !== userId || !Array.isArray(snapshot.lessons)) {
    throw new Error('[LearningDashboard] Local practice dashboard snapshot has an invalid shape');
  }
  return snapshot;
}

function saveLocalPracticeDashboardSnapshot(snapshot: PracticeDashboardSnapshot) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  window.localStorage.setItem(dashboardSnapshotStorageKey(snapshot.userId), JSON.stringify(snapshot));
}

function formatSnapshotLesson(lesson: any) {
  const lastPracticeTimestamp = Number(lesson.lastPracticeTimestamp || lesson.progress?.lastPracticedTimestamp || 0);
  const isUsed = Boolean(lesson.isUsed || Number(lesson.progress?.attempts || 0) > 0);
  return {
    ...lesson,
    isUsed,
    hasBeenAttempted: Boolean(lesson.hasBeenAttempted || isUsed),
    totalTrials: lesson.totalTrials ?? lesson.progress?.attempts,
    overallAccuracy: lesson.overallAccuracy ?? lesson.progress?.accuracy,
    accuracyApplies: lesson.accuracyApplies ?? lesson.progress?.accuracyApplies,
    totalTimeMinutes: lesson.totalTimeMinutes ?? lesson.progress?.totalTimeMinutes,
    itemsPracticed: lesson.itemsPracticed ?? lesson.progress?.itemsPracticed,
    itemsPracticedApplies: lesson.itemsPracticedApplies ?? lesson.progress?.itemsPracticedApplies,
    totalPracticeItems: lesson.totalPracticeItems ?? lesson.progress?.totalPracticeItems,
    lastPracticeTimestamp: Number.isFinite(lastPracticeTimestamp) ? lastPracticeTimestamp : 0,
    lastPracticeDate: lesson.lastPracticeDate || (lesson.progress?.lastPracticed
      ? new Date(lesson.progress.lastPracticed).toLocaleDateString()
      : undefined),
    totalSessions: lesson.totalSessions ?? lesson.progress?.sessionDays,
    tags: Array.isArray(lesson.tags) ? lesson.tags : [],
    conditions: Array.isArray(lesson.conditions) && lesson.conditions.length > 0 ? lesson.conditions : null,
  };
}

function applyPracticeDashboardSnapshot(instance: any, snapshot: PracticeDashboardSnapshot) {
  if (snapshot.userId) {
    const learnerConfigs: Record<string, LearnerTdfConfig> = {};
    for (const lesson of snapshot.lessons || []) {
      if (lesson?.TDFId && lesson.learnerConfig) {
        learnerConfigs[String(lesson.TDFId)] = lesson.learnerConfig;
      }
    }
    Session.set('learnerTdfConfigOverrides', learnerConfigs);
  }
  const rows = (snapshot.lessons || []).map(formatSnapshotLesson);
  const { used, unused } = splitTdfsByUsage(rows);
  const combinedTdfs = [...used, ...unused];
  Session.set('homeHasPracticeRecords', used.length > 0);
  instance.allTdfsList.set(combinedTdfs);
  instance.isLoading.set(false);
}

function parseCssDurationMs(rawValue: string | null | undefined) {
  const value = String(rawValue || '').trim();
  if (!value) {
    return LEARNER_CONFIG_CLOSE_FALLBACK_MS;
  }
  if (value.endsWith('ms')) {
    const ms = Number(value.slice(0, -2));
    return Number.isFinite(ms) ? ms : LEARNER_CONFIG_CLOSE_FALLBACK_MS;
  }
  if (value.endsWith('s')) {
    const seconds = Number(value.slice(0, -1));
    return Number.isFinite(seconds) ? seconds * 1000 : LEARNER_CONFIG_CLOSE_FALLBACK_MS;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : LEARNER_CONFIG_CLOSE_FALLBACK_MS;
}

function getLearnerConfigCloseDurationMs() {
  if (typeof window === 'undefined') {
    return LEARNER_CONFIG_CLOSE_FALLBACK_MS;
  }
  const transition = window.getComputedStyle(document.documentElement).getPropertyValue('--app-transition-smooth');
  return parseCssDurationMs(transition) + 20;
}

function clearLearnerConfigCloseTimer(instance: any) {
  if (instance.learnerConfigCloseTimer) {
    clearTimeout(instance.learnerConfigCloseTimer);
    instance.learnerConfigCloseTimer = null;
  }
}

function clearLearnerConfigAutosaveTimer(instance: any) {
  if (instance.learnerConfigAutosaveTimer) {
    clearTimeout(instance.learnerConfigAutosaveTimer);
    instance.learnerConfigAutosaveTimer = null;
  }
}

function getLocalLearnerTdfConfigs(): Record<string, LearnerTdfConfig | undefined> {
  const configs = Session.get('learnerTdfConfigOverrides');
  return configs && typeof configs === 'object' ? configs : {};
}

function setLocalLearnerTdfConfig(tdfId: string, config: LearnerTdfConfig | null | undefined) {
  const configs = {
    ...getLocalLearnerTdfConfigs(),
  };
  if (config) {
    configs[tdfId] = config;
  } else {
    delete configs[tdfId];
  }
  Session.set('learnerTdfConfigOverrides', configs);
}

async function saveLearnerConfigPatch(
  instance: any,
  tdfId: string,
  patch: any,
  saveRevision: number
) {
  const current = instance.learnerConfigState.get() as LearnerConfigState;
  if (current.tdfId === tdfId) {
    instance.learnerConfigState.set({ ...current, saving: true, error: null });
  }

  try {
    const result = await meteorCallAsync('saveLearnerTdfConfig', tdfId, patch) as { config?: LearnerTdfConfig | null };
    setLocalLearnerTdfConfig(tdfId, result?.config || null);
    const latest = instance.learnerConfigState.get() as LearnerConfigState;
    if (latest.tdfId === tdfId && instance.learnerConfigSaveRevision === saveRevision) {
      instance.learnerConfigState.set({ ...latest, saving: false, dirty: false, error: null });
    }
  } catch (error: any) {
    clientConsole(1, '[Dashboard Config] Failed to autosave learner TDF config:', error);
    const latest = instance.learnerConfigState.get() as LearnerConfigState;
    if (latest.tdfId === tdfId) {
      instance.learnerConfigState.set({
        ...latest,
        saving: false,
        dirty: true,
        error: error?.reason || error?.message || 'Unable to save settings.'
      });
    }
    throw error;
  } finally {
    if (instance.learnerConfigPendingSave?.saveRevision === saveRevision) {
      instance.learnerConfigPendingSave = null;
    }
  }
}

function closeLearnerConfigPanel(instance: any) {
  const current = instance.learnerConfigState.get() as LearnerConfigState;
  if (!current.tdfId) {
    instance.learnerConfigState.set(EMPTY_CONFIG_STATE);
    return;
  }
  if (current.closing) {
    return;
  }

  clearLearnerConfigCloseTimer(instance);
  instance.learnerConfigState.set({ ...current, closing: true });
  instance.learnerConfigCloseTimer = setTimeout(() => {
    clearLearnerConfigSliderDisplayValues(current.tdfId);
    instance.learnerConfigState.set(EMPTY_CONFIG_STATE);
    instance.learnerConfigCloseTimer = null;
  }, getLearnerConfigCloseDurationMs());
}

function markLearnerConfigDirty(instance: any) {
  const current = instance.learnerConfigState.get() as LearnerConfigState;
  if (!current.tdfId || current.closing) {
    return;
  }
  if (!current.dirty) {
    instance.learnerConfigState.set({ ...current, dirty: true });
  }
}

function scheduleLearnerConfigAutosave(instance: any, form: JQuery<HTMLElement>) {
  const current = instance.learnerConfigState.get() as LearnerConfigState;
  if (!current.tdfId || current.closing || current.step !== 'settings') {
    return;
  }

  const tdfId = current.tdfId;
  const patch = buildConfigPatchFromForm(form, current);
  const saveRevision = (instance.learnerConfigSaveRevision || 0) + 1;
  instance.learnerConfigSaveRevision = saveRevision;
  instance.learnerConfigPendingSave = {
    tdfId,
    patch,
    saveRevision,
  };
  markLearnerConfigDirty(instance);
  clearLearnerConfigAutosaveTimer(instance);

  instance.learnerConfigAutosaveTimer = setTimeout(async () => {
    instance.learnerConfigAutosaveTimer = null;
    try {
      instance.learnerConfigSavePromise = saveLearnerConfigPatch(
        instance,
        tdfId,
        patch,
        saveRevision
      ).finally(() => {
        instance.learnerConfigSavePromise = null;
      });
      await instance.learnerConfigSavePromise;
    } catch {
      // Error state is set by saveLearnerConfigPatch.
    }
  }, LEARNER_CONFIG_AUTOSAVE_DELAY_MS);
}

function getDashboardCache() {
  const studentID = Session.get('curStudentID') || Meteor.userId();
  return UserDashboardCache.findOne({ userId: studentID });
}

function getLearnerTdfConfig(tdfId: string): LearnerTdfConfig | undefined {
  return getLocalLearnerTdfConfigs()[tdfId] || getDashboardCache()?.learnerTdfConfigs?.[tdfId];
}

function applyDashboardLearnerConfig(content: any, tdfId: string) {
  const learnerConfig = getLearnerTdfConfig(tdfId);
  if (!learnerConfig) {
    return content;
  }
  const result = applyLearnerTdfConfig(content, learnerConfig);
  if (result.warnings.length) {
    clientConsole(1, '[Dashboard Config] Learner TDF config warning:', result.warnings.join('; '));
    Session.set('uiMessage', {
      text: result.warnings.join(' '),
      variant: 'warning',
    });
  }
  return result.tdf;
}

function learnerConfigHasSetSpecAudioOverride(tdfId: string, key: 'audioPromptMode' | 'audioInputEnabled' | 'audioInputSensitivity') {
  return getLearnerTdfConfig(tdfId)?.overrides?.setspec?.[key] !== undefined;
}

function getConfigurableContent(state: LearnerConfigState) {
  if (!state.content) {
    return null;
  }
  try {
    return applyLearnerTdfConfig(state.content, getLearnerTdfConfig(String(state.tdfId))).tdf;
  } catch (error) {
    clientConsole(1, '[Dashboard Config] Failed to apply learner config for editing:', error);
    return state.content;
  }
}

function getTutorUnits(content: any) {
  const units = content?.tdfs?.tutor?.unit;
  return Array.isArray(units) ? units : [];
}

function unitHasConfigurableRuntime(unit: any) {
  const unitType = detectTdfUnitType(unit);
  return unitType === 'learning' || unitType === 'autotutor' || unitType === 'sparc';
}

function unitHasLearnerConfigurableFields(unit: any) {
  return LEARNER_TDF_FIELD_DEFINITIONS.some((field) => {
    if (field.scope === 'setspec') {
      return false;
    }
    return learnerTdfFieldAppliesToUnit(field, unit);
  });
}

function getConfigurableRuntimeUnitIndexes(content: any) {
  return getTutorUnits(content)
    .map((unit: any, index: number) => unitHasConfigurableRuntime(unit) ? index : -1)
    .filter((index: number) => index >= 0);
}

function getLearnerConfigurableUnitIndexes(content: any) {
  return getTutorUnits(content)
    .map((unit: any, index: number) => unitHasLearnerConfigurableFields(unit) ? index : -1)
    .filter((index: number) => index >= 0);
}

function tdfHasConfigurableRuntime(content: any) {
  return getConfigurableRuntimeUnitIndexes(content).length > 0;
}

function tdfHasLearnerConfigurableFields(content: any) {
  return getLearnerConfigurableUnitIndexes(content).length > 0;
}

function getPrimaryConfigurableUnitIndex(state: LearnerConfigState) {
  return getLearnerConfigurableUnitIndexes(state.content)[0] ?? null;
}

function getLearnerConfigurableFieldsForState(state: LearnerConfigState) {
  const primaryConfigurableUnitIndex = getPrimaryConfigurableUnitIndex(state);
  const primaryConfigurableUnit = primaryConfigurableUnitIndex === null
    ? null
    : getTutorUnits(state.content)[primaryConfigurableUnitIndex];

  return LEARNER_TDF_FIELD_DEFINITIONS.filter((field) => {
    if (field.scope === 'setspec') {
      return true;
    }
    return Boolean(primaryConfigurableUnit) && learnerTdfFieldAppliesToUnit(field, primaryConfigurableUnit);
  });
}

function getPathValue(source: any, path: string, unitIndex: number | null = null) {
  const tutor = source?.tdfs?.tutor;
  if (path.startsWith('setspec.')) {
    return path.split('.').slice(1).reduce((acc, part) => acc?.[part], tutor?.setspec);
  }
  if (path.startsWith('deliverySettings.')) {
    return path.split('.').slice(1).reduce((acc, part) => acc?.[part], tutor?.deliverySettings);
  }
  if (path.startsWith('unit[].') && unitIndex !== null) {
    const key = path.startsWith('unit[].deliverySettings.') ? path.split('.').pop() : null;
    const unitValue = path.split('.').slice(1).reduce((acc, part) => acc?.[part], tutor?.unit?.[unitIndex]);
    if (unitValue !== undefined || !key) {
      return unitValue;
    }
    return tutor?.deliverySettings?.[key];
  }
  return undefined;
}

function getDefaultForField(field: any, state: LearnerConfigState) {
  const unitIndex = field.scope === 'unit' ? getPrimaryConfigurableUnitIndex(state) : null;
  return getPathValue(state.content, field.tdfPath, unitIndex) ?? field.defaultValue;
}

function getEffectiveForField(field: any, state: LearnerConfigState) {
  const unitIndex = field.scope === 'unit' ? getPrimaryConfigurableUnitIndex(state) : null;
  return getPathValue(getConfigurableContent(state), field.tdfPath, unitIndex) ?? field.defaultValue;
}

function isFieldCustomized(field: any, state: LearnerConfigState) {
  return getEffectiveForField(field, state) !== getDefaultForField(field, state);
}

function getFieldDisplayScale(field: any) {
  const scale = Number(field.displayScale);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function toFieldInputValue(field: any, value: unknown) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && getFieldDisplayScale(field) !== 1) {
    return Math.round(numeric * getFieldDisplayScale(field) * 1000) / 1000;
  }
  return value;
}

function fromFieldInputValue(field: any, value: unknown) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && getFieldDisplayScale(field) !== 1) {
    return Math.round((numeric / getFieldDisplayScale(field)) * 1000) / 1000;
  }
  return numeric;
}

function appendValueSuffix(value: unknown, suffix: string) {
  return suffix === '%' ? `${value}%` : `${value}${suffix ? ` ${suffix}` : ''}`;
}

function getLearnerConfigSliderDisplayKey(tdfId: string | null | undefined, fieldId: string) {
  return `${tdfId || ''}:${fieldId}`;
}

function getLearnerConfigSliderDisplayValues(): Record<string, string> {
  const values = Session.get(LEARNER_CONFIG_SLIDER_DISPLAY_SESSION_KEY);
  return values && typeof values === 'object' ? values : {};
}

function setLearnerConfigSliderDisplayValue(tdfId: string | null | undefined, fieldId: string, displayValue: string) {
  if (!tdfId || !fieldId) {
    return;
  }
  Session.set(LEARNER_CONFIG_SLIDER_DISPLAY_SESSION_KEY, {
    ...getLearnerConfigSliderDisplayValues(),
    [getLearnerConfigSliderDisplayKey(tdfId, fieldId)]: displayValue,
  });
}

function clearLearnerConfigSliderDisplayValues(tdfId: string | null | undefined) {
  if (!tdfId) {
    return;
  }
  const nextValues = { ...getLearnerConfigSliderDisplayValues() };
  const prefix = `${tdfId}:`;
  for (const key of Object.keys(nextValues)) {
    if (key.startsWith(prefix)) {
      delete nextValues[key];
    }
  }
  Session.set(LEARNER_CONFIG_SLIDER_DISPLAY_SESSION_KEY, nextValues);
}

function formatFieldDisplayValue(field: any, value: unknown) {
  const suffix = field.displaySuffix || field.unit || '';
  const inputValue = toFieldInputValue(field, value);
  return appendValueSuffix(inputValue, suffix);
}

function buildConfigPatchFromForm(container: JQuery<HTMLElement>, state: LearnerConfigState) {
  const patch: any = { setspec: {}, unit: {} };
  const configurableUnitIndexes = getLearnerConfigurableUnitIndexes(state.content);
  const fields = getSettingFields(state);

  for (const field of fields) {
    const input = container.find(`[data-config-field="${field.id}"]`);
    if (!input.length) continue;

    let value: string | number | boolean;
    if (field.control === 'toggle') {
      value = Boolean((input.get(0) as HTMLInputElement).checked);
    } else if (field.control === 'slider') {
      value = fromFieldInputValue(field, input.val()) as number;
    } else if (field.control === 'number' || field.id === 'setspec.audioInputSensitivity') {
      value = Number(input.val());
    } else {
      value = String(input.val());
    }

    if (field.id === 'setspec.audioPromptMode') {
      patch.setspec.audioPromptMode = value;
    } else if (field.id === 'setspec.audioInputEnabled') {
      patch.setspec.audioInputEnabled = value;
    } else if (field.id === 'setspec.audioInputSensitivity') {
      patch.setspec.audioInputSensitivity = value;
    } else if (field.tdfPath.startsWith('deliverySettings.')) {
      const key = field.tdfPath.split('.').pop();
      if (key) {
        for (const index of configurableUnitIndexes) {
          const unitIndex = String(index);
          patch.unit[unitIndex] ||= { deliverySettings: {} };
          patch.unit[unitIndex].deliverySettings[key] = value;
        }
      }
    } else if (field.tdfPath.startsWith('unit[].deliverySettings.')) {
      const key = field.tdfPath.split('.').pop();
      if (key) {
        for (const index of configurableUnitIndexes) {
          const unitIndex = String(index);
          patch.unit[unitIndex] ||= { deliverySettings: {} };
          patch.unit[unitIndex].deliverySettings[key] = value;
        }
      }
    }
  }

  return patch;
}

function getSettingFields(state: LearnerConfigState) {
  if (!tdfHasLearnerConfigurableFields(state.content)) {
    return [];
  }
  return getLearnerConfigurableFieldsForState(state);
}

function getVisibleTdfs(instance: any) {
  const filtered = instance.filteredTdfsList.get();
  return filtered || instance.allTdfsList.get();
}

function sortUsedTdfsByRecency(tdfs: any[]) {
  return tdfs.sort((a, b) =>
    (b.lastPracticeTimestamp || 0) - (a.lastPracticeTimestamp || 0)
  );
}

function sortUnusedTdfsByName(tdfs: any[]) {
  return tdfs.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, 'en', {
      numeric: true,
      sensitivity: 'base'
    })
  );
}

function splitTdfsByUsage(tdfs: any[]) {
  return {
    used: sortUsedTdfsByRecency(tdfs.filter(tdf => tdf.isUsed)),
    unused: sortUnusedTdfsByName(tdfs.filter(tdf => !tdf.isUsed))
  };
}

function clearLessonProgressStats(tdf: any, affectedTdfIds: Set<string>) {
  if (!affectedTdfIds.has(String(tdf.TDFId))) {
    return tdf;
  }

  return {
    ...tdf,
    isUsed: false,
    hasBeenAttempted: false,
    totalTrials: undefined,
    overallAccuracy: undefined,
    accuracyApplies: undefined,
    totalTimeMinutes: undefined,
    itemsPracticed: undefined,
    lastPracticeTimestamp: undefined,
    lastPracticeDate: undefined,
    totalSessions: undefined
  };
}

function applyProgressResetToDashboardList(list: any[] | false, cacheTdfIds: string[]) {
  if (!Array.isArray(list)) {
    return list;
  }
  const affectedTdfIds = new Set(cacheTdfIds.map((id) => String(id)));
  const nextList = list.map((tdf) => clearLessonProgressStats(tdf, affectedTdfIds));
  const { used, unused } = splitTdfsByUsage(nextList);
  return [...used, ...unused];
}

function displayLabelForTdf(tdf: any) {
  if (currentUserHasRole('admin,teacher')) {
    const fileName = tdf.fileName || 'unknown';
    return `${tdf.displayName} (${fileName} - ${tdf.TDFId})`;
  }
  return tdf.displayName;
}

function configForLessonCard(tdf: any) {
  const templateData = Template.parentData(1) as { learnerConfigState?: LearnerConfigState } | undefined;
  const state = templateData?.learnerConfigState;
  return shouldShowSettingsButton(tdf) && state?.tdfId === tdf.TDFId ? { ...state, location: 'card' } : null;
}

function configForLessonTable(tdf: any) {
  const templateData = Template.parentData(1) as { learnerConfigState?: LearnerConfigState } | undefined;
  const state = templateData?.learnerConfigState;
  return shouldShowSettingsButton(tdf) && state?.tdfId === tdf.TDFId ? { ...state, location: 'table' } : null;
}

function shouldShowSettingsButton(tdf: any): boolean {
  if (currentUserHasRole('admin')) {
    return Boolean(tdf.hasConfigurableSettings);
  }
  return Boolean(tdf.hasLearnerConfigurableSettings);
}

function parseBooleanLike(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function getEffectiveSetSpecValue(tdf: any, key: 'audioInputEnabled' | 'audioPromptMode') {
  const override = getLearnerTdfConfig(String(tdf?.TDFId || ''))?.overrides?.setspec?.[key];
  return override !== undefined ? override : tdf?.[key];
}

const lessonRowHelpers = {
  displayLabel(this: any): string {
    return displayLabelForTdf(this);
  },

  firstContentUnitIconClass(this: any): string {
    switch (this.firstContentUnitType) {
      case 'video':
        return 'fa-play-circle';
      case 'autotutor':
        return 'fa-comments';
      case 'assessment':
        return 'fa-question-circle';
      case 'learning':
        return 'fa-clone';
      case 'sparc':
        return 'fa-sitemap';
      case 'conditionPool':
        return 'fa-random';
      default:
        return '';
    }
  },

  firstContentUnitIconTitle(this: any): string {
    switch (this.firstContentUnitType) {
      case 'video':
        return 'First content unit is a video';
      case 'autotutor':
        return 'First content unit is an AutoTutor';
      case 'assessment':
        return 'First content unit is an assessment session';
      case 'learning':
        return 'First content unit is a learning session';
      case 'sparc':
        return 'First content unit is a SPARC page';
      case 'conditionPool':
        return 'Multiple condition TDFs';
      default:
        return '';
    }
  },

  ttsIconClass(this: any): string {
    return this.hasTTSAPIKey ? 'icon-configured' : 'icon-needs-config';
  },

  srIconClass(this: any): string {
    return this.hasSpeechAPIKey ? 'icon-configured' : 'icon-needs-config';
  },

  showTtsIcon(this: any): boolean {
    const effectiveAudioPromptMode = getEffectiveSetSpecValue(this, 'audioPromptMode');
    if (effectiveAudioPromptMode !== undefined) {
      return String(effectiveAudioPromptMode || '').trim().toLowerCase() !== 'silent';
    }
    return parseBooleanLike(this.enableAudioPromptAndFeedback);
  },

  showSrIcon(this: any): boolean {
    return parseBooleanLike(getEffectiveSetSpecValue(this, 'audioInputEnabled'));
  },

  accuracyDisplay(this: any): string {
    if (!this.isUsed || this.accuracyApplies === false || this.overallAccuracy === null || this.overallAccuracy === undefined) {
      return '-';
    }
    return `${this.overallAccuracy}%`;
  },

  accuracyBarWidth(this: any): string {
    if (!this.isUsed || this.accuracyApplies === false || this.overallAccuracy === null || this.overallAccuracy === undefined) {
      return '0%';
    }
    const value = Math.max(0, Math.min(100, Number(this.overallAccuracy)));
    return `${Number.isFinite(value) ? value : 0}%`;
  },

  itemsPracticedDisplay(this: any): string {
    if (this.itemsPracticedApplies === false) {
      return '-';
    }
    const practiced = this.isUsed ? Number(this.itemsPracticed || 0) : 0;
    const total = Number(this.totalPracticeItems);
    if (!Number.isFinite(total)) {
      return Number.isFinite(practiced) ? String(practiced) : '-';
    }
    return `${Number.isFinite(practiced) ? practiced : 0} / ${total}`;
  },

  accuracyBadgeLabel(this: any): string {
    if (!this.isUsed) {
      return 'New';
    }
    if (this.accuracyApplies === false || this.overallAccuracy === null || this.overallAccuracy === undefined) {
      return 'Used';
    }
    return `${this.overallAccuracy}%`;
  },

  accuracyBadgeClass(this: any): string {
    if (!this.isUsed) {
      return 'bg-secondary';
    }
    return this.accuracyApplies === false || this.overallAccuracy === null || this.overallAccuracy === undefined
      ? 'bg-secondary'
      : 'bg-success';
  },

  showSettingsButton(this: any): boolean {
    return shouldShowSettingsButton(this);
  },
};

Template.learningDashboard.onCreated(function(this: any) {
  this.allTdfsList = new ReactiveVar([]);
  this.filteredTdfsList = new ReactiveVar(false);
  this.searching = new ReactiveVar(false);
  this.isLoading = new ReactiveVar(true);
  this.subscriptions = [];
  this.autoruns = [];
  this.searchDebounceTimer = null;
  this.learnerConfigCloseTimer = null;
  this.learnerConfigAutosaveTimer = null;
  this.learnerConfigSaveRevision = 0;
  this.learnerConfigState = new ReactiveVar(EMPTY_CONFIG_STATE);
});

Template.learningDashboard.helpers({
  isLoading: () => {
    return ((Template.instance() as any) as any).isLoading.get();
  },

  recentUsedTdf: () => {
    return splitTdfsByUsage(getVisibleTdfs(Template.instance())).used[0] || null;
  },

  lessonSummaryText: () => {
    const visible = getVisibleTdfs(Template.instance());
    const { used, unused } = splitTdfsByUsage(visible);
    if (!visible || visible.length === 0) {
      return 'No lessons available';
    }
    return `${visible.length} lessons • ${used.length} in progress • ${unused.length} new`;
  },

  hasTdfs: () => {
    const list = getVisibleTdfs(Template.instance());
    return list && list.length > 0;
  },

  usedTdfsList: () => {
    return splitTdfsByUsage(getVisibleTdfs(Template.instance())).used;
  },

  unusedTdfsList: () => {
    return splitTdfsByUsage(getVisibleTdfs(Template.instance())).unused;
  },

  hasUsedTdfs: () => {
    return splitTdfsByUsage(getVisibleTdfs(Template.instance())).used.length > 0;
  },

  hasUnusedTdfs: () => {
    return splitTdfsByUsage(getVisibleTdfs(Template.instance())).unused.length > 0;
  },

  learnerConfigState: () => {
    return ((Template.instance() as any) as any).learnerConfigState.get();
  },

  loadingRows: () => {
    return [0, 1, 2];
  },

  loadingRowsShort: () => {
    return [0, 1];
  },

  displayLabel(this: any): string {
    return displayLabelForTdf(this);
  },

  accuracyDisplay(this: any): string {
    return lessonRowHelpers.accuracyDisplay.call(this);
  },

  accuracyBarWidth(this: any): string {
    return lessonRowHelpers.accuracyBarWidth.call(this);
  },

  itemsPracticedDisplay(this: any): string {
    return lessonRowHelpers.itemsPracticedDisplay.call(this);
  },

});

Template.learningDashboardLessonTable.helpers({
  ...lessonRowHelpers,

  configForTableRow() {
    return configForLessonTable(this);
  },
});

Template.learningDashboardLessonCards.helpers({
  ...lessonRowHelpers,

  configForCardRow() {
    return configForLessonCard(this);
  },
});

Template.learnerTdfConfigPanel.helpers({
  learnerConfigPanelClass() {
    return this.closing ? 'learner-config-panel is-closing' : 'learner-config-panel';
  },

  learnerConfigSaveStatus() {
    if (this.saving) return 'Saving...';
    if (this.dirty) return 'Waiting to save...';
    return 'Changes save automatically';
  },

  isConfigStep(step: string) {
    return this.step === step;
  },

  selectedConfigLabel() {
    return 'Lesson settings';
  },

  settingFields() {
    const sliderDisplayValues = getLearnerConfigSliderDisplayValues();
    return getSettingFields(this as LearnerConfigState).slice().sort((left, right) =>
      left.label.localeCompare(right.label, undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    ).map((field) => {
      const effectiveValue = getEffectiveForField(field, this as LearnerConfigState);
      const defaultValue = getDefaultForField(field, this as LearnerConfigState);
      const value = field.control === 'select'
        ? String(effectiveValue)
        : field.control === 'slider'
          ? toFieldInputValue(field, effectiveValue)
          : effectiveValue;
      const defaultInputValue = field.control === 'select'
        ? String(defaultValue)
        : field.control === 'slider'
          ? toFieldInputValue(field, defaultValue)
          : defaultValue;
      const displayValue = field.control === 'slider'
        ? sliderDisplayValues[getLearnerConfigSliderDisplayKey(this.tdfId, field.id)]
          || formatFieldDisplayValue(field, effectiveValue)
        : field.unit
          ? `${value} ${field.unit}`
          : String(value);
      const displaySuffix = field.displaySuffix || field.unit;
      const displayScale = getFieldDisplayScale(field);
      return {
        ...field,
        value,
        defaultInputValue,
        displayValue,
        displaySuffix,
        checked: Boolean(value),
        options: field.options?.map((option) => ({
          ...option,
          selected: option.value === String(value)
        })),
        customized: isFieldCustomized(field, this as LearnerConfigState),
        inputMax: field.max === undefined ? undefined : toFieldInputValue(field, field.max),
        inputMin: field.min === undefined ? undefined : toFieldInputValue(field, field.min),
        inputStep: field.step === undefined ? undefined : toFieldInputValue(field, field.step),
        displayScale,
        isToggle: field.control === 'toggle',
        isSelect: field.control === 'select',
        isSlider: field.control === 'slider',
        isNumber: field.control === 'number',
        isText: field.control === 'text'
      };
    });
  },

  hasSettingFields() {
    return getSettingFields(this as LearnerConfigState).length > 0;
  },

  currentUserIsAdmin() {
    return currentUserHasRole('admin');
  },

  resetProgressButtonLabel() {
    if (this.resettingProgress) return 'Resetting...';
    return this.resetConfirming ? 'Confirm reset' : 'Reset test progress';
  },
});

Template.learningDashboard.events({
  'input #learningDashboardSearch': function(event: any, instance: any) {
    const search = event.target.value;

    // Debounce search to avoid excessive filtering on every keystroke
    if (instance.searchDebounceTimer) {
      clearTimeout(instance.searchDebounceTimer);
    }

    instance.searchDebounceTimer = setTimeout(() => {
      if (search.length > 0) {
        instance.searching.set(true);
      } else {
        instance.searching.set(false);
        instance.filteredTdfsList.set(false);
        return;
      }

      const allTdfs = instance.allTdfsList.get();
      const searchLower = search.toLowerCase();

      // Single pass filter for both name and tags
      const filteredTdfs = allTdfs.filter((tdf: any) => {
        // Check display name
        if (tdf.displayName.toLowerCase().includes(searchLower)) {
          return true;
        }
        // Check tags
        if (tdf.tags && tdf.tags.some((tag: any) => tag.toLowerCase().includes(searchLower))) {
          return true;
        }
        return false;
      });

      instance.filteredTdfsList.set(filteredTdfs);
    }, 200); // 200ms debounce
  },

  'click .continue-lesson': async function(event: any) {
    event.preventDefault();
    unlockAppleMobileAudioForUserGesture();
    const target = $(event.currentTarget);
    await safeSelectTdf(
      target.data('tdfid'),
      target.data('lessonname'),
      target.data('currentstimulisetid'),
      null,
      null,
      'Continue from practice menu',
      target.data('ismultitdf'),
      null,
    );
  },

  'click .start-lesson': async function(event: any) {
    event.preventDefault();
    unlockAppleMobileAudioForUserGesture();
    const target = $(event.currentTarget);
    await safeSelectTdf(
      target.data('tdfid'),
      target.data('lessonname'),
      target.data('currentstimulisetid'),
      null,
      null,
      'Start from practice menu',
      target.data('ismultitdf'),
      null,
    );
  },

  'click .start-condition-root': async function(this: any, event: any) {
    event.preventDefault();
    unlockAppleMobileAudioForUserGesture();
    const row = $(event.currentTarget).closest('tr, .learning-dashboard-card');
    const selector = row.find('.condition-tdf-selector');
    const selectedId = selector.val() as string;
    const rootId = selector.data('roottdfid') as string;
    if (!selectedId) return;

    const isExplicitCondition = selectedId !== rootId;
    Session.set('preselectedConditionTdfId', isExplicitCondition ? selectedId : null);
    Session.set('tdfFamilyRootTdfId', rootId);

    // isOwnerLaunch = true: owner's session does not increment conditionCounts
    await safeSelectTdf(
      rootId,
      this.displayName || selectedId,
      this.currentStimuliSetId,
      null,
      null,
      'Owner condition launch from practice menu',
      this.isMultiTdf,
      null,
      false,
      true, // isOwnerLaunch
    );
  },

  'click .configure-lesson': async function(event: any, instance: any) {
    event.preventDefault();
    const target = $(event.currentTarget);
    const tdfId = String(target.data('tdfid') || '');
    const existingState = instance.learnerConfigState.get() as LearnerConfigState;
    if (existingState.tdfId === tdfId) {
      closeLearnerConfigPanel(instance);
      return;
    }

    clearLearnerConfigSliderDisplayValues(existingState.tdfId);
    clearLearnerConfigCloseTimer(instance);
    instance.learnerConfigState.set({
      ...EMPTY_CONFIG_STATE,
      tdfId,
      loading: true
    });

    try {
      const tdfDoc = await meteorCallAsync('getTdfById', tdfId) as any;
      const content = tdfDoc?.content;
      normalizeTutorUnits(content);
      if (!Array.isArray(content?.tdfs?.tutor?.unit)) {
        instance.learnerConfigState.set({
          ...EMPTY_CONFIG_STATE,
          tdfId,
          error: 'Configuration is available after choosing a concrete lesson condition.'
        });
        return;
      }
      if (!tdfHasConfigurableRuntime(content)) {
        instance.learnerConfigState.set({
          ...EMPTY_CONFIG_STATE,
          tdfId,
          error: 'Settings are available for lessons with configurable runtime units.'
        });
        return;
      }
      instance.learnerConfigState.set({
        ...EMPTY_CONFIG_STATE,
        tdfId,
        content,
        step: 'settings',
        scope: 'setspec',
        family: 'deliverySettings'
      });
    } catch (error) {
      clientConsole(1, '[Dashboard Config] Failed to load full TDF:', error);
      instance.learnerConfigState.set({
        ...EMPTY_CONFIG_STATE,
        tdfId,
        error: 'Unable to load lesson settings. Please try again.'
      });
    }
  },

  'click .learner-config-reset-field': function(event: any, instance: any) {
    const button = $(event.currentTarget);
    const fieldId = button.data('fieldid');
    const container = button.closest('.learner-config-panel');
    const input = container.find(`[data-config-field="${fieldId}"]`);
    if (!input.length) return;
    const defaultValue = button.data('defaultvalue');
    if ((input.get(0) as HTMLInputElement).type === 'checkbox') {
      (input.get(0) as HTMLInputElement).checked = defaultValue === true || defaultValue === 'true';
    } else {
      input.val(defaultValue);
    }
    const valueTarget = container.find(`[data-config-value-for="${fieldId}"]`);
    if (valueTarget.length) {
      const suffix = input.data('value-suffix') || '';
      const state = instance.learnerConfigState.get() as LearnerConfigState;
      setLearnerConfigSliderDisplayValue(state.tdfId, fieldId, appendValueSuffix(input.val(), suffix));
    }
    scheduleLearnerConfigAutosave(instance, button.closest('.learner-config-form'));
  },

  'change [data-config-field]': function(_event: any, instance: any) {
    if ($(_event.currentTarget).hasClass('learner-config-slider')) {
      return;
    }
    scheduleLearnerConfigAutosave(instance, $(_event.currentTarget).closest('.learner-config-form'));
  },

  'input [data-config-field]': function(_event: any, instance: any) {
    if ($(_event.currentTarget).hasClass('learner-config-slider')) {
      return;
    }
    scheduleLearnerConfigAutosave(instance, $(_event.currentTarget).closest('.learner-config-form'));
  },

  'input .learner-config-slider': function(event: any, instance: any) {
    const input = $(event.currentTarget);
    const fieldId = input.data('config-field');
    const suffix = input.data('value-suffix') || '';
    const state = instance.learnerConfigState.get() as LearnerConfigState;
    setLearnerConfigSliderDisplayValue(state.tdfId, fieldId, appendValueSuffix(input.val(), suffix));
    scheduleLearnerConfigAutosave(instance, input.closest('.learner-config-form'));
  },

  'click .learner-config-reset-progress': async function(event: any, instance: any) {
    event.preventDefault();
    const current = instance.learnerConfigState.get() as LearnerConfigState;
    if (!current.tdfId || current.resettingProgress) {
      return;
    }

    if (!current.resetConfirming) {
      instance.learnerConfigState.set({ ...current, resetConfirming: true, error: null });
      return;
    }

    instance.learnerConfigState.set({ ...current, resettingProgress: true, error: null });
    try {
      const result = await meteorCallAsync('resetAdminLessonProgress', current.tdfId) as {
        cacheTdfIds?: string[];
      };
      if (!Array.isArray(result?.cacheTdfIds) || result.cacheTdfIds.length === 0) {
        throw new Error('Reset completed without a practice refresh scope');
      }
      const cacheTdfIds = result.cacheTdfIds;
      instance.allTdfsList.set(applyProgressResetToDashboardList(instance.allTdfsList.get(), cacheTdfIds));
      const filteredList = instance.filteredTdfsList.get();
      if (Array.isArray(filteredList)) {
        instance.filteredTdfsList.set(applyProgressResetToDashboardList(filteredList, cacheTdfIds));
      }
      const latest = instance.learnerConfigState.get() as LearnerConfigState;
      instance.learnerConfigState.set({
        ...latest,
        resetConfirming: false,
        resettingProgress: false,
        error: null
      });
      Session.set('uiMessage', {
        text: 'Practice history and experiment state were reset for this lesson.',
        variant: 'success',
      });
    } catch (error: any) {
      clientConsole(1, '[Dashboard Config] Failed to reset admin lesson progress:', error);
      const latest = instance.learnerConfigState.get() as LearnerConfigState;
      instance.learnerConfigState.set({
        ...latest,
        resetConfirming: false,
        resettingProgress: false,
        error: error?.reason || error?.message || 'Unable to reset lesson progress.'
      });
    }
  },

  'click .learner-config-reset-progress-cancel': function(event: any, instance: any) {
    event.preventDefault();
    const current = instance.learnerConfigState.get() as LearnerConfigState;
    if (!current.tdfId || current.resettingProgress) {
      return;
    }
    instance.learnerConfigState.set({ ...current, resetConfirming: false });
  },

  'submit .learner-config-form': function(event: any) {
    event.preventDefault();
  },
});

Template.learningDashboard.rendered = async function(this: any) {
  const instance = this;
  if (instance._dashboardSubscribed) {
    return;
  }
  instance._dashboardSubscribed = true;
  const dashboardRenderStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let studentID = Session.get('curStudentID') || Meteor.userId();
  let renderedLocalSnapshot = false;
  const tryRenderLocalSnapshot = (userId: string | null | undefined) => {
    if (!userId || renderedLocalSnapshot) {
      return;
    }
    try {
      const localSnapshot = loadLocalPracticeDashboardSnapshot(userId);
      if (localSnapshot) {
        applyPracticeDashboardSnapshot(instance, localSnapshot);
        renderedLocalSnapshot = true;
        const firstLayoutPaintMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - dashboardRenderStart;
        (window as any).__mofactsDashboardLocalPaintMs = firstLayoutPaintMs;
        (window as any).__mofactsDashboardLocalSnapshotLessons = localSnapshot.lessons.length;
        clientConsole(2, '[Dashboard] Rendered local practice snapshot', {
          lessons: localSnapshot.lessons.length,
          ageMs: Date.now() - Number(localSnapshot.generatedAt || 0),
          firstLayoutPaintMs,
        });
      }
    } catch (error) {
      clientConsole(1, '[Dashboard] Local practice snapshot could not be used:', error);
    }
  };

  tryRenderLocalSnapshot(studentID);

  // sessionCleanUp() removed - it's already called in selectTdf() at the right time
  // Calling it here causes problems because rendered() can fire multiple times
  // due to reactivity, clearing session variables while card.js is using them
  await checkUserSession();
  Session.set('showSpeechAPISetup', true);

  studentID = Session.get('curStudentID') || Meteor.userId();
  if (!studentID) {
    throw new Error('[LearningDashboard] Cannot render practice dashboard without an authenticated user id');
  }

  tryRenderLocalSnapshot(studentID);

  meteorCallAsync('getPracticeDashboardSnapshot')
    .then((snapshot) => {
      const practiceSnapshot = snapshot as PracticeDashboardSnapshot;
      if (practiceSnapshot.userId !== studentID) {
        throw new Error('[LearningDashboard] Practice dashboard snapshot was returned for a different user');
      }
      saveLocalPracticeDashboardSnapshot(practiceSnapshot);
      applyPracticeDashboardSnapshot(instance, practiceSnapshot);
      const backgroundSyncBytes = JSON.stringify(practiceSnapshot).length;
      (window as any).__mofactsDashboardSyncBytes = backgroundSyncBytes;
      (window as any).__mofactsDashboardSyncLessonCount = practiceSnapshot.lessons.length;
      clientConsole(2, '[Dashboard] Applied authoritative practice snapshot', {
        lessons: practiceSnapshot.lessons.length,
        bytes: backgroundSyncBytes,
      });
    })
    .catch((error) => {
      clientConsole(1, '[Dashboard] Failed to sync authoritative practice snapshot:', error);
      if (instance.isLoading.get()) {
        instance.isLoading.set(false);
      }
    });

  // Ensure body styles from offcanvas are cleared before fade-in
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
};

Template.learningDashboard.onDestroyed(function(this: any) {
  // Clean up autoruns
  this.autoruns.forEach((ar: any) => ar.stop());

  // Clean up subscriptions
  this.subscriptions.forEach((sub: any) => sub.stop());

  // Clear search debounce timer
  if (this.searchDebounceTimer) {
    clearTimeout(this.searchDebounceTimer);
  }

  clearLearnerConfigCloseTimer(this);
  clearLearnerConfigAutosaveTimer(this);
});

function diagnoseAudioStartupFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
    return 'Audio features require a secure connection. Use https:// or http://localhost instead of a plain-HTTP LAN address.';
  }
  if (message.includes('getUserMedia is not implemented')) {
    return 'This browser does not support microphone access. Use a modern browser over HTTPS or localhost.';
  }
  if (message.includes('timed out')) {
    return 'Audio startup timed out. Check your network connection and try again.';
  }
  return `Audio startup failed: ${message}`;
}

function handleLaunchAudioStartupFailure(error: unknown) {
  const userMessage = diagnoseAudioStartupFailure(error);
  clientConsole(1, '[LearningDashboard] Audio startup failed before lesson launch:', error);
  finishLaunchLoading('audio-startup-failed');
  Session.set('uiMessage', {
    text: userMessage,
    variant: 'danger',
  });
}

// Scenario 2: Warmup audio if TDF has embedded keys (before navigating to card)
async function checkAndWarmupAudioIfNeeded() {
  const currentTdfFile = Session.get('currentTdfFile');
  if (!currentTdfFile) {
    
    return;
  }

  const user = Meteor.user();
  if (!user) {
    
    return;
  }

  let userPersonalKeys = { hasSR: false, hasTTS: false };
  try {
    markLaunchLoadingTiming('hasUserPersonalKeys:start');
    userPersonalKeys = await (Meteor as any).callAsync('hasUserPersonalKeys', Session.get('currentTdfId'));
    markLaunchLoadingTiming('hasUserPersonalKeys:complete', userPersonalKeys);
  } catch (error) {
    clientConsole(1, '[LearningDashboard] Could not determine personal audio key availability during launch prep:', error);
  }

  const audioStartupUser = {
    ...user,
    speechAPIKey: userPersonalKeys.hasSR ? '__configured__' : user?.speechAPIKey,
    ttsAPIKey: userPersonalKeys.hasTTS ? '__configured__' : user?.ttsAPIKey,
  };
  Session.set('speechAPIKeyConfigured', userPersonalKeys.hasSR === true);
  Session.set('ttsAPIKeyConfigured', userPersonalKeys.hasTTS === true);

  const audioPreparationPlan = getAudioLaunchPreparationPlan(currentTdfFile, audioStartupUser);
  if (!audioPreparationPlan.requiresPreparation) {
    return;
  }

  setLaunchLoadingMessage('Preparing audio features...');
  markLaunchLoadingTiming('audioWarmup:start', audioPreparationPlan);
  await prepareAudioForLaunchIfNeeded(currentTdfFile, audioStartupUser);
  markLaunchLoadingTiming('audioWarmup:complete');
}

// Actual logic for selecting and starting a TDF
async function safeSelectTdf(...args: Parameters<typeof selectTdf>) {
  try {
    await selectTdf(...args);
  } catch (error) {
    finishLaunchLoading('practice-launch-failed');
    clientConsole(1, '[LearningDashboard] Lesson launch failed:', error);
    Session.set('uiMessage', {
      text: 'Lesson did not start correctly. Please try again from the practice menu.',
      variant: 'danger',
    });
  }
}

async function selectTdf(currentTdfId: any, lessonName: any, currentStimuliSetId: any, ignoreOutOfGrammarResponses: any,
  speechOutOfGrammarFeedback: any, how: any, isMultiTdf: any, setspec: any, isExperiment = false, isOwnerLaunch = false) {

  startLaunchLoading('Preparing lesson...', 'practiceMenu');
  markLaunchLoadingTiming('practiceMenuClick', { currentTdfId, lessonName, how, isMultiTdf });
  const audioPromptFeedbackView = getAudioPromptFeedbackView();

  // make sure session variables are cleared from previous tests
  sessionCleanUp();
  if (isOwnerLaunch) Session.set('ownerDashboardLaunch', true);
  Session.set('uiMessage', null);

  let preparedLaunch;
  try {
    preparedLaunch = await prepareLessonLaunchContext({
      currentTdfId,
      currentStimuliSetId,
      ignoreOutOfGrammarResponses,
      speechOutOfGrammarFeedback,
      source: 'practiceMenu.selectTdf',
      applyContent: (content) => applyDashboardLearnerConfig(content, String(currentTdfId)),
      setLaunchLoadingMessage,
      markLaunchLoadingTiming,
    });
  } catch (error) {
    clientConsole(1, '[LearningDashboard] Failed to load launch-ready TDF:', currentTdfId, error);
    finishLaunchLoading('tdf-subscription-missing-content');
    alert('Unable to load the selected lesson. Please try again or contact support.');
    return;
  }

  const curTdfContent = preparedLaunch.content;
  const curTdfTips = curTdfContent.tdfs.tutor.setspec.tips;
  Session.set('curTdfTips', curTdfTips);
  const { launchProgress, unitCount } = preparedLaunch;

  if (launchProgress.moduleCompleted) {
    clientConsole(2, '[LearningDashboard] Blocking lesson relaunch because persisted state is completed', {
      currentTdfId,
      unitCount,
      persistedUnitNumber: launchProgress.persistedUnitNumber,
      lastUnitCompleted: launchProgress.lastUnitCompleted,
    });
    Session.set('uiMessage', {
      text: 'This lesson has already been completed and cannot be reopened.',
      variant: 'warning',
    });
    finishLaunchLoading('module-completed');
    return;
  }

  // Record state to restore when we return to this page
  let audioPromptMode;
  let audioInputEnabled;
  let audioPromptFeedbackSpeakingRate;
  let audioPromptQuestionSpeakingRate;
  let audioPromptVoice;
  let audioInputSensitivity;
  let audioPromptQuestionVolume;
  let audioPromptFeedbackVolume;
  let audioPromptFeedbackVoice;
  const user = Meteor.user();
  const audioSettings = user?.audioSettings || {};

  if (isExperiment) {
    audioPromptMode = setspec.audioPromptMode || 'silent';
    audioInputEnabled = setspec.audioInputEnabled || false;
    audioPromptFeedbackSpeakingRate = setspec.audioPromptFeedbackSpeakingRate || 1;
    audioPromptQuestionSpeakingRate = setspec.audioPromptQuestionSpeakingRate || 1;
    audioPromptVoice = setspec.audioPromptVoice || 'en-US-Standard-A';
    audioInputSensitivity = audioSettings.audioInputSensitivity;
    audioPromptQuestionVolume = setspec.audioPromptQuestionVolume || 0;
    audioPromptFeedbackVolume = setspec.audioPromptFeedbackVolume || 0;
    audioPromptFeedbackVoice = setspec.audioPromptFeedbackVoice || 'en-US-Standard-A';
  } else {
    // Load from user's audioSettings if available, otherwise use defaults
    audioPromptMode = learnerConfigHasSetSpecAudioOverride(String(currentTdfId), 'audioPromptMode')
      ? curTdfContent.tdfs.tutor.setspec.audioPromptMode || 'silent'
      : audioSettings.audioPromptMode || 'silent';
    audioInputEnabled = audioSettings.audioInputMode || false;
    
    audioPromptFeedbackSpeakingRate = audioSettings.audioPromptFeedbackSpeakingRate || 1;
    audioPromptQuestionSpeakingRate = audioSettings.audioPromptQuestionSpeakingRate || 1;
    audioPromptVoice = audioSettings.audioPromptVoice || 'en-US-Standard-A';
    audioInputSensitivity = learnerConfigHasSetSpecAudioOverride(String(currentTdfId), 'audioInputSensitivity')
      ? curTdfContent.tdfs.tutor.setspec.audioInputSensitivity
      : audioSettings.audioInputSensitivity;
    audioPromptQuestionVolume = audioSettings.audioPromptQuestionVolume || 0;
    audioPromptFeedbackVolume = audioSettings.audioPromptFeedbackVolume || 0;
    audioPromptFeedbackVoice = audioSettings.audioPromptFeedbackVoice || 'en-US-Standard-A';
  }

  setAudioPromptMode(audioPromptMode);
  setAudioPromptFeedbackView(audioPromptMode);
  setAudioEnabledView(audioInputEnabled);
  setAudioPromptFeedbackSpeakingRateView(audioPromptFeedbackSpeakingRate);
  setAudioPromptQuestionSpeakingRateView(audioPromptQuestionSpeakingRate);
  setAudioPromptVoiceView(audioPromptVoice);
  setAudioInputSensitivityView(audioInputSensitivity);
  setAudioPromptQuestionVolume(audioPromptQuestionVolume);
  setAudioPromptFeedbackVolume(audioPromptFeedbackVolume);
  setAudioPromptFeedbackVoiceView(audioPromptFeedbackVoice);

  // Set values for card.js to use later, in experiment mode we'll default to the values in the tdf
  setAudioPromptFeedbackSpeakingRate(audioPromptFeedbackSpeakingRate);
  setAudioPromptQuestionSpeakingRate(audioPromptQuestionSpeakingRate);
  setAudioPromptVoice(audioPromptVoice);
  setAudioPromptFeedbackVoice(audioPromptFeedbackVoice);
  setAudioInputSensitivity(audioInputSensitivity);

  // Check to see if the user has turned on audio prompt.
  // If so and if the tdf has it enabled then turn on, otherwise we won't do anything
  const userAudioPromptFeedbackToggled = ((audioPromptFeedbackView as any) == 'feedback') || ((audioPromptFeedbackView as any) == 'all') || ((audioPromptFeedbackView as any) == 'question');
  const tdfAudioPromptFeedbackEnabled = !!curTdfContent.tdfs.tutor.setspec.enableAudioPromptAndFeedback &&
    curTdfContent.tdfs.tutor.setspec.enableAudioPromptAndFeedback == 'true';
  let audioPromptFeedbackEnabled = undefined;

  if (Session.get('experimentTarget')) {
    audioPromptFeedbackEnabled = tdfAudioPromptFeedbackEnabled;
  } else {
    audioPromptFeedbackEnabled = tdfAudioPromptFeedbackEnabled && userAudioPromptFeedbackToggled;
  }
  Session.set('enableAudioPromptAndFeedback', audioPromptFeedbackEnabled);

  // If we're in experiment mode and the tdf file defines whether audio input is enabled
  // forcibly use that, otherwise go with whatever the user set the audio input toggle to
  const userAudioToggled = audioInputEnabled;
  const tdfAudioEnabled = curTdfContent.tdfs.tutor.setspec.audioInputEnabled ?
    curTdfContent.tdfs.tutor.setspec.audioInputEnabled == 'true' : false;
  const audioEnabled = !Session.get('experimentTarget') ? (tdfAudioEnabled && userAudioToggled) : tdfAudioEnabled;
  setAudioEnabled(audioEnabled);

  let continueToCard = true;

  // Go directly to the card session - which will decide whether or
  // not to show instruction
  if (continueToCard) {
    // Scenario 2: Warmup audio if TDF has embedded keys (before navigating to card)
    try {
      await checkAndWarmupAudioIfNeeded();
    } catch (error) {
      handleLaunchAudioStartupFailure(error);
      return;
    }

    if (isMultiTdf) {
      await navigateForMultiTdf(launchProgress.intent);
    } else {
      setLaunchLoadingMessage('Loading content...');
      setCardEntryIntent(launchProgress.intent, {
        source: 'practiceMenu.selectTdf',
      });
      FlowRouter.go('/card');
    }
  }
}

async function navigateForMultiTdf(entryIntent: CardEntryIntent = CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY) {
  setLaunchLoadingMessage('Restoring progress...');
  markLaunchLoadingTiming('getExperimentState:start', { source: 'navigateForMultiTdf' });
  const experimentState: any = await getExperimentState();
  markLaunchLoadingTiming('getExperimentState:complete', { source: 'navigateForMultiTdf' });
  const lastUnitCompleted = experimentState.lastUnitCompleted || -1;
  const currentUnitNumber = typeof experimentState.currentUnitNumber === 'number'
    ? experimentState.currentUnitNumber
    : -1;
  let unitLocked = false;

  // If we haven't finished the unit yet, we may want to lock into the current unit
  // so the user can't mess up the data
  if (currentUnitNumber > lastUnitCompleted) {
    const unitList = Session.get('currentTdfFile')?.tdfs?.tutor?.unit;
    const curUnit = Array.isArray(unitList) ? unitList[currentUnitNumber] : null;
    unitLocked = shouldLockMultiTdfLaunchToCurrentUnit(curUnit);
  }
  // Only show selection if we're in a unit where it doesn't matter (infinite learning sessions)
  if (unitLocked) {
    setLaunchLoadingMessage('Loading content...');
    setCardEntryIntent(entryIntent, {
      source: 'practiceMenu.navigateForMultiTdf',
    });
    FlowRouter.go('/card');
  } else {
    finishLaunchLoading('multi-tdf-select');
    FlowRouter.go('/multiTdfSelect');
  }
}








