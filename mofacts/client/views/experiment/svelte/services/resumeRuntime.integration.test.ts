import { expect } from 'chai';
import { Session } from 'meteor/session';
import { ExperimentStateStore } from '../../../../lib/state/experimentStateStore';
import {
  resolveSelectedCardExportQuestionIndex,
  selectCardService,
} from './unitEngineService';
import { createAssessmentModelEvidenceRecord, createHistoryRecord, historyLoggingService } from './historyLogging';
import {
  getQuestionIndex,
  resetQuestionIndex,
  setQuestionIndex,
} from './trialProgressionState';
import {
  resetActiveTrialDisplayRuntimeState,
  setCurrentAnswer,
} from './activeTrialDisplayRuntimeState';
import type { HistoryLoggingContext } from '../../../../../common/types';

type SelectCardResultLike = Record<string, unknown> & {
  unitFinished?: boolean;
  currentAnswer?: string;
  currentDisplay?: {
    text?: string;
  };
};

function primeMinimalSession(): void {
  Session.set('clusterMapping', [0]);
  Session.set('mappingSignature', null);
  Session.set('clusterIndex', 0);
  Session.set('engineIndices', { clusterIndex: 0, stimIndex: 0 });
  Session.set('currentUnitNumber', 0);
  Session.set('unitType', 'schedule');
  Session.set('currentTdfId', 'tdf-integration');
  Session.set('currentTdfName', 'integration-tdf');
  Session.set('currentLearningAttemptId', 'attempt-integration');
  Session.set('currentTdfUnit', {});
  Session.set('schedule', null);
  Session.set('currentTdfFile', {
    tdfs: {
      tutor: {
        setspec: {},
        unit: [{ unitname: 'Unit 1' }],
      },
    },
  });
  Session.set('currentStimuliSet', [
    {
      _id: 'stim-1',
      clusterKC: 1000,
      stimulusKC: 'KC-1',
      correctResponse: 'alpha',
      textStimulus: 'Prompt 1',
      probFunctionParameters: {},
    },
  ]);
}

describe('resume runtime integration seams', function() {
  beforeEach(function() {
    primeMinimalSession();
    ExperimentStateStore.set({});
    setQuestionIndex(1);
  });

  afterEach(function() {
    Session.set('currentLearningAttemptId', undefined);
    resetQuestionIndex();
    resetActiveTrialDisplayRuntimeState();
  });

  it('selectCardService consumes resumeToQuestion with existing answer and advances engine selection', async function() {
    let selectNextCardCalls = 0;
    const engine = {
      unitType: 'schedule',
      unitFinished: async () => false,
      selectNextCard: async () => {
        selectNextCardCalls += 1;
      },
      clearPrefetchedNextCard: () => undefined,
      findCurrentCardInfo: () => ({
        clusterIndex: 0,
        whichStim: 0,
        probabilityEstimate: 0.6,
        forceButtonTrial: false,
      }),
    };

    Session.set('resumeToQuestion', true);
    setCurrentAnswer('alpha');

    const result = await selectCardService(
      { engineIndices: { clusterIndex: 0 }, questionIndex: 1, engine },
      { engine, event: {} }
    ) as SelectCardResultLike;

    expect(selectNextCardCalls).to.equal(1);
    expect(Session.get('resumeToQuestion')).to.equal(false);
    expect(result.unitFinished).to.equal(false);
    expect(result.currentAnswer).to.equal('alpha');
  });

  it('selectCardService restores displayed card during resume when answer is not yet captured', async function() {
    let selectNextCardCalls = 0;
    let setupGlobalsCalls = 0;
    const engine = {
      unitType: 'schedule',
      unitFinished: async () => false,
      selectNextCard: async () => {
        selectNextCardCalls += 1;
      },
      findCurrentCardInfo: () => ({
        clusterIndex: 0,
        whichStim: 0,
        probabilityEstimate: 0.6,
        forceButtonTrial: false,
      }),
      setUpCardQuestionAndAnswerGlobals: async () => {
        setupGlobalsCalls += 1;
        return { originalAnswer: 'alpha', currentAnswer: 'alpha' };
      },
    };

    Session.set('resumeToQuestion', true);
    setCurrentAnswer('');

    const result = await selectCardService(
      { engineIndices: { clusterIndex: 0 }, questionIndex: 1, engine },
      { engine, event: {} }
    ) as SelectCardResultLike;

    expect(setupGlobalsCalls).to.equal(1);
    expect(selectNextCardCalls).to.equal(0);
    expect(Session.get('resumeToQuestion')).to.equal(false);
    expect(result.unitFinished).to.equal(false);
    expect(result.currentDisplay?.text).to.equal('Prompt 1');
  });

  it('schedule resume exports the live schedule pointer instead of stale machine questionIndex', async function() {
    let selectNextCardCalls = 0;
    const engine = {
      unitType: 'schedule',
      unitFinished: async () => false,
      selectNextCard: async () => {
        selectNextCardCalls += 1;
        setQuestionIndex(6);
      },
      clearPrefetchedNextCard: () => undefined,
      findCurrentCardInfo: () => ({
        clusterIndex: 0,
        whichStim: 0,
        probabilityEstimate: 0.6,
        forceButtonTrial: false,
      }),
    };

    Session.set('resumeToQuestion', true);
    setCurrentAnswer('alpha');
    setQuestionIndex(5);

    const result = await selectCardService(
      { engineIndices: { clusterIndex: 0 }, questionIndex: 1, engine },
      { engine, event: {} }
    ) as SelectCardResultLike & { questionIndex?: number };

    expect(selectNextCardCalls).to.equal(1);
    expect(result.questionIndex).to.equal(6);
    expect(getQuestionIndex()).to.equal(6);
  });

  it('resolves selected-card export index from the live schedule pointer only for schedule units', function() {
    expect(resolveSelectedCardExportQuestionIndex(
      { unitType: 'schedule' },
      2,
      () => 8,
    )).to.equal(8);

    expect(resolveSelectedCardExportQuestionIndex(
      { unitType: 'model' },
      2,
      () => {
        throw new Error('model should not read schedule pointer');
      },
    )).to.equal(2);
  });

  it('selectCardService reselects fresh card for model resume when last action was CARD_DISPLAYED', async function() {
    let selectNextCardCalls = 0;
    let setupGlobalsCalls = 0;
    const engine = {
      unitType: 'model',
      unitFinished: async () => false,
      selectNextCard: async () => {
        selectNextCardCalls += 1;
      },
      findCurrentCardInfo: () => ({
        clusterIndex: 0,
        whichStim: 0,
        probabilityEstimate: 0.6,
        forceButtonTrial: false,
      }),
      setUpCardQuestionAndAnswerGlobals: async () => {
        setupGlobalsCalls += 1;
        return { originalAnswer: 'alpha', currentAnswer: 'alpha' };
      },
    };

    Session.set('resumeToQuestion', true);
    setCurrentAnswer('');

    const result = await selectCardService(
      { engineIndices: { clusterIndex: 0 }, questionIndex: 1, engine },
      { engine, event: {} }
    ) as SelectCardResultLike;

    expect(selectNextCardCalls).to.equal(1);
    expect(setupGlobalsCalls).to.equal(0);
    expect(Session.get('resumeToQuestion')).to.equal(false);
    expect(result.unitFinished).to.equal(false);
  });

  it('ignores stale schedule button-trial state when selecting a model-unit practice card', async function() {
    let selectNextCardCalls = 0;
    const engine = {
      unitType: 'model',
      unitFinished: async () => false,
      selectNextCard: async () => {
        selectNextCardCalls += 1;
      },
      findCurrentCardInfo: () => ({
        clusterIndex: 0,
        whichStim: 0,
        probabilityEstimate: 0.6,
        forceButtonTrial: false,
      }),
      clearPrefetchedNextCard: () => undefined,
    };

    Session.set('unitType', 'model');
    Session.set('currentTdfUnit', { unitname: 'Practice Unit', learningsession: {} });
    Session.set('schedule', { isButtonTrial: true });

    const result = await selectCardService(
      { engineIndices: { clusterIndex: 0 }, questionIndex: 1, engine },
      { engine, event: { type: 'START' } }
    ) as SelectCardResultLike & { buttonTrial?: boolean };

    expect(selectNextCardCalls).to.equal(1);
    expect(result.buttonTrial).to.equal(false);
  });

  it('history logging record uses mapped cluster/session state and stable display order', function() {
    ExperimentStateStore.set({
      clusterMapping: [0],
    });
    Session.set('clusterIndex', 0);
    setQuestionIndex(3);

    const record = createHistoryRecord({
      trialEndTimeStamp: 2000,
      trialStartTimeStamp: 1000,
      transactionTimeStamp: 1250,
      source: 'keyboard',
      userAnswer: 'alpha',
      isCorrect: true,
      testType: 'd',
      deliverySettings: { feedbackType: 'full' },
      engine: {
        unitType: 'schedule',
        findCurrentCardInfo: () => ({
          clusterIndex: 0,
          whichStim: 0,
          probabilityEstimate: 0.7,
        }),
      },
      currentDisplay: { text: 'Prompt 1' },
      buttonList: [],
      wasButtonTrial: false,
      questionIndex: 3,
      answerContext: {
        originalDisplay: 'Prompt 1',
        originalAnswer: 'alpha',
        currentAnswer: 'alpha',
      },
    });

    expect(record.CFDisplayOrder).to.equal(3);
    expect(record.CFCorrectAnswer).to.equal('alpha');
    expect(record.CFStimFileIndex).to.equal(0);
    expect(record.outcome).to.equal('correct');
    expect(record.time).to.equal(1250);
    expect(record.problemStartTime).to.equal(1000);
    expect(record.modelEvidenceSource).to.equal('assessment');
    expect(record.clusterKC).to.equal('1000');
    expect(record.KCCluster).to.equal('1000');
    expect(record.stimulusKC).to.equal('KC-1');
    expect(record.KCId).to.equal('KC-1');
  });

  it('creates a model-scoped companion row for assessment shared-model evidence', function() {
    const record = createHistoryRecord({
      trialEndTimeStamp: 2000,
      trialStartTimeStamp: 1000,
      transactionTimeStamp: 1250,
      source: 'keyboard',
      userAnswer: 'alpha',
      isCorrect: true,
      testType: 'd',
      deliverySettings: { feedbackType: 'full' },
      engine: {
        unitType: 'schedule',
        findCurrentCardInfo: () => ({
          clusterIndex: 0,
          whichStim: 0,
          probabilityEstimate: 0.7,
        }),
      },
      currentDisplay: { text: 'Prompt 1' },
      buttonList: [],
      wasButtonTrial: false,
      questionIndex: 3,
      answerContext: {
        originalDisplay: 'Prompt 1',
        originalAnswer: 'alpha',
        currentAnswer: 'alpha',
      },
    });

    const companion = createAssessmentModelEvidenceRecord(record);

    expect(record.levelUnitType).to.equal('schedule');
    expect(companion).to.include({
      levelUnitType: 'model',
      modelEvidenceSource: 'assessment',
      clusterKC: '1000',
      KCCluster: '1000',
      stimulusKC: 'KC-1',
      KCId: 'KC-1',
    });
  });

  it('history logging records learning provenance for model units', function() {
    ExperimentStateStore.set({
      clusterMapping: [0],
    });
    Session.set('unitType', 'model');
    Session.set('clusterIndex', 0);
    setQuestionIndex(2);

    const record = createHistoryRecord({
      trialEndTimeStamp: 2000,
      trialStartTimeStamp: 1000,
      transactionTimeStamp: 1250,
      source: 'keyboard',
      userAnswer: 'alpha',
      isCorrect: true,
      testType: 'd',
      deliverySettings: { feedbackType: 'full' },
      engine: {
        unitType: 'model',
        findCurrentCardInfo: () => ({
          clusterIndex: 0,
          whichStim: 0,
          probabilityEstimate: 0.7,
        }),
      },
      currentDisplay: { text: 'Prompt 1' },
      buttonList: [],
      wasButtonTrial: false,
      questionIndex: 2,
      answerContext: {
        originalDisplay: 'Prompt 1',
        originalAnswer: 'alpha',
        currentAnswer: 'alpha',
      },
    });

    expect(record.modelEvidenceSource).to.equal('learning');
    expect(record.clusterKC).to.equal('1000');
    expect(record.KCCluster).to.equal('1000');
    expect(record.stimulusKC).to.equal('KC-1');
    expect(record.KCId).to.equal('KC-1');
  });

  it('history logging normalizes semantic cluster identity without rewriting item identity', function() {
    Session.set('currentStimuliSet', [
      {
        _id: 'stim-semantic',
        clusterKC: ' Fractions.LCD ',
        stimulusKC: ' Stim-A ',
        correctResponse: 'alpha',
        textStimulus: 'Prompt 1',
        probFunctionParameters: {},
      },
    ]);
    ExperimentStateStore.set({
      clusterMapping: [0],
    });
    Session.set('unitType', 'model');
    Session.set('clusterIndex', 0);

    const record = createHistoryRecord({
      trialEndTimeStamp: 2000,
      trialStartTimeStamp: 1000,
      transactionTimeStamp: 1250,
      source: 'keyboard',
      userAnswer: 'alpha',
      isCorrect: true,
      testType: 'd',
      deliverySettings: { feedbackType: 'full' },
      engine: {
        unitType: 'model',
        findCurrentCardInfo: () => ({
          clusterIndex: 0,
          whichStim: 0,
          probabilityEstimate: 0.7,
        }),
      },
      currentDisplay: { text: 'Prompt 1' },
      buttonList: [],
      wasButtonTrial: false,
      questionIndex: 1,
      answerContext: {
        originalDisplay: 'Prompt 1',
        originalAnswer: 'alpha',
        currentAnswer: 'alpha',
      },
    });

    expect(record.clusterKC).to.equal('fractions.lcd');
    expect(record.KCCluster).to.equal('fractions.lcd');
    expect(record.stimulusKC).to.equal(' Stim-A ');
    expect(record.KCId).to.equal(' Stim-A ');
    expect(record.KCDefault).to.equal(' Stim-A ');
  });

  it('history record construction fails clearly when display context is missing', function() {
    expect(() => createHistoryRecord({
      trialEndTimeStamp: 2000,
      trialStartTimeStamp: 1000,
      transactionTimeStamp: 1250,
      source: 'keyboard',
      userAnswer: 'alpha',
      isCorrect: true,
      testType: 'd',
      deliverySettings: { feedbackType: 'full' },
      engine: {
        unitType: 'schedule',
        findCurrentCardInfo: () => ({
          clusterIndex: 0,
          whichStim: 0,
          probabilityEstimate: 0.7,
        }),
      },
      currentDisplay: null,
      buttonList: [],
      wasButtonTrial: false,
      questionIndex: 3,
      answerContext: {
        originalDisplay: 'Prompt 1',
        originalAnswer: 'alpha',
        currentAnswer: 'alpha',
      },
    })).to.throw('[History Logging] currentDisplay missing before history write');
  });

  it('historyLoggingService rejects when outcome histories are uninitialized', async function() {
    Session.set('overallOutcomeHistory', undefined);
    Session.set('overallStudyHistory', undefined);

    const context: HistoryLoggingContext = {
        testType: 'd',
        isCorrect: true,
        timestamps: {
          trialStart: 1000,
          trialEnd: 1500,
          firstKeypress: 1100,
          feedbackStart: 1200,
          feedbackEnd: 1400,
        },
        source: 'keyboard',
        userAnswer: 'alpha',
        deliverySettings: {},
      };

    let rejectionMessage = '';
    try {
      await historyLoggingService(context, {});
    } catch (error) {
      rejectionMessage = error instanceof Error ? error.message : String(error);
    }

    expect(rejectionMessage).to.contain('overallOutcomeHistory');
  });

  it('historyLoggingService rejects when canonical feedback text is missing', async function() {
    Session.set('overallOutcomeHistory', []);
    Session.set('overallStudyHistory', []);

    const context: HistoryLoggingContext = {
      testType: 'd',
      isCorrect: false,
      timestamps: {
        trialStart: 1000,
        trialEnd: 1500,
        firstKeypress: 1100,
        feedbackStart: 1200,
        feedbackEnd: 1400,
      },
      source: 'keyboard',
      userAnswer: 'wrong',
      deliverySettings: {},
    };

    let rejectionMessage = '';
    try {
      await historyLoggingService(context, { skipOutcomeHistoryUpdate: true });
    } catch (error) {
      rejectionMessage = error instanceof Error ? error.message : String(error);
    }

    expect(rejectionMessage).to.contain('feedbackText missing');
  });
});
