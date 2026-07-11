import { expect } from 'chai';
import type { CanonicalHistoryRecord } from '../../../../../../learning-components/runtime/historyEnvelope';
import type { UnitEngineLike } from '../../../../../common/types';
import { SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY } from '../../../../../../learning-components/trial-displays/sparc/sparcProgressiveNodes';
import { commitSparcProductionRulesForHistory } from './historyLogging';
import {
  clearSparcRuntimeState,
  ensureSparcRuntimeHistoryHydrated,
  hydrateSparcRuntimeHistory,
  readSparcResumeSnapshot,
  rememberSparcRuntimeHistoryRecord,
} from './sparcRuntimeState';

const display = {
  pageKey: 'fractions-addition',
  nodes: [],
  productionRules: [{ id: 'fractions.determine-lcd', when: [], then: [] }],
};

function historyRecord(params: {
  sessionID: string;
  pageKey?: string;
  levelUnit?: number;
  value?: unknown;
  progressive?: boolean;
}): CanonicalHistoryRecord {
  const pageKey = params.pageKey ?? 'fractions-addition';
  const write = params.progressive
    ? {
        target: { pageKey, nodeId: 'dialogue-root' },
        key: 'progressive-node-operation',
        value: { operation: 'append', parentNodeId: 'dialogue-root', node: { id: 'turn-1' } },
      }
    : {
        target: { pageKey, nodeId: 'answer-node' },
        key: 'value',
        value: params.value,
      };
  return {
    eventType: 'sparc',
    TDFId: 'tdf-1',
    sessionID: params.sessionID,
    userId: 'user-1',
    levelUnit: params.levelUnit ?? 2,
    sparc: {
      pageKey,
      sourceAddress: { pageKey, nodeId: 'answer-node' },
      stateTransition: {
        transitionId: `transition-${params.sessionID}`,
        event: {
          eventId: `event-${params.sessionID}`,
          type: 'value-changed',
          source: { pageKey, nodeId: 'answer-node' },
          time: params.sessionID === 'attempt-1' ? 1000 : 2000,
        },
        writes: [write],
      },
    },
  };
}

describe('SPARC runtime history and resume snapshot', function() {
  afterEach(function() {
    clearSparcRuntimeState();
  });

  it('replays one durable scope across historical attempt session IDs and projects render state', function() {
    const firstAttempt = historyRecord({ sessionID: 'attempt-1', value: '12' });
    const secondAttempt = historyRecord({ sessionID: 'attempt-2', value: '24' });
    const progressiveAttempt = historyRecord({ sessionID: 'attempt-3', progressive: true });

    hydrateSparcRuntimeHistory([firstAttempt, secondAttempt, progressiveAttempt]);
    const snapshot = readSparcResumeSnapshot({
      userId: 'user-1',
      TDFId: 'tdf-1',
      levelUnit: 2,
      pageKey: 'fractions-addition',
      display,
    });

    expect(snapshot.retainedHistoryRecords).to.deep.equal([firstAttempt, secondAttempt, progressiveAttempt]);
    expect(snapshot.nodeValues['answer-node']).to.equal('24');
    expect(snapshot.progressiveNodeOperations).to.have.length(1);
    expect(snapshot.nodeValues[SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY]).to.deep.equal(
      snapshot.progressiveNodeOperations,
    );
  });

  it('keeps learner, TDF, unit, and page scopes independent while ignoring attempt identity', function() {
    hydrateSparcRuntimeHistory([
      historyRecord({ sessionID: 'attempt-1', value: '12' }),
      historyRecord({ sessionID: 'attempt-2', levelUnit: 3, value: '99' }),
      historyRecord({ sessionID: 'attempt-3', pageKey: 'other-page', value: '77' }),
    ]);

    const snapshot = readSparcResumeSnapshot({
      userId: 'user-1',
      TDFId: 'tdf-1',
      levelUnit: 2,
      pageKey: 'fractions-addition',
      display,
    });

    expect(snapshot.retainedHistoryRecords).to.have.length(1);
    expect(snapshot.nodeValues['answer-node']).to.equal('12');
  });

  it('loads a unit history once and uses the same hydration for every page snapshot', async function() {
    const records = [historyRecord({ sessionID: 'attempt-1', value: '12' })];
    let loadCount = 0;
    const scope = { userId: 'user-1', TDFId: 'tdf-1', levelUnit: 2 };
    const load = async () => {
      loadCount += 1;
      return records;
    };

    await ensureSparcRuntimeHistoryHydrated(scope, load);
    await ensureSparcRuntimeHistoryHydrated(scope, load);

    expect(loadCount).to.equal(1);
    expect(readSparcResumeSnapshot({
      ...scope,
      pageKey: 'fractions-addition',
      display,
    }).retainedHistoryRecords).to.deep.equal(records);
  });

  it('advances the same snapshot after a successful canonical history write', async function() {
    const priorRecord = historyRecord({ sessionID: 'attempt-1', value: '12' });
    const writtenRecord = historyRecord({ sessionID: 'attempt-2', value: '24' });
    rememberSparcRuntimeHistoryRecord(priorRecord);

    await commitSparcProductionRulesForHistory({
      engine: {
        async commitSparcTrialDisplayProductionRuleEvents(params: {
          priorHistoryRecords: readonly CanonicalHistoryRecord[];
          history: { writeCanonicalHistory(record: CanonicalHistoryRecord): Promise<void> };
        }) {
          expect(params.priorHistoryRecords).to.deep.equal([priorRecord]);
          await params.history.writeCanonicalHistory(writtenRecord);
        },
      } as unknown as UnitEngineLike,
      currentDisplay: display,
      sparcResult: { submittedNodes: { firstDen: '24' }, timestamp: 3000 },
      record: {
        TDFId: 'tdf-1',
        sessionID: 'attempt-2',
        userId: 'user-1',
        levelUnit: 2,
      },
    });

    const snapshot = readSparcResumeSnapshot({
      userId: 'user-1',
      TDFId: 'tdf-1',
      levelUnit: 2,
      pageKey: 'fractions-addition',
      display,
    });
    expect(snapshot.retainedHistoryRecords).to.deep.equal([priorRecord, writtenRecord]);
    expect(snapshot.nodeValues['answer-node']).to.equal('24');
  });

  it('rejects history without the canonical durable scope', function() {
    const valid = historyRecord({ sessionID: 'attempt-1', value: '12' });
    expect(() => hydrateSparcRuntimeHistory([{ ...valid, eventType: 'h5p' }]))
      .to.throw('[SPARC] Runtime hydration received a non-SPARC history record');
    expect(() => hydrateSparcRuntimeHistory([{ ...valid, sparc: {} }]))
      .to.throw('[SPARC] Runtime state requires userId, TDFId, non-negative levelUnit, and pageKey');
  });
});
