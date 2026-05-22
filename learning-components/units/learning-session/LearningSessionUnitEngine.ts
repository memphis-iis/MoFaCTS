import { MODEL_UNIT } from '../../../mofacts/common/Definitions';
import {
  getHistoryCorrectAnswer,
  getHistoryResponseKey as getAppHistoryResponseKey,
} from '../../../mofacts/common/history/historyResponseKey';
import { resolveSelectionTestType } from '../../models/selection/testTypePolicy';
import { stripSpacesAndLowerCase } from '../../content/response-normalization/responseKey';
import {
  applyClusterListAvailability,
  parseUnitClusterList,
  resolveModelClusterList,
} from '../../content/tdf/clusterListParser';
import { createTdfProbabilityFunction } from '../../models/probability/tdfProbabilityFunction';
import { calculateCardProbabilities as runCalculateCardProbabilities } from '../../models/probability/probabilityCalculation';
import { applyAnswerUpdate } from '../../models/answer-updates/answerUpdates';
import { applyPracticeTimeUpdate } from '../../models/answer-updates/practiceTimeUpdates';
import { createMeteorLearningComponentContext } from '../../runtime/MeteorLearningComponentContext';
import { buildNextCardSelection } from './learningSessionRuntime';
import { selectLearningSessionIndices } from './learningSessionSelection';
import { commitPreparedSelection as runCommitPreparedSelection } from './cardCommit';
import { learningUnitFinished } from './learningUnitFinished';
import { initializeLearningModelState } from './initializeLearningModelState';
import { loadLearningSessionResumeState } from './loadLearningSessionResumeState';
import {
  applyLockedNextCard as runApplyLockedNextCard,
  applyPrefetchedNextCard as runApplyPrefetchedNextCard,
  buildCurrentOwnerToken,
  clearLockedNextCard as runClearLockedNextCard,
  clearPrefetchedNextCard as runClearPrefetchedNextCard,
  clearRuntimeNextCardState as runClearRuntimeNextCardState,
  commitLockedNextCard as runCommitLockedNextCard,
  lockNextCardEarly as runLockNextCardEarly,
  peekLockedNextCard as runPeekLockedNextCard,
  prefetchNextCard as runPrefetchNextCard,
} from './prefetchAndLocking';

type StimClusterLike = {
  stims: Array<{
    correctResponse: string;
    params: string;
  }>;
};

export interface CreateLearningSessionUnitEngineDeps {
  readonly getSessionValue: (key: string) => any;
  readonly setSessionValue: (key: string, value: any) => void;
  readonly getDeliverySettings: () => Record<string, any>;
  readonly getStimCount: () => number;
  readonly getStimCluster: (clusterIndex: any) => StimClusterLike;
  readonly getStimKCBaseForCurrentStimuliSet: () => any;
  readonly getTestType: () => string;
  readonly getHiddenItems: () => unknown[];
  readonly setNumVisibleCards: (numVisibleCards: number) => void;
  readonly setQuestionIndex: (questionIndex: number) => void;
  readonly getDisplayAnswerText: (answer: any) => string;
  readonly updateCurStudentPerformance: (wasCorrect: any, practiceTime: any, testType: any) => void;
  readonly updateCurStudedentPracticeTime: (practiceTime: any) => void;
  readonly meteorCallAsync: (name: string, ...args: any[]) => Promise<any>;
  readonly getCurrentUserId: () => any;
  readonly reconstructLearningStateFromHistory: (historyRows: any[]) => any;
  readonly extractDelimFields: (source: any, target: any[]) => void;
  readonly rangeVal: (source: any) => any[];
  readonly legacyFloat: (source: any) => number;
  readonly legacyInt: (source: any) => number;
  readonly currentUserHasRole: (roles: string) => boolean;
  readonly displayify: (value: any) => any;
  readonly unitIsFinished: (reason: string) => void;
  readonly findTdfById: (tdfId: any) => any;
  readonly alertUser: (message: string) => void;
  readonly log: (level: number, ...args: unknown[]) => void;
}

export async function createLearningSessionUnitEngine(deps: CreateLearningSessionUnitEngineDeps): Promise<any> {
  deps.log(1, 'model unit engine created!!!');
  const unitStartTimestamp = Date.now();

  function getStimAnswer(clusterIndex: any, whichAnswer: any) {
    const cluster = deps.getStimCluster(clusterIndex);
    const stim = cluster.stims[whichAnswer];
    if (!stim) {
      throw new Error(`Stim not found for cluster ${clusterIndex}, stim ${whichAnswer}`);
    }
    return stim.correctResponse;
  }

  function getStimParameterArray(clusterIndex: any, whichStim: any) {
    const cluster = deps.getStimCluster(clusterIndex);
    const stim = cluster.stims[whichStim];
    if (!stim) {
      throw new Error(`Params not found for cluster ${clusterIndex}, stim ${whichStim}`);
    }
    return stim.params.split(',').map((x: any) => deps.legacyFloat(x));
  }

  function getStimParameterArrayFromCluster(cluster: any, whichStim: any) {
    return cluster.stims[whichStim].params.split(',').map((x: any) => deps.legacyFloat(x));
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
    deps.log(1, 'MODEL UNIT card (selection: any) => ',
        'cluster-idx:', clusterIndex,
        'whichStim:', whichStim,
        'forceButtonTrial:', forceButtonTrial,
        'parameter', getStimParameterArray(clusterIndex, whichStim),
    );
  }

  let cardProbabilities: any = [];
  const stimClusters: any[] = [];
  const learningComponentContext = createMeteorLearningComponentContext({
    getSessionValue: deps.getSessionValue,
    setSessionValue: deps.setSessionValue,
    getDeliverySettings: deps.getDeliverySettings,
    log: deps.log,
  });
  const numQuestions = deps.getStimCount();
  for (let i = 0; i < numQuestions; ++i) {
    stimClusters.push(deps.getStimCluster(i));
  }
  function initCardProbs(overrideData: any) {
    let initVals = {
      numQuestionsAnswered: 0,
      numQuestionsAnsweredCurrentSession: 0,
      numCorrectAnswers: 0,
      cards: [],
    };

    if (overrideData) {
      initVals = Object.assign(initVals, overrideData);
    }
    cardProbabilities = initVals;
  }

  function secs(t: any) {
    return t / 1000.0;
  }

  const probFunction = createTdfProbabilityFunction(deps.getSessionValue('currentTdfUnit'));

  function updateCardAndStimData(cardIndex: any, whichStim: any) {
    const card = cardProbabilities.cards[cardIndex];
    const stim = card.stims[whichStim];
    const responseText = stripSpacesAndLowerCase(deps.getDisplayAnswerText(getStimAnswer(cardIndex, whichStim)));

    cardProbabilities.instructionQuestionResult = deps.getSessionValue('instructionQuestionResults');

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
      if (deps.getTestType() === 's') {
        resp.priorStudy += 1;
      }
    }
    card.trialsSinceLastSeen = 0;
    card.hasBeenIntroduced = true;
    stim.hasBeenIntroduced = true;
    if (deps.getTestType() === 's') {
      card.priorStudy += 1;
      stim.priorStudy += 1;
    }
  }

  return {
    calculateCardProbabilities: function calculateCardProbabilities() {
      const unitNumber = deps.getSessionValue('currentUnitNumber');
      const curTdf = deps.findTdfById(deps.getSessionValue('currentTdfId'));
      const unitTypeParams = curTdf.content.tdfs.tutor.unit[unitNumber].assessmentsession || curTdf.content.tdfs.tutor.unit[unitNumber].learningsession;
      let clusterList;
      unitTypeParams ? clusterList = unitTypeParams.clusterlist : clusterList = false;
      if (!clusterList) { deps.log(2, 'no clusterlist found for unit ' + unitNumber); }
      const unitClusterList = parseUnitClusterList(clusterList);
      runCalculateCardProbabilities({
        cardProbabilities,
        stimClusters,
        unitClusterList,
        probabilityFunction: probFunction,
        deliverySettings: deps.getDeliverySettings(),
        overallOutcomeHistory: deps.getSessionValue('overallOutcomeHistory'),
        overallStudyHistory: deps.getSessionValue('overallStudyHistory'),
        getDisplayAnswerText: deps.getDisplayAnswerText,
        normalizeResponseText: (answer) => stripSpacesAndLowerCase(answer),
        legacyFloat: deps.legacyFloat,
        log: (...args) => deps.log(2, ...args),
      });
    },

    setUpClusterList: function setUpClusterList(cards: any) {
      const clusterList = resolveModelClusterList({
        currentTdfFile: deps.getSessionValue('currentTdfFile'),
        currentUnitNumber: deps.getSessionValue('currentUnitNumber'),
        subTdfIndex: deps.getSessionValue('subTdfIndex'),
        isVideoSession: deps.getSessionValue('isVideoSession'),
        curUnit: this.curUnit,
        currentSessionUnit: JSON.parse(JSON.stringify(deps.getSessionValue('currentTdfUnit'))),
        extractDelimFields: deps.extractDelimFields,
        log: deps.log,
      });
      deps.log(2, 'clusterList', clusterList);
      applyClusterListAvailability(cards, clusterList, deps.rangeVal, deps.legacyInt);
      deps.log(1, 'setupClusterList,cards:', cards);
    },

    initializeActRModel: async function() {
      await initializeLearningModelState({
        numQuestions: deps.getStimCount(),
        curKCBase: deps.getStimKCBaseForCurrentStimuliSet(),
        currentTdfId: deps.getSessionValue('currentTdfId'),
        currentTdfUnit: deps.getSessionValue('currentTdfUnit'),
        currentUnitNumber: deps.getSessionValue('currentUnitNumber'),
        stimClusters,
        getResponseKCMapForTdf: async (tdfId) => await deps.meteorCallAsync('getResponseKCMapForTdf', tdfId) as Record<string, unknown>,
        setResponseKCMap: (responseKCMap) => deps.setSessionValue('responseKCMap', responseKCMap),
        getStimParameterArrayFromCluster,
        normalizeResponseText: (rawResponse) => stripSpacesAndLowerCase(deps.getDisplayAnswerText(rawResponse as string)),
        setUpClusterList: (cards) => this.setUpClusterList(cards),
        initCardProbs,
        alertUser: deps.alertUser,
        log: deps.log,
      });
    },

    loadResumeState: async function() {
      await loadLearningSessionResumeState({
        userId: deps.getCurrentUserId(),
        tdfId: deps.getSessionValue('currentTdfId'),
        currentUnitNumber: Number(deps.getSessionValue('currentUnitNumber') || 0),
        resetStudentPerformance: Boolean(deps.getDeliverySettings()?.resetStudentPerformance),
        hiddenItems: deps.getHiddenItems(),
        cardProbabilities,
        stimClusters,
        getLearningHistoryForUnit: async (userId, tdfId, currentUnitNumber, resetStudentPerformance) => await deps.meteorCallAsync(
          'getLearningHistoryForUnit',
          userId,
          tdfId,
          currentUnitNumber,
          resetStudentPerformance,
        ) as any[],
        reconstructLearningStateFromHistory: deps.reconstructLearningStateFromHistory,
        setOverallOutcomeHistory: (history) => deps.setSessionValue('overallOutcomeHistory', history),
        setOverallStudyHistory: (history) => deps.setSessionValue('overallStudyHistory', history),
        getHistoryCorrectAnswer,
        getHistoryResponseKey: (rawResponse) => getAppHistoryResponseKey(
          rawResponse,
          (answer) => deps.getDisplayAnswerText(answer),
          (answer) => stripSpacesAndLowerCase(answer),
        ),
        setNumVisibleCards: deps.setNumVisibleCards,
        log: deps.log,
      });
    },
    getCardProbabilitiesNoCalc: function() {
      return cardProbabilities;
    },

    findCurrentCardInfo: function() {
      return currentCardInfo;
    },

    unitType: MODEL_UNIT,

    curUnit: (() => JSON.parse(JSON.stringify(deps.getSessionValue('currentTdfUnit'))))(),

    unitMode: (function() {
      const unit = deps.getSessionValue('currentTdfUnit');
      let unitMode = 'default';
      if (unit.learningsession && unit.learningsession.unitMode)
        unitMode = unit.learningsession.unitMode.trim();
      else if (unit.videosession && unit.videosession.unitMode)
        unitMode = unit.videosession.unitMode.trim();
      deps.log(1, 'UNIT MODE: ' + unitMode);
      return unitMode;
    })(),

    initImpl: async function() {
      deps.setSessionValue('unitType', MODEL_UNIT);
      await this.initializeActRModel();
    },

    calculateIndices: async function(options: any = {}) {
      return await selectLearningSessionIndices({
        unitMode: this.unitMode,
        cards: cardProbabilities.cards,
        hiddenItems: deps.getHiddenItems(),
        deliverySettings: deps.getDeliverySettings(),
        options,
        calculateCardProbabilities: () => this.calculateCardProbabilities(),
        log: deps.log,
      });
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
      return buildCurrentOwnerToken(this._trialEpoch, cardRef);
    },

    _resolveSelectionTestType: function(card: any, stim: any) {
      return resolveSelectionTestType({
        card,
        stim,
        deliverySettings: deps.getDeliverySettings(),
        random: Math.random,
        log: (...args) => deps.log(2, ...args),
      });
    },

    async _buildNextCardSelection(indices: any, options: any = {}) {
      return await buildNextCardSelection({
        indices,
        options,
        cardProbabilities,
        context: learningComponentContext,
        calculateIndices: (selectionOptions) => this.calculateIndices(selectionOptions),
        resolveSelectionTestType: (card, stim) => this._resolveSelectionTestType(card, stim),
        buildPreparedCardQuestionAndAnswerGlobals: (cardIndex, whichStim, probFunctionParameters, buildOptions) =>
          this.buildPreparedCardQuestionAndAnswerGlobals(cardIndex, whichStim, probFunctionParameters, buildOptions),
      });
    },

    _commitPreparedSelection: function(selection: any, _curExperimentState: any) {
      return runCommitPreparedSelection({
        selection,
        cardProbabilities,
        context: {
          setSessionValue: deps.setSessionValue,
          getSessionValue: deps.getSessionValue,
          setQuestionIndex: deps.setQuestionIndex,
          log: deps.log,
        },
        resolveSelectionTestType: (card, stim) => this._resolveSelectionTestType(card, stim),
        buildCurrentOwnerToken: (cardRef) => this._buildCurrentOwnerToken(cardRef),
        setCurrentCardInfo,
        findCurrentCardInfo: () => this.findCurrentCardInfo(),
        applyPreparedCardQuestionAndAnswerGlobals: (preparedState) => this.applyPreparedCardQuestionAndAnswerGlobals(preparedState),
        setRuntimeCurrentPreparedState: (preparedState) => {
          this.currentPreparedState = preparedState;
        },
        setRuntimeCurrentCardRef: (cardRef) => {
          this.currentCardRef = cardRef;
        },
        setRuntimeCurrentCardOwnerToken: (ownerToken) => {
          this.currentCardOwnerToken = ownerToken;
        },
        updateCardAndStimData,
        recordAdminMetrics: (cardIndex, whichStim, card, stim) => {
          if (!deps.currentUserHasRole('admin,teacher')) {
            return;
          }
          deps.log(1, '>>>BEGIN METRICS>>>>>>>\n',
          'Overall user (stats: any) => ',
              'total responses:', cardProbabilities.numQuestionsAnswered,
              'total correct responses:', cardProbabilities.numCorrectAnswers,
          );

          deps.log(1, 'Model selected card:', card);
          deps.log(1, 'Model selected stim:', stim);

          const elapsedStr = function(t: any) {
            return t < 1 ? 'Never Seen': secs(Date.now() - t);
          };
          deps.log(1,
              'Card First Seen:', elapsedStr(card.firstSeen),
              'Card Last Seen:', elapsedStr(card.lastSeen),
              'Total time in other practice:', secs(card.otherPracticeTime),
              'Stim First Seen:', elapsedStr(stim.firstSeen),
              'Stim Last Seen:', elapsedStr(stim.lastSeen),
              'Stim Total time in other practice:', secs(stim.otherPracticeTime),
          );

          const responseText = stripSpacesAndLowerCase(deps.getDisplayAnswerText(getStimAnswer(cardIndex, whichStim)));
          if (responseText && responseText in cardProbabilities.responses) {
            deps.log(1, 'Response is', responseText, deps.displayify(cardProbabilities.responses[responseText]));
          }

          deps.log(1, '<<<END   METRICS<<<<<<<');
        }
      });
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
        deps.unitIsFinished('No more cards to show');
        return;
      }
      await this._applyNextCardSelection(selection, curExperimentState);
      return selection;
    },

    clearLockedNextCard: function(reason: any = 'unspecified') {
      runClearLockedNextCard(this, { log: deps.log }, reason);
    },

    clearRuntimeNextCardState: function(reason: any = 'runtime-reset') {
      runClearRuntimeNextCardState(this, { log: deps.log }, reason);
    },

    setPreparedNextTrialContent: function(content: any) {
      this.nextTrialContent = content;
    },

    getPreparedNextTrialContent: function() {
      return this.nextTrialContent || null;
    },

    peekLockedNextCard: function() {
      return runPeekLockedNextCard(this);
    },

    lockNextCardEarly: async function(indices: any, _curExperimentState: any, options: any = {}) {
      return await runLockNextCardEarly(this, {
        buildNextCardSelection: (selectionIndices, selectionOptions) => this._buildNextCardSelection(selectionIndices, selectionOptions),
        log: deps.log,
      }, indices, options);
    },

    applyLockedNextCard: async function(curExperimentState: any) {
      return await runApplyLockedNextCard(this, {
        applyNextCardSelection: (selection, experimentState) => this._applyNextCardSelection(selection, experimentState),
        log: deps.log,
      }, curExperimentState);
    },

    commitLockedNextCard: function(curExperimentState: any) {
      return runCommitLockedNextCard(this, {
        commitPreparedSelection: (selection, experimentState) => this._commitPreparedSelection(selection, experimentState),
        log: deps.log,
      }, curExperimentState);
    },

    prefetchNextCard: async function(indices: any, _curExperimentState: any) {
      await runPrefetchNextCard(this, {
        buildNextCardSelection: (selectionIndices, selectionOptions) => this._buildNextCardSelection(selectionIndices, selectionOptions),
        isVideoSession: () => deps.getSessionValue('isVideoSession'),
        log: deps.log,
      }, indices);
    },

    applyPrefetchedNextCard: async function(curExperimentState: any) {
      return await runApplyPrefetchedNextCard(this, {
        applyNextCardSelection: (selection, experimentState) => this._applyNextCardSelection(selection, experimentState),
        log: deps.log,
      }, curExperimentState);
    },

    clearPrefetchedNextCard: function() {
      runClearPrefetchedNextCard(this);
    },

    updatePracticeTime: function(practiceTime: any) {
      applyPracticeTimeUpdate({
        cardProbabilities,
        clusterIndex: deps.getSessionValue('clusterIndex'),
        whichStim: currentCardInfo.whichStim,
        practiceTime,
      });
      deps.updateCurStudedentPracticeTime(practiceTime);
    },

    cardAnswered: async function(wasCorrect: any, practiceTime: any) {
      const cards = cardProbabilities.cards;
      const selectedClusterIndex = deps.getSessionValue('clusterIndex');
      const cluster = stimClusters[selectedClusterIndex];
      const card = cards[selectedClusterIndex];
      const testType = deps.getTestType();
      deps.log(1, 'cardAnswered, card: ', card, 'clusterIndex: ', selectedClusterIndex);

      const {whichStim} = this.findCurrentCardInfo();
      const stim = card.stims[whichStim];
      const answerText = stripSpacesAndLowerCase(deps.getDisplayAnswerText(
        cluster.stims[currentCardInfo.whichStim].correctResponse));

      deps.updateCurStudentPerformance(wasCorrect, practiceTime, testType);

      const currentStimProbability = stim.probabilityEstimate;

      deps.log(2, 'cardAnswered, curTrialInfo:', currentStimProbability, card, stim);

      applyAnswerUpdate({
        cardProbabilities,
        cards,
        selectedClusterIndex,
        currentStimIndex: currentCardInfo.whichStim,
        whichStim,
        practiceTime,
        wasCorrect,
        testType,
        answerText,
        onMissingResponseMetrics: () => deps.log(1, 'COULD NOT STORE RESPONSE METRICS',
            answerText,
            currentCardInfo.whichStim,
            deps.displayify(cluster.stims[currentCardInfo.whichStim].correctResponse),
            deps.displayify(cardProbabilities.responses)),
      });

    },

    unitFinished: async function() {
      const session = this.curUnit.learningsession || this.curUnit.videosession;
      return learningUnitFinished({
        session,
        deliverySettings: deps.getDeliverySettings(),
        numQuestionsAnsweredCurrentSession: cardProbabilities.numQuestionsAnsweredCurrentSession,
        unitStartTimestamp,
        getCurrentStudentPerformance: () => deps.getSessionValue('curStudentPerformance'),
        log: deps.log,
      });
    },
  };
}
