import { expect } from 'chai';
import { Session } from 'meteor/session';
import { CardStore } from '../../modules/cardStore';
import { ExperimentStateStore } from '../../../../lib/state/experimentStateStore';
import { prepareIncomingTrialService, commitPreparedTrialRuntime } from './unitEngineService';

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
    CardStore.setQuestionIndex(1);
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
    expect(result.preparedAdvanceMode).to.equal('fallback');
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
        deliveryParams: { feedbackTimeout: 2000 },
        engineIndices: { clusterIndex: 0, stimIndex: 0 },
        questionIndex: 4,
      },
    });

    expect(commitPreparedScheduledCardCalls).to.equal(1);
    expect(Session.get('currentAnswer')).to.equal('alpha');
    expect(CardStore.getQuestionIndex()).to.equal(4);
  });
});
