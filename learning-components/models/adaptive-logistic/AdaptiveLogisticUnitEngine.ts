import {
  getHistoryCorrectAnswer,
  getHistoryResponseKey,
} from '../../content/response-normalization/historyResponseKey';
import { stripSpacesAndLowerCase } from '../../content/response-normalization/responseKey';
import { createLearningComponentAdapterContext } from '../../runtime/LearningComponentAdapterContext';
import { applyPracticeTimeUpdate } from './practiceTimeUpdates';
import { createTdfProbabilityFunction } from './tdfProbabilityFunction';
import { resolveSelectionTestType } from './testTypePolicy';
import { buildNextCardSelection } from './learningSessionRuntime';
import { selectLearningSessionIndices } from './learningSessionSelection';
import { commitPreparedSelection as runCommitPreparedSelection } from './cardCommit';
import { learningUnitFinished } from './learningUnitFinished';
import { initializeLearningModelState } from './initializeLearningModelState';
import { loadLearningSessionResumeState } from './loadLearningSessionResumeState';
import {
  createCurrentLearningCardInfoTracker,
  recordLearningCardAdminMetrics,
  updateCardAndStimExposure,
} from './learningSessionCardState';
import { applyLearningSessionAnswer } from './learningSessionAnswerCoordinator';
import type { UnitEngineSessionReadKey, UnitEngineSessionWriteKey } from '../../units/UnitEngineSessionKeys';
import {
  calculateLearningSessionCardProbabilities,
  setUpLearningSessionClusterList,
} from './learningSessionModelPreparation';
import {
  createEmptyLogisticModelProbabilityState,
  getStimParameterArray as getLogisticStimParameterArray,
  getStimParameterArrayFromCluster as getLogisticStimParameterArrayFromCluster,
} from './logisticModelStateBootstrap';
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
import {
  applyModelPracticeUpdateToAdaptiveLogistic,
  queryAdaptiveLogisticModelPracticeState,
} from './modelPracticeUpdateApplication';
import { createModelPracticeRuntime } from '../../runtime/modelPracticeRuntime';
import {
  createCanonicalModelPracticeHistoryRecord,
  type ModelPracticeHistoryCore,
  type ModelPracticeUpdateRequest,
} from '../../runtime/modelPracticeUpdates';
import { buildAdaptiveLogisticModelProgressItems } from './modelProgressProvider';
import type { LearningHistoryReadOptions } from '../../units/UnitEngineServerMethods';

type StimClusterLike = {
  clusterKC?: unknown;
  stims: Array<{
    correctResponse: string;
    stimuliSetId?: unknown;
    stimulusKC?: unknown;
    clusterKC?: unknown;
    responseKC?: unknown;
    params: string;
  }>;
};

export type AdaptiveLogisticServerMethods = {
  readonly getResponseKCMapForTdf: (tdfId: any) => Promise<Record<string, unknown>>;
  readonly getStimulusCrowdStatsForDeck: (
    tdfId: any,
    stimulusKCs: Array<string | number>,
  ) => Promise<Array<{
    stimulusKC: string | number;
    correctCount: number;
    incorrectCount: number;
    totalCount: number;
  }>>;
  readonly getLearningHistoryForUnit: (
    userId: any,
    tdfId: any,
    currentUnitNumber: number,
    resetStudentPerformance: boolean,
    options?: LearningHistoryReadOptions,
  ) => Promise<any[]>;
};

export interface AdaptiveLogisticUnitEngineConfig {
  readonly unitType: string;
  readonly unitLabel: string;
  readonly resolveRuntimeConfig: (unit: any) => Record<string, unknown> | null;
  readonly resolveUnitMode: (unit: any) => string;
  readonly resolveProbabilitySource: (unit: any) => string | undefined;
  readonly resolveUnitClusterListSource: (unit: any, activeVideoSession: boolean) => unknown;
  readonly resolveModelPreparationClusterListSource: (unit: any) => unknown;
}

export interface CreateAdaptiveLogisticUnitEngineDeps {
  readonly getSessionValue: (key: UnitEngineSessionReadKey) => any;
  readonly setSessionValue: (key: UnitEngineSessionWriteKey, value: any) => void;
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
  readonly serverMethods: AdaptiveLogisticServerMethods;
  readonly getCurrentUserId: () => any;
  readonly reconstructLearningStateFromHistory: (
    historyRows: any[],
    options?: { allowResponseLessModelPractice?: boolean },
  ) => any;
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

export async function createAdaptiveLogisticUnitEngine(
  deps: CreateAdaptiveLogisticUnitEngineDeps,
  config: AdaptiveLogisticUnitEngineConfig,
): Promise<any> {
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
    return getLogisticStimParameterArray({
      getStimCluster: deps.getStimCluster,
      clusterIndex,
      whichStim,
      parseNumber: deps.legacyFloat,
    });
  }

  function getStimParameterArrayFromCluster(cluster: any, whichStim: any) {
    return getLogisticStimParameterArrayFromCluster({
      cluster,
      whichStim,
      parseNumber: deps.legacyFloat,
    });
  }

  let cardProbabilities: any = [];
  const stimClusters: any[] = [];
  const currentCardTracker = createCurrentLearningCardInfoTracker({
    getCardProbabilities: () => cardProbabilities,
    getStimParameterArray,
    log: deps.log,
  });
  const learningComponentContext = createLearningComponentAdapterContext({
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
    cardProbabilities = createEmptyLogisticModelProbabilityState(overrideData);
  }

  const probFunction = createTdfProbabilityFunction(
    config.resolveProbabilitySource(deps.getSessionValue('currentTdfUnit')),
  );
  const modelDeps = {
    ...deps,
    resolveUnitClusterListSource: config.resolveUnitClusterListSource,
    resolveModelPreparationClusterListSource: config.resolveModelPreparationClusterListSource,
  };

  function updateCardAndStimData(cardIndex: any, whichStim: any) {
    updateCardAndStimExposure({
      cardProbabilities,
      cardIndex,
      whichStim,
      instructionQuestionResults: deps.getSessionValue('instructionQuestionResults'),
      testType: deps.getTestType(),
      correctAnswer: getStimAnswer(cardIndex, whichStim),
      getDisplayAnswerText: deps.getDisplayAnswerText,
    });
  }

  function recordModelPracticeRuntimeHistories(outcome: string) {
    const overallOutcomeHistory = deps.getSessionValue('overallOutcomeHistory');
    if (!Array.isArray(overallOutcomeHistory)) {
      throw new Error('Adaptive logistic model practice requires initialized overallOutcomeHistory');
    }
    if (outcome === 'correct') {
      overallOutcomeHistory.push(1);
    } else if (outcome === 'incorrect') {
      overallOutcomeHistory.push(0);
    }
    deps.setSessionValue('overallOutcomeHistory', overallOutcomeHistory);

    const overallStudyHistory = deps.getSessionValue('overallStudyHistory');
    if (!Array.isArray(overallStudyHistory)) {
      throw new Error('Adaptive logistic model practice requires initialized overallStudyHistory');
    }
    if (outcome === 'study') {
      overallStudyHistory.push(1);
    } else if (outcome === 'correct' || outcome === 'incorrect') {
      overallStudyHistory.push(0);
    }
    deps.setSessionValue('overallStudyHistory', overallStudyHistory);
  }

  return {
    calculateCardProbabilities: function calculateCardProbabilities() {
      calculateLearningSessionCardProbabilities({
        cardProbabilities,
        stimClusters,
        probabilityFunction: probFunction,
        deps: modelDeps,
      });
    },

    setUpClusterList: function setUpClusterList(cards: any) {
      setUpLearningSessionClusterList({
        cards,
        curUnit: this.curUnit,
        deps: modelDeps,
      });
    },

    initializeLogisticModelState: async function() {
      await initializeLearningModelState({
        numQuestions: deps.getStimCount(),
        curKCBase: deps.getStimKCBaseForCurrentStimuliSet(),
        currentTdfId: deps.getSessionValue('currentTdfId'),
        currentTdfUnit: deps.getSessionValue('currentTdfUnit'),
        currentUnitNumber: deps.getSessionValue('currentUnitNumber'),
        stimClusters,
        getResponseKCMapForTdf: deps.serverMethods.getResponseKCMapForTdf,
        getStimulusCrowdStatsForDeck: deps.serverMethods.getStimulusCrowdStatsForDeck,
        setResponseKCMap: (responseKCMap) => deps.setSessionValue('responseKCMap', responseKCMap),
        getStimParameterArrayFromCluster,
        normalizeResponseText: (rawResponse) => stripSpacesAndLowerCase(deps.getDisplayAnswerText(rawResponse as string)),
        setUpClusterList: (cards) => this.setUpClusterList(cards),
        initCardProbs,
        resolveRuntimeConfig: config.resolveRuntimeConfig,
        unitLabel: config.unitLabel,
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
        getLearningHistoryForUnit: deps.serverMethods.getLearningHistoryForUnit,
        reconstructLearningStateFromHistory: deps.reconstructLearningStateFromHistory,
        allowResponseLessModelPractice: config.unitType === 'sparc',
        setOverallOutcomeHistory: (history) => deps.setSessionValue('overallOutcomeHistory', history),
        setOverallStudyHistory: (history) => deps.setSessionValue('overallStudyHistory', history),
        getHistoryCorrectAnswer,
        getHistoryResponseKey: (rawResponse) => getHistoryResponseKey(
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

    getModelProgressItems: function() {
      return buildAdaptiveLogisticModelProgressItems({
        cardProbabilities,
        currentCardRef: this.currentCardRef,
      });
    },

    applyModelPracticeUpdate: async function(
      core: ModelPracticeHistoryCore,
      request: ModelPracticeUpdateRequest,
      extensionFields?: Record<string, unknown>,
    ) {
      const modelEvidenceSource = extensionFields?.sparc ? 'sparc' : 'learning';
      const runtime = createModelPracticeRuntime({
        applyUpdate: (currentRequest) => applyModelPracticeUpdateToAdaptiveLogistic({
          cardProbabilities,
          request: currentRequest,
        }),
        queryState: (query) => queryAdaptiveLogisticModelPracticeState({
          cardProbabilities,
          query,
        }),
        createHistoryRecord: createCanonicalModelPracticeHistoryRecord,
      });
      const result = await runtime.applyModelPracticeUpdate(core, request, {
        modelEvidenceSource,
        ...extensionFields,
      });
      recordModelPracticeRuntimeHistories(request.outcome);
      calculateLearningSessionCardProbabilities({
        cardProbabilities,
        stimClusters,
        probabilityFunction: probFunction,
        deps: modelDeps,
      });
      return result;
    },

    queryModelPracticeState: function(query: any) {
      return queryAdaptiveLogisticModelPracticeState({
        cardProbabilities,
        query,
      });
    },

    findCurrentCardInfo: function() {
      return currentCardTracker.findCurrentCardInfo();
    },

    unitType: config.unitType,

    curUnit: (() => JSON.parse(JSON.stringify(deps.getSessionValue('currentTdfUnit'))))(),

    unitMode: (function() {
      const unit = deps.getSessionValue('currentTdfUnit');
      const unitMode = config.resolveUnitMode(unit);
      deps.log(1, 'UNIT MODE: ' + unitMode);
      return unitMode;
    })(),

    initImpl: async function() {
      deps.setSessionValue('unitType', config.unitType);
      await this.initializeLogisticModelState();
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
        setCurrentCardInfo: currentCardTracker.setCurrentCardInfo,
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
          recordLearningCardAdminMetrics({
            cardProbabilities,
            cardIndex,
            whichStim,
            card,
            stim,
            correctAnswer: getStimAnswer(cardIndex, whichStim),
            getDisplayAnswerText: deps.getDisplayAnswerText,
            displayify: deps.displayify,
            log: deps.log,
          });
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
        if (await this.unitFinished()) {
          deps.unitIsFinished('Adaptive logistic session completion rule satisfied');
          return;
        }
        throw new Error(
          'Adaptive logistic session selection produced no card before a completion rule was satisfied; refusing to advance unit.'
        );
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
        whichStim: currentCardTracker.currentCardInfo.whichStim,
        practiceTime,
      });
      deps.updateCurStudedentPracticeTime(practiceTime);
    },

    cardAnswered: async function(wasCorrect: any, practiceTime: any) {
      const selectedClusterIndex = deps.getSessionValue('clusterIndex');
      const testType = deps.getTestType();
      const {whichStim} = this.findCurrentCardInfo();
      await applyLearningSessionAnswer({
        cardProbabilities,
        stimClusters,
        selectedClusterIndex,
        whichStim,
        currentStimIndex: currentCardTracker.currentCardInfo.whichStim,
        wasCorrect,
        practiceTime,
        testType,
        getDisplayAnswerText: deps.getDisplayAnswerText,
        updateCurStudentPerformance: deps.updateCurStudentPerformance,
        displayify: deps.displayify,
        log: deps.log,
      });
    },

    unitFinished: async function() {
      const session = config.resolveRuntimeConfig(this.curUnit);
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
