import {
  applyPreparedCardQuestionAndAnswerGlobals,
  buildPreparedCardQuestionAndAnswerGlobals,
} from './shared/cardPreparation';

export interface CreateBaseUnitEngineParams {
  readonly experimentState: any;
  readonly adaptiveQuestionLogic: any;
  readonly stimClusters: any[];
  readonly getCurrentTestType: () => string | undefined;
  readonly getDeliverySettings: () => Record<string, unknown> | null | undefined;
  readonly getStimAnswer: (clusterIndex: number, whichStim: number) => string;
  readonly setSessionValue: (key: string, value: unknown) => void;
  readonly setCardValue: (key: string, value: unknown) => void;
  readonly setAlternateDisplayIndex: (value: number | undefined) => void;
  readonly setOriginalQuestion: (value: unknown) => void;
  readonly log: (level: number, ...args: unknown[]) => void;
}

export function createBaseUnitEngine(params: CreateBaseUnitEngineParams): any {
  const engine: any = {
    unitType: 'DEFAULT',

    adaptiveQuestionLogic: params.adaptiveQuestionLogic,
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

    initImpl: async function() { },

    init: async function() {
      params.log(1, 'Engine created for unit:', this.unitType);
      await this.initImpl();
    },

    buildPreparedCardQuestionAndAnswerGlobals: async function(cardIndex: any, whichStim: any, probFunctionParameters: any, options: any = {}) {
      return buildPreparedCardQuestionAndAnswerGlobals(
        cardIndex,
        whichStim,
        probFunctionParameters,
        options,
        {
          stimClusters: params.stimClusters,
          getCurrentTestType: params.getCurrentTestType,
          getDeliverySettings: params.getDeliverySettings,
          getStimAnswer: params.getStimAnswer,
          log: (...args: unknown[]) => params.log(1, ...args),
        },
      );
    },

    applyPreparedCardQuestionAndAnswerGlobals: function(preparedState: any) {
      return applyPreparedCardQuestionAndAnswerGlobals(preparedState, {
        setSessionValue: params.setSessionValue,
        setCardValue: params.setCardValue,
        setAlternateDisplayIndex: params.setAlternateDisplayIndex,
        setOriginalQuestion: params.setOriginalQuestion,
      });
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
  engine.experimentState = params.experimentState;
  return engine;
}
