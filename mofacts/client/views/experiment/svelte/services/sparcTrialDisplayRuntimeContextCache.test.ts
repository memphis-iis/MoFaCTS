import { expect } from 'chai';
import type {
  SparcTrialDisplay,
} from '../../../../../../learning-components/trial-displays/sparc/SparcTrialDisplayAdapter';
import { createEmptySparcReplayState, createSparcStateCellKey } from '../../../../../../learning-components/units/sparcsession/sparcStateReplay';
import type { SparcReplaySession } from './sparcProductionRuleHistoryCache';
import {
  clearSparcTrialDisplayRuntimeContextCache,
  getSparcTrialDisplayRuntimeContext,
} from './sparcTrialDisplayRuntimeContextCache';

function display(productionRules: SparcTrialDisplay['productionRules'] = []): SparcTrialDisplay {
  return {
    type: 'sparc',
    documentId: 'doc-1',
    nodes: [],
    productionRules,
  };
}

function replaySession(records: SparcReplaySession['retainedHistoryRecords']): SparcReplaySession {
  return {
    TDFId: 'tdf-1',
    sessionID: 'session-1',
    documentId: 'doc-1',
    replayState: createEmptySparcReplayState(),
    retainedHistoryRecords: records,
  };
}

describe('sparcTrialDisplayRuntimeContextCache', function() {
  afterEach(function() {
    clearSparcTrialDisplayRuntimeContextCache();
  });

  it('reuses the authored document for the same display signature', function() {
    const firstContext = getSparcTrialDisplayRuntimeContext({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      documentId: 'doc-1',
      display: display(),
      replaySession: replaySession([]),
    });
    const secondContext = getSparcTrialDisplayRuntimeContext({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      documentId: 'doc-1',
      display: display(),
      replaySession: replaySession([]),
    });

    expect(secondContext.document).to.equal(firstContext.document);
    expect(secondContext.appliedRecordCount).to.equal(0);
  });

  it('advances cached replay state with newly retained records', function() {
    const firstContext = getSparcTrialDisplayRuntimeContext({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      documentId: 'doc-1',
      display: display(),
      replaySession: replaySession([]),
    });
    const historyRecord = {
      eventType: 'sparc',
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      sparc: {
        documentId: 'doc-1',
        sourceAddress: {
          documentId: 'doc-1',
          nodeId: 'source-node',
        },
        stateTransition: {
          transitionId: 'transition-1',
          event: {
            eventId: 'event-1',
            type: 'value-changed',
            source: {
              documentId: 'doc-1',
              nodeId: 'source-node',
            },
            time: 2000,
          },
          writes: [{
            target: {
              documentId: 'doc-1',
              nodeId: 'answer-node',
            },
            key: 'value',
            value: 'updated',
          }],
        },
      },
    };

    const advancedContext = getSparcTrialDisplayRuntimeContext({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      documentId: 'doc-1',
      display: display(),
      replaySession: replaySession([historyRecord]),
    });
    const cellKey = createSparcStateCellKey({
      documentId: 'doc-1',
      nodeId: 'answer-node',
    }, 'value');

    expect(advancedContext.document).to.equal(firstContext.document);
    expect(advancedContext.appliedRecordCount).to.equal(1);
    expect(advancedContext.replayState.cells[cellKey]?.value).to.equal('updated');
  });

  it('rebuilds the authored document when the display signature changes', function() {
    const firstContext = getSparcTrialDisplayRuntimeContext({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      documentId: 'doc-1',
      display: display(),
      replaySession: replaySession([]),
    });
    const changedContext = getSparcTrialDisplayRuntimeContext({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      documentId: 'doc-1',
      display: display([{ id: 'rule-1', when: [], then: [] }]),
      replaySession: replaySession([]),
    });

    expect(changedContext.document).not.to.equal(firstContext.document);
    expect(changedContext.appliedRecordCount).to.equal(0);
  });
});
