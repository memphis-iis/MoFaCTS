import { expect } from 'chai';
import { Session } from 'meteor/session';
import { sessionCleanUp, clearMappingSessionStateForCleanup } from './sessionUtils';
import { CARD_ENTRY_INTENT, getCardEntryIntent, setCardEntryIntent } from './cardEntryIntent';
import {
  CARD_LAUNCH_PRESERVED_UNIT_KEYS,
  USER_ADMIN_DEFAULT_FILTER,
} from './sessionCleanupRegistry';
import {
  clearSparcProductionRuleHistoryCache,
  readSparcProductionRuleHistoryRecords,
  rememberSparcProductionRuleHistoryRecord,
} from '../views/experiment/svelte/services/sparcProductionRuleHistoryCache';
import {
  clearSparcControllerRuntimeContextCache,
  getSparcControllerRuntimeContext,
} from '../views/experiment/svelte/services/sparcControllerRuntimeContextCache';
import type { SparcControllerDisplay } from '../views/experiment/svelte/services/sparcController';
import { createEmptySparcReplayState } from '../../../learning-components/units/sparcsession/sparcStateReplay';

describe('sessionUtils mapping cleanup', function() {
  beforeEach(function() {
    Session.set('clusterMapping', [2, 1, 0]);
    Session.set('mappingSignature', 'msig_v2_abc123');
  });

  afterEach(function() {
    Session.set('clusterMapping', '');
    Session.set('mappingSignature', null);
    Session.set('fromInstructions', false);
    Session.set('cardBootstrapInProgress', false);
    Session.set('currentTdfName', undefined);
    Session.set('currentTdfId', undefined);
    Session.set('currentUnitNumber', undefined);
    Session.set('currentTdfUnit', undefined);
    Session.set('currentRootTdfId', undefined);
    Session.set('currentAnswer', undefined);
    Session.set('cardEntryIntent', undefined);
    Session.set('courseAssignmentLaunchContext', null);
    clearSparcProductionRuleHistoryCache();
    clearSparcControllerRuntimeContextCache();
  });

  it('clears mapping and signature session keys via cleanup helper', function() {
    clearMappingSessionStateForCleanup();

    expect(Session.get('clusterMapping')).to.equal('');
    expect(Session.get('mappingSignature')).to.equal(null);
  });

  it('clears mapping and signature in the normal (full) cleanup branch', function() {
    Session.set('fromInstructions', false);

    sessionCleanUp();

    expect(Session.get('clusterMapping')).to.equal('');
    expect(Session.get('mappingSignature')).to.equal(null);
  });

  it('clears mapping and signature in the fromInstructions guard branch', function() {
    Session.set('fromInstructions', true);
    // Simulate navigating to /card so the guard branch executes
    Object.defineProperty(document, 'location', {
      value: { pathname: '/card' },
      writable: true,
      configurable: true,
    });

    sessionCleanUp();

    expect(Session.get('clusterMapping')).to.equal('');
    expect(Session.get('mappingSignature')).to.equal(null);
  });

  it('clears mapping and signature in the card bootstrap guard branch', function() {
    Session.set('fromInstructions', false);
    Session.set('cardBootstrapInProgress', true);
    Object.defineProperty(document, 'location', {
      value: { pathname: '/card' },
      writable: true,
      configurable: true,
    });

    sessionCleanUp();

    expect(Session.get('clusterMapping')).to.equal('');
    expect(Session.get('mappingSignature')).to.equal(null);
  });

  it('preserves documented unit launch keys when moving from instructions to /card', function() {
    Session.set('fromInstructions', true);
    Session.set('currentTdfName', 'Lesson A');
    Session.set('currentTdfId', 'tdf-a');
    Session.set('currentUnitNumber', 2);
    Session.set('currentTdfUnit', { unitname: 'Unit 2' });
    Session.set('currentRootTdfId', 'root-a');
    Session.set('currentAnswer', 'stale answer');
    setCardEntryIntent(CARD_ENTRY_INTENT.INSTRUCTION_CONTINUE, {
      source: 'session-utils-test',
      rootTdfId: 'root-a',
      currentTdfId: 'tdf-a',
      unitNumber: 2,
    });
    Object.defineProperty(document, 'location', {
      value: { pathname: '/card' },
      writable: true,
      configurable: true,
    });

    sessionCleanUp();

    expect(CARD_LAUNCH_PRESERVED_UNIT_KEYS).to.include('currentTdfId');
    expect(Session.get('currentTdfName')).to.equal('Lesson A');
    expect(Session.get('currentTdfId')).to.equal('tdf-a');
    expect(Session.get('currentUnitNumber')).to.equal(2);
    expect(Session.get('currentTdfUnit')).to.deep.equal({ unitname: 'Unit 2' });
    expect(Session.get('currentRootTdfId')).to.equal('root-a');
    expect(Session.get('currentAnswer')).to.equal(undefined);
    expect(Session.get('filter')).to.equal(USER_ADMIN_DEFAULT_FILTER);
    expect(getCardEntryIntent()).to.equal(CARD_ENTRY_INTENT.INSTRUCTION_CONTINUE);
  });

  it('clears unit launch keys during full cleanup', function() {
    Session.set('fromInstructions', false);
    Session.set('currentTdfName', 'Lesson A');
    Session.set('currentTdfId', 'tdf-a');
    Session.set('currentUnitNumber', 2);
    Session.set('currentTdfUnit', { unitname: 'Unit 2' });
    Session.set('currentRootTdfId', 'root-a');
    Session.set('currentScore', 12);
    Session.set('courseAssignmentLaunchContext', {
      assignmentId: 'assignment-1',
      courseId: 'course-1',
      TDFId: 'tdf-a',
      launchSource: 'courses',
    });
    Object.defineProperty(document, 'location', {
      value: { pathname: '/experimentList' },
      writable: true,
      configurable: true,
    });

    sessionCleanUp();

    expect(Session.get('currentTdfName')).to.equal(undefined);
    expect(Session.get('currentTdfId')).to.equal(undefined);
    expect(Session.get('currentUnitNumber')).to.equal(undefined);
    expect(Session.get('currentTdfUnit')).to.equal(undefined);
    expect(Session.get('currentRootTdfId')).to.equal(undefined);
    expect(Session.get('currentScore')).to.equal(0);
    expect(Session.get('curUnitInstructionsSeen')).to.equal(false);
    expect(Session.get('courseAssignmentLaunchContext')).to.equal(null);
  });

  it('clears SPARC replay caches during full cleanup', function() {
    const historyRecord = {
      eventType: 'sparc',
      TDFId: 'tdf-a',
      sessionID: 'session-a',
      sparc: {
        documentId: 'doc-a',
        sourceAddress: {
          documentId: 'doc-a',
          nodeId: 'source-node',
        },
      },
    };
    rememberSparcProductionRuleHistoryRecord(historyRecord);
    const display: SparcControllerDisplay = {
      documentId: 'doc-a',
      nodes: [],
    };
    const firstContext = getSparcControllerRuntimeContext({
      TDFId: 'tdf-a',
      sessionID: 'session-a',
      documentId: 'doc-a',
      display,
      replaySession: {
        TDFId: 'tdf-a',
        sessionID: 'session-a',
        documentId: 'doc-a',
        replayState: createEmptySparcReplayState(),
        retainedHistoryRecords: [historyRecord],
      },
    });
    Session.set('fromInstructions', false);
    Object.defineProperty(document, 'location', {
      value: { pathname: '/experimentList' },
      writable: true,
      configurable: true,
    });

    sessionCleanUp();

    expect(readSparcProductionRuleHistoryRecords({
      TDFId: 'tdf-a',
      sessionID: 'session-a',
      documentId: 'doc-a',
    })).to.deep.equal([]);
    const rebuiltContext = getSparcControllerRuntimeContext({
      TDFId: 'tdf-a',
      sessionID: 'session-a',
      documentId: 'doc-a',
      display,
      replaySession: {
        TDFId: 'tdf-a',
        sessionID: 'session-a',
        documentId: 'doc-a',
        replayState: createEmptySparcReplayState(),
        retainedHistoryRecords: [],
      },
    });
    expect(rebuiltContext.document).not.to.equal(firstContext.document);
    expect(rebuiltContext.appliedRecordCount).to.equal(0);
  });
});
