import CardScreen from './experiment/svelte/components/CardScreen.svelte';
import { mount, unmount } from 'svelte';
import { Meteor } from 'meteor/meteor';
import './svelteCardTester.html';
import { Session } from 'meteor/session';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { UiSettingsStore } from '../lib/state/uiSettingsStore';
import { sanitizeUiSettings } from './experiment/svelte/utils/uiSettingsValidator';
import {
  createStimClusterMapping,
  getStimCluster,
  getCurrentDeliveryParams
} from '../lib/currentTestingHelpers';
import { DEFAULT_UI_SETTINGS as BASE_UI_SETTINGS } from './experiment/svelte/machine/constants';
import { getCardDataFromEngine } from './experiment/svelte/services/unitEngineService';
import { applyMappingRecordToSession } from './experiment/svelte/services/mappingRecordService';
import { Answers } from './experiment/answerAssess';
import { KC_MULTIPLE, MODEL_UNIT, SCHEDULE_UNIT, VIDEO_UNIT, STIM_PARAMETER } from '../../common/Definitions';
import { getErrorMessage, getErrorStack } from '../lib/errorUtils';
import { clientConsole } from '../lib/clientLogger';

const DEFAULT_UI_SETTINGS: any = {
  ...BASE_UI_SETTINGS,
  displayQuestionNumber: false
};

const DEFAULT_PERFORMANCE = {
  totalTimeDisplay: '2.5',
  percentCorrect: '75.00%',
  cardsSeen: 15,
  totalCards: 20,
  currentTrial: 1
};

const DEFAULT_TIMEOUTS = {
  question: { mode: 'question', progress: 35, remainingTime: 12 },
  feedback: { mode: 'feedback', progress: 60, remainingTime: 4 },
  none: { mode: 'none', progress: 0, remainingTime: 0 }
};

const SESSION_KEYS = [
  'currentTdfFile',
  'currentTdfUnit',
  'currentUnitNumber',
  'currentStimuliSet',
  'currentStimuliSetId',
  'clusterMapping',
  'currentTdfId',
  'unitType',
  'testType'
];

let currentSvelteComponent: any = null;

function captureSessionState() {
  const snapshot: any = {};
  SESSION_KEYS.forEach((key) => {
    snapshot[key] = Session.get(key);
  });
  snapshot.uiSettings = UiSettingsStore.get();
  return snapshot;
}

function restoreSessionState(snapshot: any) {
  if (!snapshot) return;
  SESSION_KEYS.forEach((key) => {
    Session.set(key, snapshot[key]);
  });
  UiSettingsStore.set(snapshot.uiSettings || {});
}

function readJsonFile(file: any) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        resolve(parsed);
      } catch (error: unknown) {
        reject(new Error(`Invalid JSON in ${file.name}: ${getErrorMessage(error)}`));
      }
    };
    reader.onerror = () => {
      reject(new Error(`Failed to read file: ${file.name}`));
    };
    reader.readAsText(file);
  });
}

function normalizeTdfFile(raw: any, fileName: any) {
  let tdf = null;
  if (raw?.tdfs?.tutor) {
    tdf = raw;
  } else if (raw?.content?.tdfs?.tutor) {
    tdf = raw.content;
  } else if (raw?.tutor) {
    tdf = { tdfs: { tutor: raw.tutor } };
  }

  if (!tdf?.tdfs?.tutor) {
    throw new Error('Invalid TDF: missing tdfs.tutor section.');
  }

  if (!tdf.tdfs.tutor.setspec) {
    throw new Error('Invalid TDF: missing tutor.setspec.');
  }

  if (!Array.isArray(tdf.tdfs.tutor.unit)) {
    throw new Error('Invalid TDF: missing tutor.unit array.');
  }

  if (!fileName) {
    throw new Error('TDF filename is missing.');
  }

  return {
    ...tdf,
    fileName
  };
}

function convertClustersToStimuli(clusters: any, stimulusFileName: any) {
  if (!Array.isArray(clusters)) {
    throw new Error('Stim file clusters missing or not an array.');
  }

  const stimuli: any[] = [];
  const baseKC = KC_MULTIPLE;
  let clusterKC = baseKC;
  let stimKC = baseKC;
  const responseKCMap: Record<string, any> = {};
  let responseKCCounter = 1;

  clusters.forEach((cluster, clusterIndex) => {
    if (!cluster || !Array.isArray(cluster.stims)) {
      throw new Error(`Cluster ${clusterIndex} missing stims array.`);
    }

    cluster.stims.forEach((stim: any, stimIndex: any) => {
      if (!stim || typeof stim !== 'object') {
        throw new Error(`Stim ${stimIndex} in cluster ${clusterIndex} is not an object.`);
      }

      const response = stim.response || {};
      const correctResponse = response.correctResponse ?? stim.correctResponse;
      if (!correctResponse) {
        throw new Error(`Stim ${stimIndex} in cluster ${clusterIndex} missing correctResponse.`);
      }

      let incorrectResponses = response.incorrectResponses ?? stim.incorrectResponses;
      if (typeof incorrectResponses === 'string') {
        incorrectResponses = incorrectResponses.split(',').map((item) => item.trim()).filter(Boolean);
      } else if (Array.isArray(incorrectResponses)) {
        incorrectResponses = incorrectResponses.map((item) => (typeof item === 'string' ? item.trim() : item)).filter(Boolean);
      }

      const display = stim.display || {};
      const answerText = Answers.getDisplayAnswerText(correctResponse);
      let responseKC = responseKCMap[answerText];
      if (!responseKC && responseKC !== 0) {
        responseKC = responseKCCounter;
        responseKCMap[answerText] = responseKC;
        responseKCCounter += 1;
      }

      stimuli.push({
        stimuliSetId: 1,
        stimulusFileName,
        stimulusKC: stimKC,
        clusterKC,
        responseKC,
        params: stim.parameter || STIM_PARAMETER,
        optimalProb: stim.optimalProb,
        correctResponse,
        incorrectResponses,
        speechHintExclusionList: stim.speechHintExclusionList,
        clozeStimulus: display.clozeText || display.clozeStimulus || stim.clozeStimulus,
        textStimulus: display.text || display.textStimulus || stim.textStimulus || '',
        audioStimulus: display.audioSrc || display.audioStimulus || stim.audioStimulus,
        imageStimulus: display.imgSrc || display.imageStimulus || stim.imageStimulus,
        videoStimulus: display.videoSrc || display.videoStimulus || stim.videoStimulus,
        alternateDisplays: stim.alternateDisplays
      });

      stimKC += 1;
    });

    clusterKC += 1;
  });

  if (!stimuli.length) {
    throw new Error('Stim file produced no stimuli.');
  }

  return stimuli;
}

function buildClusterInfo(stimuli: any) {
  if (!Array.isArray(stimuli) || !stimuli.length) {
    throw new Error('Stimuli array is empty.');
  }

  const clusterStims: Record<number, any[]> = {};
  stimuli.forEach((stim: any) => {
    if (stim.clusterKC === undefined || stim.clusterKC === null) {
      throw new Error('Stimulus missing clusterKC.');
    }
    const clusterIndex = stim.clusterKC % KC_MULTIPLE;
    if (!clusterStims[clusterIndex]) {
      clusterStims[clusterIndex] = [];
    }
    clusterStims[clusterIndex].push(stim);
  });

  const clusters = Object.keys(clusterStims)
    .map((key) => ({
      index: Number(key),
      stimCount: (clusterStims[Number(key)] || []).length
    }))
    .sort((a, b) => a.index - b.index);

  return { clusters, clusterStims };
}

function normalizeStimFile(raw: any, fileName: any) {
  let clusters = null;
  let stimuli = null;

  if (raw?.stimuli?.setspec?.clusters) {
    clusters = raw.stimuli.setspec.clusters;
  } else if (raw?.setspec?.clusters) {
    clusters = raw.setspec.clusters;
  } else if (Array.isArray(raw?.stimuli)) {
    stimuli = raw.stimuli;
  } else if (Array.isArray(raw)) {
    stimuli = raw;
  }

  if (!clusters && !stimuli) {
    throw new Error('Stim file missing clusters or stimuli array.');
  }

  if (!fileName) {
    throw new Error('Stim filename is missing.');
  }

  if (clusters) {
    stimuli = convertClustersToStimuli(clusters, fileName);
  }

  const clusterInfo = buildClusterInfo(stimuli);

  return {
    fileName,
    stimuli,
    clusters: clusterInfo.clusters,
    clusterStims: clusterInfo.clusterStims
  };
}

function validateStimFileName(tdf: any, stimFileName: any) {
  const expected = tdf?.tdfs?.tutor?.setspec?.stimulusfile;
  if (!expected) {
    throw new Error('TDF setspec.stimulusfile is missing.');
  }
  if (!stimFileName) {
    throw new Error('Stim filename is missing.');
  }
  if (expected !== stimFileName) {
    throw new Error(`Stim file mismatch: TDF expects "${expected}" but loaded "${stimFileName}".`);
  }
}

function getUnitType(unit: any) {
  if (unit?.assessmentsession) return SCHEDULE_UNIT;
  if (unit?.videosession) return VIDEO_UNIT;
  if (unit?.learningsession) return MODEL_UNIT;
  return 'instruction-only';
}

function configureTesterSession({ tdf, stimuli, unitIndex, testType, clusterCount }: any) {
  const unit = tdf?.tdfs?.tutor?.unit?.[unitIndex];
  if (!unit) {
    throw new Error(`Unit index ${unitIndex} not found in TDF.`);
  }

  const unitType = getUnitType(unit);
  if (unitType === 'instruction-only') {
    throw new Error(`Unit "${unit.unitname}" has no session type with stimuli.`);
  }

  Session.set('currentTdfFile', tdf);
  Session.set('currentTdfUnit', unit);
  Session.set('currentUnitNumber', unitIndex);
  Session.set('currentStimuliSet', stimuli);
  Session.set('currentTdfId', tdf._id || tdf.fileName);
  Session.set('unitType', unitType);
  Session.set('testType', testType);

  if (!Number.isInteger(clusterCount) || clusterCount <= 0) {
    throw new Error('Stim file has no clusters to map.');
  }

  const setspec = tdf.tdfs.tutor.setspec || {};
  const shuffles = setspec.shuffleclusters ? setspec.shuffleclusters.trim().split(' ') : [''];
  const swaps = setspec.swapclusters ? setspec.swapclusters.trim().split(' ') : [''];
  const mapping = createStimClusterMapping(clusterCount, shuffles || [], swaps || [], []);
  applyMappingRecordToSession({
    mappingTable: mapping,
    mappingSignature: null,
    createdAt: Date.now(),
  });

  const tdfSettings = setspec.uiSettings || {};
  const unitSettings = unit.uiSettings || {};
  const tdfName = tdf.tdfs?.tutor?.title || tdf.fileName || '';
  UiSettingsStore.set(sanitizeUiSettings({ ...tdfSettings, ...unitSettings }, { tdfName }));
}

function getActiveStatesForMode(mode: any) {
  switch (mode) {
    case 'study':
      return ['study.waiting'];
    case 'correct':
    case 'incorrect':
      return ['feedback'];
    case 'test':
    default:
      return ['presenting.awaiting'];
  }
}

function buildMatches(activeStates: any) {
  return (query: any) => {
    if (!query) return false;
    return activeStates.some((state: any) => state === query || state.startsWith(`${query}.`));
  };
}

function shouldShowTimeoutBar(uiSettings: any) {
  return uiSettings.displayTimeoutBar === true;
}

function buildTimeoutConfig(mode: any, uiSettings: any) {
  if (!shouldShowTimeoutBar(uiSettings)) {
    return { ...DEFAULT_TIMEOUTS.none };
  }
  if (mode === 'test') {
    return { ...DEFAULT_TIMEOUTS.question };
  }
  if (mode === 'study' || mode === 'correct' || mode === 'incorrect') {
    return { ...DEFAULT_TIMEOUTS.feedback };
  }
  return { ...DEFAULT_TIMEOUTS.none };
}

function buildTestSnapshot({ config, cardData, mode, userAnswer, feedbackMessage, isTimeout, performanceData }: any) {
  const mergedUiSettings = normalizeUiSettings(config.uiSettings || {});
  const mergedDeliveryParams = {
    ...getCurrentDeliveryParams(),
    ...(config.deliveryparams || {})
  };

  const activeStates = getActiveStatesForMode(mode);
  const matches = buildMatches(activeStates);
  const isCorrect = mode === 'correct' || mode === 'study';

  const context = {
    currentDisplay: cardData.currentDisplay,
    currentAnswer: cardData.currentAnswer,
    buttonList: cardData.buttonList,
    buttonTrial: cardData.buttonTrial,
    testType: cardData.testType,
    deliveryParams: mergedDeliveryParams,
    uiSettings: mergedUiSettings,
    feedbackMessage: feedbackMessage || '',
    isCorrect,
    isTimeout: !!isTimeout,
    userAnswer: userAnswer || '',
    audio: { waitingForTranscription: false, srAttempts: 0, maxSrAttempts: 0 },
    engineIndices: cardData.engineIndices || {}
  };

  return {
    snapshot: {
      value: activeStates[0] || 'presenting.awaiting',
      context,
      matches
    },
    performance: performanceData || { ...DEFAULT_PERFORMANCE },
    timeout: buildTimeoutConfig(mode, mergedUiSettings)
  };
}

function normalizeUiSettings(rawSettings: any = {}) {
  const mergedSettings = { ...DEFAULT_UI_SETTINGS, ...(rawSettings || {}) };

  Object.keys(DEFAULT_UI_SETTINGS).forEach((field: any) => {
    if (typeof DEFAULT_UI_SETTINGS[field] !== 'boolean') return;
    if (mergedSettings[field] === 'true') {
      mergedSettings[field] = true;
    } else if (mergedSettings[field] === 'false') {
      mergedSettings[field] = false;
    }
  });

  const booleanStringFields = ['displayUserAnswerInFeedback', 'onlyShowSimpleFeedback'];

  booleanStringFields.forEach((field: any) => {
    if (mergedSettings[field] === 'true') {
      mergedSettings[field] = true;
    } else if (mergedSettings[field] === 'false') {
      mergedSettings[field] = false;
    }
  });

  return mergedSettings;
}

function syncSettingsFromConfig(instance: any) {
  const config = instance.currentConfig.get();
  if (!config) return;

  const deliveryparams = config.deliveryparams || config.deliveryParams || {};
  const uiSettings = normalizeUiSettings(config.uiSettings || {});

  $('.setting-fontsize').val(deliveryparams.fontsize || '24');
  $('.setting-stimuliPosition').val(uiSettings.stimuliPosition || 'top');
  $('.setting-displayQuestionNumber').prop('checked', uiSettings.displayQuestionNumber === true);
  $('.setting-isVideoSession').prop('checked', uiSettings.isVideoSession === true);
  $('.setting-videoUrl').val(uiSettings.videoUrl || '');

  $('.setting-displayTimeoutBar').prop('checked', uiSettings.displayTimeoutBar === true);

  $('.setting-displayCorrectFeedback').prop('checked', uiSettings.displayCorrectFeedback === true);
  $('.setting-displayIncorrectFeedback').prop('checked', uiSettings.displayIncorrectFeedback === true);
  $('.setting-onlyShowSimpleFeedback').val(toTriStateSelectValue(uiSettings.onlyShowSimpleFeedback));
  $('.setting-singleLineFeedback').prop('checked', uiSettings.singleLineFeedback === true);

  $('.setting-displayCorrectAnswerInIncorrectFeedback').prop('checked', uiSettings.displayCorrectAnswerInIncorrectFeedback === true);
  $('.setting-displayUserAnswerInFeedback').val(toTriStateSelectValue(uiSettings.displayUserAnswerInFeedback));

  $('.setting-correctColor').val(uiSettings.correctColor || 'green');
  $('.setting-incorrectColor').val(uiSettings.incorrectColor || 'darkorange');

  $('.setting-displaySubmitButton').prop('checked', uiSettings.displaySubmitButton === true);

  $('.setting-correctMessage').val(uiSettings.correctMessage || 'Correct!');
  $('.setting-incorrectMessage').val(uiSettings.incorrectMessage || 'Incorrect');
  $('.setting-inputPlaceholderText').val(uiSettings.inputPlaceholderText || 'Your answer');

  $('.setting-choiceButtonCols').val(uiSettings.choiceButtonCols || 2);

  $('.setting-caseSensitive').prop('checked', uiSettings.caseSensitive === true);
}

function parseTriStateSelectValue(value: any) {
  if (value === 'never') return false;
  if (value === 'always') return true;
  return value;
}

function toTriStateSelectValue(value: any) {
  if (value === true) return 'always';
  if (value === false || value == null) return 'never';
  return value;
}

function updateConfigSetting(instance: any, section: any, key: any, value: any) {
  const config = instance.currentConfig.get();
  if (!config) {
    instance.selectionError.set('No card loaded. Load TDF + stim and apply selection first.');
    return;
  }

  const nextConfig = { ...config };
  nextConfig[section] = { ...(nextConfig[section] || {}) };
  nextConfig[section][key] = value;
  instance.currentConfig.set(nextConfig);

  const cardData = instance.currentCardData.get();
  if (cardData) {
    const nextCardData = { ...cardData };
    if (section === 'uiSettings') {
      nextCardData.uiSettings = { ...(nextCardData.uiSettings || {}), ...nextConfig[section] };
      UiSettingsStore.set(normalizeUiSettings(nextCardData.uiSettings || {}));
    }
    if (section === 'deliveryparams' || section === 'deliveryParams') {
      nextCardData.deliveryParams = { ...(nextCardData.deliveryParams || {}), ...nextConfig[section] };
    }
    instance.currentCardData.set(nextCardData);
  }
}

function buildConfigFromSelection(instance: any) {
  const tdf = instance.tdfFile.get();
  const stimData = instance.stimFile.get();
  if (!tdf || !stimData) {
    throw new Error('Load both TDF and Stim JSON files before applying selection.');
  }

  validateStimFileName(tdf, stimData.fileName);

  const unitIndex = Number(instance.selectedUnitIndex.get());
  if (!Number.isInteger(unitIndex)) {
    throw new Error('Select a valid unit.');
  }

  const clusterIndex = Number(instance.selectedClusterIndex.get());
  if (!Number.isInteger(clusterIndex)) {
    throw new Error('Select a valid cluster.');
  }

  const stimIndex = Number(instance.selectedStimIndex.get());
  if (!Number.isInteger(stimIndex)) {
    throw new Error('Select a valid stim.');
  }

  const testType = instance.selectedTestType.get() || 'd';

  configureTesterSession({
    tdf,
    stimuli: stimData.stimuli,
    unitIndex,
    testType,
    clusterCount: stimData.clusters.length
  });

  const cluster = getStimCluster(clusterIndex);
  if (!cluster?.stims?.length) {
    throw new Error(`Cluster ${clusterIndex} has no stimuli.`);
  }

  if (stimIndex < 0 || stimIndex >= cluster.stims.length) {
    throw new Error(`Stim index ${stimIndex} is out of range for cluster ${clusterIndex}.`);
  }

  const stubEngine = {
    findCurrentCardInfo: () => ({
      whichStim: stimIndex,
      clusterIndex,
      forceButtonTrial: false,
      probabilityEstimate: null
    })
  };

  const cardData = getCardDataFromEngine(stubEngine, clusterIndex, 1);

  const config = {
    display: cardData.currentDisplay,
    answer: cardData.currentAnswer,
    buttonList: cardData.buttonList,
    testType: cardData.testType,
    deliveryparams: cardData.deliveryParams || {},
    uiSettings: cardData.uiSettings || {}
  };

  return { config, cardData };
}

function remountCard({ config, cardData, mode, userAnswer, feedbackMessage, isTimeout, performanceData }: any) {
  const targetElement = document.getElementById('svelte-card-mount');
  if (!targetElement) return;

  if (currentSvelteComponent) {
    unmount(currentSvelteComponent);
    currentSvelteComponent = null;
  }

  if (!config || !cardData) {
    targetElement.innerHTML = '<div class="alert alert-info">Load a TDF + Stim file and apply selection to preview the real card.</div>';
    return;
  }

  try {
    const { snapshot, performance, timeout } = buildTestSnapshot({
      config,
      cardData,
      mode,
      userAnswer,
      feedbackMessage,
      isTimeout,
      performanceData
    });

    currentSvelteComponent = mount(CardScreen, {
      target: targetElement,
      props: {
        testMode: true,
        testSnapshot: snapshot,
        testPerformance: performance,
        testTimeout: timeout
      }
    });
  } catch (error: unknown) {
    clientConsole(1, '[SvelteCardTester] Mount failed:', error);
    const message = getErrorMessage(error);
    const stack = getErrorStack(error);
    targetElement.innerHTML = `
      <div class="alert alert-danger">
        <h4>Component Mount Error</h4>
        <p>${message}</p>
        <pre style="font-size: 11px; white-space: pre-wrap;">${stack || 'Stack trace unavailable'}</pre>
      </div>
    `;
  }
}

function buildUnitOptions(tdf: any) {
  return tdf.tdfs.tutor.unit.map((unit: any, index: any) => ({
    index,
    label: `Unit ${index}: ${unit.unitname || '(unnamed unit)'}`
  }));
}

function buildClusterOptions(stimData: any) {
  return stimData.clusters.map((cluster: any) => ({
    index: cluster.index,
    label: `Cluster ${cluster.index} (${cluster.stimCount} stims)`
  }));
}

function buildStimOptions(stimData: any, clusterIndex: any) {
  const stims = stimData.clusterStims[clusterIndex] || [];
  return stims.map((stim: any, index: any) => ({
    index,
    label: `Stim ${index}`
  }));
}

Template.svelteCardTester.onCreated(function(this: any) {
  this.currentConfig = new ReactiveVar(null);
  this.currentCardData = new ReactiveVar(null);
  this.currentMode = new ReactiveVar('test');
  this.loadError = new ReactiveVar(null);
  this.selectionError = new ReactiveVar(null);
  this.settingsExpanded = new ReactiveVar(false);

  this.tdfFile = new ReactiveVar(null);
  this.stimFile = new ReactiveVar(null);
  this.availableUnits = new ReactiveVar([]);
  this.availableClusters = new ReactiveVar([]);
  this.availableStims = new ReactiveVar([]);
  this.selectedUnitIndex = new ReactiveVar(null);
  this.selectedClusterIndex = new ReactiveVar(null);
  this.selectedStimIndex = new ReactiveVar(null);
  this.selectedTestType = new ReactiveVar('d');
  this.userAnswer = new ReactiveVar('');
  this.feedbackMessage = new ReactiveVar('');
  this.isTimeout = new ReactiveVar(false);
  this.performanceData = new ReactiveVar({ ...DEFAULT_PERFORMANCE });

  this.originalSessionState = captureSessionState();
});

Template.svelteCardTester.onRendered(function(this: any) {
  const instance = this;

  this.autorun(function() {
    remountCard({
      config: instance.currentConfig.get(),
      cardData: instance.currentCardData.get(),
      mode: instance.currentMode.get(),
      userAnswer: instance.userAnswer.get(),
      feedbackMessage: instance.feedbackMessage.get(),
      isTimeout: instance.isTimeout.get(),
      performanceData: instance.performanceData.get()
    });
  });

  Meteor.defer(() => syncSettingsFromConfig(instance));
});

Template.svelteCardTester.onDestroyed(function(this: any) {
  if (currentSvelteComponent) {
    unmount(currentSvelteComponent);
    currentSvelteComponent = null;
  }
  restoreSessionState(this.originalSessionState);
});

Template.svelteCardTester.helpers({
  loadError() {
    return (Template.instance() as any).loadError.get();
  },

  selectionError() {
    return (Template.instance() as any).selectionError.get();
  },

  hasConfig() {
    return !!(Template.instance() as any).currentConfig.get();
  },

  tdfLabel() {
    const tdf = (Template.instance() as any).tdfFile.get();
    if (!tdf) return 'None loaded';
    const lessonName = tdf?.tdfs?.tutor?.setspec?.lessonname || tdf.fileName;
    return `${tdf.fileName} (${lessonName})`;
  },

  stimLabel() {
    const stim = (Template.instance() as any).stimFile.get();
    if (!stim) return 'None loaded';
    return stim.fileName;
  },

  availableUnits() {
    return (Template.instance() as any).availableUnits.get();
  },

  availableClusters() {
    return (Template.instance() as any).availableClusters.get();
  },

  availableStims() {
    return (Template.instance() as any).availableStims.get();
  },

  isUnitSelected(index: any) {
    return Number(index) === (Template.instance() as any).selectedUnitIndex.get() ? 'selected' : '';
  },

  isClusterSelected(index: any) {
    return Number(index) === (Template.instance() as any).selectedClusterIndex.get() ? 'selected' : '';
  },

  isStimSelected(index: any) {
    return Number(index) === (Template.instance() as any).selectedStimIndex.get() ? 'selected' : '';
  },

  isTestTypeSelected(value: any) {
    return value === (Template.instance() as any).selectedTestType.get() ? 'selected' : '';
  },

  userAnswer() {
    return (Template.instance() as any).userAnswer.get();
  },

  feedbackMessage() {
    return (Template.instance() as any).feedbackMessage.get();
  },

  timeoutChecked() {
    return (Template.instance() as any).isTimeout.get() ? 'checked' : '';
  },

  isTestMode() {
    return (Template.instance() as any).currentMode.get() === 'test';
  },

  isStudyMode() {
    return (Template.instance() as any).currentMode.get() === 'study';
  },

  isCorrectMode() {
    return (Template.instance() as any).currentMode.get() === 'correct';
  },

  isIncorrectMode() {
    return (Template.instance() as any).currentMode.get() === 'incorrect';
  },

  settingsExpanded() {
    return (Template.instance() as any).settingsExpanded.get();
  }
});

Template.svelteCardTester.events({
  'change .tdf-file-input'(event: any, instance: any) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    instance.loadError.set(null);
    readJsonFile(file)
      .then((raw) => {
        const tdf = normalizeTdfFile(raw, file.name);
        instance.tdfFile.set(tdf);
        instance.availableUnits.set(buildUnitOptions(tdf));
        instance.selectedUnitIndex.set(0);
        instance.selectionError.set(null);
      })
      .catch((error: unknown) => {
        instance.loadError.set(getErrorMessage(error));
      });
  },

  'change .stim-file-input'(event: any, instance: any) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    instance.loadError.set(null);
    readJsonFile(file)
      .then((raw) => {
        const stimData = normalizeStimFile(raw, file.name);
        instance.stimFile.set(stimData);
        const clusters = buildClusterOptions(stimData);
        instance.availableClusters.set(clusters);
        if (clusters.length) {
          instance.selectedClusterIndex.set(clusters[0].index);
          const stims = buildStimOptions(stimData, clusters[0].index);
          instance.availableStims.set(stims);
          instance.selectedStimIndex.set(stims.length ? stims[0].index : null);
        } else {
          instance.availableStims.set([]);
          instance.selectedStimIndex.set(null);
        }
        instance.selectionError.set(null);
      })
      .catch((error) => {
        instance.loadError.set(error.message);
      });
  },

  'change .unit-select'(event: any, instance: any) {
    instance.selectedUnitIndex.set(parseInt(event.currentTarget.value, 10));
  },

  'change .cluster-select'(event: any, instance: any) {
    const clusterIndex = parseInt(event.currentTarget.value, 10);
    instance.selectedClusterIndex.set(clusterIndex);

    const stimData = instance.stimFile.get();
    if (stimData) {
      const stims = buildStimOptions(stimData, clusterIndex);
      instance.availableStims.set(stims);
      instance.selectedStimIndex.set(stims.length ? stims[0].index : null);
    }
  },

  'change .stim-select'(event: any, instance: any) {
    instance.selectedStimIndex.set(parseInt(event.currentTarget.value, 10));
  },

  'change .testtype-select'(event: any, instance: any) {
    instance.selectedTestType.set(event.currentTarget.value);
  },

  'input .user-answer-input'(event: any, instance: any) {
    instance.userAnswer.set(event.currentTarget.value);
  },

  'input .feedback-message-input'(event: any, instance: any) {
    instance.feedbackMessage.set(event.currentTarget.value);
  },

  'change .timeout-toggle'(event: any, instance: any) {
    instance.isTimeout.set(event.currentTarget.checked);
  },

  'click .apply-selection-btn'(event: any, instance: any) {
    event.preventDefault();
    instance.selectionError.set(null);
    try {
      const { config, cardData } = buildConfigFromSelection(instance);
      instance.currentConfig.set(config);
      instance.currentCardData.set(cardData);
      Meteor.defer(() => syncSettingsFromConfig(instance));
    } catch (error: unknown) {
      instance.selectionError.set(getErrorMessage(error));
    }
  },

  'click .mode-btn-test'(event: any, instance: any) {
    instance.currentMode.set('test');
  },

  'click .mode-btn-study'(event: any, instance: any) {
    instance.currentMode.set('study');
  },

  'click .mode-btn-correct'(event: any, instance: any) {
    instance.currentMode.set('correct');
  },

  'click .mode-btn-incorrect'(event: any, instance: any) {
    instance.currentMode.set('incorrect');
  },

  'click .layout-btn-over-under'(event: any, instance: any) {
    updateConfigSetting(instance, 'uiSettings', 'stimuliPosition', 'top');
  },

  'click .layout-btn-split'(event: any, instance: any) {
    updateConfigSetting(instance, 'uiSettings', 'stimuliPosition', 'left');
  },

  'click .toggle-settings, click .settings-header'(event: any, instance: any) {
    event.preventDefault();
    instance.settingsExpanded.set(!instance.settingsExpanded.get());
  },

  'change .setting-fontsize'(event: any, instance: any) {
    updateConfigSetting(instance, 'deliveryparams', 'fontsize', event.target.value);
  },

  'change .setting-stimuliPosition'(event: any, instance: any) {
    updateConfigSetting(instance, 'uiSettings', 'stimuliPosition', event.target.value);
  },

  'change .setting-displayCorrectFeedback'(event: any, instance: any) {
    updateConfigSetting(instance, 'uiSettings', 'displayCorrectFeedback', event.target.checked);
  },

  'change .setting-displayIncorrectFeedback'(event: any, instance: any) {
    updateConfigSetting(instance, 'uiSettings', 'displayIncorrectFeedback', event.target.checked);
  },

  'change .setting-onlyShowSimpleFeedback'(event: any, instance: any) {
    updateConfigSetting(instance, 'uiSettings', 'onlyShowSimpleFeedback', parseTriStateSelectValue(event.target.value));
  },

  'change .setting-singleLineFeedback'(event: any, instance: any) {
    updateConfigSetting(instance, 'uiSettings', 'singleLineFeedback', event.target.checked);
  },

  'change .setting-displayCorrectAnswerInIncorrectFeedback'(event: any, instance: any) {
    updateConfigSetting(instance, 'uiSettings', 'displayCorrectAnswerInIncorrectFeedback', event.target.checked);
  },

  'change .setting-displayUserAnswerInFeedback'(event: any, instance: any) {
    updateConfigSetting(instance, 'uiSettings', 'displayUserAnswerInFeedback', parseTriStateSelectValue(event.target.value));
  },

  'change .setting-correctColor'(event: any, instance: any) {
    updateConfigSetting(instance, 'uiSettings', 'correctColor', event.target.value);
  },

  'change .setting-incorrectColor'(event: any, instance: any) {
    updateConfigSetting(instance, 'uiSettings', 'incorrectColor', event.target.value);
  },

  'change .setting-correctMessage'(event: any, instance: any) {
    updateConfigSetting(instance, 'uiSettings', 'correctMessage', event.target.value);
  },

  'change .setting-incorrectMessage'(event: any, instance: any) {
    updateConfigSetting(instance, 'uiSettings', 'incorrectMessage', event.target.value);
  },

  'change .setting-displaySubmitButton'(event: any, instance: any) {
    updateConfigSetting(instance, 'uiSettings', 'displaySubmitButton', event.target.checked);
  },

  'change .setting-inputPlaceholderText'(event: any, instance: any) {
    updateConfigSetting(instance, 'uiSettings', 'inputPlaceholderText', event.target.value);
  },

  'change .setting-isVideoSession'(event: any, instance: any) {
    updateConfigSetting(instance, 'uiSettings', 'isVideoSession', event.target.checked);
  },

  'change .setting-videoUrl'(event: any, instance: any) {
    updateConfigSetting(instance, 'uiSettings', 'videoUrl', event.target.value);
  },

  'change .setting-displayQuestionNumber'(event: any, instance: any) {
    updateConfigSetting(instance, 'uiSettings', 'displayQuestionNumber', event.target.checked);
  },

  'change .setting-displayTimeoutBar'(event: any, instance: any) {
    updateConfigSetting(instance, 'uiSettings', 'displayTimeoutBar', event.target.checked);
  },

  'change .setting-choiceButtonCols'(event: any, instance: any) {
    updateConfigSetting(instance, 'uiSettings', 'choiceButtonCols', parseInt(event.target.value, 10));
  },

  'change .setting-caseSensitive'(event: any, instance: any) {
    updateConfigSetting(instance, 'uiSettings', 'caseSensitive', event.target.checked);
  }
});







