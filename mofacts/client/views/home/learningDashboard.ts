import {ReactiveVar} from 'meteor/reactive-var';
import { Tracker } from 'meteor/tracker';
import './learningDashboard.html';
import './learningDashboard.css';
import {getExperimentState} from '../experiment/svelte/services/experimentState';
import {MODEL_UNIT, SCHEDULE_UNIT, VIDEO_UNIT} from '../../../common/Definitions';
import {meteorCallAsync, clientConsole} from '../..';
/** @typedef {import('../../../server/methods/dashboardCacheMethods.contracts').InitializeDashboardCacheResult} InitializeDashboardCacheResult */
import {sessionCleanUp} from '../../lib/sessionUtils';
import {checkUserSession} from '../../lib/userSessionHelpers';
import { CardStore } from '../experiment/modules/cardStore';
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
import { CARD_ENTRY_INTENT, resolveCardLaunchProgress, setCardEntryIntent, type CardEntryIntent } from '../../lib/cardEntryIntent';
import { isConditionRootWithoutUnitArray, normalizeTutorUnits } from '../../lib/tdfUtils';
import { evaluateDashboardVersionPolicy, type VersionMeta } from './versionPolicy';
import { applyFallbackProgressSignals, shouldUseProgressSignalFallback } from './progressSignals';
import { ensureCurrentStimuliSetId } from '../experiment/svelte/services/mediaResolver';
import { clearConditionResolutionContext, setActiveTdfContext } from '../../lib/idContext';
import { passesDashboardEntitlement } from './dashboardEntitlement';
import {
  LEARNER_TDF_FIELD_DEFINITIONS,
  applyLearnerTdfConfig,
  learnerTdfFieldAppliesToUnit,
  type LearnerTdfConfig
} from '../../../common/lib/learnerTdfConfig';
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
declare const Assignments: any;
declare const UserDashboardCache: any;

type LearnerConfigState = {
  tdfId: string | null;
  loading: boolean;
  error: string | null;
  step: 'scope' | 'settings';
  content: any | null;
  scope: 'setspec' | 'unit' | null;
  unitIndex: number | null;
  family: 'ui' | 'delivery' | null;
  saving: boolean;
  closing: boolean;
  dirty: boolean;
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
};

const LEARNER_CONFIG_CLOSE_FALLBACK_MS = 200;
const LEARNER_CONFIG_AUTOSAVE_DELAY_MS = 500;

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

  const patch = buildConfigPatchFromForm(form, current);
  const saveRevision = (instance.learnerConfigSaveRevision || 0) + 1;
  instance.learnerConfigSaveRevision = saveRevision;
  markLearnerConfigDirty(instance);
  clearLearnerConfigAutosaveTimer(instance);

  instance.learnerConfigAutosaveTimer = setTimeout(async () => {
    instance.learnerConfigAutosaveTimer = null;
    const saveState = instance.learnerConfigState.get() as LearnerConfigState;
    if (saveState.tdfId === current.tdfId) {
      instance.learnerConfigState.set({ ...saveState, saving: true, error: null });
    }
    try {
      await meteorCallAsync('saveLearnerTdfConfig', current.tdfId, patch);
      const latest = instance.learnerConfigState.get() as LearnerConfigState;
      if (latest.tdfId === current.tdfId && instance.learnerConfigSaveRevision === saveRevision) {
        instance.learnerConfigState.set({ ...latest, saving: false, dirty: false, error: null });
      }
    } catch (error: any) {
      clientConsole(1, '[Dashboard Config] Failed to autosave learner TDF config:', error);
      const latest = instance.learnerConfigState.get() as LearnerConfigState;
      if (latest.tdfId === current.tdfId) {
        instance.learnerConfigState.set({
          ...latest,
          saving: false,
          dirty: true,
          error: error?.reason || error?.message || 'Unable to save settings.'
        });
      }
    }
  }, LEARNER_CONFIG_AUTOSAVE_DELAY_MS);
}

function getDashboardCache() {
  const studentID = Session.get('curStudentID') || Meteor.userId();
  return UserDashboardCache.findOne({ userId: studentID });
}

function getLearnerTdfConfig(tdfId: string): LearnerTdfConfig | undefined {
  return getDashboardCache()?.learnerTdfConfigs?.[tdfId];
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

function learnerConfigHasSetSpecAudioOverride(tdfId: string, key: 'audioPromptMode' | 'audioInputSensitivity') {
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

function getLearnerConfigurableFieldsForState(state: LearnerConfigState) {
  return LEARNER_TDF_FIELD_DEFINITIONS.filter((field) => {
    if (field.scope !== state.scope || field.family !== state.family) {
      return false;
    }
    if (state.scope !== 'unit') {
      return true;
    }

    const unit = state.unitIndex === null ? null : getTutorUnits(state.content)[state.unitIndex];
    return learnerTdfFieldAppliesToUnit(field, unit);
  });
}

function unitSupportsLearnerFamily(unit: any, family: 'ui' | 'delivery') {
  return LEARNER_TDF_FIELD_DEFINITIONS.some(
    (field) => field.scope === 'unit' &&
      field.family === family &&
      learnerTdfFieldAppliesToUnit(field, unit)
  );
}

function getPathValue(source: any, path: string, unitIndex: number | null = null) {
  if (path.startsWith('setspec.')) {
    return path.split('.').slice(1).reduce((acc, part) => acc?.[part], source?.tdfs?.tutor?.setspec);
  }
  if (path.startsWith('deliveryparams.')) {
    return path.split('.').slice(1).reduce((acc, part) => acc?.[part], source?.tdfs?.tutor?.deliveryparams);
  }
  if (path.startsWith('unit[].') && unitIndex !== null) {
    return path.split('.').slice(1).reduce((acc, part) => acc?.[part], source?.tdfs?.tutor?.unit?.[unitIndex]);
  }
  return undefined;
}

function getDefaultForField(field: any, state: LearnerConfigState) {
  return getPathValue(state.content, field.tdfPath, state.unitIndex) ?? field.defaultValue;
}

function getEffectiveForField(field: any, state: LearnerConfigState) {
  return getPathValue(getConfigurableContent(state), field.tdfPath, state.unitIndex) ?? field.defaultValue;
}

function isFieldCustomized(field: any, state: LearnerConfigState) {
  return getEffectiveForField(field, state) !== getDefaultForField(field, state);
}

function buildConfigPatchFromForm(container: JQuery<HTMLElement>, state: LearnerConfigState) {
  const patch: any = state.scope === 'setspec'
    ? { setspec: {}, deliveryparams: {} }
    : { unit: { [String(state.unitIndex)]: { deliveryparams: {}, uiSettings: {} } } };
  const fields = getSettingFields(state);

  for (const field of fields) {
    const input = container.find(`[data-config-field="${field.id}"]`);
    if (!input.length) continue;

    let value: string | number | boolean;
    if (field.control === 'toggle') {
      value = Boolean((input.get(0) as HTMLInputElement).checked);
    } else if (field.control === 'number' || field.control === 'slider' || field.id === 'setspec.audioInputSensitivity') {
      value = Number(input.val());
    } else {
      value = String(input.val());
    }

    if (field.id === 'setspec.audioPromptMode') {
      patch.setspec.audioPromptMode = value;
    } else if (field.id === 'setspec.audioInputSensitivity') {
      patch.setspec.audioInputSensitivity = value;
    } else if (field.tdfPath.startsWith('setspec.uiSettings.')) {
      const key = field.tdfPath.split('.').pop();
      if (key) {
        patch.setspec.uiSettings = {
          ...(patch.setspec.uiSettings || {}),
          [key]: value
        };
      }
    } else if (field.tdfPath.startsWith('deliveryparams.')) {
      const key = field.tdfPath.split('.').pop();
      if (key) {
        patch.deliveryparams[key] = value;
      }
    } else if (field.tdfPath.startsWith('unit[].uiSettings.') && state.unitIndex !== null) {
      const key = field.id.split('.').pop();
      if (key && state.unitIndex !== null) {
        patch.unit[String(state.unitIndex)].uiSettings[key] = value;
      }
    } else if (field.tdfPath.startsWith('unit[].deliveryparams.') && state.unitIndex !== null) {
      const key = field.tdfPath.split('.').pop();
      if (key) {
        patch.unit[String(state.unitIndex)].deliveryparams[key] = value;
      }
    }
  }

  return patch;
}

function getSettingFields(state: LearnerConfigState) {
  if (state.scope === 'unit') {
    const unit = state.unitIndex === null ? null : getTutorUnits(state.content)[state.unitIndex];
    if (!state.family || !unitSupportsLearnerFamily(unit, state.family)) {
      return [];
    }
  }

  return getLearnerConfigurableFieldsForState(state);
}

function getFamilyChoicesForState(state: LearnerConfigState) {
  const families = new Set(
    LEARNER_TDF_FIELD_DEFINITIONS
      .filter((field) => getLearnerConfigurableFieldsForState({ ...state, family: field.family }).includes(field))
      .map((field) => field.family)
  );
  return [
    ...(families.has('delivery') ? [{ label: 'Delivery parameters', family: 'delivery' }] : []),
    ...(families.has('ui') ? [{ label: 'UI parameters', family: 'ui' }] : [])
  ];
}

function getScopeChoicesForState(state: LearnerConfigState) {
  const units = getTutorUnits(state.content);
  return [
    { label: 'Lesson settings', scope: 'setspec', unitIndex: null },
    ...units.map((unit: any, index: number) => ({
      label: unit?.unitname || unit?.name || `Unit ${index + 1}`,
      scope: 'unit',
      unitIndex: index
    }))
  ];
}

function getConfigChoicesForState(state: LearnerConfigState) {
  return getScopeChoicesForState(state).flatMap((scopeChoice) => {
    const scopedState = {
      ...state,
      scope: scopeChoice.scope as 'setspec' | 'unit',
      unitIndex: scopeChoice.unitIndex
    };
    return getFamilyChoicesForState(scopedState).map((familyChoice) => ({
      ...scopeChoice,
      ...familyChoice,
      unitIndex: scopeChoice.unitIndex === null ? '' : String(scopeChoice.unitIndex),
      label: `${scopeChoice.label}: ${familyChoice.label}`
    }));
  });
}


function parseVersionMajor(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1) {
    return raw;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const direct = Number(trimmed);
    if (Number.isInteger(direct) && direct >= 1) {
      return direct;
    }
    const m = trimmed.match(/^v(\d+)$/i);
    if (m) {
      const parsed = Number(m[1]);
      return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
    }
  }
  return null;
}

function parsePublishedAt(raw: unknown): number | null {
  if (!raw) return null;
  const asDate = new Date(raw as any);
  const ms = asDate.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function normalizeNullableString(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  return value.length ? value : null;
}

function extractVersionMeta(tdf: any): VersionMeta {
  const setspec = tdf?.content?.tdfs?.tutor?.setspec || {};
  const lineageId = normalizeNullableString(
    setspec.lessonLineageId ?? setspec.lessonlineageid ?? setspec.lineageId ?? setspec.lineageid
  );
  const versionMajor = parseVersionMajor(
    setspec.versionMajor ?? setspec.versionmajor ?? setspec.version ?? setspec.versionLabel ?? setspec.versionlabel
  );
  const publishedAtMs = parsePublishedAt(
    setspec.publishedAt ?? setspec.publishedat ?? tdf?.updatedAt ?? tdf?.createdAt
  );
  const rawPublished = setspec.isPublished ?? setspec.ispublished;
  const isPublished = typeof rawPublished === 'boolean'
    ? rawPublished
    : (typeof rawPublished === 'string' ? rawPublished.toLowerCase() === 'true' : null);

  return {
    tdfId: String(tdf?._id || ''),
    lineageId,
    versionMajor,
    publishedAtMs,
    isPublished,
  };
}

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

  hasTdfs: () => {
    const allTdfs = ((Template.instance() as any) as any).allTdfsList.get();
    const filtered = ((Template.instance() as any) as any).filteredTdfsList.get();
    const list = filtered || allTdfs;
    return list && list.length > 0;
  },

  allTdfsList: () => {
    const filtered = ((Template.instance() as any) as any).filteredTdfsList.get();
    if (filtered) {
      return filtered;
    }
    return ((Template.instance() as any) as any).allTdfsList.get();
  },

  // Return CSS class for TTS (headphones) icon based on whether TDF has API key
  ttsIconClass() {
    return this.hasTTSAPIKey ? 'icon-configured' : 'icon-needs-config';
  },

  // Return CSS class for SR (microphone) icon based on whether TDF has API key
  srIconClass() {
    return this.hasSpeechAPIKey ? 'icon-configured' : 'icon-needs-config';
  },

  displayLabel() {
    if (currentUserHasRole('admin,teacher')) {
      const fileName = this.fileName || 'unknown';
      return `${this.displayName} (${fileName} - ${this.TDFId})`;
    }
    return this.displayName;
  },

  configForTableRow() {
    const state = (Template.instance() as any).learnerConfigState.get() as LearnerConfigState;
    return state.tdfId === this.TDFId ? { ...state, location: 'table' } : null;
  },

  configForCardRow() {
    const state = (Template.instance() as any).learnerConfigState.get() as LearnerConfigState;
    return state.tdfId === this.TDFId ? { ...state, location: 'card' } : null;
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

  scopeChoices() {
    return getConfigChoicesForState(this as LearnerConfigState);
  },

  selectedConfigLabel() {
    const state = this as LearnerConfigState;
    let scopeLabel = '';
    if (state.scope === 'setspec') {
      scopeLabel = 'Lesson settings';
    } else if (state.scope === 'unit' && state.unitIndex !== null) {
      const unit = getTutorUnits(state.content)[state.unitIndex];
      scopeLabel = unit?.unitname || unit?.name || `Unit ${state.unitIndex + 1}`;
    }
    const familyLabel = state.family === 'delivery' ? 'Delivery parameters' : 'UI parameters';
    return scopeLabel ? `${scopeLabel}: ${familyLabel}` : familyLabel;
  },

  settingFields() {
    return getSettingFields(this as LearnerConfigState).map((field) => {
      const effectiveValue = getEffectiveForField(field, this as LearnerConfigState);
      const defaultValue = getDefaultForField(field, this as LearnerConfigState);
      const value = effectiveValue;
      const defaultInputValue = defaultValue;
      const displayValue = field.unit ? `${value} ${field.unit}` : String(value);
      const displaySuffix = field.unit;
      return {
        ...field,
        value,
        defaultInputValue,
        displayValue,
        displaySuffix,
        checked: Boolean(value),
        options: field.options?.map((option) => ({
          ...option,
          selected: option.value === value
        })),
        customized: isFieldCustomized(field, this as LearnerConfigState),
        inputMin: field.min,
        inputMax: field.max,
        inputStep: field.step,
        isToggle: field.control === 'toggle',
        isSelect: field.control === 'select',
        isSlider: field.control === 'slider',
        isNumber: field.control === 'number',
        isText: field.control === 'text'
      };
    });
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
        'Continue from Learning Dashboard',
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
      'Start from Learning Dashboard',
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

    const tdfDoc = Tdfs.findOne({ _id: selectedId });
    if (!tdfDoc) return;
    const setspec = tdfDoc.content?.tdfs?.tutor?.setspec || {};

    // isOwnerLaunch = true: owner's session does not increment conditionCounts
    await safeSelectTdf(
      selectedId,
      setspec.lessonname || tdfDoc.content?.fileName || selectedId,
      tdfDoc.stimuliSetId,
      setspec.speechIgnoreOutOfGrammarResponses === 'true',
      setspec.speechOutOfGrammarFeedback || 'Response not in answer set',
      'Owner condition launch from Learning Dashboard',
      tdfDoc.content?.isMultiTdf,
      setspec,
      false,
      true, // isOwnerLaunch
    );
    // For the root option, also store the root TDF id so resumeService can resolve conditions
    if (selectedId === rootId) {
      Session.set('tdfFamilyRootTdfId', rootId);
    }
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

    clearLearnerConfigCloseTimer(instance);
    instance.learnerConfigState.set({
      ...EMPTY_CONFIG_STATE,
      tdfId,
      loading: true
    });

    try {
      let tdfDoc = Tdfs.findOne({ _id: tdfId });
      if (!Array.isArray(tdfDoc?.content?.tdfs?.tutor?.unit)) {
        tdfDoc = await meteorCallAsync('getTdfById', tdfId);
      }
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
      instance.learnerConfigState.set({
        ...EMPTY_CONFIG_STATE,
        tdfId,
        content,
        step: 'scope'
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

  'click .learner-config-scope': function(event: any, instance: any) {
    const current = instance.learnerConfigState.get() as LearnerConfigState;
    const target = $(event.currentTarget);
    instance.learnerConfigState.set({
      ...current,
      step: 'settings',
      scope: target.data('scope'),
      unitIndex: target.data('unitindex') === '' ? null : Number(target.data('unitindex')),
      family: target.data('family'),
      dirty: false,
      error: null
    });
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
      valueTarget.text(`${input.val()}${suffix ? ` ${suffix}` : ''}`);
    }
    scheduleLearnerConfigAutosave(instance, button.closest('.learner-config-form'));
  },

  'change [data-config-field]': function(_event: any, instance: any) {
    scheduleLearnerConfigAutosave(instance, $(_event.currentTarget).closest('.learner-config-form'));
  },

  'input [data-config-field]': function(_event: any, instance: any) {
    scheduleLearnerConfigAutosave(instance, $(_event.currentTarget).closest('.learner-config-form'));
  },

  'input .learner-config-slider': function(event: any, instance: any) {
    const input = $(event.currentTarget);
    const fieldId = input.data('config-field');
    const suffix = input.data('value-suffix') || '';
    input.closest('.learner-config-field').find(`[data-config-value-for="${fieldId}"]`).text(`${input.val()}${suffix ? ` ${suffix}` : ''}`);
    scheduleLearnerConfigAutosave(instance, input.closest('.learner-config-form'));
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
  const curClassContext = Meteor.user()?.loginParams?.curClass || Session.get('curClass') || null;
  const courseId = curClassContext?.courseId || null;
  // Subscribe to lightweight TDF listing and assignments before reading collections
  const subs = [
    Meteor.subscribe('dashboardTdfsListing'),
  ];
  if (courseId) {
    subs.push(Meteor.subscribe('Assignments', courseId));
  }
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
    'content.tdfs.tutor.setspec': 1
    // Explicitly EXCLUDE content.tdfs.tutor.unit (large array)
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

  // If no cache exists, initialize it
  if (!cache) {
    clientConsole(2, '[Dashboard] No cache found, initializing...');
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
        const practicedCount = stats.itemsPracticedCount ?? stats.itemsPracticed ?? stats.uniqueItemIds?.length ?? 0;
        const totalSessions = stats.totalSessions ?? stats.sessionDates?.length ?? 0;
        statsMap.set(TDFId, {
          totalTrials: stats.totalTrials,
          overallAccuracy: stats.overallAccuracy,
          last10Accuracy: stats.last10Accuracy,
          totalTimeMinutes: stats.totalTimeMinutes,
          itemsPracticed: practicedCount,
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

  // Process all TDFs to build used/unused lists
  const courseTdfs = Assignments.find({courseId: courseId}).fetch();
  const assignedRootIds = new Set(
    courseTdfs
      .map((assignment: any) => String(assignment?.TDFId || '').trim())
      .filter((id: string) => id.length > 0)
  );
  const assignedConditionRefs = new Set<string>();
  for (const tdf of allTdfs) {
    const tdfId = String(tdf?._id || '').trim();
    if (!assignedRootIds.has(tdfId)) {
      continue;
    }
    const refs = tdf?.content?.tdfs?.tutor?.setspec?.condition;
    if (!Array.isArray(refs)) {
      continue;
    }
    for (const ref of refs) {
      const normalized = String(ref || '').trim();
      if (normalized.length > 0) {
        assignedConditionRefs.add(normalized);
      }
    }
  }

  // Check if user has personal API keys configured
  const user = Meteor.user();
  const userHasSpeechAPIKey = !!(user?.speechAPIKey && user.speechAPIKey.trim());
  const userHasTTSAPIKey = !!(user?.textToSpeechAPIKey && user.textToSpeechAPIKey.trim());

  // Stage 4 version gating:
  // - current version = highest versionMajor (tie: latest publishedAt)
  // - if user has progress in older version, still allow current version
  const versionMetaByTdfId = new Map<string, VersionMeta>();
  const versionsByLineage = new Map<string, VersionMeta[]>();
  const currentVersionByLineage = new Map<string, string>();

  for (const tdf of allTdfs) {
    const meta = extractVersionMeta(tdf);
    versionMetaByTdfId.set(meta.tdfId, meta);
    if (!meta.lineageId || meta.versionMajor === null) {
      continue;
    }
    if (!versionsByLineage.has(meta.lineageId)) {
      versionsByLineage.set(meta.lineageId, []);
    }
    versionsByLineage.get(meta.lineageId)!.push(meta);
  }

  for (const [lineageId, versions] of versionsByLineage.entries()) {
    const publishedOnly = versions.filter((v) => v.isPublished !== false);
    const pool = publishedOnly.length ? publishedOnly : versions;
    const sorted = pool.slice().sort((a, b) => {
      const versionDiff = (b.versionMajor || 0) - (a.versionMajor || 0);
      if (versionDiff !== 0) return versionDiff;
      return (b.publishedAtMs || 0) - (a.publishedAtMs || 0);
    });
    const current = sorted[0];
    if (current?.tdfId) {
      currentVersionByLineage.set(lineageId, current.tdfId);
    }
  }

  const allTdfObjects = [];

  // Build sets of condition-child filenames and IDs so they can be suppressed
  // as standalone rows (they are only accessible via their owner's condition selector).
  const conditionChildFileNames = new Set<string>();
  const conditionChildIds = new Set<string>();
  for (const tdf of allTdfs) {
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
    const ignoreOutOfGrammarResponses = setspec.speechIgnoreOutOfGrammarResponses ?
      setspec.speechIgnoreOutOfGrammarResponses.toLowerCase() == 'true' : false;
    const speechOutOfGrammarFeedback = setspec.speechOutOfGrammarFeedback ?
      setspec.speechOutOfGrammarFeedback : 'Response not in answer set';

    // Extract audio features from TDF setspec
    const audioInputEnabled = setspec.audioInputEnabled ? setspec.audioInputEnabled == 'true' : false;
    const enableAudioPromptAndFeedback = setspec.enableAudioPromptAndFeedback ?
      setspec.enableAudioPromptAndFeedback == 'true' : false;

    // Check if TDF has embedded API keys OR if user has personal API keys
    // Icon should be green if EITHER source has a key (TDF or user personal key)
    const tdfHasSpeechAPIKey = !!(setspec.speechAPIKey && setspec.speechAPIKey.trim());
    const tdfHasTTSAPIKey = !!(setspec.textToSpeechAPIKey && setspec.textToSpeechAPIKey.trim());
    const hasSpeechAPIKey = tdfHasSpeechAPIKey || userHasSpeechAPIKey;
    const hasTTSAPIKey = tdfHasTTSAPIKey || userHasTTSAPIKey;

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

    // Check if this TDF is assigned to the user
    const isAssigned = courseTdfs.length > 0
      ? assignedRootIds.has(String(TDFId))
        || assignedConditionRefs.has(String(TDFId))
        || assignedConditionRefs.has(String(fileName))
      : false;

    // Check if this TDF has been attempted
    const hasBeenAttempted = attemptedTdfIds.has(TDFId);

    // Server publication is the source of truth for dashboard access.
    // Client-side checks should only enforce local view-policy (version gating, assignment context).
    const shouldShow = true;

    const versionMeta = versionMetaByTdfId.get(TDFId);
    const versionDecision = evaluateDashboardVersionPolicy({
      tdfId: TDFId,
      isAssigned,
      hasMeaningfulProgress: tdfsWithMeaningfulProgress.has(TDFId),
      versionMeta,
      currentVersionByLineage,
    });

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
        isMultiTdf: isMultiTdf,
        tags: setspec.tags || [],
        isOwner: isOwner,
        conditions: conditions,
        isUsed: isUsed,
        hasBeenAttempted: hasBeenAttempted,
        versionMetadataInvalid: versionDecision.metadataInvalid,
        versionMetadataDiagnostic: versionDecision.reason,
        // Add stats if available (inline instead of second pass)
        totalTrials: stats?.totalTrials,
        overallAccuracy: stats?.overallAccuracy,
        last10Accuracy: stats?.last10Accuracy,
        totalTimeMinutes: stats?.totalTimeMinutes,
        itemsPracticed: stats?.itemsPracticed,
        lastPracticeDate: stats?.lastPracticeDate,
        totalSessions: stats?.totalSessions
      };

      allTdfObjects.push(tdfData);
    }
  }

  // Separate into used and unused for sorting
  const usedTdfs = allTdfObjects.filter(t => t.isUsed);
  const unusedTdfs = allTdfObjects.filter(t => !t.isUsed);

  // Sort used TDFs by lastPracticeDate (most recent first)
  usedTdfs.sort((a: any, b: any) => {
    const dateA = new Date(a.lastPracticeDate || 0);
    const dateB = new Date(b.lastPracticeDate || 0);
    return dateB.getTime() - dateA.getTime();
  });

  // Sort unused TDFs alphabetically by name
  unusedTdfs.sort((a, b) => a.displayName.localeCompare(b.displayName, 'en', {numeric: true, sensitivity: 'base'}));

  // Combine: used first (sorted by recent), then unused (sorted alphabetically)
  const combinedTdfs = [...usedTdfs, ...unusedTdfs];

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
    finishLaunchLoading('dashboard-launch-failed');
    clientConsole(1, '[LearningDashboard] Lesson launch failed:', error);
    Session.set('uiMessage', {
      text: 'Lesson did not start correctly. Please try again from the Learning Dashboard.',
      variant: 'danger',
    });
  }
}

async function selectTdf(currentTdfId: any, lessonName: any, currentStimuliSetId: any, ignoreOutOfGrammarResponses: any,
  speechOutOfGrammarFeedback: any, how: any, isMultiTdf: any, setspec: any, isExperiment = false, isOwnerLaunch = false) {

  startLaunchLoading('Preparing lesson...', 'learningDashboard');
  markLaunchLoadingTiming('dashboardClick', { currentTdfId, lessonName, how, isMultiTdf });
  const audioPromptFeedbackView = getAudioPromptFeedbackView();

  // make sure session variables are cleared from previous tests
  sessionCleanUp();
  if (isOwnerLaunch) Session.set('ownerDashboardLaunch', true);
  Session.set('uiMessage', null);

  // Set the session variables we know
  // Note that we assume the root and current TDF ids start the same.
  // The canonical entry resolver / card bootstrap may later redirect to a
  // condition-specific TDF when the selected root participates in condition resolution.
  setActiveTdfContext({
    currentRootTdfId: currentTdfId,
    currentTdfId: currentTdfId,
    currentStimuliSetId: currentStimuliSetId,
  }, 'learningDashboard.selectTdf.start');
  clearConditionResolutionContext('learningDashboard.selectTdf.start');

  // Subscribe to full TDF data for the active session
  setLaunchLoadingMessage('Loading lesson...');
  markLaunchLoadingTiming('currentTdfSubscription:start', { currentTdfId });
  const tdfSub = Meteor.subscribe('currentTdf', currentTdfId);
  await new Promise<void>((resolve) => {
    const handle = Tracker.autorun(() => {
      if (tdfSub.ready()) {
        handle.stop();
        markLaunchLoadingTiming('currentTdfSubscription:ready', { currentTdfId });
        resolve();
      }
    });
  });

  const tdfDoc = Tdfs.findOne({_id: currentTdfId});
  if (!tdfDoc || !tdfDoc.content) {
    clientConsole(1, 'Failed to load current TDF from subscription:', currentTdfId);
    finishLaunchLoading('tdf-subscription-missing-content');
    alert('Unable to load the selected lesson. Please try again or contact support.');
    return;
  }
  let curTdfContent = tdfDoc.content;
  normalizeTutorUnits(curTdfContent);
  if (!Array.isArray(curTdfContent?.tdfs?.tutor?.unit)) {
    clientConsole(1, '[LearningDashboard] Selected TDF content missing tutor.unit; fetching full TDF by id:', currentTdfId);
    markLaunchLoadingTiming('getTdfById:start', { currentTdfId });
    const fullTdfDoc: any = await meteorCallAsync('getTdfById', currentTdfId);
    markLaunchLoadingTiming('getTdfById:complete', { currentTdfId });
    curTdfContent = fullTdfDoc?.content;
    normalizeTutorUnits(curTdfContent);
    const isConditionRoot = isConditionRootWithoutUnitArray(curTdfContent);
    if (!Array.isArray(curTdfContent?.tdfs?.tutor?.unit) && !isConditionRoot) {
      const errorMsg = `[LearningDashboard] Selected TDF ${currentTdfId} is missing required content.tdfs.tutor.unit`;
      clientConsole(1, errorMsg);
      finishLaunchLoading('tdf-missing-unit-list');
      alert('Unable to start this lesson because the TDF unit list is missing.');
      return;
    }
    if (!Array.isArray(curTdfContent?.tdfs?.tutor?.unit) && isConditionRoot) {
      clientConsole(2, '[LearningDashboard] Selected root condition TDF without unit array; continuing via condition-resolve flow:', currentTdfId);
    }
  }
  curTdfContent = applyDashboardLearnerConfig(curTdfContent, String(currentTdfId));
  const curTdfTips = curTdfContent.tdfs.tutor.setspec.tips;
  const hasConditionPool = Array.isArray(curTdfContent?.tdfs?.tutor?.setspec?.condition)
    && curTdfContent.tdfs.tutor.setspec.condition.length > 0;
  const launchMode = hasConditionPool ? 'root-random' : 'condition-fixed';
  Session.set('tdfLaunchMode', launchMode);
  Session.set('tdfFamilyRootTdfId', hasConditionPool ? currentTdfId : null);
  Session.set('currentTdfFile', curTdfContent);
  Session.set('currentTdfName', curTdfContent.fileName);
  setActiveTdfContext({
    currentRootTdfId: currentTdfId,
    currentTdfId: currentTdfId,
    currentStimuliSetId: currentStimuliSetId,
  }, 'learningDashboard.selectTdf.loaded');
  ensureCurrentStimuliSetId(currentStimuliSetId || tdfDoc.stimuliSetId);
  CardStore.setIgnoreOutOfGrammarResponses(ignoreOutOfGrammarResponses);
  Session.set('speechOutOfGrammarFeedback', speechOutOfGrammarFeedback);
  Session.set('curTdfTips', curTdfTips);
  const unitCount = Array.isArray(curTdfContent?.tdfs?.tutor?.unit) ? curTdfContent.tdfs.tutor.unit.length : 0;
  setLaunchLoadingMessage('Restoring progress...');
  markLaunchLoadingTiming('getExperimentState:start', { source: 'selectTdf' });
  const persistedExperimentState = await getExperimentState();
  markLaunchLoadingTiming('getExperimentState:complete', { source: 'selectTdf' });
  const launchProgress = resolveCardLaunchProgress(persistedExperimentState, unitCount);

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
        source: 'learningDashboard.selectTdf',
      });
      FlowRouter.go('/card');
    }
  }
}

async function navigateForMultiTdf(entryIntent: CardEntryIntent = CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY) {
  function getUnitType(curUnit: any) {
    let unitType = 'other';
    if (curUnit.assessmentsession) {
      unitType = SCHEDULE_UNIT;
    } else if (curUnit.videosession) {
      unitType = VIDEO_UNIT;
    } else if (curUnit.learningsession) {
      unitType = MODEL_UNIT;
    }
    return unitType;
  }

  setLaunchLoadingMessage('Restoring progress...');
  markLaunchLoadingTiming('getExperimentState:start', { source: 'navigateForMultiTdf' });
  const experimentState: any = await getExperimentState();
  markLaunchLoadingTiming('getExperimentState:complete', { source: 'navigateForMultiTdf' });
  const lastUnitCompleted = experimentState.lastUnitCompleted || -1;
  const lastUnitStarted = experimentState.lastUnitStarted || -1;
  let unitLocked = false;

  // If we haven't finished the unit yet, we may want to lock into the current unit
  // so the user can't mess up the data
  if (lastUnitStarted > lastUnitCompleted) {
    const curUnit = experimentState.currentTdfUnit;
    const curUnitType = getUnitType(curUnit);
    // We always want to lock users in to an assessment session
    if (curUnitType === SCHEDULE_UNIT) {
      unitLocked = true;
    } else if (curUnitType === MODEL_UNIT || curUnitType === VIDEO_UNIT) {
      if (!!curUnit.displayMinSeconds || !!curUnit.displayMaxSeconds) {
        unitLocked = true;
      }
    }
  }
  // Only show selection if we're in a unit where it doesn't matter (infinite learning sessions)
  if (unitLocked) {
    setLaunchLoadingMessage('Loading content...');
    setCardEntryIntent(entryIntent, {
      source: 'learningDashboard.navigateForMultiTdf',
    });
    FlowRouter.go('/card');
  } else {
    finishLaunchLoading('multi-tdf-select');
    FlowRouter.go('/multiTdfSelect');
  }
}








