export {sessionCleanUp, clearMappingSessionStateForCleanup};
import {resetAudioState} from "./state/audioState";
import {audioManager} from "./audioContextManager";
import { clientConsole } from "./clientLogger";
import { clearEngine } from "./engineManager";
import { clearCardEntryContext } from "./cardEntryIntent";
import { CardStore } from "../views/experiment/modules/cardStore";
import { deliverySettingsStore } from "./state/deliverySettingsStore";
import { ExperimentStateStore } from "./state/experimentStateStore";
import { clearMappingRecordFromSession } from "../views/experiment/svelte/services/mappingRecordService";
import {
  applySessionCleanupEntries,
  CARD_RUNTIME_SESSION_DEFAULTS,
  FULL_LAUNCH_SESSION_DEFAULTS,
} from "./sessionCleanupRegistry";
declare const Session: any;
declare const Meteor: any;
declare const GlobalExperimentStates: any;

/* *****************************************************************
 * All of our currently known session variables
 * *****************************************************************
 * audioEnabled              - Did either the user or the tdf enable audio input for the current practice set?
 * audioEnabledView          - Did user enable audio input? Used to work around sessionCleanUp on card load
 * audioInputSensitivity     - Value from ? to ? for tuning audio input sensitivity
 * audioPromptFeedbackView   - Used to restore value on profile refresh after navigating away
 * audioPromptSpeakingRate   - Value from 0.1 to 2. Acts as percentage relative to 1, i.e. 2 is twice as fast as normal
 * audioPromptSpeakingRateView - Used to restore value on profile refresh after navigating away
 * audioToggled              - var to hold audioEnabled toggle state when navigating back to profile
 * buttonTrial
 * cardEntryIntent
 * cardEntrySource
 * cardEntryRootTdfId
 * cardEntryCurrentTdfId
 * cardEntryUnitNumber
 * cardEntryStartedAt
 * clusterIndex
 * clusterMapping            - For an entire experiment
 * currentAnswer
 * currentDisplay            - Entire display json structure with clozeText, text, imgSrc, audioSrc, videoSrc
 * currentRootTdfId
 * currentTdfName
 * currentTdfId
 * currentScore
 * currentUnitNumber
 * currentUnitStartTime      - Mostly only for lock-outs
 * debugging                 - Generic debugging flag
 * enableAudioPromptAndFeedback
 * experimentPasswordRequired - If enabled we'll prompt for a password in the experiment page
 * experimentTarget          - untouched in sessionCleanUp
 * experimentXCond           - untouched in sessionCleanUp
 * filter                    - filter for user admin page
 * ignoreOutOfGrammarResponses - speech input, only transcribe if recognized word in answer set
 * loginMode                 - untouched in sessionCleanUp
 * inResume
 * questionIndex
 * recording
 * runSimulation
 * sampleRate
 * speechAPIKeyIsSetup       - Indicates if we have a *user* provided speech api key (there may be one in the tdf file)
 * speechOutOfGrammarFeedback - What should we display when transcription is ignored when out of grammar
 * testType
 * */

// Handle an entire session - note that we current don't limit this to the
// client... but maybe we should?
function clearMappingSessionStateForCleanup() {
  clearMappingRecordFromSession();
}

function clearSessionTimersForCleanup() {
  Meteor.clearInterval(Session.get('CurIntervalId'));
  Session.set('CurIntervalId', undefined);
  Meteor.clearTimeout(Session.get('CurTimeoutId'));
  Session.set('CurTimeoutId', undefined);
  Meteor.clearInterval(Session.get('varLenTimeoutName'));
  Session.set('varLenTimeoutName', null);
}

function resetSharedCardRuntimeState(options: { preserveCardEntryContext?: boolean } = {}) {
  Session.set('currentAnswer', undefined);
  resetAudioState();
  CardStore.resetHiddenItems();
  applySessionCleanupEntries(Session, CARD_RUNTIME_SESSION_DEFAULTS);
  clearMappingSessionStateForCleanup();
  if (!options.preserveCardEntryContext) {
    clearCardEntryContext();
  }
  CardStore.resetQuestionIndex();
  clearSessionTimersForCleanup();
  CardStore.resetReactiveDefaults();

  audioManager.cleanup();
}

function shouldPreserveUnitStateForCard() {
  const fromInstructions = Session.get('fromInstructions');
  const cardBootstrapInProgress = Session.get('cardBootstrapInProgress') === true;
  const targetPath = document?.location?.pathname;
  return targetPath === '/card' && (fromInstructions || cardBootstrapInProgress);
}

function sessionCleanUp() {
  const fromInstructions = Session.get('fromInstructions');

  if (shouldPreserveUnitStateForCard()) {
    clientConsole(1, '[Session] Skipping unit state cleanup on /card to avoid init race', {
      reason: fromInstructions ? 'instructions-transition' : 'card-bootstrap',
      currentUnitNumber: Session.get('currentUnitNumber'),
      currentTdfUnit: Session.get('currentTdfUnit')?.unitname,
    });

    resetSharedCardRuntimeState({ preserveCardEntryContext: true });
    Session.set('fromInstructions', false);
    return;
  }

  resetSharedCardRuntimeState();

  clientConsole(1, '[Session] Clearing currentTdfUnit during session cleanup', {
    path: document?.location?.pathname,
    stack: new Error().stack,
  });
  applySessionCleanupEntries(Session, FULL_LAUNCH_SESSION_DEFAULTS);
  deliverySettingsStore.set({});
  ExperimentStateStore.clear();
  ExperimentStateStore.clear();

  clearEngine();
  const currentExperimentState = ExperimentStateStore.get();
  if (currentExperimentState) {
    let mergedExperimentState = currentExperimentState;
    let globalExperimentState = GlobalExperimentStates.findOne({TDFId: Session.get('currentRootTdfId')})
    if(globalExperimentState){
      mergedExperimentState = Object.assign(globalExperimentState.experimentState, mergedExperimentState);
      GlobalExperimentStates.update({_id: globalExperimentState._id}, {$set: {experimentState: mergedExperimentState}});
    }
  }
  Session.set('currentRootTdfId', undefined);
  Session.set('conditionTdfId', undefined);
}



