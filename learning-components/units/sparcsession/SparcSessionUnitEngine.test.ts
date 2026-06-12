import assert from 'node:assert/strict';
import {
  createSparcSessionUnitEngine,
} from './SparcSessionUnitEngine';
import {
  createSparcStateCellKey,
} from './sparcStateReplay';
import type { CanonicalHistoryRecord } from '../../runtime/historyEnvelope';
import type { UnitEngineSessionReadKey } from '../UnitEngineSessionKeys';
import type {
  SparcAuthoredDocument,
} from './sparcSessionContracts';

function createMinimalDeps(overrides: Record<string, unknown> = {}): any {
  const deps = {
    getSessionValue(key: UnitEngineSessionReadKey) {
      if (key === 'currentTdfUnit') {
        return { sparcsession: {} };
      }
      if (key === 'curStudentPerformance') {
        return { totalTime: 0 };
      }
      return undefined;
    },
    setSessionValue() {},
    getDeliverySettings: () => ({}),
    getStimCount: () => 0,
    getStimCluster: () => ({ stims: [] }),
    getStimKCBaseForCurrentStimuliSet: () => [],
    getTestType: () => 'd',
    getHiddenItems: () => [],
    setNumVisibleCards() {},
    setQuestionIndex() {},
    getDisplayAnswerText: (answer: unknown) => String(answer || ''),
    updateCurStudentPerformance() {},
    updateCurStudedentPracticeTime() {},
    serverMethods: {
      getResponseKCMapForTdf: async () => ({}),
      getStimulusCrowdStatsForDeck: async () => [],
      getLearningHistoryForUnit: async () => [],
    },
    getCurrentUserId: () => 'user-1',
    reconstructLearningStateFromHistory: () => ({}),
    extractDelimFields() {},
    rangeVal: (source: unknown) => [source],
    legacyFloat: (source: unknown) => Number(source),
    legacyInt: (source: unknown) => Number(source),
    currentUserHasRole: () => false,
    displayify: (value: unknown) => value,
    unitIsFinished() {},
    alertUser() {},
    log() {},
    findTdfById: () => ({
      content: {
        tdfs: {
          tutor: {
            unit: [{ sparcsession: { clusterlist: '' } }],
          },
        },
      },
    }),
    ...overrides,
  };
  return deps;
}

function sampleDocument(): SparcAuthoredDocument {
  return {
    id: 'doc-1',
    schemaVersion: 1,
    initialState: [{
      target: {
        documentId: 'doc-1',
        nodeId: 'feedback',
      },
      key: 'visible',
      value: false,
    }],
    reactiveRules: [{
      id: 'show-feedback',
      when: {
        type: 'state',
        query: {
          target: {
            documentId: 'doc-1',
            nodeId: 'region-1',
          },
          key: 'lastOutcome',
        },
        compare: 'eq',
        value: 'correct',
      },
      writes: [{
        target: {
          documentId: 'doc-1',
          nodeId: 'feedback',
        },
        key: 'visible',
        value: true,
      }],
    }],
    root: {
      id: 'root',
      kind: 'document',
      children: [{
        id: 'region-1',
        kind: 'panel',
      }, {
        id: 'region-7',
        kind: 'panel',
        children: [{
          id: 'feedback',
          kind: 'feedback',
        }],
      }],
    },
  };
}

describe('SparcSessionUnitEngine document runtime boundary', function() {
  it('exposes SPARC document validation, replay, and authored response commit methods', async function() {
    const engine = await createSparcSessionUnitEngine(createMinimalDeps());
    const document = sampleDocument();
    const writtenRecords: unknown[] = [];

    assert.deepEqual(engine.validateSparcDocumentReferences(document), {
      valid: true,
      issues: [],
    });
    assert.equal(engine.validateSparcAuthoredDocument(document).valid, false);
    assert.deepEqual(
      engine.validateSparcAuthoredDocument(document).layoutIssues.map((issue: { kind: string }) => issue.kind),
      ['missing-document-layout'],
    );

    const authoredStartState = engine.replaySparcDocumentHistory(document, []);
    assert.equal(
      authoredStartState.cells[createSparcStateCellKey({
        documentId: 'doc-1',
        nodeId: 'feedback',
      }, 'visible')]?.value,
      false,
    );

    const result = await engine.processAndCommitSparcAuthoredResponseOutcome({
      core: {
        TDFId: 'tdf-1',
        sessionID: 'session-1',
        levelUnit: 2,
        userId: 'user-1',
      },
      document,
      input: {
        observationId: 'obs-1',
        sourceAddress: {
          documentId: 'doc-1',
          nodeId: 'region-1',
        },
        time: 2000,
        problemStartTime: 1500,
        outcome: 'correct',
        responseValue: 'Answer',
      },
      priorHistoryRecords: [],
      history: {
        async writeCanonicalHistory(record: CanonicalHistoryRecord) {
          writtenRecords.push(record);
        },
      },
    });

    assert.equal(result.responseCommit.usedAdaptiveModel, false);
    assert.equal(writtenRecords.length, 2);
    assert.equal(result.responseCommit.historyRecord.eventType, 'sparc');
    assert.equal(result.responseCommit.historyRecord.levelUnitType, 'sparc');
    assert.deepEqual(result.reactiveCommit.evaluation.matchedRuleIds, ['show-feedback']);
    assert.equal(
      result.finalReplayState.cells[createSparcStateCellKey({
        documentId: 'doc-1',
        nodeId: 'feedback',
      }, 'visible')]?.value,
      true,
    );
  });
});
