import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import './audioSettings.html';
import {
  setTtsWarmedUp,
  getSrWarmedUp, setSrWarmedUp,
  setAudioInputSensitivity, setAudioInputSensitivityView,
  setAudioPromptFeedbackView,
  setAudioPromptQuestionVolume, setAudioPromptFeedbackVolume,
  setAudioPromptQuestionSpeakingRate, setAudioPromptFeedbackSpeakingRate,
  setAudioPromptQuestionSpeakingRateView, setAudioPromptFeedbackSpeakingRateView,
  setAudioPromptVoice, setAudioPromptFeedbackVoice,
  setAudioPromptVoiceView, setAudioPromptFeedbackVoiceView
} from '../lib/state/audioState';
import { getErrorMessage } from '../lib/errorUtils';
import { evaluateSrAvailability } from '../lib/audioAvailability';
import { resolveSpeechRecognitionLanguage } from '../lib/speechRecognitionConfig';
import { clientConsole } from '../lib/userSessionHelpers';

declare const $: any;

// Set up input sensitivity range to display/hide when audio input is enabled/disabled

// Cache success color to avoid repeated getComputedStyle calls during slider drag
let cachedSuccessColor: string | null = null;
const AUDIO_INPUT_SENSITIVITY_MIN = 20;
const AUDIO_INPUT_SENSITIVITY_MAX = 80;
const AUDIO_INPUT_SENSITIVITY_DEFAULT = 60;

function normalizeAudioInputSensitivity(value: unknown): number {
  const parsed = parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return AUDIO_INPUT_SENSITIVITY_DEFAULT;
  }
  return Math.min(AUDIO_INPUT_SENSITIVITY_MAX, Math.max(AUDIO_INPUT_SENSITIVITY_MIN, parsed));
}

function updateAudioInputSensitivityLabel(value: unknown) {
  const label = document.getElementById('audioInputSensitivityLabel');
  if (!label) return;
  label.textContent = String(normalizeAudioInputSensitivity(value));
}

// Update range slider fill color based on value
function updateRangeSliderFill(slider: any) {
  const value = slider.value;
  const min = slider.min || 0;
  const max = slider.max || 100;
  const percentage = ((value - min) / (max - min)) * 100;

  // Cache the success color on first call (avoid layout thrashing on every input event)
  if (!cachedSuccessColor) {
    cachedSuccessColor = getComputedStyle(document.documentElement).getPropertyValue('--success-color').trim() || '#28a745';
  }
  slider.style.background = `linear-gradient(to right, ${cachedSuccessColor} 0%, ${cachedSuccessColor} ${percentage}%, #ddd ${percentage}%, #ddd 100%)`;
}

// Default audio settings
const DEFAULT_AUDIO_SETTINGS = {
  audioPromptMode: 'silent',
  audioPromptQuestionVolume: 0,
  audioPromptQuestionSpeakingRate: 1,
  audioPromptVoice: 'en-US-Standard-A',
  audioPromptFeedbackVolume: 0,
  audioPromptFeedbackSpeakingRate: 1,
  audioPromptFeedbackVoice: 'en-US-Standard-A',
  audioInputMode: false,
  audioInputSensitivity: AUDIO_INPUT_SENSITIVITY_DEFAULT,
};

// Get user's audio settings with fallbacks to defaults
function getUserAudioSettings() {
  const user = Meteor.user() as any;
  if (!user) return DEFAULT_AUDIO_SETTINGS;

  // audioSettings should always exist (initialized by server publication)
  // Merge with defaults to handle any missing fields
  const settings = { ...DEFAULT_AUDIO_SETTINGS, ...(user.audioSettings || {}) };
  settings.audioInputSensitivity = normalizeAudioInputSensitivity(settings.audioInputSensitivity);
  return settings;
}

// Save a single audio setting to database (updates entire audioSettings object)
async function saveAudioSettingToDatabase(settingKey: any, settingValue: any) {
  try {
    // Get current settings
    const currentSettings = getUserAudioSettings();

    // Update the specific setting
    currentSettings[settingKey] = settingValue;

    // Save entire settings object
    await (Meteor as any).callAsync('saveAudioSettings', currentSettings);
  } catch (error: unknown) {
    clientConsole(1, '[Audio Settings] Error saving audio setting:', error);
    alert('Failed to save audio settings: ' + getErrorMessage(error));
  }
}

const showHideAudioEnabledGroup = function(show: any) {
  if (show) {
    $('.audioEnabledGroup').show();
    $('.audioEnabledGroup').addClass('flow');
  } else {
    $('.audioEnabledGroup').hide();
    $('.audioEnabledGroup').removeClass('flow');
  }
};

const showHideAudioInputGroup = function(show: any) {
  if (show) {
    $('.audioInputGroup').show();
    $('.audioInputGroup').addClass('flow');
  } else {
    $('.audioInputGroup').hide();
    $('.audioInputGroup').removeClass('flow');
  }
};

function getAudioPromptModeFromPage() {
  if ($('#audioPromptFeedbackOn')[0].checked && $('#audioPromptQuestionOn')[0].checked) {
    return 'all';
  } else if ($('#audioPromptFeedbackOn')[0].checked){
    return 'feedback';
  } else if ($('#audioPromptQuestionOn')[0].checked) {
    return 'question';
  } else {
    return 'silent';
  }
}

function setAudioPromptVolumeOnPage(audioVolume: any) {
  //Google's TTS API uses decibels to alter audio, the range is -96 to 16. 0 is default
  (document.getElementById('audioPromptVolume') as any).value = audioVolume;
}

function setAudioPromptModeOnPage(audioPromptMode: any) {
  switch (audioPromptMode) {
    case 'all':
      $('#audioPromptFeedbackOn')[0].checked = true;
      $('#audioPromptQuestionOn')[0].checked = true;
      break;
    case 'feedback':
      $('#audioPromptFeedbackOn')[0].checked = true;
      $('#audioPromptQuestionOn')[0].checked = false;
      break;
    case 'question':
      $('#audioPromptFeedbackOn')[0].checked = false;
      $('#audioPromptQuestionOn')[0].checked = true;
      break;
    default:
      $('#audioPromptFeedbackOn')[0].checked = false;
      $('#audioPromptQuestionOn')[0].checked = false;
      break;
  }
}

function getAudioInputFromPage() {
  return $('#audioInputOn')[0].checked;
}

function setAudioInputOnPage(audioInputEnabled: any) {
  if (audioInputEnabled) {
    $('#audioInputOn')[0].checked = true;
  } else {
    $('#audioInputOn')[0].checked = false;
  }
}

function showHideheadphonesSuggestedDiv(show: any) {
  if (show) {
    $('#headphonesSuggestedDiv').show();
  } else {
    $('#headphonesSuggestedDiv').hide();
  }
}

function showHideAudioPromptGroupDependingOnAudioPromptMode(audioPromptMode: any) {
  const audioPromptSharedGroup = $('.audioPromptSharedGroup');

  // Show shared controls if any audio mode is enabled
  if (audioPromptMode !== 'silent') {
    audioPromptSharedGroup.show();
    audioPromptSharedGroup.addClass('flow');
  } else {
    audioPromptSharedGroup.removeClass('flow');
    audioPromptSharedGroup.hide();
  }
}

Template.audioSettings.onRendered(async function(this: any) {
  // Load settings from database on page load
  const settings = getUserAudioSettings();

  // Batch all DOM updates in a single frame to avoid layout thrashing
  requestAnimationFrame(() => {
    // Set toggle states
    setAudioInputOnPage(settings.audioInputMode);
    setAudioPromptModeOnPage(settings.audioPromptMode);
    showHideAudioPromptGroupDependingOnAudioPromptMode(settings.audioPromptMode);

    // Set all control values (use first available value for shared controls)
    const volume = settings.audioPromptQuestionVolume || settings.audioPromptFeedbackVolume || 0;
    const speakingRate = settings.audioPromptQuestionSpeakingRate || settings.audioPromptFeedbackSpeakingRate || 1;
    const voice = settings.audioPromptVoice || settings.audioPromptFeedbackVoice || 'en-US-Standard-A';

    setAudioPromptVolumeOnPage(volume);
    (document.getElementById('audioPromptSpeakingRate') as any).value = speakingRate;
    (document.getElementById('audioPromptVoice') as any).value = voice;
    (document.getElementById('audioInputSensitivity') as any).value = settings.audioInputSensitivity;
    updateAudioInputSensitivityLabel(settings.audioInputSensitivity);

    // Initialize range slider fills (both in same frame)
    updateRangeSliderFill(document.getElementById('audioPromptVolume'));
    updateRangeSliderFill(document.getElementById('audioInputSensitivity'));

    // Show/hide appropriate groups
    showHideAudioInputGroup(settings.audioInputMode);
    showHideAudioEnabledGroup(settings.audioPromptMode != 'silent' || settings.audioInputMode);
    const showHeadphonesSuggestedDiv = settings.audioPromptMode != 'silent' && settings.audioInputMode;
    showHideheadphonesSuggestedDiv(showHeadphonesSuggestedDiv);
  });

  const srAvailability = evaluateSrAvailability({
    user: Meteor.user() as any,
    tdfFile: Session.get('currentTdfFile'),
    sessionSpeechApiKey: Session.get('speechAPIKey'),
  });
  clientConsole(2, '[Audio Settings] SR availability evaluated', srAvailability);

  // Update AudioState for backward compatibility (set both to same values)
  const volume = settings.audioPromptQuestionVolume || settings.audioPromptFeedbackVolume || 0;
  const speakingRate = settings.audioPromptQuestionSpeakingRate || settings.audioPromptFeedbackSpeakingRate || 1;
  const voice = settings.audioPromptVoice || settings.audioPromptFeedbackVoice || 'en-US-Standard-A';
  setAudioPromptQuestionVolume(volume);
  setAudioPromptFeedbackVolume(volume);
  setAudioPromptQuestionSpeakingRate(speakingRate);
  setAudioPromptFeedbackSpeakingRate(speakingRate);
  setAudioPromptVoice(voice);
  setAudioPromptFeedbackVoice(voice);
  setAudioInputSensitivity(settings.audioInputSensitivity);

  checkAndSetSpeechAPIKeyIsSetup();

  // Load API key if it exists
  if (Session.get('showSpeechAPISetup')) {
    try {
      const key = await (Meteor as any).callAsync('getUserSpeechAPIKey');
      if (key) {
        $('#speechAPIKey').val(key);
      }
    } catch (_error) {
      // Missing key is expected for users who have not configured speech API.
    }
  }

  // Note: TTS warmup on hot code reload is now handled in index.js Meteor.startup
  // This ensures it runs even if the user is already in a practice session

});

Template.audioSettings.onDestroyed(function(this: any) {
  // Reset cached color so it's recalculated if theme changes
  cachedSuccessColor = null;
});

Template.audioSettings.events({
  'click #audioPromptQuestionOn': function(event: any) {
    updateAudioPromptMode(event);
  },

  'click #audioPromptFeedbackOn': function(event: any) {
    updateAudioPromptMode(event);
  },

  'click #audioInputOn': async function(_event: any) {
    const audioInputEnabled = getAudioInputFromPage();

    const showHeadphonesSuggestedDiv = (getAudioPromptModeFromPage() != 'silent') && audioInputEnabled;

    showHideheadphonesSuggestedDiv(showHeadphonesSuggestedDiv);
    showHideAudioInputGroup(audioInputEnabled)
    showHideAudioEnabledGroup(audioInputEnabled || (getAudioPromptModeFromPage() != 'silent'));

    // FIX: Warm up Google Speech Recognition API when user enables audio input
    // This eliminates the cold start delay on first trial
    if (audioInputEnabled) {
      warmupGoogleSpeechRecognition();
    }

    //save the audio input mode to the user profile using unified settings
    await saveAudioSettingToDatabase('audioInputMode', audioInputEnabled);
  },

  'click #speechAPISubmit': async function(_e: any) {
    const key = $('#speechAPIKey').val();
    try {
      await (Meteor as any).callAsync('saveUserSpeechAPIKey', key);
      // Make sure to update our reactive session variable so the api key is
      // setup indicator updates
      checkAndSetSpeechAPIKeyIsSetup();

      
      alert('Speech API key has been saved');
    } catch (error) {
      // Make sure to update our reactive session variable so the api key is
      // setup indicator updates
      checkAndSetSpeechAPIKeyIsSetup();

      
      alert('Your changes were not saved! ' + error);
    }
  },

  'click #speechAPIDelete': async function(_e: any) {
    try {
      await (Meteor as any).callAsync('deleteUserSpeechAPIKey');
      // Make sure to update our reactive session variable so the api key is
      // setup indicator updates
      checkAndSetSpeechAPIKeyIsSetup();
      $('#speechAPIKey').val('');
      
      alert('Speech API key has been deleted');
    } catch (error) {
      // Make sure to update our reactive session variable so the api key is
      // setup indicator updates
      checkAndSetSpeechAPIKeyIsSetup();
      
      alert('Your changes were not saved! ' + error);
    }
  },

  'input #audioPromptVolume': function(event: any) {
    updateRangeSliderFill(event.currentTarget);
  },

  'change #audioPromptVolume': async function(event: any) {
    const value = parseFloat(event.currentTarget.value);
    updateRangeSliderFill(event.currentTarget);

    // Set both AudioState variables to the same value for backward compatibility
    setAudioPromptQuestionVolume(value);
    setAudioPromptFeedbackVolume(value);

    // Save both to database
    const currentSettings = getUserAudioSettings();
    currentSettings.audioPromptQuestionVolume = value;
    currentSettings.audioPromptFeedbackVolume = value;
    await (Meteor as any).callAsync('saveAudioSettings', currentSettings);
  },

  'change #audioPromptSpeakingRate': async function(event: any) {
    const value = parseFloat(event.currentTarget.value);
    // Set both AudioState variables to the same value for backward compatibility
    setAudioPromptQuestionSpeakingRate(value);
    setAudioPromptFeedbackSpeakingRate(value);
    setAudioPromptQuestionSpeakingRateView(value);
    setAudioPromptFeedbackSpeakingRateView(value);

    // Save both to database
    const currentSettings = getUserAudioSettings();
    currentSettings.audioPromptQuestionSpeakingRate = value;
    currentSettings.audioPromptFeedbackSpeakingRate = value;
    await (Meteor as any).callAsync('saveAudioSettings', currentSettings);
  },

  'change #audioPromptVoice': async function(event: any) {
    const value = event.currentTarget.value;
    // Set both voice variables to the same value for simplicity
    setAudioPromptVoice(value);
    setAudioPromptVoiceView(value);
    setAudioPromptFeedbackVoice(value);
    setAudioPromptFeedbackVoiceView(value);

    // Save both to database for backward compatibility
    const currentSettings = getUserAudioSettings();
    currentSettings.audioPromptVoice = value;
    currentSettings.audioPromptFeedbackVoice = value;
    await (Meteor as any).callAsync('saveAudioSettings', currentSettings);
  },

  'input #audioInputSensitivity': function(event: any) {
    const value = normalizeAudioInputSensitivity(event.currentTarget.value);
    event.currentTarget.value = value;
    updateAudioInputSensitivityLabel(value);
    updateRangeSliderFill(event.currentTarget);
  },

  'change #audioInputSensitivity': async function(event: any) {
    const value = normalizeAudioInputSensitivity(event.currentTarget.value);
    event.currentTarget.value = value;
    updateAudioInputSensitivityLabel(value);
    updateRangeSliderFill(event.currentTarget);

    setAudioInputSensitivity(value);
    setAudioInputSensitivityView(value);
    await saveAudioSettingToDatabase('audioInputSensitivity', value);
  },

  'click #audioPromptVoiceTest': function(event: any) {
    event.preventDefault();
    const voice = (document.getElementById('audioPromptVoice') as any).value;
    const audioObj = new Audio(`https://cloud.google.com/text-to-speech/docs/audio/${voice}.wav`);
    audioObj.play();
  }
});

Template.audioSettings.helpers({
  showSpeechAPISetup: function() {
    //check if Session variable useEmbeddedAPIKey is set
    if(Session.get('useEmbeddedAPIKeys')){
      return false;
    } else {
      return Session.get('showSpeechAPISetup');
    }
  },

  speechAPIKeyIsSetup: function() {
    return Session.get('speechAPIKeyIsSetup');
  },
});

async function checkAndSetSpeechAPIKeyIsSetup() {
  try {
    const data = await (Meteor as any).callAsync('isUserSpeechAPIKeySetup');
    Session.set('speechAPIKeyIsSetup', data);
  } catch (_err) {
    // API setup lookup failure should not break settings page render.
  }
}

async function updateAudioPromptMode(e: any){
  const audioPromptMode = getAudioPromptModeFromPage();

  (setAudioPromptFeedbackView as any)(audioPromptMode);
  //if toggle is on, show the warning, else hide it
  if (e.currentTarget.checked){
    $('.audioEnabledGroup').show();

    // FIX: Warm up Google TTS API when user enables audio prompts
    // This eliminates the 8-9 second cold start delay on first trial
    warmupGoogleTTS();
  } else if(audioPromptMode == 'silent' && !getAudioInputFromPage()){
    $('.audioEnabledGroup').hide();
  }
  showHideAudioPromptGroupDependingOnAudioPromptMode(audioPromptMode);

  //save the audio prompt mode to the user profile using unified settings
  await saveAudioSettingToDatabase('audioPromptMode', audioPromptMode);
}

export async function warmupGoogleTTS() {
  // Get voice from TDF if available, otherwise use default
  const tdfFile = Session.get('currentTdfFile');
  const voice = tdfFile?.tdfs?.tutor?.setspec?.audioPromptFeedbackVoice || 'en-US-Standard-A';
  const ttsLanguage = tdfFile?.tdfs?.tutor?.setspec?.textToSpeechLanguage || 'en-US';

  // Make a dummy TTS request to establish the Meteor method connection
  // Use valid text instead of "." - Google TTS rejects punctuation-only input
  // Server will handle key lookup (user personal key or TDF key fallback)
  try {
    await (Meteor as any).callAsync('makeGoogleTTSApiCall',
      Session.get('currentTdfId'),
      'warmup', // Valid word for synthesis
      1.0, // Default rate
      0.0, // Volume 0 (silent warmup)
      voice,
      ttsLanguage
    );
    setTtsWarmedUp(true);
  } catch (_err) {
    setTtsWarmedUp(false); // Allow retry on failure
  }
}

export async function warmupGoogleSpeechRecognition() {
  // Check if already warmed up
  if (getSrWarmedUp()) {
    return;
  }

  // Create minimal silent audio data (LINEAR16 format, 16kHz, 100ms of silence)
  // 16kHz * 100ms = 1600 samples, each sample is 2 bytes (16-bit) = 3200 bytes
  const silentAudioBytes = new Uint8Array(3200).fill(0);
  const base64Audio = btoa(String.fromCharCode.apply(null, Array.from(silentAudioBytes) as any));
  const speechRecognitionLanguage = resolveSpeechRecognitionLanguage(
    Session.get('currentTdfFile')?.tdfs?.tutor?.setspec
  );

  // Build minimal request matching production format
  const request = {
    config: {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,  // Using 16kHz (Google recommended)
      languageCode: speechRecognitionLanguage,
      maxAlternatives: 1,
      profanityFilter: false,
      enableAutomaticPunctuation: false,
      model: 'latest_short',
      useEnhanced: true,
      speechContexts: [{
        phrases: ['warmup'],  // Minimal phrase hint
        boost: 5
      }]
    },
    audio: {
      content: base64Audio
    }
  };

  // Make warmup call
  try {
    await (Meteor as any).callAsync('makeGoogleSpeechAPICall',
      Session.get('currentTdfId'),
      '', // Empty key - server will fetch TDF or user key
      request,
      ['warmup'] // Minimal answer grammar
    );
    setSrWarmedUp(true);
  } catch (_err) {
    setSrWarmedUp(false); // Allow retry on failure
  }
}





