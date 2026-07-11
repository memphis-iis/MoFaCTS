import assert from 'node:assert/strict';
import { withCanonicalHistorySchemaVersion, type CanonicalHistoryRecord } from './historyEnvelope';
import {
  modelPracticeIdentityMatches,
  readSharedModelPracticeEvent,
  readSharedModelPracticeEvents,
  sharedModelPracticeIdentityMatches,
} from './modelPracticeHistoryExchange';
import type { ModelPracticeHistoryIdentity } from './historyStimulusIdentity';

const target: ModelPracticeHistoryIdentity = {
  stimuliSetId: 'stim-set-1',
  stimulusKC: 'kc-1',
  clusterKC: 'cluster-1',
  KCId: 'kc-1',
  KCDefault: 'kc-1',
  KCCluster: 'cluster-1',
  response: {
    responseKC: 'response-kc-1',
    responseKey: 'answer',
  },
};

function makeModelRecord(overrides: Record<string, unknown> = {}): CanonicalHistoryRecord {
  return withCanonicalHistorySchemaVersion({
    TDFId: 'tdf-1',
    sessionID: 'session-1',
    userId: 'user-1',
    levelUnit: 1,
    levelUnitName: 'Shared Model Unit',
    levelUnitType: 'model',
    time: 2000,
    problemStartTime: 1000,
    responseDuration: 300,
    selection: 'selection-1',
    action: 'response',
    outcome: 'correct',
    typeOfResponse: 'text',
    responseValue: 'Answer',
    input: 'Answer',
    displayedStimulus: 'Prompt',
    eventType: '',
    stimuliSetId: target.stimuliSetId,
    stimulusKC: target.stimulusKC,
    clusterKC: target.clusterKC,
    KCId: target.KCId,
    KCDefault: target.KCDefault,
    KCCluster: target.KCCluster,
    responseKC: target.response?.responseKC,
    responseKey: target.response?.responseKey,
    ...overrides,
  });
}

function makeCardHistoryLogRecord(overrides: Record<string, unknown> = {}): CanonicalHistoryRecord {
  return withCanonicalHistorySchemaVersion({
    TDFId: 'tdf-1',
    sessionID: 'session-1',
    userId: 'user-1',
    anonStudentId: 'student-1',
    levelUnit: 1,
    levelUnitName: 'Learning Session',
    levelUnitType: 'model',
    time: 2000,
    problemStartTime: 1000,
    responseDuration: 300,
    selection: 'selection-1',
    action: 'UpdateTextField',
    outcome: 'correct',
    probabilityEstimate: 0.7,
    typeOfResponse: 'text',
    responseValue: 'Answer',
    input: 'Answer',
    displayedStimulus: 'Prompt',
    eventType: '',
    stimuliSetId: target.stimuliSetId,
    stimulusKC: target.stimulusKC,
    clusterKC: target.clusterKC,
    KCId: target.KCId,
    KCDefault: target.KCDefault,
    KCCluster: target.KCCluster,
    responseKC: target.response?.responseKC,
    responseKey: target.response?.responseKey,
    studentResponseType: 'ATTEMPT',
    tutorResponseType: 'RESULT',
    CFStimFileIndex: 0,
    CFSetShuffledIndex: 0,
    CFReviewEntry: '',
    ...overrides,
  });
}

describe('modelPracticeHistoryExchange', function() {
  it('reads any canonical model history row as a shared model-practice event', function() {
    const event = readSharedModelPracticeEvent(makeModelRecord());

    assert.ok(event);
    assert.deepEqual(event.identity, target);
    assert.deepEqual(event.sharedKey, {
      userId: 'user-1',
      contextKind: 'tdf',
      contextId: 'tdf-1',
      clusterKC: 'cluster-1',
    });
    assert.equal(event.outcome, 'correct');
    assert.equal(event.responseValue, 'Answer');
    assert.equal(event.practiceDurationMs, 300);
  });

  it('reads the card practice history-log shape as a shared model-practice event', function() {
    const event = readSharedModelPracticeEvent(makeCardHistoryLogRecord());

    assert.ok(event);
    assert.deepEqual(event.identity, target);
    assert.equal(event.time, 2000);
    assert.equal(event.problemStartTime, 1000);
    assert.equal(event.outcome, 'correct');
    assert.equal(event.responseValue, 'Answer');
    assert.equal(event.input, 'Answer');
    assert.equal(event.displayedStimulus, 'Prompt');
    assert.equal(event.practiceDurationMs, 300);
  });

  it('also reads older practiceDurationMs rows during shared history exchange', function() {
    const event = readSharedModelPracticeEvent(makeModelRecord({
      responseDuration: undefined,
      practiceDurationMs: 350,
    }));

    assert.ok(event);
    assert.equal(event.practiceDurationMs, 350);
  });

  it('uses SPARC observation duration when shared duration fields are absent', function() {
    const event = readSharedModelPracticeEvent(makeModelRecord({
      responseDuration: undefined,
      practiceDurationMs: undefined,
      sparc: {
        pageKey: 'doc-1',
        sourceAddress: {
          pageKey: 'doc-1',
          nodeId: 'widget-1',
        },
        practiceObservation: {
          observationId: 'obs-1',
          sourceAddress: {
            pageKey: 'doc-1',
            nodeId: 'widget-1',
          },
          time: 2000,
          problemStartTime: 1000,
          practiceDurationMs: 450,
          outcome: 'correct',
          responseValue: 'Answer',
        },
      },
    }));

    assert.ok(event);
    assert.equal(event.practiceDurationMs, 450);
  });

  it('filters non-model rows out of shared model-practice events', function() {
    const events = readSharedModelPracticeEvents([
      { eventType: 'sparc', levelUnitType: 'sparc' },
      makeModelRecord(),
    ]);

    assert.equal(events.length, 1);
    assert.equal(events[0]?.identity.KCId, 'kc-1');
  });

  it('matches model identities across card and SPARC readers', function() {
    const event = readSharedModelPracticeEvent(makeModelRecord());

    assert.ok(event);
    assert.equal(modelPracticeIdentityMatches(target, event.identity), true);
  });

  it('matches shared model identity while ignoring the item envelope', function() {
    const event = readSharedModelPracticeEvent(makeModelRecord({
      courseAssignment: {
        courseId: 'course-1',
      },
      stimuliSetId: 'other-set',
      stimulusKC: 'other-item',
      KCId: 'other-item',
      KCDefault: 'other-item',
    }));

    assert.ok(event);
    assert.equal(modelPracticeIdentityMatches(target, event.identity), false);
    assert.equal(sharedModelPracticeIdentityMatches({
      target,
      targetUserId: 'user-1',
      targetContext: {
        contextKind: 'course',
        contextId: 'course-1',
      },
      event,
    }), true);
  });

  it('fails clearly when a model row is missing shared identity fields', function() {
    assert.throws(
      () => readSharedModelPracticeEvent(makeModelRecord({
        KCId: undefined,
      })),
      /Model practice history record missing KCId/,
    );
  });
});
