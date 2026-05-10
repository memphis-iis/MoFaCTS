import {currentUserHasRole} from '../../lib/roleUtils';
import {
  extractDelimFields,
  rangeVal,
  getStimCount,
  getStimCluster,
  getStimKCBaseForCurrentStimuliSet,
  getTestType,
  shuffle,
  randomChoice,
  createStimClusterMapping,
  updateCurStudentPerformance,
  updateCurStudedentPracticeTime
} from '../../lib/currentTestingHelpers';
import { createExperimentState } from './svelte/services/experimentState';
import { unitIsFinished } from './unitProgression';
import { CardStore } from './modules/cardStore';
import { DeliveryParamsStore } from '../../lib/state/deliveryParamsStore';
import { ExperimentStateStore } from '../../lib/state/experimentStateStore';
import {MODEL_UNIT, SCHEDULE_UNIT} from '../../../common/Definitions';
import {meteorCallAsync} from '../../index';
import {clientConsole} from '../../lib/userSessionHelpers';
import {displayify} from '../../../common/globalHelpers';
import {Answers} from './answerAssess';
import { AdaptiveQuestionLogic } from './adaptiveQuestionLogic';
import { reconstructLearningStateFromHistory } from './svelte/services/historyReconstruction';
import { hasScheduleArtifactForUnit } from './svelte/services/assessmentResume';
import { applyDisplayFieldSubset } from '../../../common/lib/displayFieldSubsets';

const _ = (globalThis as any)._;
const Tdfs = (globalThis as any).Tdfs;

import { legacyDisplay, legacyFloat, legacyInt, legacyTrim } from '../../../common/underscoreCompat';

export {createScheduleUnit, createModelUnit, createEmptyUnit, createVideoUnit};

const blank = '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';

type StimClusterLike = {
  stims: Array<{
    correctResponse: string;
    params: string;
  }>;
};

function setCardState(key: any, value: any) {
  CardStore.setCardValue(key, value);
}

async function create(func: any, curExperimentData: any) {
  const baseEngine = await defaultUnitEngine(curExperimentData);
  const engineExtension = await func();
  const engine = _.extend(baseEngine, engineExtension);
  await engine.init();
  return engine;
}

// Must be global: TDF calculateProbability snippets call getRandomInt() via eval
function getRandomInt(max: any) {
  return Math.floor(Math.random() * max);
}
(globalThis as any).getRandomInt = getRandomInt;

function stripSpacesAndLowerCase(input: any) {
  return input.replace(/ /g, '').toLowerCase();
}

function getHistoryCorrectAnswer(rawResponse: any) {
  const fullResponse = legacyTrim(String(rawResponse || ''));
  return fullResponse.split('~')[0] || '';
}

function getHistoryResponseKey(rawResponse: any) {
  const firstVariant = getHistoryCorrectAnswer(rawResponse);
  return stripSpacesAndLowerCase(Answers.getDisplayAnswerText(firstVariant));
}

function buildHiddenItemKeySet(hiddenItems: any[]): Set<string> {
  const hiddenItemKeys = new Set<string>();
  for (const item of hiddenItems || []) {
    if (item === null || item === undefined) {
      continue;
    }
    if (typeof item === 'object' && item !== null && 'KCId' in item) {
      hiddenItemKeys.add(String((item as { KCId?: unknown }).KCId));
      continue;
    }
    hiddenItemKeys.add(String(item));
  }
  return hiddenItemKeys;
}

function getStimAnswer(clusterIndex: any, whichAnswer: any) {
  const cluster = getStimCluster(clusterIndex) as StimClusterLike;
  const stim = cluster.stims[whichAnswer];
  if (!stim) {
    throw new Error(`Stim not found for cluster ${clusterIndex}, stim ${whichAnswer}`);
  }
  return stim.correctResponse;
}

function shouldExcludeCurrentCard(
  clusterIndex: number,
  stimIndex: number,
  selectionOptions: any,
) {
  const excludedRef = selectionOptions?.excludeCurrentCardRef;
  if (!excludedRef) {
    return false;
  }

  return excludedRef.clusterIndex === clusterIndex && excludedRef.stimIndex === stimIndex;
}

async function createEmptyUnit(curExperimentData: any) {
  return await create(emptyUnitEngine, curExperimentData);
}

async function createModelUnit(curExperimentData: any) {
  return await create(modelUnitEngine, curExperimentData);
}

async function createScheduleUnit(curExperimentData: any) {
  return await create(scheduleUnitEngine, curExperimentData);
}

async function createVideoUnit(curExperimentData: any) {
  return await create(videoUnitEngine, curExperimentData);
}

// Return an instance of the "base" engine
async function defaultUnitEngine(curExperimentData: any) {
  let stimClusters: any = [];
  const numQuestions = getStimCount();
  for (let i = 0; i < numQuestions; ++i) {
    stimClusters.push(getStimCluster(i));
  }
  const engine: any = {
    // Things actual engines must supply
    unitType: 'DEFAULT',
      //check if the unit is adaptive
    
    adaptiveQuestionLogic: new AdaptiveQuestionLogic(),
    selectNextCard: function() {
      throw new Error('Missing Implementation');
    },
    prefetchNextCard: function() {
      // Default engines may not support prefetch; no-op
    },
    applyPrefetchedNextCard: async function() {
      return false;
    },
    clearPrefetchedNextCard: function() {},
    cardAnswered: async function() {
      throw new Error('Missing Implementation');
    },
    unitFinished: function() {
      throw new Error('Missing Implementation');
    },
    calculateIndices: function() {
      throw new Error('Missing Implementation');
    },
    loadResumeState: async function() { },

    // Optional functions that engines can replace if they want
    initImpl: async function() { },
    // reinitializeClusterListsFromCurrentSessionData: function() { },

    // Functions we supply
    init: async function() {
      clientConsole(1, 'Engine created for unit:', this.unitType);
      await this.initImpl();
    },

    buildPreparedCardQuestionAndAnswerGlobals: async function(cardIndex: any, whichStim: any, probFunctionParameters: any, options: any = {}) {
      const newExperimentState: any = {};
      const cluster = stimClusters[cardIndex];
      clientConsole(1, 'setUpCardQuestionAndAnswerGlobals', cardIndex, whichStim, probFunctionParameters,
          cluster, cluster.stims[whichStim]);
      const curStim = cluster.stims[whichStim];
      let currentDisplay = JSON.parse(JSON.stringify({
        text: curStim.textStimulus,
        audioSrc: curStim.audioStimulus,
        imgSrc: curStim.imageStimulus,
        videoSrc: curStim.videoStimulus,
        clozeText: curStim.clozeStimulus || curStim.clozeText
      }));
      let resolvedAlternateDisplayIndex = undefined;
      if (curStim.alternateDisplays) {
        const numPotentialDisplays = curStim.alternateDisplays.length + 1;
        const displayIndex = Number.isFinite(options?.alternateDisplayIndex)
          ? Number(options.alternateDisplayIndex)
          : Math.floor(numPotentialDisplays * Math.random());
        if (displayIndex < curStim.alternateDisplays.length) {
          resolvedAlternateDisplayIndex = displayIndex;
          newExperimentState.alternateDisplayIndex = displayIndex;
          const curAltDisplay = curStim.alternateDisplays[displayIndex];
          currentDisplay = JSON.parse(JSON.stringify({
            text: curAltDisplay.textStimulus,
            audioSrc: curAltDisplay.audioStimulus,
            imgSrc: curAltDisplay.imageStimulus,
            videoSrc: curAltDisplay.videoStimulus,
            clozeText: curAltDisplay.clozeStimulus || curAltDisplay.clozeText
          }));
        }
      }
      const testType = options?.testType || Session.get('testType') || 'd';
      const originalDisplay = JSON.parse(JSON.stringify(currentDisplay));
      currentDisplay = JSON.parse(JSON.stringify(
        applyDisplayFieldSubset(currentDisplay, DeliveryParamsStore.get(), testType)
      ));
      newExperimentState.originalDisplay = originalDisplay;

      let currentQuestion = currentDisplay.clozeText || currentDisplay.text;
      currentQuestion = typeof currentQuestion === 'string' ? currentQuestion : '';
      let currentQuestionPart2 = undefined;
      let currentStimAnswer = getStimAnswer(cardIndex, whichStim);

      newExperimentState.originalAnswer = currentStimAnswer;
      currentStimAnswer = currentStimAnswer.toLowerCase();

      // If we have a dual prompt question populate the spare data field
      if (currentQuestion && currentQuestion.indexOf('|') != -1) {
        const prompts = currentQuestion.split('|');
        currentQuestion = prompts[0];
        currentQuestionPart2 = prompts[1];
      }
      newExperimentState.originalQuestion = currentQuestion;
      newExperimentState.originalQuestion2 = currentQuestionPart2;

      // Format cloze questions by replacing underscores with styled blanks
      const regex = /([_])+/g;
      const formattedQuestion = currentQuestion
        ? currentQuestion.replaceAll(regex, `<u>${blank + blank}</u>`)
        : '';

      clientConsole(1, 'setUpCardQuestionAndAnswerGlobals2:', formattedQuestion, currentQuestionPart2);

      newExperimentState.currentAnswer = currentStimAnswer;
      newExperimentState.currentQuestionPart2 = currentQuestionPart2;

      if (formattedQuestion && currentDisplay.clozeText) {
        currentDisplay.clozeText = formattedQuestion;
      } else if (formattedQuestion && currentDisplay.text) {
        currentDisplay.text = formattedQuestion;
      }
      newExperimentState.currentDisplayEngine = currentDisplay;

      return {
        cardIndex,
        whichStim,
        probFunctionParameters,
        currentAnswer: currentStimAnswer,
        originalDisplay,
        currentDisplay,
        alternateDisplayIndex: resolvedAlternateDisplayIndex,
        newExperimentState,
      };
    },

    applyPreparedCardQuestionAndAnswerGlobals: function(preparedState: any) {
      const newExperimentState = JSON.parse(JSON.stringify(preparedState?.newExperimentState || {}));
      const alternateDisplayIndex = preparedState?.alternateDisplayIndex;
      Session.set('alternateDisplayIndex', undefined);
      CardStore.setAlternateDisplayIndex(undefined);
      if (typeof alternateDisplayIndex === 'number') {
        Session.set('alternateDisplayIndex', alternateDisplayIndex);
        CardStore.setAlternateDisplayIndex(alternateDisplayIndex);
      }
      CardStore.setOriginalQuestion(newExperimentState.originalQuestion);
      Session.set('currentAnswer', preparedState?.currentAnswer);
      setCardState('currentAnswer', preparedState?.currentAnswer); // Keep cardState in sync for displayAnswer helper
      return newExperimentState;
    },

    setUpCardQuestionAndAnswerGlobals: async function(cardIndex: any, whichStim: any, probFunctionParameters: any, options: any = {}) {
      const preparedState = await this.buildPreparedCardQuestionAndAnswerGlobals(
        cardIndex,
        whichStim,
        probFunctionParameters,
        options,
      );
      return this.applyPreparedCardQuestionAndAnswerGlobals(preparedState);
    },
  };
  engine.experimentState = curExperimentData.experimentState;
  clientConsole(1, 'curExperimentData:', curExperimentData);
  return engine;
}

// ////////////////////////////////////////////////////////////////////////////
// Return an instance of a unit with NO question/answer's (instruction-only)
function emptyUnitEngine() {
  return {
    unitType: 'instruction-only',
    initImpl: function() { },
    unitFinished: function() {
      return true;
    },
    selectNextCard: function() { },
    findCurrentCardInfo: function() { },
    cardAnswered: async function() { },
  };
}

// ////////////////////////////////////////////////////////////////////////////
// Return an instance of the video session engine.
// Video sessions use explicit cluster indices from TDF checkpoint definitions
// (e.g., questions: [60, 61, 62, 63]) rather than probability-based selection.
// The video player (VideoSessionMode.svelte) controls when questions appear
// and passes the exact cluster index to show at each checkpoint.
function videoUnitEngine(): any {
  let currentVideoCardInfo: any = { clusterIndex: -1, whichStim: 0 };

  return {
    unitType: 'video',

    initImpl: function() {
      // Video sessions don't need model/probability initialization
      clientConsole(1, 'Video unit engine initialized (no model setup needed)');
    },

    selectNextCard: async function(indices: any, _curExperimentState: any) {
      if (!indices || !Number.isFinite(indices.clusterIndex)) {
        throw new Error('Video session selectNextCard requires explicit indices with clusterIndex');
      }

      const cardIndex = indices.clusterIndex;
      const whichStim = indices.stimIndex || 0;

      clientConsole(1, 'VIDEO UNIT (selectNextCard: any) => cluster:', cardIndex, 'stim:', whichStim);

      // Track current card for findCurrentCardInfo
      currentVideoCardInfo = { clusterIndex: cardIndex, whichStim: whichStim };

      Session.set('clusterIndex', cardIndex);

      // setUpCardQuestionAndAnswerGlobals is provided by the base defaultUnitEngine
      Session.set('testType', 'd');
      await this.setUpCardQuestionAndAnswerGlobals(cardIndex, whichStim, undefined, { testType: 'd' });
    },

    findCurrentCardInfo: function() {
      return currentVideoCardInfo;
    },

    unitFinished: function() {
      // Video session completion is controlled by the video player,
      // not by the engine's card selection logic.
      return false;
    },

    cardAnswered: async function() {
      // Video sessions don't update model probabilities
    },

    calculateIndices: function() {
      // Video sessions use explicit indices from checkpoints, not calculated ones
      return null;
    },

    prefetchNextCard: function() { },
    applyPrefetchedNextCard: async function() { return false; },
    clearPrefetchedNextCard: function() { },
    updatePracticeTime: function() { },
    loadResumeState: async function() { },
  };
}

// ////////////////////////////////////////////////////////////////////////////
// Return an instance of the model-based unit engine

/* Stats information: we track the following stats in the card info structure.
   (All properties are relative to the object returned by getCardProbs())

- Total responses given by user: numQuestionsAnswered
- Total correct NON-STUDY responses given by user: numCorrectAnswers
- Cluster correct answer count - card.priorCorrect
- Cluster incorrect answer count - card.priorIncorrect
- Last time cluster was shown (in milliseconds since the epoch) - card.lastSeen
- First time cluster was shown (in milliseconds since the epoch) - card.firstSeen
- Trials since cluster seen - card.trialsSinceLastSeen
- If user has seen cluster - card.hasBeenIntroduced
- Correct answer count for stim (cluster version) - card.stims.priorCorrect
- Incorrect answer count for stim (cluster version) - card.stims.priorIncorrect
- If user has seen specific stimulus in a cluster - card.stims.hasBeenIntroduced
- Correct answer count for answer (correct response) text - responses.priorCorrect
- Incorrect answer count for answer (correct response) text - responses.priorIncorrect
- Count of times study trials shown per cluster - card.priorStudy
- Total time (in seconds) that other cards have been practiced since a card's
  FIRST practice - card.otherPracticeTime
*/

// TODO: pass in all session variables possible
async function modelUnitEngine(): Promise<any> {
  clientConsole(1, 'model unit engine created!!!');
  // Checked against practice seconds. Notice that we capture this on unit
  // creation, so if they leave in the middle of practice and come back to
  // the unit we'll start all over.
  const unitStartTimestamp = Date.now();



  function getStimParameterArray(clusterIndex: any, whichStim: any) {
    const cluster = getStimCluster(clusterIndex) as StimClusterLike;
    const stim = cluster.stims[whichStim];
    if (!stim) {
      throw new Error(`Params not found for cluster ${clusterIndex}, stim ${whichStim}`);
    }
    return stim.params.split(',').map((x: any) => legacyFloat(x));
  }

  function getStimParameterArrayFromCluster(cluster: any, whichStim: any) {
    return cluster.stims[whichStim].params.split(',').map((x: any) => legacyFloat(x));
  }

  const currentCardInfo = {
    testType: 'd',
    clusterIndex: -1,
    whichStim: -1,
    forceButtonTrial: false,
    probabilityEstimate: -1,
  };

  function setCurrentCardInfo(clusterIndex: any, whichStim: any, forceButtonTrial: any = false) {
    currentCardInfo.clusterIndex = clusterIndex;
    currentCardInfo.whichStim = whichStim;
    currentCardInfo.forceButtonTrial = forceButtonTrial;
    currentCardInfo.probabilityEstimate = cardProbabilities.cards[clusterIndex].stims[whichStim].probabilityEstimate;
    clientConsole(1, 'MODEL UNIT card (selection: any) => ',
        'cluster-idx:', clusterIndex,
        'whichStim:', whichStim,
        'forceButtonTrial:', forceButtonTrial,
        'parameter', getStimParameterArray(clusterIndex, whichStim),
    );
  }

  // Initialize card probabilities, with optional initial data
  let cardProbabilities: any = [];
  let stimClusters: any = [];
  const numQuestions = getStimCount();
  for (let i = 0; i < numQuestions; ++i) {
    stimClusters.push(getStimCluster(i));
  }
  function initCardProbs(overrideData: any) {
    let initVals = {
      numQuestionsAnswered: 0,
      numQuestionsAnsweredCurrentSession: 0,
      numCorrectAnswers: 0,
      cards: [],
    };

    if (overrideData) {
      initVals = _.extend(initVals, overrideData);
    }
    cardProbabilities = initVals;
  }

  // Helpers for time/display/calc below
  function secs(t: any) {
    return t / 1000.0;
  }
  function elapsed(t: any) {
    return t < 1 ? 0 : secs(Date.now() - t);
  }

  // This is the final probability calculation used below if one isn't given
  // in the unit's learningsession/calculateProbability tag
  function defaultProbFunction(p: any, pFunc: any) {
    const recentHistory = p.overallOutcomeHistory.slice(
      Math.max(p.overallOutcomeHistory.length - 60, 0),
      p.overallOutcomeHistory.length
    );

    p.y = -0.77 +
        0.665 * pFunc.logitdec(recentHistory, 0.966) +
        0.51 * p.stimSuccessCount +
        11.1 * pFunc.recency(p.stimSecsSinceLastShown, 0.443);

    p.probability = 1.0 / (1.0 + Math.exp(-p.y));

    return p;
  }

  // See if they specified a probability function
  const unit = Session.get('currentTdfUnit');
  let probFunction = undefined;
  if (unit.learningsession) 
    probFunction = unit.learningsession.calculateProbability ? unit.learningsession.calculateProbability.trim() : undefined;
  else if (unit.videosession) 
    probFunction = unit.videosession.calculateProbability ? unit.videosession.calculateProbability.trim() : undefined;
  if (probFunction) {
    probFunction = new Function('p', 'pFunc', '\'use strict\';\n' + probFunction); // jshint ignore:line
  } else {
    probFunction = defaultProbFunction;
  }

  // Select card closest to optimal probability threshold
  function selectCardClosestToOptimalProbability(cards: any, hiddenItems: any, currentDeliveryParams: any, selectionOptions: any = {}) {
    clientConsole(1, 'selectCardClosestToOptimalProbability');
    const hiddenItemKeys = buildHiddenItemKeySet(hiddenItems);
    let currentMin = 50.0;
    let clusterIndex = -1;
    let stimIndex = -1;
    let optimalProb;
    const forceSpacing = currentDeliveryParams.forceSpacing;
    const minTrialDistance = forceSpacing ? 1 : -1;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (!card.canUse || !(card.trialsSinceLastSeen > minTrialDistance)) {
        continue;
      }
      for (let j = 0; j < card.stims.length; j++) {
        const stim = card.stims[j];
        if (shouldExcludeCurrentCard(i, j, selectionOptions)) continue;
        if (hiddenItemKeys.has(String(stim.stimulusKC)) || !stim.canUse) continue;
        const parameters = stim.parameter;
        const deliveryParams: any = DeliveryParamsStore.get();
        optimalProb = Math.log(Number(deliveryParams.optimalThreshold) / (1 - Number(deliveryParams.optimalThreshold))) || false;
        if (!optimalProb) optimalProb = Math.log(parameters[1] / (1 - parameters[1])) || false;
        if (!optimalProb) {
          clientConsole(2, "NO OPTIMAL PROBABILITY SPECIFIED IN STIM, THROWING ERROR");
          throw new Error("NO OPTIMAL PROBABILITY SPECIFIED IN STIM, THROWING ERROR");
        }
        const dist = Math.abs(Math.log(Number(stim.probabilityEstimate) / (1 - Number(stim.probabilityEstimate))) - Number(optimalProb));
        if (dist < currentMin) {
          currentMin = dist;
          clusterIndex = i;
          stimIndex = j;
        }
      }
    }

    return { clusterIndex, stimIndex };
  }

  // Select card below optimal probability threshold
  function selectCardBelowOptimalProbability(cards: any, hiddenItems: any, currentDeliveryParams: any, selectionOptions: any = {}) {
    clientConsole(1, 'selectCardBelowOptimalProbability');
    const hiddenItemKeys = buildHiddenItemKeySet(hiddenItems);
    let currentMax = 0;
    let clusterIndex = -1;
    let stimIndex = -1;
    const forceSpacing = currentDeliveryParams.forceSpacing;
    const minTrialDistance = forceSpacing ? 1 : -1;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (!card.canUse || !(card.trialsSinceLastSeen > minTrialDistance)) {
        continue;
      }
      for (let j = 0; j < card.stims.length; j++) {
        const stim = card.stims[j];
        if (shouldExcludeCurrentCard(i, j, selectionOptions)) continue;
        if (hiddenItemKeys.has(String(stim.stimulusKC)) || !stim.canUse) continue;
        const parameters = stim.parameter;
        let thresholdCeiling = parameters[1];
        if (!thresholdCeiling) {
          thresholdCeiling = currentDeliveryParams.optimalThreshold || 0.90;
        }
        if (stim.probabilityEstimate > currentMax && stim.probabilityEstimate < thresholdCeiling) {
          currentMax = stim.probabilityEstimate;
          clusterIndex = i;
          stimIndex = j;
        }
      }
    }
    return { clusterIndex, stimIndex };
  }

  function updateCardAndStimData(cardIndex: any, whichStim: any) {
    const card = cardProbabilities.cards[cardIndex];
    const stim = card.stims[whichStim];
    const responseText = stripSpacesAndLowerCase(Answers.getDisplayAnswerText(getStimAnswer(cardIndex, whichStim)));

    // Record instructions answer to card
    cardProbabilities.instructionQuestionResult = Session.get('instructionQuestionResults');
    
    // About to show a card - record any times necessary
    card.lastSeen = Date.now();
    if (card.firstSeen < 1) {
      card.firstSeen = card.lastSeen;
    }

    stim.lastSeen = Date.now();
    if (stim.firstSeen < 1) {
      stim.firstSeen = stim.lastSeen;
    }

    if (responseText && responseText in cardProbabilities.responses) {
      const resp = cardProbabilities.responses[responseText];
      resp.lastSeen = Date.now();
      if (resp.firstSeen < 1) {
        resp.firstSeen = resp.lastSeen;
      }
      if (getTestType() === 's') {
        resp.priorStudy += 1;
      }
    }
    // If this is NOT a resume (and is just normal display mode for
    // a learner) then we need to update stats for the card
    card.trialsSinceLastSeen = 0;
    card.hasBeenIntroduced = true;
    stim.hasBeenIntroduced = true;
    if (getTestType() === 's') {
      card.priorStudy += 1;
      stim.priorStudy += 1;
    }
  }

  // Our actual implementation
  return {


    // Calculate current card probabilities for every card - see selectNextCard
    // the actual card/stim (cluster/version) selection
    calculateCardProbabilities: function calculateCardProbabilities() {
      let count=0;
      let parms;
      const ptemp: any = [];
      const tdfDebugLog: any = [];
      const unitNumber = Session.get('currentUnitNumber');
      const curTdf = Tdfs.findOne({_id: Session.get('currentTdfId')});
      const unitTypeParams = curTdf.content.tdfs.tutor.unit[unitNumber].assessmentsession || curTdf.content.tdfs.tutor.unit[unitNumber].learningsession;
      let clusterList;
      unitTypeParams ? clusterList = unitTypeParams.clusterlist : clusterList = false;
      const unitClusterList: any = [];
      if(!clusterList){ clientConsole(2, 'no clusterlist found for unit ' + unitNumber); }
      clusterList.split(' ').forEach(
        (value: any) => {
          if(value.includes('-')){
            const [start, end] = value.split('-').map(Number);
            for(let i = start; i <= end; i++){
              unitClusterList.push(i);
            }
          } else {
            unitClusterList.push(Number(value));
          }
        }
      );
      for (const clusterIndex of unitClusterList) {
        const card = cardProbabilities.cards[clusterIndex];
        const stimCluster = stimClusters[clusterIndex];
        for (let stimIndex = 0; stimIndex < card.stims.length; stimIndex++) {
          const stim = card.stims[stimIndex];
          parms = this.calculateSingleProb(clusterIndex, stimIndex, count, stimCluster);
          tdfDebugLog.push(parms.debugLog);

          stim.available = parms.available;
          if (typeof stim.available == "string" && (stim.available == "true" || stim.available == "false")) {
            stim.available = stim.available == "true";
          }
          stim.canUse = stim.available || stim.available === undefined;
          stim.probabilityEstimate = parms.probability;
          stim.probFunctionParameters = parms;
          if (typeof stim.probabilityEstimate !== "number") {
            throw 'Error: Probability Estimate is undefined or NaN.';
          }
          ptemp[count] = Math.round(10000 * parms.probability) / 10000;
          count++;
        }
      }
      clientConsole(2, 'calculateCardProbabilities', JSON.stringify(ptemp));
    },

    // Given a single item from the cardProbabilities, calculate the
    // current probability. IMPORTANT: this function only returns ALL parameters
    // used which include probability. The caller is responsible for storing it.
    calculateSingleProb: function calculateSingleProb(cardIndex: any, stimIndex: any, i: any, stimCluster: any) {
      const card = cardProbabilities.cards[cardIndex];
      const stim = card.stims[stimIndex];
      
      // Store parameters in an object for easy logging/debugging
      const p: any = {};

      // Probability Functions
      const pFunc: any = {};
      pFunc.testFunction = function() {
        clientConsole(2, "testing probability function");
      }

      pFunc.mul = function(m1: any,m2: any){
        var result = 0;
        var len = m1.length;
        for (var i = 0; i < len; i++) {
          result += m1[i] * m2[i]
        }
        return result
      }
      pFunc.logitdec = function(outcomes: any, decay: any){
        if (outcomes) {
          var outcomessuc = JSON.parse(JSON.stringify(outcomes));
          var outcomesfail = outcomes.map(function(value: any) {
            return Math.abs(value - 1)
          });
          var w = outcomessuc.unshift(1);
          outcomesfail.unshift(1);
          return Math.log(pFunc.mul(outcomessuc, [...Array(w).keys()].reverse().map(function(value: any) {
            return Math.pow(decay, value) 
          }))  / pFunc.mul(outcomesfail, [...Array(w).keys()].reverse().map(function(value: any) {
            return Math.pow(decay, value) 
          })))
        }
        return 0
      }

      pFunc.recency = function(age: any,d: any){
        if (age==0) {
          return 0;
        } else {
          return Math.pow(1 + age, -d);
        }
      }

      pFunc.quaddiffcor = function(seq: any, probs: any){
        return pFunc.mul(seq, probs.map(function(value: any) {
          return value * value
        }))
      }

      pFunc.quaddiffincor = function(seq: any, probs: any){
        return pFunc.mul(Math.abs(seq-1), probs.map(function(value: any) {
          return value * value
        }))
      }

      pFunc.linediffcor = function(seq: any, probs: any) {
        return pFunc.mul(seq, probs)
      }

      pFunc.linediffincor = function(seq: any, probs: any) {
        return pFunc.mul(seq.map(function(value: any) {
          return Math.abs(value - 1)
        }), probs)
      }

      pFunc.arrSum = function(arr: any) {
        return arr.reduce(function(a: any,b: any){return a + b}, 0);
      }

      pFunc.errlist = function(seq: any) {  return seq.map(function(value: any) {return Math.abs(value - 1)})}

      p.i = i;

      // Current Indices
      p.clusterIndex = cardIndex;
      p.stimIndex = stimIndex;
      p.pFunc = pFunc

      // Top-level metrics
      p.userTotalResponses = cardProbabilities.numQuestionsAnswered;
      p.userCorrectResponses = cardProbabilities.numCorrectAnswers;
      
      // Instruction metrics
      p.instructionQuestionResult = card.instructionQuestionResult;

      // Card/cluster metrics
      p.questionSuccessCount = card.priorCorrect;
      p.questionFailureCount = card.priorIncorrect;
      p.questionTotalTests = p.questionSuccessCount + p.questionFailureCount;
      p.questionStudyTrialCount = card.priorStudy;
      p.questionSecsSinceLastShown = elapsed(card.lastSeen);
      p.questionSecsSinceFirstShown = elapsed(card.firstSeen);
      p.questionSecsPracticingOthers = secs(card.otherPracticeTime);

      // Stimulus/cluster-version metrics
      p.stimSecsSinceLastShown = elapsed(stim.lastSeen);
      p.stimSecsSinceFirstShown = elapsed(stim.firstSeen);
      p.stimSecsPracticingOthers = secs(stim.otherPracticeTime);
      p.stim = stimCluster.stims[stimIndex];

      p.stimSuccessCount = stim.priorCorrect;
      p.stimFailureCount = stim.priorIncorrect;
      p.stimStudyTrialCount = stim.priorStudy;
      const stimAnswer = stimCluster.stims[stimIndex].correctResponse;
      let answerText = Answers.getDisplayAnswerText(stimAnswer).toLowerCase();
      p.stimResponseText = stripSpacesAndLowerCase(answerText);
      answerText = answerText.replace(/\./g, '_');
      p.answerText = answerText;

      p.resp = cardProbabilities.responses[p.stimResponseText];
      p.responseSuccessCount = p.resp.priorCorrect;
      p.responseFailureCount = p.resp.priorIncorrect;
      p.responseOutcomeHistory = JSON.parse(JSON.stringify(p.resp.outcomeStack));
      p.responseSecsSinceLastShown = elapsed(p.resp.lastSeen);
      p.responseStudyTrialCount = p.resp.priorStudy;

      p.stimParameters = stimCluster.stims[stimIndex].params.split(',').map((x: any) => legacyFloat(x));
      const currentDeliveryParams = DeliveryParamsStore.get();
      if (currentDeliveryParams.optimalThreshold) {
        p.stimParameters[1] = currentDeliveryParams.optimalThreshold;
      }

      p.clusterPreviousCalculatedProbabilities = JSON.parse(JSON.stringify(card.previousCalculatedProbabilities));
      p.clusterOutcomeHistory = JSON.parse(JSON.stringify(card.outcomeStack));

      p.stimPreviousCalculatedProbabilities = JSON.parse(JSON.stringify(stim.previousCalculatedProbabilities));
      p.stimOutcomeHistory = JSON.parse(JSON.stringify(stim.outcomeStack));
      //clientConsole('stimOutcomeHistory', typeof p.stimOutcomeHistory, p.stimOutcomeHistory)
      if(typeof p.stimOutcomeHistory === 'string') {
        p.stimOutcomeHistory = p.stimOutcomeHistory.split(',');
      }

      p.overallOutcomeHistory = Session.get('overallOutcomeHistory');
      p.overallStudyHistory = Session.get('overallStudyHistory');

      return probFunction(p, pFunc);
    },

    // TODO: do this function without side effects on cards
    setUpClusterList: function setUpClusterList(cards: any) {
      const currentTdfFile = Session.get('currentTdfFile');
      const isMultiTdf = currentTdfFile.isMultiTdf;
      const isVideoSession = Session.get('isVideoSession')
      const clusterList: any = [];

      if (isMultiTdf) {
        const curUnitNumber = Session.get('currentUnitNumber');

        // NOTE: We are currently assuming that multiTdfs will have only three units:
        // an instruction unit, an assessment session with exactly one question which is the last
        // item in the stim file, and a unit with all clusters specified in the generated subtdfs array
        if (curUnitNumber == 2) {
          const subTdfIndex = Session.get('subTdfIndex');
          if (typeof(subTdfIndex) == 'undefined') {
            clientConsole(1, 'assuming we are in studentReporting, therefore ignoring the clusterlists'); // TODO, make this an explicit argument and error when it happens if we don't pass in the argument
          } else {
            const unitClusterList = currentTdfFile.subTdfs[subTdfIndex].clusterList;
            extractDelimFields(unitClusterList, clusterList);
          }
        } else if (curUnitNumber > 2) {
          throw new Error('We shouldn\'t ever get here, dynamic tdf cluster list error');
        }
      } else {
          const sessCurUnit = JSON.parse(JSON.stringify(Session.get('currentTdfUnit')));
          // Figure out which cluster numbers that they want
          clientConsole(1, 'setupclusterlist:', this.curUnit, sessCurUnit);
          let unitClusterList = "";
          // TODO: shouldn't need both
          if(isVideoSession) {
            if (this.curUnit && this.curUnit.videosession && this.curUnit.videosession.questions)
              unitClusterList = this.curUnit.videosession.questions;
          }
          else {
            if(this.curUnit && this.curUnit.learningsession && this.curUnit.learningsession.clusterlist)
              unitClusterList = this.curUnit.learningsession.clusterlist.trim()
          }
        extractDelimFields(unitClusterList, clusterList);
      }
      clientConsole(2, 'clusterList', clusterList);
      for (let i = 0; i < clusterList.length; ++i) {
        const nums = rangeVal(clusterList[i]);
        for (let j = 0; j < nums.length; ++j) {
          cards[legacyInt(nums[j])].canUse = true;
        }
      }
      clientConsole(1, 'setupClusterList,cards:', cards);
    },

    // Initialize cards as we'll need them for the created engine (for current
    // model). Note that we assume TDF/Stimulus is set up and correct - AND
    // that we've already turned off cluster mapping. You'll note that although
    // we nest stims under cards, we maintain a "flat" list of probabilities -
    // this is to speed up calculations and make iteration below easier
    initializeActRModel: async function() {
      let i; let j;
      const numQuestions = getStimCount();
      const initCards: any = [];
      const initResponses: any = {};
      const initProbs: any = [];
      const curKCBase: any = getStimKCBaseForCurrentStimuliSet();
      clientConsole(1, 'initializeActRModel', numQuestions, curKCBase);
      // PERFORMANCE FIX: Use scoped method that only fetches current TDF (100x+ faster than getResponseKCMap)
      const currentTdfId = Session.get('currentTdfId');
      const responseKCMap: any = await meteorCallAsync('getResponseKCMapForTdf', currentTdfId);
      Session.set('responseKCMap', responseKCMap)
      clientConsole(2, 'initializeActRModel,responseKCMap', responseKCMap);
      for (i = 0; i < numQuestions; ++i) {
        const cluster = stimClusters[i];
        const clusterKC = cluster.stims?.[0]?.clusterKC;
        if (!Number.isFinite(clusterKC)) {
          throw new Error(`[Unit Engine] Missing clusterKC for cluster index ${i}; refusing synthetic fallback.`);
        }
        const card: any = {
          clusterKC,
          priorCorrect: 0,
          allTimeCorrect: 0,
          allTimeIncorrect: 0,
          priorIncorrect: 0,
          hasBeenIntroduced: false,
          outcomeStack: [],
          lastSeen: 0,
          firstSeen: 0,
          totalPracticeDuration: 0,
          allTimeTotalPracticeDuration: 0,
          otherPracticeTime: 0,
          previousCalculatedProbabilities: [],
          priorStudy: 0,
          trialsSinceLastSeen: 3, // We start at >2 for initial logic (see findMin/Max functions below)
          canUse: false,
          stims: [],
          instructionQuestionResult: null,
        };

        // We keep per-stim and re-response-text results as well
        const numStims = cluster.stims.length;
        for (j = 0; j < numStims; ++j) {
          const clusterStim = cluster.stims[j];
          const stimClusterKC = clusterStim.clusterKC;
          const stimKC = clusterStim.stimulusKC;
          if (!Number.isFinite(stimClusterKC)) {
            throw new Error(`[Unit Engine] Missing clusterKC for stim ${j} in cluster index ${i}; refusing synthetic fallback.`);
          }
          if (!Number.isFinite(stimKC)) {
            throw new Error(`[Unit Engine] Missing stimulusKC for stim ${j} in cluster index ${i}; refusing synthetic fallback.`);
          }
          if (stimClusterKC !== clusterKC) {
            throw new Error(`[Unit Engine] Inconsistent clusterKC in cluster index ${i}: cluster=${clusterKC}, stim=${stimClusterKC}.`);
          }
          // Note this may be a single element array for older stims or a 3 digit array for newer ones
          const parameter = getStimParameterArrayFromCluster(cluster, j);
          // Per-stim counts
          card.stims.push({
            clusterKC: stimClusterKC,
            stimIndex: j,
            stimulusKC: stimKC,
            priorCorrect: 0,
            allTimeCorrect: 0,
            allTimeIncorrect: 0,
            curSessionPriorCorrect: 0,
            priorIncorrect: 0,
            curSessionPriorIncorrect: 0,
            hasBeenIntroduced: false,
            outcomeStack: [],
            lastSeen: 0,
            firstSeen: 0,
            totalPracticeDuration: 0,
            allTimeTotalPracticeDuration: 0,
            otherPracticeTime: 0,
            previousCalculatedProbabilities: [],
            priorStudy: 0,
            parameter: parameter,
            instructionQuestionResult: null,
            timesSeen: 0,
            canUse: true,
          });

          initProbs.push({
            cardIndex: i,
            stimIndex: j,
            probability: 0,
          });

          // Per-response counts
          const rawResponse = cluster.stims[j].correctResponse;
          const response = stripSpacesAndLowerCase(Answers.getDisplayAnswerText(rawResponse));
          if (!(response in initResponses)) {
            initResponses[response] = {
              KCId: responseKCMap[response],
              priorCorrect: 0,
              allTimeCorrect: 0,
              allTimeIncorrect: 0,
              priorIncorrect: 0,
              firstSeen: 0,
              lastSeen: 0,
              totalPracticeDuration: 0,
              allTimeTotalPracticeDuration: 0,
              priorStudy: 0,
              outcomeStack: [],
              instructionQuestionResult: null,
            };
          }
        }

        initCards.push(card);
      }

      this.setUpClusterList(initCards);

      // Re-init the card probabilities
      initCardProbs({
        cards: initCards, // List of cards (each of which has stims)
        responses: initResponses, // Dictionary of text responses for
      });

      clientConsole(2, 'initCards:', initCards, initProbs);

      // CRITICAL: Validate model has cards - empty models are errors, not success
      const unit = Session.get('currentTdfUnit');
      const unitNumber = Session.get('currentUnitNumber');
      if (!initCards || initCards.length === 0) {
        const session = unit.learningsession || unit.videosession || {};
        const errorMsg = `Learning/video session in unit "${unit.unitname}" (unit ${unitNumber}) has no cards. ` +
          `Check clusterlist configuration. ` +
          `Clusterlist: "${session.clusterlist || 'MISSING'}", ` +
          `NumQuestions: ${numQuestions}, ` +
          `InitCards length: ${initCards ? initCards.length : 'null'}`;
        clientConsole(1, '[Unit Engine] EMPTY MODEL ERROR:', errorMsg);
        alert('Learning session has no cards - check TDF clusterlist configuration');
        throw new Error(errorMsg);
      }

      

      // has to be done once ahead of time to give valid values for the beginning of the test.
      // calculateCardProbabilities();
    },

    loadResumeState: async function() {
      clientConsole(1, 'loadResumeState start');

      const cards = cardProbabilities.cards;
      const hiddenItems = CardStore.getHiddenItems();
      const userId = Meteor.userId();
      const tdfId = Session.get('currentTdfId');
      const currentUnitNumber = Number(Session.get('currentUnitNumber') || 0);
      const resetStudentPerformance = Boolean((DeliveryParamsStore.get() as Record<string, unknown>)?.resetStudentPerformance);
      const historyRows = await meteorCallAsync(
        'getLearningHistoryForUnit',
        userId,
        tdfId,
        currentUnitNumber,
        resetStudentPerformance
      ) as any[];
      const reconstructed = reconstructLearningStateFromHistory(historyRows || []);

      Session.set('overallOutcomeHistory', reconstructed.overallOutcomeHistory);
      Session.set('overallStudyHistory', reconstructed.overallStudyHistory);

      for (let cardIndex=0; cardIndex<cards.length; cardIndex++) {
        const card = cards[cardIndex];
        const clusterState = reconstructed.clusterState[String(card.clusterKC)];
        if (clusterState) {
          Object.assign(card, clusterState);
        }

        for (let stimIndex=0; stimIndex<card.stims.length; stimIndex++) {
          const stim = card.stims[stimIndex];
          const stimulusState = reconstructed.stimulusState[String(stim.stimulusKC)];
          if (stimulusState) {
            Object.assign(stim, stimulusState);
          }
        }
      }

      for (let cardIndex=0; cardIndex<cards.length; cardIndex++) {
        const card = cards[cardIndex];
        for (let stimIndex=0; stimIndex<card.stims.length; stimIndex++) {
          const rawResponse = stimClusters[cardIndex]?.stims?.[stimIndex]?.correctResponse;
          const correctAnswer = getHistoryCorrectAnswer(rawResponse);
          const responseKey = getHistoryResponseKey(rawResponse);
          const responseState = reconstructed.responseState[String(correctAnswer)];
          if (responseKey && responseState && cardProbabilities.responses[responseKey]) {
            Object.assign(cardProbabilities.responses[responseKey], responseState);
          }
        }
      }

      let numVisibleCards = 0;
      for (let i = 0; i < cardProbabilities.cards.length; i++){
        if(cardProbabilities.cards[i].canUse){
          numVisibleCards += cardProbabilities.cards[i].stims.length;
        }
      }
      CardStore.setNumVisibleCards(numVisibleCards - hiddenItems.length);

      Object.assign(cardProbabilities, {
        numQuestionsAnswered: reconstructed.numQuestionsAnswered,
        numQuestionsAnsweredCurrentSession: reconstructed.numQuestionsAnsweredCurrentSession,
        numCorrectAnswers: reconstructed.numCorrectAnswers,
      });
    },
    getCardProbabilitiesNoCalc: function() {
      return cardProbabilities;
    },

    findCurrentCardInfo: function() {
      return currentCardInfo;
    },

    // reinitializeClusterListsFromCurrentSessionData: function(){
    //     setUpClusterList(cardProbabilities.cards);
    // },

    unitType: MODEL_UNIT,

    curUnit: (() => JSON.parse(JSON.stringify(Session.get('currentTdfUnit'))))(),

    unitMode: (function() {
      const unit = Session.get('currentTdfUnit');
      let unitMode = 'default';
      if(unit.learningsession && unit.learningsession.unitMode)
        unitMode = unit.learningsession.unitMode.trim();
      else if (unit.videosession && unit.videosession.unitMode)
        unitMode = unit.videosession.unitMode.trim();
      clientConsole(1, 'UNIT MODE: ' + unitMode);
      return unitMode;
    })(),

    initImpl: async function() {
      Session.set('unitType', MODEL_UNIT);
      await this.initializeActRModel();
    },

    calculateIndices: async function(options: any = {}) {
      this.calculateCardProbabilities();
      const hiddenItems = CardStore.getHiddenItems();
      const cards = cardProbabilities.cards;
      const currentDeliveryParams = DeliveryParamsStore.get();
      const selectionOptions = {
        excludeCurrentCardRef: options?.excludeCurrentCardRef || null,
      };
      const runSelection = (selectorOptions: any) => {
        let indices;
        switch (this.unitMode) {
          case 'thresholdCeiling':
            indices = selectCardBelowOptimalProbability(cards, hiddenItems, currentDeliveryParams, selectorOptions);
            clientConsole(2, 'thresholdCeiling, indicies:', JSON.parse(JSON.stringify(indices)));
            if (indices.clusterIndex === -1) {
              clientConsole(2, 'thresholdCeiling failed, reverting to min prob dist');
              indices = selectCardClosestToOptimalProbability(cards, hiddenItems, currentDeliveryParams, selectorOptions);
            }
            return indices;
          case 'distance':
            return selectCardClosestToOptimalProbability(cards, hiddenItems, currentDeliveryParams, selectorOptions);
          default:
            return selectCardClosestToOptimalProbability(cards, hiddenItems, currentDeliveryParams, selectorOptions);
        }
      };

      let indices = runSelection(selectionOptions);
      if (indices.clusterIndex === -1 && selectionOptions.excludeCurrentCardRef) {
        clientConsole(2, '[EARLY LOCK] Falling back to forced repeat selection', selectionOptions.excludeCurrentCardRef);
        indices = runSelection({ excludeCurrentCardRef: null });
      }
      return indices;
    },

    currentCardRef: null as any,
    currentCardOwnerToken: null as any,
    lockedNextCardRef: null as any,
    nextTrialContent: null as any,
    currentPreparedState: null as any,
    _trialEpoch: 0,
    _lockedNextSelection: null as any,
    _earlyLockPromise: null as any,
    _prefetchedSelection: null as any,
    _prefetchPromise: null as any,

    _buildCurrentOwnerToken: function(cardRef: any) {
      const trialEpoch = Number.isFinite(this._trialEpoch) ? this._trialEpoch : 0;
      return `${trialEpoch}:${cardRef.clusterIndex}:${cardRef.stimIndex}:${Date.now()}`;
    },

    _resolveSelectionTestType: function(card: any, stim: any) {
      let testType = 'd';
      const currentDeliveryParams = DeliveryParamsStore.get();
      const studyFirstProbability = Number(currentDeliveryParams.studyFirst || 0);
      const shouldShowStudyFirst = !card.hasBeenIntroduced &&
        studyFirstProbability > 0 &&
        (studyFirstProbability >= 1 || Math.random() < studyFirstProbability);
      if (shouldShowStudyFirst) {
        clientConsole(2, 'STUDY FOR FIRST TRIAL !!!', studyFirstProbability);
        testType = 's';
      } else if (stim.available) {
        clientConsole(2, 'Trial type set by probability function to: ', stim.available);
        if (stim.available == 'drill')
          testType = 'd';
        else if (stim.available == 'study')
          testType = 's';
        else if (stim.available == 'test')
          testType = 't';
      }
      return testType;
    },

    async _buildNextCardSelection(indices: any, options: any = {}) {
      if (indices === undefined || indices === null) {
        clientConsole(2, 'indices unset, calculating now');
        indices = await this.calculateIndices(options);
      }

      if (!indices) {
        return null;
      }

      const newClusterIndex = indices.clusterIndex;
      const newStimIndex = indices.stimIndex;

      if (newClusterIndex === -1 || newStimIndex === -1) {
        return null;
      }

       const card = cardProbabilities.cards[newClusterIndex];
       const stim = card.stims[newStimIndex];
       const testType = this._resolveSelectionTestType(card, stim);
       const currentDeliveryParams = DeliveryParamsStore.get() as Record<string, unknown>;
       const preparationDiagnostic = {
        currentTdfName: Session.get('currentTdfName') || null,
        currentTdfId: Session.get('currentTdfId') || null,
        currentRootTdfId: Session.get('currentRootTdfId') || null,
        currentStimuliSetId: Session.get('currentStimuliSetId') || null,
        currentUnitNumber: Session.get('currentUnitNumber') ?? null,
        currentUnitName: Session.get('currentTdfUnit')?.unitname || null,
        clusterIndex: newClusterIndex,
        stimIndex: newStimIndex,
        studyFirst: currentDeliveryParams.studyFirst,
        studyOnlyFields: currentDeliveryParams.studyOnlyFields || null,
        drillFields: currentDeliveryParams.drillFields || null,
        cardHasBeenIntroduced: card.hasBeenIntroduced,
        stimHasBeenIntroduced: stim.hasBeenIntroduced,
        stimAvailable: stim.available || null,
        resolvedTestType: testType,
      };
       Session.set('firstCardPreparationDiagnostic', {
        stage: 'beforeBuildPreparedCard',
        capturedAt: Date.now(),
        ...preparationDiagnostic,
      });
       clientConsole(1, '[Unit Engine] First-card preparation diagnostic', preparationDiagnostic);
       let preparedState;
       try {
        preparedState = await this.buildPreparedCardQuestionAndAnswerGlobals(
          newClusterIndex,
          newStimIndex,
          stim.probFunctionParameters,
          { testType },
        );
       } catch (error) {
        const errorRecord = error instanceof Error ? error : null;
        const failureDiagnostic = {
          error,
          currentTdfName: Session.get('currentTdfName') || null,
          currentTdfId: Session.get('currentTdfId') || null,
          currentRootTdfId: Session.get('currentRootTdfId') || null,
          currentStimuliSetId: Session.get('currentStimuliSetId') || null,
          currentUnitNumber: Session.get('currentUnitNumber') ?? null,
          currentUnitName: Session.get('currentTdfUnit')?.unitname || null,
          clusterIndex: newClusterIndex,
          stimIndex: newStimIndex,
          studyFirst: currentDeliveryParams.studyFirst,
          studyOnlyFields: currentDeliveryParams.studyOnlyFields || null,
          drillFields: currentDeliveryParams.drillFields || null,
          resolvedTestType: testType,
        };
        Session.set('firstCardPreparationDiagnostic', {
          stage: 'buildPreparedCardFailed',
          capturedAt: Date.now(),
          ...failureDiagnostic,
          errorMessage: errorRecord?.message || String(error),
          errorStack: errorRecord?.stack || null,
        });
        clientConsole(1, '[Unit Engine] First-card preparation failed', failureDiagnostic);
        throw error;
       }
       const completedDiagnostic = {
        currentTdfName: Session.get('currentTdfName') || null,
        currentTdfId: Session.get('currentTdfId') || null,
        currentStimuliSetId: Session.get('currentStimuliSetId') || null,
        currentUnitNumber: Session.get('currentUnitNumber') ?? null,
        currentUnitName: Session.get('currentTdfUnit')?.unitname || null,
        clusterIndex: newClusterIndex,
        stimIndex: newStimIndex,
        resolvedTestType: testType,
        currentDisplayKeys: Object.keys(preparedState?.currentDisplay || {}),
        hasDisplayText: Boolean(preparedState?.currentDisplay?.text),
        hasDisplayClozeText: Boolean(preparedState?.currentDisplay?.clozeText),
        hasDisplayAudio: Boolean(preparedState?.currentDisplay?.audioSrc),
        hasDisplayImage: Boolean(preparedState?.currentDisplay?.imgSrc),
        hasCurrentAnswer: Boolean(preparedState?.currentAnswer),
      };
       Session.set('firstCardPreparationDiagnostic', {
        stage: 'buildPreparedCardCompleted',
        capturedAt: Date.now(),
        ...completedDiagnostic,
      });
       clientConsole(1, '[Unit Engine] First-card preparation completed', completedDiagnostic);

      return {
        indices,
        clusterIndex: newClusterIndex,
        stimIndex: newStimIndex,
        currentCardRef: {
          clusterIndex: newClusterIndex,
          stimIndex: newStimIndex,
        },
        preparedState,
        testType,
        ownerToken: options?.ownerToken || null,
        createdAt: Date.now(),
      };
    },

    _commitPreparedSelection: function(selection: any, _curExperimentState: any) {
      const cardIndex = selection.clusterIndex;
      const whichStim = selection.stimIndex;

      const card = cardProbabilities.cards[cardIndex];
      const stim = card.stims[whichStim];

      clientConsole(2, 'selectNextCard indices:', cardIndex, whichStim, selection.indices);

      stim.previousCalculatedProbabilities.push(stim.probabilityEstimate);
      card.previousCalculatedProbabilities.push(stim.probabilityEstimate);

      Session.set('currentStimProbFunctionParameters', stim.probFunctionParameters);
      Session.set('clusterIndex', cardIndex);

      let newExperimentState: any = {
        clusterIndex: cardIndex,
        shufIndex: cardIndex,
        lastTimeStamp: Date.now(),
        whichStim: whichStim,
      };

      setCurrentCardInfo(cardIndex, whichStim);
      clientConsole(2, 'select next card:', cardIndex, whichStim);
      clientConsole(2, 'currentCardInfo:', JSON.parse(JSON.stringify(this.findCurrentCardInfo())));

      const preparedState = selection?.preparedState;
      if (!preparedState) {
        throw new Error('Model selection commit requires preparedState');
      }
      const stateChanges = this.applyPreparedCardQuestionAndAnswerGlobals(preparedState);
      this.currentPreparedState = preparedState;
      clientConsole(2, 'selectNextCard,', Session.get('clozeQuestionParts'), stateChanges);
      newExperimentState = Object.assign(newExperimentState, stateChanges);

      const testType = selection?.testType || this._resolveSelectionTestType(card, stim);
      Session.set('testType', testType);
      newExperimentState.testType = testType;
      newExperimentState.questionIndex = 1;
      this.currentCardRef = {
        clusterIndex: cardIndex,
        stimIndex: whichStim,
      };
      this.currentCardOwnerToken = selection?.ownerToken || this._buildCurrentOwnerToken(this.currentCardRef);

      CardStore.setQuestionIndex(0);
      updateCardAndStimData(cardIndex, whichStim);

      if (currentUserHasRole('admin,teacher')) {
        clientConsole(1, '>>>BEGIN METRICS>>>>>>>\n',
        'Overall user (stats: any) => ',
            'total responses:', cardProbabilities.numQuestionsAnswered,
            'total correct responses:', cardProbabilities.numCorrectAnswers,
        );

        clientConsole(1, 'Model selected card:', card);
        clientConsole(1, 'Model selected stim:', stim);

        const elapsedStr = function(t: any) {
          return t < 1 ? 'Never Seen': secs(Date.now() - t);
        };
        clientConsole(1,
            'Card First Seen:', elapsedStr(card.firstSeen),
            'Card Last Seen:', elapsedStr(card.lastSeen),
            'Total time in other practice:', secs(card.otherPracticeTime),
            'Stim First Seen:', elapsedStr(stim.firstSeen),
            'Stim Last Seen:', elapsedStr(stim.lastSeen),
            'Stim Total time in other practice:', secs(stim.otherPracticeTime),
        );

        const responseText = stripSpacesAndLowerCase(Answers.getDisplayAnswerText(getStimAnswer(cardIndex, whichStim)));
        if (responseText && responseText in cardProbabilities.responses) {
          clientConsole(1, 'Response is', responseText, displayify(cardProbabilities.responses[responseText]));
        }

        clientConsole(1, '<<<END   METRICS<<<<<<<');
      }

      _.each(cardProbabilities.cards, function(card: any, index: any) {
        if (index != cardIndex && card.hasBeenIntroduced) {
          card.trialsSinceLastSeen += 1;
        }
      });

      return newExperimentState;
    },

    async _applyNextCardSelection(selection: any, _curExperimentState: any) {
      const cardIndex = selection.clusterIndex;
      const whichStim = selection.stimIndex;
      const stim = cardProbabilities.cards[cardIndex].stims[whichStim];

      const preparedState = selection?.preparedState || await this.buildPreparedCardQuestionAndAnswerGlobals(
        cardIndex,
        whichStim,
        stim.probFunctionParameters,
        { testType: selection?.testType },
      );
      this._commitPreparedSelection({
        ...selection,
        preparedState,
      }, _curExperimentState);
      return selection;
    },

    selectNextCard: async function(indices: any, curExperimentState: any) {
      const selection = await this._buildNextCardSelection(indices, {});
      if (!selection) {
        unitIsFinished('No more cards to show');
        return;
      }
      await this._applyNextCardSelection(selection, curExperimentState);
      return selection;
    },

    clearLockedNextCard: function(reason: any = 'unspecified') {
      if (this.lockedNextCardRef || this.nextTrialContent) {
        clientConsole(2, '[EARLY LOCK] Cleared locked next card', { reason });
      }
      this.lockedNextCardRef = null;
      this._lockedNextSelection = null;
      this.nextTrialContent = null;
      this._earlyLockPromise = null;
    },

    clearRuntimeNextCardState: function(reason: any = 'runtime-reset') {
      this._trialEpoch = Number.isFinite(this._trialEpoch) ? this._trialEpoch + 1 : 1;
      this.currentCardRef = null;
      this.currentCardOwnerToken = null;
      this.currentPreparedState = null;
      this.clearLockedNextCard(reason);
    },

    setPreparedNextTrialContent: function(content: any) {
      this.nextTrialContent = content;
    },

    getPreparedNextTrialContent: function() {
      return this.nextTrialContent || null;
    },

    peekLockedNextCard: function() {
      if (!this.lockedNextCardRef || !this._lockedNextSelection) {
        return null;
      }

      return {
        ...this.lockedNextCardRef,
        ownerToken: this._lockedNextSelection.ownerToken || null,
      };
    },

    lockNextCardEarly: async function(indices: any, _curExperimentState: any, options: any = {}) {
      if (this._earlyLockPromise) {
        return await this._earlyLockPromise;
      }

      const currentCardRef = options?.currentCardRef || this.currentCardRef;
      const ownerToken = options?.ownerToken || this.currentCardOwnerToken;
      this._earlyLockPromise = this._buildNextCardSelection(indices, {
        excludeCurrentCardRef: currentCardRef,
        ownerToken,
      })
        .then((selection: any) => {
          if (!selection) {
            return null;
          }
          if (ownerToken && this.currentCardOwnerToken && ownerToken !== this.currentCardOwnerToken) {
            clientConsole(2, '[EARLY LOCK] Discarding stale lock because owner token changed', {
              ownerToken,
              activeOwnerToken: this.currentCardOwnerToken,
            });
            return null;
          }
          this._lockedNextSelection = selection;
          this.lockedNextCardRef = {
            clusterIndex: selection.clusterIndex,
            stimIndex: selection.stimIndex,
            ownerToken: selection.ownerToken || null,
            createdAt: selection.createdAt,
          };
          clientConsole(2, '[EARLY LOCK] Locked next card', this.lockedNextCardRef);
          return selection;
        })
        .finally(() => {
          this._earlyLockPromise = null;
        });

      return await this._earlyLockPromise;
    },

    applyLockedNextCard: async function(curExperimentState: any) {
      const selection = this._lockedNextSelection;
      if (!selection || !this.lockedNextCardRef) {
        return false;
      }
      if (selection.ownerToken && this.currentCardOwnerToken && selection.ownerToken !== this.currentCardOwnerToken) {
        clientConsole(2, '[EARLY LOCK] Discarding locked next card because owner token mismatched', {
          selectionOwnerToken: selection.ownerToken,
          currentOwnerToken: this.currentCardOwnerToken,
        });
        this.clearLockedNextCard('owner-token-mismatch');
        return false;
      }

      await this._applyNextCardSelection(selection, curExperimentState);
      clientConsole(2, '[EARLY LOCK] Applying locked next card', this.lockedNextCardRef);
      this.clearLockedNextCard('applied');
      return true;
    },

    commitLockedNextCard: function(curExperimentState: any) {
      const selection = this._lockedNextSelection;
      if (!selection || !this.lockedNextCardRef) {
        return false;
      }
      if (selection.ownerToken && this.currentCardOwnerToken && selection.ownerToken !== this.currentCardOwnerToken) {
        clientConsole(2, '[EARLY LOCK] Discarding locked next card because owner token mismatched', {
          selectionOwnerToken: selection.ownerToken,
          currentOwnerToken: this.currentCardOwnerToken,
        });
        this.clearLockedNextCard('owner-token-mismatch');
        return false;
      }

      this._commitPreparedSelection(selection, curExperimentState);
      clientConsole(2, '[EARLY LOCK] Applying locked next card', this.lockedNextCardRef);
      this.clearLockedNextCard('applied');
      return true;
    },

    prefetchNextCard: async function(indices: any, _curExperimentState: any) {
      if (Session.get('isVideoSession')) {
        return;
      }

      if (this._prefetchedSelection || this._prefetchPromise) {
        return;
      }

      this._prefetchPromise = this._buildNextCardSelection(indices)
        .then((selection: any) => {
      if (selection) {
        this._prefetchedSelection = selection;
        clientConsole(2, '[PREFETCH] Next card selection prepared');
      }
    })
    .catch((err: any) => {
      clientConsole(1, '[PREFETCH] Error during next card selection:', err);
    })
    .finally(() => {
      this._prefetchPromise = null;
    });
  },

    applyPrefetchedNextCard: async function(curExperimentState: any) {
      if (this._prefetchPromise) {
        try {
          await this._prefetchPromise;
        } catch (e) {
          clientConsole(1, '[PREFETCH] Prefetch failed to resolve:', e);
        }
      }

      const selection = this._prefetchedSelection;
      this._prefetchedSelection = null;
      if (!selection) {
        clientConsole(2, '[PREFETCH] No prefetched selection available, will use fallback');
        return false;
      }

      clientConsole(2, '[PREFETCH] Applying prefetched selection');
      await this._applyNextCardSelection(selection, curExperimentState);
      return true;
    },

    clearPrefetchedNextCard: function() {
      this._prefetchedSelection = null;
      this._prefetchPromise = null;
    },

    updatePracticeTime: function(practiceTime: any) {
      const card = cardProbabilities.cards[Session.get('clusterIndex')];
      const stim = card.stims[currentCardInfo.whichStim];
      card.totalPracticeDuration += practiceTime;
      stim.totalPracticeDuration += practiceTime;
      updateCurStudedentPracticeTime(practiceTime);
    },

    cardAnswered: async function(wasCorrect: any, practiceTime: any) {
      // Get info we need for updates and logic below
      const cards = cardProbabilities.cards;
      const selectedClusterIndex = Session.get('clusterIndex');
      const cluster = stimClusters[selectedClusterIndex];
      const card = cards[selectedClusterIndex];
      const testType = getTestType();
      clientConsole(1, 'cardAnswered, card: ', card, 'clusterIndex: ', selectedClusterIndex);

      _.each(cards, function(otherCard: any, index: any) {
        if (otherCard.firstSeen > 0) {
          if (index != selectedClusterIndex) {
            otherCard.otherPracticeTime += practiceTime;
            _.each(otherCard.stims, function(otherStim: any) {
              otherStim.otherPracticeTime += practiceTime;
            });
          } else {
            _.each(otherCard.stims, function(otherStim: any, index: any) {
              if (index != currentCardInfo.whichStim) {
                otherStim.otherPracticeTime += practiceTime;
              }
            });
          }
        }
      });

      const {whichStim} = this.findCurrentCardInfo();
      const stim = card.stims[whichStim];
      stim.totalPracticeDuration += practiceTime;
      stim.allTimeTotalPracticeDuration += practiceTime;
      stim.timesSeen += 1;
      const answerText = stripSpacesAndLowerCase(Answers.getDisplayAnswerText(
        cluster.stims[currentCardInfo.whichStim].correctResponse));

      updateCurStudentPerformance(wasCorrect, practiceTime, testType);

      // Study trials are a special case: we don't update any of the
      // metrics below. As a result, we just calculate probabilities and
      // leave. Note that the calculate call is important because this is
      // the only place we call it after init *and* something might have
      // changed during question selection
      if (testType === 's') {
        return;
      }

      // "Global" stats
      cardProbabilities.numQuestionsAnswered += 1;
      cardProbabilities.numQuestionsAnsweredCurrentSession += 1;
      if (wasCorrect) {
        cardProbabilities.numCorrectAnswers += 1;
      }

      const currentStimProbability = stim.probabilityEstimate;

      clientConsole(2, 'cardAnswered, curTrialInfo:', currentStimProbability, card, stim);
      if (wasCorrect) {
        card.priorCorrect += 1;
        card.allTimeCorrect += 1;
        stim.priorCorrect += 1;
        stim.curSessionPriorCorrect += 1;
        stim.allTimeCorrect += 1;
      }
      else {
        card.priorIncorrect += 1;
        card.allTimeIncorrect += 1;
        stim.priorIncorrect += 1;
        stim.curSessionPriorIncorrect += 1;
        stim.allTimeIncorrect += 1;
      }

      // This is called from processUserTimesLog() so this both works in memory and restoring from userTimesLog
      card.outcomeStack.push(wasCorrect ? 1 : 0);
      stim.outcomeStack.push(wasCorrect ? 1 : 0);

      // "Response" stats
      let resp;
      if (answerText && answerText in cardProbabilities.responses) {
        resp = cardProbabilities.responses[answerText];
        if (wasCorrect) {
          resp.priorCorrect += 1;
          resp.allTimeCorrect += 1;
        }
        else {
          resp.priorIncorrect += 1;
          resp.allTimeIncorrect += 1;
        }

        resp.outcomeStack.push(wasCorrect ? 1 : 0);
      } else {
        clientConsole(1, 'COULD NOT STORE RESPONSE METRICS',
            answerText,
            currentCardInfo.whichStim,
            displayify(cluster.stims[currentCardInfo.whichStim].correctResponse),
            displayify(cardProbabilities.responses));
      }

    },

    unitFinished: async function() {
      const session = this.curUnit.learningsession || this.curUnit.videosession;
      const deliveryParams = DeliveryParamsStore.get() as Record<string, unknown>;
      const minSecs = Number(deliveryParams.displayMinSeconds || 0);
      const maxSecs = Number(deliveryParams.displayMaxSeconds || 0);
      const maxTrials = parseInt(session.maxTrials || 0);
      const numTrialsSoFar = cardProbabilities.numQuestionsAnsweredCurrentSession || 0;
      const practicetimer = deliveryParams.practicetimer;

      if (maxTrials > 0 && numTrialsSoFar >= maxTrials) {
        return true;
      }

      // TODO: why are we using side effects to handle the unit being finished? Fix this
      if (minSecs > 0.0 || maxSecs > 0.0) {
        // We ignore practice seconds if displayXXXseconds are specified:
        // that means the unit will be over when the timer is exceeded
        // or the user clicks a button. Either way, that's handled outside
        // the engine
        return false;
      }

      // If we're still here, check practice seconds.
      // If we're still here, check practice seconds
      const practiceSeconds = Number((DeliveryParamsStore.get() as any).practiceseconds || 0);
      if (practiceSeconds < 1.0) {
        // Less than a second is an error or a missing values
        clientConsole(2, 'No Practice Time Found and display timer: user must quit with Continue button');
        return false;
      }

      let unitElapsedTime = 0;
      if(practicetimer === 'clock-based'){
        unitElapsedTime = Session.get('curStudentPerformance').totalTime / 1000.0;
      }
      else {
        unitElapsedTime = (Date.now() - unitStartTimestamp) / 1000.0;
      }
      clientConsole(2, 'Model practice check', unitElapsedTime, '>', practiceSeconds);
      return (unitElapsedTime > practiceSeconds);
    },
  };
}

// Aka assessment session
async function scheduleUnitEngine(): Promise<any> {
  let schedule: any;
  let scheduleCursor = 0;
  function createSchedule(setspec: any, unitNumber: any, unit: any) {
    // First get the setting we'll use
    const settings = loadAssessmentSettings(setspec, unit);
    clientConsole(2, 'ASSESSMENT SESSION LOADED FOR SCHEDULE CREATION');
    clientConsole(1, 'Assessment settings:', settings);

    // Shuffle clusters at start
    if (settings.randomClusters) {
      shuffle(settings.clusterNumbers);
    }

    // Our question array should be pre-populated
    // Remember that addressing a javascript array index forces the
    // expansion of the array to that index
    const quests: any = [];
    quests[settings.scheduleSize-1] = {};

    // How you set a question
    const setQuest = function(qidx: any, type: any, clusterIndex: any, condition: any, whichStim: any, forceButtonTrial: any) {
      quests[qidx] = {
        testType: type.toLowerCase(),
        clusterIndex: clusterIndex,
        condition: condition,
        whichStim: whichStim,
        forceButtonTrial: forceButtonTrial,
      };
    };

    let i; let j; let k; let z; // Loop indices

    // For each group
    for (i = 0; i < settings.groupNames.length; ++i) {
      // Get initial info for this group
      const groupName = settings.groupNames[i];
      const group = settings.groups[i]; // group = array of strings
      const numTemplates = legacyInt(settings.numTemplatesList[i]);
      const templateSize = legacyInt(settings.templateSizes[i]);

      // Generate template indices
      const indices: any = [];
      for (z = 0; z < numTemplates; ++z) {
        indices.push(z);
      }
      if (settings.randomConditions) {
        shuffle(indices);
      }

      // For each template index
      for (j = 0; j < indices.length; ++j) {
        const index = indices[j];

        // Find in initial position
        let firstPos;
        for (firstPos = 0; firstPos < settings.initialPositions.length; ++firstPos) {
          const entry: any = settings.initialPositions[firstPos];
          // Note the 1-based assumption for initial position values
          if (groupName === entry[0] && legacyInt(entry.substring(2)) == index + 1) {
            break; // FOUND
          }
        }

        // Remove and use first cluster no matter what
        const clusterNum = settings.clusterNumbers.shift();

        // If we didn't find the group, move to next group
        if (firstPos >= settings.initialPositions.length) {
          break;
        }

        // Work through the group elements
        for (k = 0; k < templateSize; ++k) {
          // "parts" is a comma-delimited entry with 4 components:
          // 0 - the offset (whichStim) - can be numeric or "r" for random
          // 1 - input method: "f" = fill-in (text), "b" = button (multiple choice), "n" = default
          // 2 - trial type: d=drill, t=test, s=study, m=mandatory-correction, n=timed-prompt, i=instructional-test
          // 3 - location (added to qidx)
          const groupEntry: any = group[index * templateSize + k];
          const parts = groupEntry.split(',');

          let forceButtonTrial = false;
          if (parts[1].toLowerCase()[0] === 'b') {
            forceButtonTrial = true;
          }

          let type = parts[2].toUpperCase()[0];
          if (type === 'Z') {
            const stud = Math.floor(Math.random() * 10);
            if (stud === 0) {
              type = 'S';
            } else {
              type = 'D';
            }
          }

          const location = legacyInt(parts[3]);

          const offStr = parts[0].toLowerCase(); // Selects stim from cluster w/ multiple stims
          if (offStr === 'm') {
            // Trial from model
            setQuest(firstPos + location, type, 0, 'select_'+type, offStr, forceButtonTrial);
          } else {
            // Trial by other means
            let offset;
            if (offStr === 'r') {
              // See loadAssessmentSettings below - ranChoices should
              // be populated with the possible offsets already
              if (settings.ranChoices.length < 1) {
                throw new Error('Random offset, but randomcchoices isn\'t set');
              }
              offset = randomChoice(settings.ranChoices);
            } else {
              offset = legacyInt(offStr);
            }
            let condition = groupName + '-' + index;

            const pairNum = clusterNum;
            setQuest(firstPos + location, type, pairNum, condition, offset, forceButtonTrial);
          } // offset is Model or something else?
        } // k (walk thru group elements)
      } // j (each template index)
    } // i (each group)

    // NOW we can create the final ordering of the questions - we start with
    // a default copy and then do any final permutation
    const finalQuests: any = [];
    _.each(quests, function(obj: any) {
      finalQuests.push(obj);
    });

    // Shuffle and swap final question mapping based on permutefinalresult
    // and swapfinalresults
    if (finalQuests.length > 0) {
      const shuffles = String(settings.finalPermute).split(' ');
      const swaps = String(settings.finalSwap).split(' ');
      let mapping = _.range(finalQuests.length);
      mapping = createStimClusterMapping(finalQuests.length, shuffles || [], swaps || [], mapping)

      clientConsole(2, 'Question swap/shuffle mapping:', displayify(
          _.map(mapping, function(val: any, idx: any) {
            return 'q[' + idx + '].cluster==' + quests[idx].clusterIndex +
                      ' ==> q[' + val + '].cluster==' + quests[val].clusterIndex;
          }),
      ));
      for (j = 0; j < mapping.length; ++j) {
        finalQuests[j] = quests[mapping[j]];
      }
    }

    // Note that our card.js code has some fancy permutation
    // logic, but that we don't currently use it from the assessment
    // session
    const schedule = {
      unitNumber: unitNumber,
      created: new Date(),
      permute: null,
      q: finalQuests,
      isButtonTrial: settings.isButtonTrial,
    };

    clientConsole(1, 'Created schedule for current unit:');
    clientConsole(2, schedule);

    return schedule;
  }

  // Given a unit object loaded from a TDF, populate and return a settings
  // object with the parameters as specified by the Assessment Session
  function loadAssessmentSettings(setspec: any, unit: any) {
    const settings: any = {
      specType: 'unspecified',
      groupNames: [],
      templateSizes: [],
      numTemplatesList: [],
      initialPositions: [],
      groups: [],
      randomClusters: false,
      randomConditions: false,
      scheduleSize: 0,
      finalSwap: [''],
      finalPermute: [''],
      clusterNumbers: [],
      ranChoices: [],
      isButtonTrial: false,
      adaptiveLogic: {},
    };

    if (!unit || !unit.assessmentsession) {
      return settings;
    }

    const assess = unit.assessmentsession;

    // Interpret TDF string booleans
    const boolVal = function(src: any) {
      return legacyDisplay(src).toLowerCase() === 'true';
    };

    // Get the setspec settings first
    settings.finalSwap = assess.swapfinalresult || '';
    settings.finalPermute = assess.permutefinalresult || '';

    // The "easy" "top-level" settings
    extractDelimFields(assess.initialpositions, settings.initialPositions);
    settings.randomClusters = boolVal(assess.assignrandomclusters);
    settings.randomConditions = boolVal(assess.randomizegroups);
    settings.isButtonTrial = boolVal(unit.buttontrial);

    // Unlike finalPermute, which is always a series of space-delimited
    // strings that represent rangeVals, ranChoices can be a single number N
    // (which is equivalent to [0,N) where N is that number) or a rangeVal
    // ([X,Y] where the string is X-Y). SO - we convert this into a list of
    // all possible random choices
    const randomChoicesParts: any = [];
    extractDelimFields(assess.randomchoices, randomChoicesParts);
    _.each(randomChoicesParts, function(item: any) {
      if (item.indexOf('-') < 0) {
        // Single number - convert to range
        const val = legacyInt(item);
        if (!val) {
          throw new Error('Invalid randomchoices paramter: ' + assess.randomchoices);
        }
        item = '0-' + (val-1).toString();
      }

      _.each(rangeVal(item), function(subitem: any) {
        settings.ranChoices.push(subitem);
      });
    });

    // Condition by group, but remove the default single-val arrays
    // Note: since there could be 0-N group entries, we leave that as an array
    const byGroup: any = {};
    _.each(assess.conditiontemplatesbygroup, function(val: any, name: any) {
      byGroup[name] = val;
    });

    if (byGroup) {
      extractDelimFields(byGroup.groupnames, settings.groupNames);
      extractDelimFields(byGroup.clustersrepeated, settings.templateSizes);
      extractDelimFields(byGroup.templatesrepeated, settings.numTemplatesList);
      extractDelimFields(byGroup.initialpositions, settings.initialPositions);

      // Group can be either string or array. If its just a string then we need to pass it into settings as an array. 
      if(settings.groupNames.length > 1){
      _.each(byGroup.group, function(tdfGroup: any) {
        const newGroup: any = [];
        extractDelimFields(tdfGroup, newGroup);
        if (newGroup.length > 0) {
          settings.groups.push(newGroup);
        }
      });
    }
    else{
      const newGroup: any[] = []
      extractDelimFields(byGroup.group, newGroup);
      if (newGroup.length > 0) {
        settings.groups.push(newGroup);
      }
    }

//      extractDelimFields(byGroup.group, settings.groups);

      if (settings.groups.length != settings.groupNames.length) {
        clientConsole(1, 'WARNING! Num group names doesn\'t match num groups', settings.groupNames, settings.groups);
      }
    }

    // Now that all possible changes to initial positions have been
    // done, we know our schedule size
    settings.scheduleSize = settings.initialPositions.length;

    const currentTdfFile = Session.get('currentTdfFile');
    const isMultiTdf = currentTdfFile.isMultiTdf;
    let unitClusterList: any;

    if (isMultiTdf) {
      const curUnitNumber = Session.get('currentUnitNumber');

      // NOTE: We are currently assuming that multiTdfs will have only three units:
      // an instruction unit, an assessment session with exactly one question which is the last
      // item in the stim file, and a unit with all clusters specified in the generated subtdfs array
      if (curUnitNumber == 1) {
        const lastClusterIndex = getStimCount() - 1;
        unitClusterList = lastClusterIndex + '-' + lastClusterIndex;
      } else {
        const subTdfIndex = Session.get('subTdfIndex');
        unitClusterList = currentTdfFile.subTdfs[subTdfIndex].clusterList;
      }
    } else {
      unitClusterList = assess.clusterlist;
    }

    // Cluster Numbers
    const clusterList: any = [];
    extractDelimFields(unitClusterList, clusterList);
    for (let i = 0; i < clusterList.length; ++i) {
      const nums = rangeVal(clusterList[i]);
      for (let j = 0; j < nums.length; ++j) {
        settings.clusterNumbers.push(legacyInt(nums[j]));
      }
    }

    // Adaptive logic
    settings.adaptiveLogic = assess.adaptiveLogic || {};

    return settings;
  }

  return {
    unitType: SCHEDULE_UNIT,

    initImpl: async function() {
      // Retrieve current schedule
      Session.set('unitType', SCHEDULE_UNIT);

      const curUnitNum = Session.get('currentUnitNumber');
      const file = Session.get('currentTdfFile');

      // CRITICAL: Validate inputs - NO UNSAFE FALLBACKS
      if (curUnitNum === null || curUnitNum === undefined) {
        throw new Error(`Schedule engine initImpl: currentUnitNumber is ${curUnitNum}. Session state is broken.`);
      }

      if (!file) {
        throw new Error('Schedule engine initImpl: currentTdfFile is null/undefined. Session state is broken.');
      }

      if (!file.tdfs) {
        throw new Error(`Schedule engine initImpl: currentTdfFile has no tdfs property. File structure: ${JSON.stringify(Object.keys(file))}`);
      }

      if (!file.tdfs.tutor) {
        throw new Error(`Schedule engine initImpl: currentTdfFile.tdfs has no tutor property. File structure: ${JSON.stringify(Object.keys(file.tdfs))}`);
      }

      if (!file.tdfs.tutor.setspec) {
        throw new Error('Schedule engine initImpl: currentTdfFile.tdfs.tutor has no setspec property.');
      }

      if (!file.tdfs.tutor.unit) {
        throw new Error('Schedule engine initImpl: currentTdfFile.tdfs.tutor has no unit array.');
      }

      if (curUnitNum < 0 || curUnitNum >= file.tdfs.tutor.unit.length) {
        throw new Error(`Schedule engine initImpl: currentUnitNumber ${curUnitNum} is out of bounds (0-${file.tdfs.tutor.unit.length - 1})`);
      }

      const setSpec = file.tdfs.tutor.setspec;
      const currUnit = file.tdfs.tutor.unit[curUnitNum];

      if (!currUnit) {
        throw new Error(`Schedule engine initImpl: unit at index ${curUnitNum} is null/undefined`);
      }

      

      clientConsole(2, 'creating schedule with params:', setSpec, curUnitNum, currUnit);
      const existingExperimentState: any = ExperimentStateStore.get();
      const hasPersistedSchedule = hasScheduleArtifactForUnit(existingExperimentState, curUnitNum);
      const shouldReusePersistedSchedule = hasPersistedSchedule && !Session.get('resetSchedule');

      if (shouldReusePersistedSchedule) {
        schedule = existingExperimentState.schedule;
      } else {
        schedule = createSchedule(setSpec, curUnitNum, currUnit);
      }
      scheduleCursor = 0;
      if (!schedule) {
        alert('There is an issue with the TDF - experiment cannot continue');
        throw new Error('There is an issue with the TDF - experiment cannot continue');
      }

      // CRITICAL: Validate schedule has cards - empty schedules are errors, not success
      if (!schedule.q || schedule.q.length === 0) {
        const errorMsg = `Assessment session in unit "${currUnit.unitname}" (unit ${curUnitNum}) has no cards/questions. ` +
          `Check clusterlist configuration in assessmentsession. ` +
          `Schedule structure: ${JSON.stringify(schedule, null, 2)}`;
        clientConsole(1, '[Unit Engine] EMPTY SCHEDULE ERROR:', errorMsg);
        alert('Assessment session has no questions - check TDF configuration');
        throw new Error(errorMsg);
      }

      

      // We save the current schedule and also log it to the UserTime collection
      Session.set('schedule', schedule);

      if (!shouldReusePersistedSchedule) {
        const newExperimentState = {
          schedule,
          scheduleUnitNumber: curUnitNum,
        };
        await createExperimentState(newExperimentState);
      }
    },

    loadResumeState: async function() {
      // Assessment resume state is derived from schedule artifact + history.
    },

    getSchedule: function() {
      return schedule;
    },

    getScheduleCursor: function() {
      return scheduleCursor;
    },

    setScheduleCursor: function(cursor: any) {
      const nextCursor = Number(cursor);
      if (!Number.isFinite(nextCursor) || nextCursor < 0) {
        throw new Error(`Schedule cursor must be a non-negative finite number; received ${String(cursor)}`);
      }

      const boundedCursor = Math.floor(nextCursor);
      const scheduleLength = Array.isArray(schedule?.q) ? schedule.q.length : 0;
      if (boundedCursor > scheduleLength) {
        throw new Error(`Schedule cursor ${boundedCursor} is out of bounds for schedule length ${scheduleLength}`);
      }

      scheduleCursor = boundedCursor;
    },

    prepareNextScheduledCard: async function() {
      const scheduleIndex = scheduleCursor;
      const sched = this.getSchedule();
      const questInfo = sched.q[scheduleIndex];
      if (!questInfo) {
        return null;
      }

      const curClusterIndex = questInfo.clusterIndex;
      const curStimIndex = questInfo.whichStim;
      const preparedState = await this.buildPreparedCardQuestionAndAnswerGlobals(
        curClusterIndex,
        curStimIndex,
        0,
        { testType: questInfo.testType },
      );

      return {
        scheduleIndex,
        clusterIndex: curClusterIndex,
        stimIndex: curStimIndex,
        whichStim: curStimIndex,
        testType: questInfo.testType,
        preparedState,
      };
    },

    commitPreparedScheduledCard: function(selection: any) {
      if (!selection) {
        return false;
      }

      const scheduleIndex = Number.isFinite(selection.scheduleIndex)
        ? Number(selection.scheduleIndex)
        : scheduleCursor;
      const curClusterIndex = selection.clusterIndex;
      const curStimIndex = selection.stimIndex ?? selection.whichStim;
      if (!Number.isFinite(curClusterIndex) || !Number.isFinite(curStimIndex)) {
        throw new Error('Prepared schedule commit requires clusterIndex and stimIndex');
      }

      const preparedState = selection.preparedState;
      if (!preparedState) {
        throw new Error('Prepared schedule commit requires preparedState');
      }

      Session.set('clusterIndex', curClusterIndex);
      this.applyPreparedCardQuestionAndAnswerGlobals(preparedState);
      Session.set('testType', selection.testType);
      scheduleCursor = scheduleIndex + 1;
      CardStore.setQuestionIndex(scheduleCursor);
      clientConsole(2, 'SCHEDULE UNIT prepared card => ',
          'cluster-idx-unmapped:', curClusterIndex,
          'whichStim:', curStimIndex,
      );
      return true;
    },

    selectNextCard: async function(_indices: any, _curExperimentState: any) {
      const selection = await this.prepareNextScheduledCard();
      clientConsole(1, 'schedule selectNextCard', scheduleCursor, selection);
      if (!selection) {
        return;
      }
      this.commitPreparedScheduledCard(selection);
      return selection;
    },

    findCurrentCardInfo: function() {
      const questionIndex = Math.max(scheduleCursor - 1, 0);
      return this.getSchedule().q[questionIndex];
    },

    updatePracticeTime: function() {
    },

    cardAnswered: async function() {
      // Nothing currently
    },

    unitFinished: function() {
      const curUnitNum = Session.get('currentUnitNumber');
      let schedule: any = null;
      if (curUnitNum < Session.get('currentTdfFile').tdfs.tutor.unit.length) {
        schedule = this.getSchedule();
      }

      if (schedule && scheduleCursor < schedule.q.length) {
        return false; // have more
      } else {
        return true; // nothing left
      }
    },
  };
}







