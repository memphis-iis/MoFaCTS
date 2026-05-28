import {ReactiveVar} from 'meteor/reactive-var';
import { Tracker } from 'meteor/tracker';
import './learningDashboard.html';
import './learningDashboard.css';
import {getExperimentState} from '../experiment/svelte/services/experimentState';
import {meteorCallAsync, clientConsole} from '../..';
/** @typedef {import('../../../server/methods/dashboardCacheMethods.contracts').InitializeDashboardCacheResult} InitializeDashboardCacheResult */
/** @typedef {import('../../../server/methods/dashboardCacheMethods.contracts').EnsureDashboardCacheCurrentResult} EnsureDashboardCacheCurrentResult */
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
import { applyFallbackProgressSignals, shouldUseProgressSignalFallback } from './progressSignals';
import { passesDashboardEntitlement } from './dashboardEntitlement';
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
declare const Tdfs: any;
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

const DASHBOARD_CACHE_VERSION = 3;
const LEARNER_CONFIG_CLOSE_FALLBACK_MS = 200;
const LEARNER_CONFIG_AUTOSAVE_DELAY_MS = 500;
const LEARNER_CONFIG_SLIDER_DISPLAY_SESSION_KEY = 'learnerConfigSliderDisplayValues';

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
  const transition = window.getComputedStyle(document.documentElement).getPropertyValue('--transition-smooth');
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
  return unitType === 'learning' || unitType === 'autotutor';
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

function getConditionRefs(setspec: any) {
  const refs = new Set<string>();
  const conditionFileNames = Array.isArray(setspec?.condition) ? setspec.condition : [];
  const conditionTdfIds = Array.isArray(setspec?.conditionTdfIds) ? setspec.conditionTdfIds : [];
  for (const fileName of conditionFileNames) {
    if (typeof fileName === 'string' && fileName.trim()) refs.add(fileName.trim());
  }
  for (const tdfId of conditionTdfIds) {
    if (typeof tdfId === 'string' && tdfId.trim()) refs.add(tdfId.trim());
  }
  return Array.from(refs);
}

function tdfFamilyHasConfigurableRuntime(tdfObject: any, tdfsById: Map<string, any>, tdfsByFileName: Map<string, any>) {
  if (tdfHasConfigurableRuntime(tdfObject)) {
    return true;
  }

  const refs = getConditionRefs(tdfObject?.tdfs?.tutor?.setspec);
  return refs.some((ref) => {
    const child = tdfsById.get(ref) || tdfsByFileName.get(ref);
    return tdfHasConfigurableRuntime(child?.content);
  });
}

function tdfFamilyHasLearnerConfigurableFields(tdfObject: any, tdfsById: Map<string, any>, tdfsByFileName: Map<string, any>) {
  if (tdfHasLearnerConfigurableFields(tdfObject)) {
    return true;
  }

  const refs = getConditionRefs(tdfObject?.tdfs?.tutor?.setspec);
  return refs.some((ref) => {
    const child = tdfsById.get(ref) || tdfsByFileName.get(ref);
    return tdfHasLearnerConfigurableFields(child?.content);
  });
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

function expandClusterToken(token: string, tdfLabel: string): number[] {
  const value = token.trim();
  if (!value) {
    return [];
  }
  if (!value.includes('-')) {
    const item = Number(value);
    if (!Number.isInteger(item) || item < 0) {
      throw new Error(`[LearningDashboard] Invalid clusterlist item "${value}" in ${tdfLabel}`);
    }
    return [item];
  }

  const [startRaw, endRaw, extra] = value.split('-');
  if (extra !== undefined) {
    throw new Error(`[LearningDashboard] Invalid clusterlist range "${value}" in ${tdfLabel}`);
  }
  const start = Number(startRaw);
  const end = Number(endRaw);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
    throw new Error(`[LearningDashboard] Invalid clusterlist range "${value}" in ${tdfLabel}`);
  }

  const items: number[] = [];
  for (let item = start; item <= end; item += 1) {
    items.push(item);
  }
  return items;
}

function addClusterListItems(totalItems: Set<number>, clusterList: unknown, tdfLabel: string) {
  if (clusterList === undefined || clusterList === null || String(clusterList).trim() === '') {
    return;
  }
  const tokens = String(clusterList).trim().split(/\s+/);
  for (const token of tokens) {
    for (const item of expandClusterToken(token, tdfLabel)) {
      totalItems.add(item);
    }
  }
}

function getLearningSessionClusterList(unit: any): unknown {
  return unit?.learningsession?.clusterlist;
}

function isConditionRootTdf(tdfContent: any): boolean {
  return Array.isArray(tdfContent?.tdfs?.tutor?.setspec?.condition);
}

function countTotalPracticeItems(tdfContent: any, tdfLabel: string): number | null {
  const units = tdfContent?.tdfs?.tutor?.unit;
  if (!Array.isArray(units)) {
    if (isConditionRootTdf(tdfContent)) {
      return null;
    }
    throw new Error(`[LearningDashboard] TDF "${tdfLabel}" is missing tdfs.tutor.unit; cannot report total practice items`);
  }

  const totalItems = new Set<number>();
  for (const unit of units) {
    if (!unit?.learningsession) {
      continue;
    }
    addClusterListItems(totalItems, getLearningSessionClusterList(unit), tdfLabel);
  }
  return totalItems.size;
}

function configForLessonCard(tdf: any) {
  const templateData = Template.parentData(1) as { learnerConfigState?: LearnerConfigState } | undefined;
  const state = templateData?.learnerConfigState;
  return tdf.hasConfigurableSettings && state?.tdfId === tdf.TDFId ? { ...state, location: 'card' } : null;
}

function configForLessonTable(tdf: any) {
  const templateData = Template.parentData(1) as { learnerConfigState?: LearnerConfigState } | undefined;
  const state = templateData?.learnerConfigState;
  return tdf.hasConfigurableSettings && state?.tdfId === tdf.TDFId ? { ...state, location: 'table' } : null;
}

const lessonRowHelpers = {
  displayLabel(this: any): string {
    return displayLabelForTdf(this);
  },

  ttsIconClass(this: any): string {
    return this.hasTTSAPIKey ? 'icon-configured' : 'icon-needs-config';
  },

  srIconClass(this: any): string {
    return this.hasSpeechAPIKey ? 'icon-configured' : 'icon-needs-config';
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
      throw new Error(`[LearningDashboard] Missing totalPracticeItems for TDF "${this.TDFId}"`);
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
    const tdfId = target.data('tdfid');
    const lessonName = target.data('lessonname');

    // Get TDF info from Tdfs collection
    const tdf = Tdfs.findOne({_id: tdfId});
    if (tdf) {
      const setspec = tdf.content.tdfs.tutor.setspec;
      await safeSelectTdf(
        tdfId,
        lessonName,
        tdf.stimuliSetId,
        setspec.speechIgnoreOutOfGrammarResponses === 'true',
        setspec.speechOutOfGrammarFeedback || 'Response not in answer set',
        'Continue from practice menu',
        tdf.content.isMultiTdf,
        setspec,
      );
    }
  },

  'click .start-lesson': async function(event: any) {
    event.preventDefault();
    unlockAppleMobileAudioForUserGesture();
    const target = $(event.currentTarget);
    await safeSelectTdf(
      target.data('tdfid'),
      target.data('lessonname'),
      target.data('currentstimulisetid'),
      target.data('ignoreoutofgrammarresponses'),
      target.data('speechoutofgrammarfeedback'),
      'Start from practice menu',
      target.data('ismultitdf'),
      null,
    );
  },

  'click .start-condition-root': async function(event: any) {
    event.preventDefault();
    unlockAppleMobileAudioForUserGesture();
    const row = $(event.currentTarget).closest('tr, .learning-dashboard-card');
    const selector = row.find('.condition-tdf-selector');
    const selectedId = selector.val() as string;
    const rootId = selector.data('roottdfid') as string;
    if (!selectedId) return;

    const isExplicitCondition = selectedId !== rootId;
    const tdfDoc = Tdfs.findOne({ _id: isExplicitCondition ? rootId : selectedId });
    if (!tdfDoc) return;
    const setspec = tdfDoc.content?.tdfs?.tutor?.setspec || {};
    Session.set('preselectedConditionTdfId', isExplicitCondition ? selectedId : null);
    Session.set('tdfFamilyRootTdfId', rootId);

    // isOwnerLaunch = true: owner's session does not increment conditionCounts
    await safeSelectTdf(
      rootId,
      setspec.lessonname || tdfDoc.content?.fileName || selectedId,
      tdfDoc.stimuliSetId,
      setspec.speechIgnoreOutOfGrammarResponses === 'true',
      setspec.speechOutOfGrammarFeedback || 'Response not in answer set',
      'Owner condition launch from practice menu',
      tdfDoc.content?.isMultiTdf,
      setspec,
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
  // sessionCleanUp() removed - it's already called in selectTdf() at the right time
  // Calling it here causes problems because rendered() can fire multiple times
  // due to reactivity, clearing session variables while card.js is using them
  await checkUserSession();
  Session.set('showSpeechAPISetup', true);

  const studentID = Session.get('curStudentID') || Meteor.userId();
  // Subscribe to lightweight TDF listing before reading collections
  const subs = [
    Meteor.subscribe('dashboardTdfsListing'),
  ];
  instance.subscriptions.push(...subs);

  await new Promise<void>((resolve) => {
    const handle = Tracker.autorun(() => {
      const ready = subs.every((sub) => sub && sub.ready());
      if (ready) {
        handle.stop();
        resolve();
      }
    });
  });

  // Get all TDFs the user can access with field projection
  // Excludes large 'unit' array to reduce data transfer by 50-70%
  const tdfFields = {
    _id: 1,
    stimuliSetId: 1,
    ownerId: 1,
    accessors: 1,
    conditionCounts: 1,
    'content.fileName': 1,
    'content.isMultiTdf': 1,
    'content.tdfs.tutor.setspec.lessonname': 1,
    'content.tdfs.tutor.setspec.tags': 1,
    'content.tdfs.tutor.setspec.condition': 1,
    'content.tdfs.tutor.setspec.conditionTdfIds': 1,
    'content.tdfs.tutor.setspec.speechIgnoreOutOfGrammarResponses': 1,
    'content.tdfs.tutor.setspec.speechOutOfGrammarFeedback': 1,
    'content.tdfs.tutor.setspec.audioInputEnabled': 1,
    'content.tdfs.tutor.setspec.enableAudioPromptAndFeedback': 1,
    'content.tdfs.tutor.unit.learningsession': 1,
    'content.tdfs.tutor.unit.autotutorsession': 1
    // Include only runtime markers from units so Configure can stay hidden for non-configurable lessons.
  };
  let allTdfs = Tdfs.find({}, { fields: tdfFields }).fetch();
  Session.set('allTdfs', allTdfs);

  // PHASE 2: Subscribe to dashboard cache for pre-computed stats
  // This provides O(1) loading instead of N queries per TDF
  clientConsole(2, '[Dashboard] Subscribing to dashboardCache...');
  await new Promise<void>((resolve) => {
    Meteor.subscribe('dashboardCache', {
      onReady: () => {
        clientConsole(2, '[Dashboard] Subscription ready');
        resolve();
      },
      onStop: (error: any) => { if (error) clientConsole(1, '[Dashboard] Subscription error:', error); resolve(); }
    });
  });

  // Get cache from local Minimongo
  let cache = UserDashboardCache.findOne({ userId: studentID });
  clientConsole(2, '[Dashboard] Cache found:', cache ? 'yes' : 'no', cache ? `with ${Object.keys(cache.tdfStats || {}).length} TDFs` : '');

  // The cache version only proves schema shape. Before trusting a current-version
  // cache, verify it covers the learner's latest history writes.
  try {
    /** @type {EnsureDashboardCacheCurrentResult} */
    const ensureResult = await meteorCallAsync('ensureDashboardCacheCurrent');
    clientConsole(2, '[Dashboard] ensureDashboardCacheCurrent result:', ensureResult);
    cache = UserDashboardCache.findOne({ userId: studentID });
    clientConsole(2, '[Dashboard] Cache after freshness check:', cache ? `${Object.keys(cache.tdfStats || {}).length} TDFs` : 'still null');
  } catch (err) {
    clientConsole(1, '[Dashboard] Failed to ensure cache freshness:', err);
  }

  // If no current cache exists, initialize it.
  if (!cache || cache.version !== DASHBOARD_CACHE_VERSION) {
    clientConsole(2, '[Dashboard] Cache missing or stale, initializing...');
    try {
      /** @type {InitializeDashboardCacheResult} */
      const initResult = await meteorCallAsync('initializeDashboardCache');
      clientConsole(2, '[Dashboard] initializeDashboardCache result:', initResult);
      // Re-fetch cache after initialization
      cache = UserDashboardCache.findOne({ userId: studentID });
      clientConsole(2, '[Dashboard] Cache after init:', cache ? `${Object.keys(cache.tdfStats || {}).length} TDFs` : 'still null');
    } catch (err) {
      clientConsole(1, '[Dashboard] Failed to initialize cache:', err);
      // Cache will be null, statsMap will be empty
    }
  }

  // Build statsMap from cache (O(1) lookup)
  const statsMap = new Map();
  const attemptedTdfIds = new Set<string>();
  const tdfsWithMeaningfulProgress = new Set<string>();

  if (cache?.tdfStats) {
    for (const [TDFId, stats] of Object.entries(cache.tdfStats as Record<string, any>)) {
      attemptedTdfIds.add(TDFId);
      if ((stats?.totalTrials || 0) > 0) {
        tdfsWithMeaningfulProgress.add(TDFId);
      }
      if (stats.totalTrials > 0) {
        const practicedCount = stats.itemsPracticedApplies === false
          ? '-'
          : stats.itemsPracticedCount ?? stats.itemsPracticed ?? stats.uniqueItemIds?.length ?? 0;
        const totalSessions = stats.totalSessions ?? stats.sessionDates?.length ?? 0;
        const lastPracticeTimestamp = Number(stats.lastPracticeTimestamp) || (stats.lastPracticeDate
          ? new Date(stats.lastPracticeDate).getTime()
          : 0);
        statsMap.set(TDFId, {
          totalTrials: stats.totalTrials,
          overallAccuracy: stats.overallAccuracy,
          accuracyApplies: stats.accuracyApplies !== false && stats.overallAccuracy !== null && stats.overallAccuracy !== undefined,
          totalTimeMinutes: stats.totalTimeMinutes,
          itemsPracticed: practicedCount,
          itemsPracticedApplies: stats.itemsPracticedApplies !== false,
          lastPracticeTimestamp: Number.isFinite(lastPracticeTimestamp) ? lastPracticeTimestamp : 0,
          lastPracticeDate: stats.lastPracticeDate
            ? new Date(stats.lastPracticeDate).toLocaleDateString()
            : 'N/A',
          totalSessions
        });
      }
    }
    clientConsole(2, '[Dashboard] Built statsMap with', statsMap.size, 'TDFs');
  } else {
    clientConsole(2, '[Dashboard] No tdfStats in cache');
  }

  // Fallback for cache-miss/stale-cache cases: pull progress signals from persisted experiment state.
  if (shouldUseProgressSignalFallback(cache, tdfsWithMeaningfulProgress.size) && studentID) {
    try {
      const fallbackSignals = await meteorCallAsync('getLearnerProgressSignals', studentID) as {
        attemptedTdfIds?: string[];
        meaningfulProgressTdfIds?: string[];
      };
      applyFallbackProgressSignals(attemptedTdfIds, tdfsWithMeaningfulProgress, fallbackSignals);
      clientConsole(2, '[Dashboard] Applied progress-signal fallback', {
        attemptedCount: attemptedTdfIds.size,
        meaningfulCount: tdfsWithMeaningfulProgress.size,
      });
    } catch (err) {
      clientConsole(1, '[Dashboard] Failed to load fallback progress signals', err);
    }
  }

  // Check if user has personal API keys configured
  const user = Meteor.user();
  const userHasSpeechAPIKey = !!(user?.speechAPIKey && user.speechAPIKey.trim());
  const userHasTTSAPIKey = !!(user?.textToSpeechAPIKey && user.textToSpeechAPIKey.trim());

  const allTdfObjects = [];

  // Build sets of condition-child filenames and IDs so they can be suppressed
  // as standalone rows (they are only accessible via their owner's condition selector).
  const conditionChildFileNames = new Set<string>();
  const conditionChildIds = new Set<string>();
  const tdfsById = new Map<string, any>();
  const tdfsByFileName = new Map<string, any>();
  for (const tdf of allTdfs) {
    if (tdf?._id) {
      tdfsById.set(String(tdf._id), tdf);
    }
    if (tdf?.content?.fileName) {
      tdfsByFileName.set(String(tdf.content.fileName), tdf);
    }
    const sp = tdf?.content?.tdfs?.tutor?.setspec;
    const conditionFileNames: unknown[] = Array.isArray(sp?.condition) ? sp.condition : [];
    const conditionTdfIds: unknown[] = Array.isArray(sp?.conditionTdfIds) ? sp.conditionTdfIds : [];
    for (const fn of conditionFileNames) {
      if (typeof fn === 'string' && fn.trim()) conditionChildFileNames.add(fn.trim());
    }
    for (const id of conditionTdfIds) {
      if (typeof id === 'string' && id.trim()) conditionChildIds.add(id.trim());
    }
  }

  // SINGLE PASS: Process TDFs and add stats in one iteration
  // Optimized from 2-pass algorithm - O(n) instead of O(2n)
  for (const tdf of allTdfs) {
    const TDFId = tdf._id;
    const tdfObject = tdf.content;
    const isMultiTdf = tdfObject.isMultiTdf;
    const currentStimuliSetId = tdf.stimuliSetId;

    // Make sure we have a valid TDF (with a setspec)
    const setspec = tdfObject.tdfs?.tutor?.setspec;
    if (!setspec) {
      continue;
    }

    // Skip condition children — they are accessible only via their parent root's selector
    if (conditionChildIds.has(String(TDFId)) || conditionChildFileNames.has(String(tdfObject.fileName))) {
      continue;
    }

    const name = setspec.lessonname;
    const fileName = tdfObject.fileName;
    const totalPracticeItems = countTotalPracticeItems(tdfObject, fileName || name || TDFId);
    const itemsPracticedApplies = typeof totalPracticeItems === 'number' && totalPracticeItems > 0;
    const hasConfigurableRuntime = tdfFamilyHasConfigurableRuntime(tdfObject, tdfsById, tdfsByFileName);
    const hasLearnerConfigurableFields = tdfFamilyHasLearnerConfigurableFields(tdfObject, tdfsById, tdfsByFileName);
    const ignoreOutOfGrammarResponses = setspec.speechIgnoreOutOfGrammarResponses ?
      setspec.speechIgnoreOutOfGrammarResponses.toLowerCase() == 'true' : false;
    const speechOutOfGrammarFeedback = setspec.speechOutOfGrammarFeedback ?
      setspec.speechOutOfGrammarFeedback : 'Response not in answer set';

    // Extract audio features from TDF setspec
    const audioInputEnabled = setspec.audioInputEnabled ? setspec.audioInputEnabled == 'true' : false;
    const enableAudioPromptAndFeedback = setspec.enableAudioPromptAndFeedback ?
      setspec.enableAudioPromptAndFeedback == 'true' : false;

    // Embedded TDF API key values are intentionally not published in dashboard listing rows.
    const hasSpeechAPIKey = userHasSpeechAPIKey;
    const hasTTSAPIKey = userHasTTSAPIKey;

    // Determine ownership and build condition selector data for owner rows
    const isOwner = tdf.ownerId === Meteor.userId();
    let conditions: { fileName: string; tdfId: string | null; count: number }[] | null = null;
    if (isOwner && Array.isArray(setspec.condition) && setspec.condition.length > 0) {
      const condTdfIds: unknown[] = Array.isArray(setspec.conditionTdfIds) ? setspec.conditionTdfIds : [];
      const condCounts: unknown[] = Array.isArray((tdf as any).conditionCounts) ? (tdf as any).conditionCounts : [];
      conditions = (setspec.condition as string[]).map((fn: string, i: number) => ({
        fileName: fn,
        tdfId: typeof condTdfIds[i] === 'string' ? condTdfIds[i] as string : null,
        count: typeof condCounts[i] === 'number' ? condCounts[i] as number : 0,
      }));
    }

    // Check if this TDF has been attempted
    const hasBeenAttempted = attemptedTdfIds.has(TDFId);

    // Server publication is the source of truth for dashboard access.
    const shouldShow = true;

    const passesEntitlement = passesDashboardEntitlement({
      isPublishedByServer: true,
    });

    if (shouldShow && passesEntitlement) {
      // Get stats for this TDF (O(1) lookup from pre-built map)
      const stats = statsMap.get(TDFId);
      const isUsed = !!stats;

      // Build complete object with TDF properties and stats in single pass
      const tdfData = {
        TDFId: TDFId,
        displayName: name,
        fileName: fileName,
        currentStimuliSetId: currentStimuliSetId,
        ignoreOutOfGrammarResponses: ignoreOutOfGrammarResponses,
        speechOutOfGrammarFeedback: speechOutOfGrammarFeedback,
        audioInputEnabled: audioInputEnabled,
        enableAudioPromptAndFeedback: enableAudioPromptAndFeedback,
        hasSpeechAPIKey: hasSpeechAPIKey,
        hasTTSAPIKey: hasTTSAPIKey,
        hasConfigurableSettings: hasLearnerConfigurableFields || (currentUserHasRole('admin') && hasConfigurableRuntime),
        isMultiTdf: isMultiTdf,
        tags: setspec.tags || [],
        isOwner: isOwner,
        conditions: conditions,
        isUsed: isUsed,
        hasBeenAttempted: hasBeenAttempted,
        // Add stats if available (inline instead of second pass)
        totalTrials: stats?.totalTrials,
        overallAccuracy: stats?.overallAccuracy,
        accuracyApplies: stats?.accuracyApplies,
        totalTimeMinutes: stats?.totalTimeMinutes,
        itemsPracticed: stats?.itemsPracticed,
        itemsPracticedApplies: stats?.itemsPracticedApplies ?? itemsPracticedApplies,
        totalPracticeItems,
        lastPracticeTimestamp: stats?.lastPracticeTimestamp,
        lastPracticeDate: stats?.lastPracticeDate,
        totalSessions: stats?.totalSessions
      };

      allTdfObjects.push(tdfData);
    }
  }

  const { used: usedTdfs, unused: unusedTdfs } = splitTdfsByUsage(allTdfObjects);
  const combinedTdfs = [...usedTdfs, ...unusedTdfs];

  Session.set('homeHasPracticeRecords', usedTdfs.length > 0);
  this.allTdfsList.set(combinedTdfs);
  this.isLoading.set(false);

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
    userPersonalKeys = await (Meteor as any).callAsync('hasUserPersonalKeys');
    markLaunchLoadingTiming('hasUserPersonalKeys:complete', userPersonalKeys);
  } catch (error) {
    clientConsole(1, '[LearningDashboard] Could not determine personal audio key availability during launch prep:', error);
  }

  const audioStartupUser = {
    ...user,
    speechAPIKey: userPersonalKeys.hasSR ? '__configured__' : user?.speechAPIKey,
    ttsAPIKey: userPersonalKeys.hasTTS ? '__configured__' : user?.ttsAPIKey,
  };

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

  if (audioEnabled) {
    // Fetch speech API key if available (from user settings or TDF)
    try {
      const key = await (Meteor as any).callAsync('getUserSpeechAPIKey');
      Session.set('speechAPIKey', key);
    } catch (error) {
      // Missing user key is acceptable; continue with runtime behavior.
    }
  }

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








