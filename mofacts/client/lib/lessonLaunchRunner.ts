import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { MODEL_UNIT, SCHEDULE_UNIT, VIDEO_UNIT } from '../../common/Definitions';
import { getExperimentState } from '../views/experiment/svelte/services/experimentState';
import {
  CARD_ENTRY_INTENT,
  setCardEntryIntent,
  type CardEntryIntent,
} from './cardEntryIntent';
import { clientConsole } from './clientLogger';
import { prepareLessonLaunchContext } from './lessonLaunchInitializer';
import { sessionCleanUp } from './sessionUtils';
import {
  getAudioPromptFeedbackView,
  setAudioEnabled,
  setAudioEnabledView,
  setAudioInputSensitivity,
  setAudioInputSensitivityView,
  setAudioPromptFeedbackSpeakingRate,
  setAudioPromptFeedbackSpeakingRateView,
  setAudioPromptFeedbackView,
  setAudioPromptFeedbackVoice,
  setAudioPromptFeedbackVoiceView,
  setAudioPromptFeedbackVolume,
  setAudioPromptMode,
  setAudioPromptQuestionSpeakingRate,
  setAudioPromptQuestionSpeakingRateView,
  setAudioPromptQuestionVolume,
  setAudioPromptVoice,
  setAudioPromptVoiceView,
} from './state/audioState';

const { FlowRouter } = require('meteor/ostrio:flow-router-extra');

type SetSpecLike = Record<string, any>;

function getUnitType(curUnit: any) {
  if (curUnit?.assessmentsession) {
    return SCHEDULE_UNIT;
  }
  if (curUnit?.videosession) {
    return VIDEO_UNIT;
  }
  if (curUnit?.learningsession) {
    return MODEL_UNIT;
  }
  return 'other';
}

async function navigateForMultiTdf(entryIntent: CardEntryIntent = CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY) {
  const experimentState: any = await getExperimentState();
  const lastUnitCompleted = experimentState.lastUnitCompleted || -1;
  const currentUnitNumber = typeof experimentState.currentUnitNumber === 'number'
    ? experimentState.currentUnitNumber
    : -1;
  let unitLocked = false;

  if (currentUnitNumber > lastUnitCompleted) {
    const unitList = Session.get('currentTdfFile')?.tdfs?.tutor?.unit;
    const curUnit = Array.isArray(unitList) ? unitList[currentUnitNumber] : null;
    const curUnitType = getUnitType(curUnit);
    if (curUnitType === SCHEDULE_UNIT) {
      unitLocked = true;
    } else if (curUnitType === MODEL_UNIT || curUnitType === VIDEO_UNIT) {
      const deliverySettings = curUnit?.deliverySettings || {};
      if (
        !!deliverySettings.displayMinSeconds ||
        !!deliverySettings.displayMaxSeconds ||
        !!curUnit.displayMinSeconds ||
        !!curUnit.displayMaxSeconds
      ) {
        unitLocked = true;
      }
    }
  }

  if (unitLocked) {
    setCardEntryIntent(entryIntent, {
      source: 'lessonLaunch.navigateForMultiTdf',
    });
    FlowRouter.go('/card');
  } else {
    FlowRouter.go('/multiTdfSelect');
  }
}

export async function selectTdf(
  currentTdfId: any,
  lessonName: any,
  currentStimuliSetId: any,
  ignoreOutOfGrammarResponses: any,
  speechOutOfGrammarFeedback: any,
  how: any,
  isMultiTdf: any,
  setspec: SetSpecLike,
  isExperiment = false,
  isRefresh = false,
) {
  clientConsole(2, 'Starting Lesson:', lessonName, 'tdfId:', currentTdfId,
    'stimuliSetId:', currentStimuliSetId, 'isMultiTdf:', isMultiTdf, 'source:', how);

  const audioPromptFeedbackView = getAudioPromptFeedbackView();

  sessionCleanUp();
  Session.set('uiMessage', null);

  let preparedLaunch;
  try {
    preparedLaunch = await prepareLessonLaunchContext({
      currentTdfId,
      currentStimuliSetId,
      ignoreOutOfGrammarResponses,
      speechOutOfGrammarFeedback,
      source: 'lessonLaunch.selectTdf',
    });
  } catch (error) {
    clientConsole(1, '[LessonLaunch] Failed to load launch-ready TDF:', currentTdfId, error);
    alert('Unable to load the selected lesson. Please try again or contact support.');
    return;
  }

  const curTdfContent = preparedLaunch.content;
  Session.set('showPageNumbers', setspec.showPageNumbers ? setspec.showPageNumbers : false);
  const { launchProgress, unitCount } = preparedLaunch;

  if (launchProgress.moduleCompleted) {
    clientConsole(2, '[LessonLaunch] Blocking lesson relaunch because persisted state is completed', {
      currentTdfId,
      unitCount,
      persistedUnitNumber: launchProgress.persistedUnitNumber,
      lastUnitCompleted: launchProgress.lastUnitCompleted,
    });
    Session.set('uiMessage', {
      text: 'This lesson has already been completed and cannot be reopened.',
      variant: 'warning',
    });
    return;
  }

  const user = Meteor.user() as any;
  const audioSettings = user?.audioSettings || {};
  let audioPromptMode;
  let audioInputEnabled;
  let audioPromptFeedbackSpeakingRate;
  let audioPromptQuestionSpeakingRate;
  let audioPromptVoice;
  let audioInputSensitivity;
  let audioPromptQuestionVolume;
  let audioPromptFeedbackVolume;
  let audioPromptFeedbackVoice;

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

  setAudioPromptFeedbackSpeakingRate(audioPromptFeedbackSpeakingRate);
  setAudioPromptQuestionSpeakingRate(audioPromptQuestionSpeakingRate);
  setAudioPromptVoice(audioPromptVoice);
  setAudioPromptFeedbackVoice(audioPromptFeedbackVoice);
  setAudioInputSensitivity(audioInputSensitivity);

  const audioPromptFeedbackMode = String((audioPromptFeedbackView as unknown) || '');
  const userAudioPromptFeedbackToggled =
    audioPromptFeedbackMode === 'feedback' ||
    audioPromptFeedbackMode === 'all' ||
    audioPromptFeedbackMode === 'question';
  const tdfAudioPromptFeedbackEnabled = !!curTdfContent.tdfs.tutor.setspec.enableAudioPromptAndFeedback &&
    curTdfContent.tdfs.tutor.setspec.enableAudioPromptAndFeedback === 'true';
  const audioPromptFeedbackEnabled = Session.get('experimentTarget')
    ? tdfAudioPromptFeedbackEnabled
    : tdfAudioPromptFeedbackEnabled && userAudioPromptFeedbackToggled;
  Session.set('enableAudioPromptAndFeedback', audioPromptFeedbackEnabled);

  const userAudioToggled = audioInputEnabled;
  const tdfAudioEnabled = curTdfContent.tdfs.tutor.setspec.audioInputEnabled
    ? curTdfContent.tdfs.tutor.setspec.audioInputEnabled === 'true'
    : false;
  const audioEnabled = !Session.get('experimentTarget') ? (tdfAudioEnabled && userAudioToggled) : tdfAudioEnabled;
  setAudioEnabled(audioEnabled);

  if (audioEnabled) {
    try {
      const key = await (Meteor as any).callAsync('getUserSpeechAPIKey');
      Session.set('speechAPIKey', key);
    } catch (error) {
      clientConsole(1, 'Error getting user speech API key:', error);
    }
  }

  if (!isRefresh) {
    if (isMultiTdf) {
      await navigateForMultiTdf(launchProgress.intent);
    } else {
      setCardEntryIntent(launchProgress.intent, {
        source: 'lessonLaunch.selectTdf',
      });
      FlowRouter.go('/card');
    }
  }
}
