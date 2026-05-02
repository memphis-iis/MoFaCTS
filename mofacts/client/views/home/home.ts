import {getExperimentState} from '../experiment/svelte/services/experimentState';
import {MODEL_UNIT, SCHEDULE_UNIT, VIDEO_UNIT} from '../../../common/Definitions';
import {sessionCleanUp} from '../../lib/sessionUtils';
import {checkUserSession, clientConsole} from '../../lib/userSessionHelpers';
import { CardStore } from '../experiment/modules/cardStore';
import { ExperimentStateStore } from '../../lib/state/experimentStateStore';
const { FlowRouter } = require('meteor/ostrio:flow-router-extra');
import {Cookie} from '../../lib/cookies';
import { Tracker } from 'meteor/tracker';
import './home.html';
import './home.css';
import { isConditionRootWithoutUnitArray, normalizeTutorUnits } from '../../lib/tdfUtils';
import { ensureCurrentStimuliSetId } from '../experiment/svelte/services/mediaResolver';
import { clearConditionResolutionContext, setActiveTdfContext } from '../../lib/idContext';
import { CARD_ENTRY_INTENT, resolveCardLaunchProgress, setCardEntryIntent, type CardEntryIntent } from '../../lib/cardEntryIntent';

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

declare const Template: any;
declare const Session: any;
declare const Meteor: any;
declare const GlobalExperimentStates: any;
declare const Tdfs: any;

export {selectTdf};

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

Template.home.onRendered(async function(this: any) {
  
  clientConsole(2, '[HOME] Template.home.onRendered called');
  // sessionCleanUp() removed - it's already called in selectTdf() at the right time
  // Calling it here causes problems because rendered() can fire multiple times
  // due to reactivity, clearing session variables while card.js is using them
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
});

// Actual logic for selecting and starting a TDF
 
async function selectTdf(currentTdfId: any, lessonName: any, currentStimuliSetId: any, ignoreOutOfGrammarResponses: any,
  speechOutOfGrammarFeedback: any, how: any, isMultiTdf: any, setspec: any, isExperiment = false, isRefresh = false) {
  clientConsole(2, 'Starting Lesson:', lessonName, 'tdfId:', currentTdfId,
      'stimuliSetId:', currentStimuliSetId, 'isMultiTdf:', isMultiTdf);

  const audioPromptFeedbackView = getAudioPromptFeedbackView();

  // make sure session variables are cleared from previous tests
  sessionCleanUp();
  Session.set('uiMessage', null);

  // Set the session variables we know
  // Note that we assume the root and current TDF ids start the same.
  // The canonical entry resolver / card bootstrap may later redirect to a
  // condition-specific TDF when the selected root participates in condition resolution.
  setActiveTdfContext({
    currentRootTdfId: currentTdfId,
    currentTdfId: currentTdfId,
    currentStimuliSetId: currentStimuliSetId,
  }, 'home.selectTdf.start');
  clearConditionResolutionContext('home.selectTdf.start');
  let globalExperimentState = GlobalExperimentStates.findOne({userId: Meteor.userId(), TDFId: currentTdfId}) || {};
  if (globalExperimentState) {
    ExperimentStateStore.set(globalExperimentState.experimentState);
  } else {
    ExperimentStateStore.set({});
  }
  const tdfSub = Meteor.subscribe('currentTdf', currentTdfId);
  await new Promise<void>((resolve) => {
    const handle = Tracker.autorun(() => {
      if (tdfSub.ready()) {
        handle.stop();
        resolve();
      }
    });
  });

  const tdfDoc = Tdfs.findOne({_id: currentTdfId});
  if (!tdfDoc || !tdfDoc.content) {
    clientConsole(1, '[HOME] Failed to load current TDF from subscription:', currentTdfId);
    alert('Unable to load the selected lesson. Please try again or contact support.');
    return;
  }
  let curTdfContent = tdfDoc.content;
  normalizeTutorUnits(curTdfContent);
  if (!Array.isArray(curTdfContent?.tdfs?.tutor?.unit)) {
    clientConsole(1, '[HOME] Selected TDF content missing tutor.unit; fetching full TDF by id:', currentTdfId);
    const fullTdfDoc = await (Meteor as any).callAsync('getTdfById', currentTdfId);
    curTdfContent = fullTdfDoc?.content;
    normalizeTutorUnits(curTdfContent);
    const isConditionRoot = isConditionRootWithoutUnitArray(curTdfContent);
    if (!Array.isArray(curTdfContent?.tdfs?.tutor?.unit) && !isConditionRoot) {
      const errorMsg = `[HOME] Selected TDF ${currentTdfId} is missing required content.tdfs.tutor.unit`;
      clientConsole(1, errorMsg);
      alert('Unable to start this lesson because the TDF unit list is missing.');
      return;
    }
    if (!Array.isArray(curTdfContent?.tdfs?.tutor?.unit) && isConditionRoot) {
      clientConsole(2, '[HOME] Selected root condition TDF without unit array; continuing via condition-resolve flow:', currentTdfId);
    }
  }
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
  }, 'home.selectTdf.loaded');
  ensureCurrentStimuliSetId(currentStimuliSetId || tdfDoc.stimuliSetId);
  CardStore.setIgnoreOutOfGrammarResponses(ignoreOutOfGrammarResponses);
  Session.set('speechOutOfGrammarFeedback', speechOutOfGrammarFeedback);
  Session.set('showPageNumbers', setspec.showPageNumbers ? setspec.showPageNumbers : false);
  const unitCount = Array.isArray(curTdfContent?.tdfs?.tutor?.unit) ? curTdfContent.tdfs.tutor.unit.length : 0;
  const persistedExperimentState = await getExperimentState();
  const launchProgress = resolveCardLaunchProgress(persistedExperimentState, unitCount);

  if (launchProgress.moduleCompleted) {
    clientConsole(2, '[HOME] Blocking lesson relaunch because persisted state is completed', {
      currentTdfId,
      unitCount,
      persistedUnitNumber: launchProgress.persistedUnitNumber,
      lastUnitCompleted: launchProgress.lastUnitCompleted,
    });
    Session.set('uiMessage', {
      text: 'This lesson has already been completed and cannot be reopened.',
      variant: 'warning'
    });
    return;
  }
    

  // Record state to restore when we return to this page
  let audioPromptMode;
  let audioInputEnabled;
  let audioPromptFeedbackSpeakingRate;
  let audioPromptQuestionSpeakingRate;
  let audioPromptVoice;
  let audioInputSensitivity;
  let audioPromptQuestionVolume
  let audioPromptFeedbackVolume
  let audioPromptFeedbackVoice
  const user = Meteor.user();
  const audioSettings = user?.audioSettings || {};
  if(isExperiment) {
    audioPromptMode = setspec.audioPromptMode || 'silent';
    audioInputEnabled = setspec.audioInputEnabled || false;
    audioPromptFeedbackSpeakingRate = setspec.audioPromptFeedbackSpeakingRate || 1;
    audioPromptQuestionSpeakingRate = setspec.audioPromptQuestionSpeakingRate || 1;
    audioPromptVoice = setspec.audioPromptVoice || 'en-US-Standard-A';
    audioInputSensitivity = audioSettings.audioInputSensitivity;
    audioPromptQuestionVolume = setspec.audioPromptQuestionVolume || 0;
    audioPromptFeedbackVolume = setspec.audioPromptFeedbackVolume || 0;
    audioPromptFeedbackVoice = setspec.audioPromptFeedbackVoice || 'en-US-Standard-A';
  }
  else {
    // Load from user's audioSettings if available, otherwise use defaults
    audioPromptMode = audioSettings.audioPromptMode || 'silent';
    audioInputEnabled = audioSettings.audioInputMode || false;
    audioPromptFeedbackSpeakingRate = audioSettings.audioPromptFeedbackSpeakingRate || 1;
    audioPromptQuestionSpeakingRate = audioSettings.audioPromptQuestionSpeakingRate || 1;
    audioPromptVoice = audioSettings.audioPromptVoice || 'en-US-Standard-A';
    audioInputSensitivity = audioSettings.audioInputSensitivity;
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
      clientConsole(1, 'Error getting user speech API key:', error);
    }
  }

  // Go directly to the card session - which will decide whether or
  // not to show instruction
  if (continueToCard) {
    if (!isRefresh) {
      if (isMultiTdf) {
        navigateForMultiTdf(launchProgress.intent);
      } else {
        setCardEntryIntent(launchProgress.intent, {
          source: 'home.selectTdf',
        });
        FlowRouter.go('/card');
      }
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

  const experimentState: any = await getExperimentState();
  const lastUnitCompleted = experimentState.lastUnitCompleted || -1;
  const lastUnitStarted = experimentState.lastUnitStarted || -1;
  let unitLocked = false;

  // If we haven't finished the unit yet, we may want to lock into the current unit
  // so the user can't mess up the data
  if (lastUnitStarted > lastUnitCompleted) {
    const curUnit = experimentState.currentTdfUnit; // Session.get("currentTdfUnit");
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
    setCardEntryIntent(entryIntent, {
      source: 'home.navigateForMultiTdf',
    });
    FlowRouter.go('/card');
  } else {
    FlowRouter.go('/multiTdfSelect');
  }
}





