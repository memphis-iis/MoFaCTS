import { expect } from 'chai';
import { Session } from 'meteor/session';
import { ExperimentStateStore } from '../../../../lib/state/experimentStateStore';
import {
  canEngineUseSeamlessPreparedAdvance,
  commitPreparedTrialRuntime,
  prepareIncomingTrialService,
  resolveModelEngineCardRef,
  resolvePreparedIncomingTrialRoute,
  resolvePreparedTrialCommitRoute,
} from './unitEngineService';
import {
  getQuestionIndex,
  resetQuestionIndex,
  setQuestionIndex,
} from './trialProgressionState';

function primeMinimalSession(): void {
  Session.set('clusterMapping', [0]);
  Session.set('mappingSignature', null);
  Session.set('clusterIndex', 0);
  Session.set('engineIndices', { clusterIndex: 0, stimIndex: 0 });
  Session.set('currentUnitNumber', 0);
  Session.set('currentTdfId', 'tdf-prepared');
  Session.set('currentTdfName', 'prepared-tdf');
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

describe('prepared advance integration seams', function() {
  beforeEach(function() {
    primeMinimalSession();
    ExperimentStateStore.set({});
    setQuestionIndex(1);
  });

  afterEach(function() {
    resetQuestionIndex();
  });

  it('prepareIncomingTrialService materializes model locked-next payload without committing it', async function() {
    let lockNextCardEarlyCalls = 0;
    let applyLockedNextCardCalls = 0;
    let selectNextCardCalls = 0;
    const selection = {
      clusterIndex: 0,
      stimIndex: 0,
      testType: 'd',
      preparedState: {
        currentAnswer: 'alpha',
        currentDisplay: { text: 'Prompt 1' },
        newExperimentState: { originalAnswer: 'alpha' },
      },
    };
    const engine = {
      unitType: 'model',
      currentCardRef: { clusterIndex: 0, stimIndex: 0 },
      currentCardOwnerToken: 'owner-1',
      nextTrialContent: null as Record<string, unknown> | null,
      lockNextCardEarly: async () => {
        lockNextCardEarlyCalls += 1;
        return selection;
      },
      setPreparedNextTrialContent(content: Record<string, unknown> | null) {
        this.nextTrialContent = content;
      },
      getPreparedNextTrialContent() {
        return this.nextTrialContent;
      },
      applyLockedNextCard: async () => {
        applyLockedNextCardCalls += 1;
        return true;
      },
      selectNextCard: async () => {
        selectNextCardCalls += 1;
        return selection;
      },
    };

    const result = await prepareIncomingTrialService(
      { engine, engineIndices: { clusterIndex: 0, stimIndex: 0 }, questionIndex: 1 },
      { engine }
    ) as Record<string, unknown>;

    expect(lockNextCardEarlyCalls).to.equal(1);
    expect(applyLockedNextCardCalls).to.equal(0);
    expect(selectNextCardCalls).to.equal(0);
    expect(result.preparedAdvanceMode).to.equal('seamless');
    expect(result.currentAnswer).to.equal('alpha');
    expect(result.questionIndex).to.equal(2);
    expect(engine.getPreparedNextTrialContent()).to.not.equal(null);
  });

  it('names prepared incoming trial routes by behavior', function() {
    expect(resolvePreparedIncomingTrialRoute({ unitType: 'video' })).to.deep.equal({
      kind: 'video-noop',
      preparedAdvanceMode: 'none',
    });
    expect(resolvePreparedIncomingTrialRoute({ unitType: 'model' })).to.deep.equal({
      kind: 'model-lock',
      preparedAdvanceMode: 'seamless',
    });
    expect(resolvePreparedIncomingTrialRoute({ unitType: 'schedule' })).to.deep.equal({
      kind: 'schedule-prepare',
      preparedAdvanceMode: 'direct',
    });
    expect(resolvePreparedIncomingTrialRoute({ unitType: 'custom' })).to.deep.equal({
      kind: 'finish-check',
      preparedAdvanceMode: 'direct',
    });
  });

  it('prepareIncomingTrialService peeks schedule next card without advancing live selection', async function() {
    let prepareNextScheduledCardCalls = 0;
    let selectNextCardCalls = 0;
    const selection = {
      scheduleIndex: 1,
      clusterIndex: 0,
      stimIndex: 0,
      whichStim: 0,
      testType: 'd',
      preparedState: {
        currentAnswer: 'alpha',
        currentDisplay: { text: 'Prompt 1' },
        newExperimentState: { originalAnswer: 'alpha' },
      },
    };
    const engine = {
      unitType: 'schedule',
      prepareNextScheduledCard: async () => {
        prepareNextScheduledCardCalls += 1;
        return selection;
      },
      selectNextCard: async () => {
        selectNextCardCalls += 1;
        return selection;
      },
      unitFinished: async () => false,
    };

    const result = await prepareIncomingTrialService(
      { engine, questionIndex: 3 },
      { engine }
    ) as Record<string, unknown>;

    expect(prepareNextScheduledCardCalls).to.equal(1);
    expect(selectNextCardCalls).to.equal(0);
    expect(result.preparedAdvanceMode).to.equal('direct');
    expect(result.questionIndex).to.equal(4);
    expect(result.preparedSelection).to.deep.equal(selection);
  });

  it('prepareIncomingTrialService returns an explicit no-op for video units', async function() {
    let selectNextCardCalls = 0;
    const engine = {
      unitType: 'video',
      selectNextCard: async () => {
        selectNextCardCalls += 1;
      },
    };

    const result = await prepareIncomingTrialService(
      { engine, questionIndex: 2 },
      { engine }
    ) as Record<string, unknown>;

    expect(selectNextCardCalls).to.equal(0);
    expect(result.preparedAdvanceMode).to.equal('none');
    expect(result.unitFinished).to.equal(false);
    expect(result.questionIndex).to.equal(3);
    expect(result.engine).to.equal(engine);
  });

  it('prepareIncomingTrialService rejects missing engine state instead of treating the unit as finished', async function() {
    try {
      await prepareIncomingTrialService(
        { engine: null, questionIndex: 2 },
        {}
      );
      throw new Error('Expected prepareIncomingTrialService to reject missing engine state');
    } catch (error: unknown) {
      expect(error).to.be.instanceOf(Error);
      expect((error as Error).message).to.equal('No engine available for prepared incoming trial');
    }
  });

  it('names prepared trial commit routes by behavior', function() {
    expect(resolvePreparedTrialCommitRoute({ unitType: 'model' })).to.equal('model-locked-card');
    expect(resolvePreparedTrialCommitRoute({ unitType: 'schedule' })).to.equal('schedule-prepared-card');
    expect(resolvePreparedTrialCommitRoute({ unitType: 'video' })).to.equal('unsupported');
    expect(resolvePreparedTrialCommitRoute(null)).to.equal('unsupported');
  });

  it('names seamless prepared-advance and model card-ref ownership', function() {
    const modelEngine = {
      unitType: 'model',
      currentCardRef: { clusterIndex: 2, stimIndex: 3 },
    };
    expect(canEngineUseSeamlessPreparedAdvance(modelEngine)).to.equal(true);
    expect(resolveModelEngineCardRef(modelEngine)).to.deep.equal({ clusterIndex: 2, stimIndex: 3 });
    expect(canEngineUseSeamlessPreparedAdvance({ unitType: 'schedule' })).to.equal(false);
    expect(resolveModelEngineCardRef({ unitType: 'schedule', currentCardRef: { clusterIndex: 2 } })).to.equal(null);
  });

  it('commitPreparedTrialRuntime applies schedule mirrors only at commit', function() {
    let commitPreparedScheduledCardCalls = 0;
    const selection = {
      scheduleIndex: 1,
      clusterIndex: 0,
      stimIndex: 0,
    };
    const engine = {
      unitType: 'schedule',
      commitPreparedScheduledCard: (preparedSelection: Record<string, unknown>) => {
        commitPreparedScheduledCardCalls += 1;
        expect(preparedSelection).to.equal(selection);
        return true;
      },
      setPreparedNextTrialContent: () => undefined,
    };

    commitPreparedTrialRuntime({
      engine,
      preparedTrial: {
        engine,
        preparedSelection: selection,
        currentAnswer: 'alpha',
        buttonTrial: false,
        buttonList: [],
        deliverySettings: { feedbackTimeout: 2000 },
        engineIndices: { clusterIndex: 0, stimIndex: 0 },
        questionIndex: 4,
      },
    });

    expect(commitPreparedScheduledCardCalls).to.equal(1);
    expect(Session.get('currentAnswer')).to.equal('alpha');
    expect(getQuestionIndex()).to.equal(4);
  });
});
