import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import sinon from 'sinon';

import type { AutoTutorRuntimeCapabilities } from '../../../../../../learning-components/units/autotutor/AutoTutorRuntimeCapabilities';

type MeteorCallAsyncHost = typeof Meteor & {
  callAsync: (name: string, ...args: unknown[]) => Promise<unknown>;
};

function buildCapabilities(): AutoTutorRuntimeCapabilities {
  const script = {
    id: 'script-relationships',
    topic: 'Communication',
    learningGoal: 'Explain NVC concepts.',
    idealAnswer: 'NVC supports connection through observations, feelings, needs, and requests.',
    expectations: [
      { id: 'E1', label: 'connection', proposition: 'NVC supports connection.', assertion: 'NVC supports connection.' },
      { id: 'E2', label: 'observation', proposition: 'NVC separates observations from evaluations.', assertion: 'NVC separates observations from evaluations.' },
      { id: 'E3', label: 'requests', proposition: 'NVC requests leave room for no.', assertion: 'NVC requests leave room for no.' },
    ],
    misconceptions: [],
    dialogPolicy: {
      requiredExpectations: ['E1', 'E2', 'E3'],
    },
    summary: 'NVC distinguishes observations, feelings, needs, and requests.',
  };
  return {
    session: {
      getSessionValue() {
        return undefined;
      },
      setSessionValue() {},
      getAutoTutorSessionSnapshot() {
        return {
          currentUserId: 'user-1',
          currentUsername: 'user@example.test',
          currentTdfId: 'tdf-1',
          currentTdfName: 'AutoTutor Test',
          currentUnitNumber: 0,
          currentTdfFile: {
            tdfs: {
              tutor: {
                setspec: {
                  openRouterApiKey: 'test-key',
                  openRouterModel: 'openai/test-model',
                },
              },
            },
          },
          currentTdfUnit: {
            unitname: 'AutoTutor Test',
            autotutorsession: {
              cluster: 0,
              maxTurns: 10,
              graduation: {
                requiredExpectationCount: 2,
                maxActiveMisconceptions: 0,
              },
            },
          },
        };
      },
      publishAutoTutorState() {},
    },
    stimuli: {
      getStimCluster() {
        return {
          stims: [
            {
              display: { text: 'What is NVC for?' },
              autoTutor: script,
            },
          ],
        };
      },
    },
    serverMethods: {
      async getAutoTutorHistoryForUnit() {
        return [];
      },
      async getPreferredOpenRouterApiKey() {
        return null;
      },
    },
    history: {
      normalizeResult(result) {
        return result as never;
      },
      async writeResult() {},
      async writeAutoTutorTurn() {},
      async writeCanonicalHistory() {},
    },
    aiProvider: {
      async callOpenRouterJson() {
        throw new Error('not used');
      },
    },
    logger: {
      log() {},
    },
  };
}

describe('autoTutorClient relationship graph initialization', function() {
  afterEach(function() {
    sinon.restore();
  });

  it('generates and persists missing expectation relationships before planner state initializes', async function() {
    const meteorCallStub = sinon.stub(Meteor as MeteorCallAsyncHost, 'callAsync');
    meteorCallStub.withArgs('persistAutoTutorExpectationRelationships').resolves({ success: true });
    const fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify({
      data: [
        { embedding: [1, 0, 0] },
        { embedding: [0.6, 0.8, 0] },
        { embedding: [0.4, 0.4, 0.8] },
      ],
      usage: { cost: 0.0001 },
    }), { status: 200 }));

    const { createAutoTutorRuntime } = await import('./autoTutorClient');
    const runtime = await createAutoTutorRuntime(buildCapabilities());
    const state = runtime.getState();

    expect(fetchStub.calledOnce).to.equal(true);
    expect(meteorCallStub.calledWith('persistAutoTutorExpectationRelationships')).to.equal(true);
    expect(runtime.config.script.expectationRelationships).to.have.keys(['E1', 'E2', 'E3']);
    expect(state.expectations.E1?.centrality).to.be.greaterThan(0);
    expect(state.expectations.E2?.priority).to.be.greaterThan(0);
  });
});
