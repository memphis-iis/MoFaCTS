import { expect } from 'chai';
import { Session } from 'meteor/session';
import { updateEngineService } from './unitEngineService';

describe('unit engine H5P model updates', function() {
  afterEach(function() {
    Session.set('isVideoSession', false);
    Session.set('engineIndices', undefined);
  });

  it('reports missing engine state as an explicit update error', async function() {
    const result = await updateEngineService({
      testType: 'd',
      isCorrect: true,
      timestamps: {
        trialStart: 1000,
        firstKeypress: 1100,
        trialEnd: 1500,
        feedbackStart: 1500,
        feedbackEnd: 1500,
      },
      engine: null,
    }, {});

    expect(result).to.deep.equal({
      status: 'error',
      error: 'No engine available for engine update',
    });
  });

  it('counts every H5P part outcome against the selected model card', async function() {
    const calls: Array<{ isCorrect: boolean; practiceTime: number; testType: string }> = [];

    const result = await updateEngineService({
      testType: 'd',
      isCorrect: false,
      timestamps: {
        trialStart: 1000,
        firstKeypress: 1100,
        trialEnd: 2500,
        feedbackStart: 2500,
        feedbackEnd: 2500,
      },
      h5pResult: {
        contentId: 'activity-1',
        batchId: 'batch-1',
        completed: true,
        events: [
          { eventIndex: 0, correct: true },
          { eventIndex: 1, correct: true },
          { eventIndex: 2, correct: false },
        ],
      },
      engine: {
        unitType: 'model',
        currentCardRef: { clusterIndex: 4, stimIndex: 0 },
        cardAnswered: async (isCorrect: boolean, practiceTime: number, testType: string) => {
          calls.push({ isCorrect, practiceTime, testType });
        },
        unitFinished: async () => false,
      },
    }, {});

    expect(result).to.deep.equal({ status: 'updated', unitFinished: false });
    expect(calls.map((call) => call.isCorrect)).to.deep.equal([true, true, false]);
    expect(calls.map((call) => call.practiceTime)).to.deep.equal([1500, 1500, 1500]);
    expect(calls.map((call) => call.testType)).to.deep.equal(['d', 'd', 'd']);
    expect(Session.get('engineIndices')).to.deep.equal({ clusterIndex: 4, stimIndex: 0 });
  });

  it('leaves video-session engine indices owned by the video surface', async function() {
    Session.set('isVideoSession', true);
    Session.set('engineIndices', { clusterIndex: 2, stimIndex: 0 });

    const result = await updateEngineService({
      testType: 'd',
      isCorrect: true,
      timestamps: {
        trialStart: 1000,
        firstKeypress: 1100,
        trialEnd: 1800,
        feedbackStart: 1800,
        feedbackEnd: 1800,
      },
      engine: {
        unitType: 'model',
        currentCardRef: { clusterIndex: 4, stimIndex: 0 },
        cardAnswered: async () => undefined,
        unitFinished: async () => false,
      },
    }, {});

    expect(result).to.deep.equal({ status: 'updated', unitFinished: false });
    expect(Session.get('engineIndices')).to.deep.equal({ clusterIndex: 2, stimIndex: 0 });
  });
});
