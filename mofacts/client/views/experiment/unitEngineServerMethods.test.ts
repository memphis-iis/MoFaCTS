import { expect } from 'chai';
import { Session } from 'meteor/session';
import { createUnitEngineServerMethods } from './unitEngineServerMethods';

describe('unitEngineServerMethods', function() {
  beforeEach(function() {
    Session.set('courseAssignmentLaunchContext', null);
  });

  afterEach(function() {
    Session.set('courseAssignmentLaunchContext', null);
  });

  it('passes course assignment launch context to model bootstrap server methods', async function() {
    const calls: Array<{ name: string; args: unknown[] }> = [];
    const courseAssignment = {
      assignmentId: 'assignment-1',
      courseId: 'course-1',
      TDFId: 'tdf-1',
      launchSource: 'courses' as const,
    };
    Session.set('courseAssignmentLaunchContext', courseAssignment);
    const serverMethods = createUnitEngineServerMethods({
      meteorCallAsync: async (name, ...args) => {
        calls.push({ name, args });
        return name === 'getStimulusCrowdStatsForDeck' ? [] : {};
      },
    });

    await serverMethods.getResponseKCMapForTdf('tdf-1');
    await serverMethods.getStimulusCrowdStatsForDeck('tdf-1', ['kc-1']);
    await serverMethods.getLearningHistoryForUnit('user-1', 'tdf-1', 0, false);

    expect(calls).to.deep.equal([{
      name: 'getResponseKCMapForTdf',
      args: ['tdf-1', { courseAssignment }],
    }, {
      name: 'getStimulusCrowdStatsForDeck',
      args: ['tdf-1', ['kc-1'], { courseAssignment }],
    }, {
      name: 'getLearningHistoryForUnit',
      args: ['user-1', 'tdf-1', 0, false, { courseAssignment }],
    }]);
  });

  it('does not attach course assignment options during direct lesson launches', async function() {
    const calls: Array<{ name: string; args: unknown[] }> = [];
    const serverMethods = createUnitEngineServerMethods({
      meteorCallAsync: async (name, ...args) => {
        calls.push({ name, args });
        return name === 'getLearningHistoryForUnit' ? [] : {};
      },
    });

    await serverMethods.getLearningHistoryForUnit('user-1', 'tdf-1', 0, false);

    expect(calls).to.deep.equal([{
      name: 'getLearningHistoryForUnit',
      args: ['user-1', 'tdf-1', 0, false, {}],
    }]);
  });
});
