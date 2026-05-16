export {sessionCleanUp, clearMappingSessionStateForCleanup};
import {playerController, destroyPlyr} from "../lib/plyrHelper";
import {resetAudioState} from "./state/audioState";
import {audioManager} from "./audioContextManager";
import { clientConsole } from "./clientLogger";
import { clearEngine } from "./engineManager";
import { clearCardEntryContext } from "./cardEntryIntent";
import { CardStore } from "../views/experiment/modules/cardStore";
import { deliverySettingsStore } from "./state/deliverySettingsStore";
import { ExperimentStateStore } from "./state/experimentStateStore";
import { clearMappingRecordFromSession } from "../views/experiment/svelte/services/mappingRecordService";
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

function sessionCleanUp() {
  

  // CRITICAL: Add protection - don't clear unit state if navigating to /card from /instructions
  const fromInstructions = Session.get('fromInstructions');
  const cardBootstrapInProgress = Session.get('cardBootstrapInProgress') === true;
  const targetPath = document?.location?.pathname;
  const preserveUnitStateForCard = targetPath === '/card' && (fromInstructions || cardBootstrapInProgress);

  if (preserveUnitStateForCard) {
    clientConsole(1, '[Session] Skipping unit state cleanup on /card to avoid init race', {
      reason: fromInstructions ? 'instructions-transition' : 'card-bootstrap',
      currentUnitNumber: Session.get('currentUnitNumber'),
      currentTdfUnit: Session.get('currentTdfUnit')?.unitname,
    });

    // Clean up other session vars but PRESERVE unit state
    Session.get('currentAnswer', undefined);
    Session.set('alternateDisplayIndex', undefined);

    // Reset all audio state (Phase 3 migration)
    resetAudioState();

    Session.set('buttonTrial', false);
    Session.set('showPageNumbers', false);
    Session.set('schedule', undefined);

    Session.set('wasReportedForRemoval', false);
    CardStore.resetHiddenItems();
    Session.set('numVisibleCards', 0);

    // PRESERVE: currentTdfName, currentTdfId, currentUnitNumber, currentTdfUnit

    Session.set('currentStimuliSet', undefined);
    Session.set('submmissionLock', false);
    // curStudentPerformance preserved for continuity
    // deliverySettingsStore preserved
    // ExperimentStateStore preserved
    // currentRootTdfId preserved

    Session.set('clusterIndex', undefined);
    clearMappingSessionStateForCleanup();

    Session.set('displayReady', undefined);
    Session.set('currentDisplay', undefined);
    Session.set('originalQuestion', undefined);
    Session.set('engineIndices', undefined);

    // currentUnitStartTime preserved
    // currentScore preserved
    // overallOutcomeHistory preserved
    Session.set('enableAudioPromptAndFeedback', false);
    Session.set('errorReportStart', undefined);
    Session.set('mainCardTimeoutStart', undefined);
    Session.set('pausedLocks', 0);
    Session.set('experimentPasswordRequired', false);
    Session.set('filter', '@gmail.com');
    Session.set('ignoreOutOfGrammarResponses', false);
    Session.set('inResume', false);
    Session.set('resumeInProgress', false);
    clearCardEntryContext();
    CardStore.resetQuestionIndex();
    Session.set('recording', false);
    Session.set('sampleRate', undefined);
    // unitType preserved
    Session.set('speechOutOfGrammarFeedback', undefined);
    Session.set('subTdfIndex', undefined);
    Session.set('testType', undefined);
    Session.set('scoringEnabled', undefined);
    Session.set('feedbackParamsSet', undefined);
    Session.set('instructionQuestionResult', undefined);
    Session.set('curTdfTips', undefined);
    Meteor.clearInterval(Session.get('CurIntervalId'));
    Session.set('CurIntervalId', undefined);
    Meteor.clearTimeout(Session.get('CurTimeoutId'));
    Session.set('CurTimeoutId', undefined);
    Meteor.clearInterval(Session.get('varLenTimeoutName'));
    Session.set('varLenTimeoutName', null);
    Session.set('recordingLocked', false);
    Session.set('selectedTdfDueDate', undefined);
    Session.set('currentStimProbFunctionParameters', undefined);
    // furthestUnit preserved
    // curUnitInstructionsSeen preserved (will be used to skip re-showing instructions)

    // Reset CardStore (source of truth for card-scoped state)
    CardStore.resetReactiveDefaults();

    // Engine preserved - don't clear it

    if (playerController) {
      destroyPlyr();
    }

    // Clean up all audio resources (Phase 4 migration)
    audioManager.cleanup();

    // Reset flag after use
    Session.set('fromInstructions', false);

    
    return; // Early exit - preserve unit state
  }

  

  Session.get('currentAnswer', undefined);
  Session.set('alternateDisplayIndex', undefined);

  // Reset all audio state (Phase 3 migration)
  resetAudioState();

  Session.set('buttonTrial', false);
  Session.set('showPageNumbers', false);
  Session.set('schedule', undefined);

  Session.set('wasReportedForRemoval', false);
  CardStore.resetHiddenItems();
  Session.set('numVisibleCards', 0);

  Session.set('currentTdfName', undefined);
  Session.set('currentTdfId', undefined);
  Session.set('currentUnitNumber', undefined);
  clientConsole(1, '[Session] Clearing currentTdfUnit during session cleanup', {
    path: document?.location?.pathname,
    stack: new Error().stack,
  });
  Session.set('currentTdfUnit', undefined);
  Session.set('currentStimuliSet', undefined);
  Session.set('submmissionLock', false);
  Session.set('curStudentPerformance', undefined);
  deliverySettingsStore.set({});
  ExperimentStateStore.clear();
  Session.set('currentRootTdfId', undefined);
  Session.set('conditionTdfId', undefined);
  ExperimentStateStore.clear();

  Session.set('clusterIndex', undefined);
  clearMappingSessionStateForCleanup();

  Session.set('displayReady', undefined);
  Session.set('currentDisplay', undefined);
  Session.set('originalQuestion', undefined);
  Session.set('engineIndices', undefined);

  Session.set('currentUnitStartTime', Date.now());
  Session.set('currentScore', 0);
  Session.set('overallOutcomeHistory', []);
  Session.set('overallStudyHistory', []);
  Session.set('enableAudioPromptAndFeedback', false);
  Session.set('errorReportStart', undefined);
  Session.set('mainCardTimeoutStart', undefined);
  Session.set('pausedLocks', 0);
  Session.set('experimentPasswordRequired', false);
  Session.set('filter', '@gmail.com');
  Session.set('ignoreOutOfGrammarResponses', false);
  Session.set('inResume', false);
  Session.set('resumeInProgress', false);
  clearCardEntryContext();
  CardStore.resetQuestionIndex();
  Session.set('recording', false);
  Session.set('sampleRate', undefined);
  Session.set('unitType', undefined);
  Session.set('speechOutOfGrammarFeedback', undefined);
  Session.set('subTdfIndex', undefined);
  Session.set('testType', undefined);
  Session.set('scoringEnabled', undefined);
  Session.set('feedbackParamsSet', undefined);
  Session.set('instructionQuestionResult', undefined);
  Session.set('curTdfTips', undefined)
  Meteor.clearInterval(Session.get('CurIntervalId'))
  Session.set('CurIntervalId', undefined)
  Meteor.clearTimeout(Session.get('CurTimeoutId'));
  Session.set('CurTimeoutId', undefined);
  Meteor.clearInterval(Session.get('varLenTimeoutName'));
  Session.set('varLenTimeoutName', null)
  Session.set('recordingLocked', false);
  Session.set('selectedTdfDueDate', undefined);
  Session.set('currentStimProbFunctionParameters', undefined);
  Session.set('furthestUnit', undefined);
  Session.set('curUnitInstructionsSeen', false);

  // Reset CardStore (source of truth for card-scoped state)
  CardStore.resetReactiveDefaults();

  clearEngine();

  if(playerController) {
    destroyPlyr();
  }

  // Clean up all audio resources (Phase 4 migration)
  audioManager.cleanup();
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
  Session.set('ownerDashboardLaunch', false);
}



