import { expect } from 'chai';
import { Session } from 'meteor/session';
import {
  CARD_ENTRY_INTENT,
  CARD_REFRESH_REBUILD_REASON,
  clearCardEntryContext,
  classifyCardRefreshRebuild,
  getCardEntryContext,
  getCardEntryIntent,
  resolveCardLaunchProgress,
  setCardEntryIntent,
  shouldUseProgressBootstrapForEntryIntent,
} from './cardEntryIntent';
import { LAST_ACTION } from '../../common/constants/resumeActions';

describe('cardEntryIntent', function() {
  beforeEach(function() {
    clearCardEntryContext();
    Session.set('currentRootTdfId', undefined);
    Session.set('currentTdfId', undefined);
    Session.set('currentUnitNumber', undefined);
  });

  afterEach(function() {
    clearCardEntryContext();
    Session.set('currentRootTdfId', undefined);
    Session.set('currentTdfId', undefined);
    Session.set('currentUnitNumber', undefined);
  });

  it('captures explicit entry intent with current session context', function() {
    Session.set('currentRootTdfId', 'root-tdf');
    Session.set('currentTdfId', 'condition-tdf');
    Session.set('currentUnitNumber', 3);

    setCardEntryIntent(CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY, {
      source: 'test.initialEntry',
    });

    const context = getCardEntryContext();
    expect(getCardEntryIntent()).to.equal(CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY);
    expect(context.intent).to.equal(CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY);
    expect(context.source).to.equal('test.initialEntry');
    expect(context.rootTdfId).to.equal('root-tdf');
    expect(context.currentTdfId).to.equal('condition-tdf');
    expect(context.unitNumber).to.equal(3);
    expect(context.startedAt).to.be.a('number');
  });

  it('clears the stored context fully', function() {
    setCardEntryIntent(CARD_ENTRY_INTENT.CARD_REFRESH_REBUILD, {
      source: 'test.refresh',
      rootTdfId: 'root',
      currentTdfId: 'tdf',
      unitNumber: 1,
      startedAt: 1234,
    });

    clearCardEntryContext();

    expect(getCardEntryIntent()).to.equal(null);
    expect(getCardEntryContext()).to.deep.equal({
      intent: null,
      source: null,
      rootTdfId: null,
      currentTdfId: null,
      unitNumber: null,
      startedAt: null,
    });
  });

  it('routes only persisted-progress intents through canonical progress bootstrap', function() {
    expect(shouldUseProgressBootstrapForEntryIntent(CARD_ENTRY_INTENT.PERSISTED_PROGRESS_RESUME)).to.equal(true);
    expect(shouldUseProgressBootstrapForEntryIntent(CARD_ENTRY_INTENT.CARD_REFRESH_REBUILD)).to.equal(true);
    expect(shouldUseProgressBootstrapForEntryIntent(CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY)).to.equal(false);
    expect(shouldUseProgressBootstrapForEntryIntent(CARD_ENTRY_INTENT.INSTRUCTION_CONTINUE)).to.equal(false);
    expect(shouldUseProgressBootstrapForEntryIntent(null)).to.equal(false);
  });

  it('classifies refresh rebuild with no experiment state as initial TDF entry', function() {
    expect(classifyCardRefreshRebuild(null)).to.deep.equal({
      intent: CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY,
      reason: CARD_REFRESH_REBUILD_REASON.NO_EXPERIMENT_STATE,
      lastAction: undefined,
    });

    expect(classifyCardRefreshRebuild({})).to.deep.equal({
      intent: CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY,
      reason: CARD_REFRESH_REBUILD_REASON.NO_EXPERIMENT_STATE,
      lastAction: undefined,
    });
  });

  it('classifies refresh rebuild with missing lastAction as initial TDF entry', function() {
    expect(classifyCardRefreshRebuild({
      currentUnitNumber: 0,
      currentTdfId: 'tdf-1',
    })).to.deep.equal({
      intent: CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY,
      reason: CARD_REFRESH_REBUILD_REASON.MISSING_LAST_ACTION,
      lastAction: undefined,
    });
  });

  it('classifies refresh rebuild with canonical progress as persisted-progress resume', function() {
    expect(classifyCardRefreshRebuild({
      lastAction: LAST_ACTION.CARD_DISPLAYED,
      currentUnitNumber: 2,
    })).to.deep.equal({
      intent: CARD_ENTRY_INTENT.PERSISTED_PROGRESS_RESUME,
      reason: CARD_REFRESH_REBUILD_REASON.MEANINGFUL_LAST_ACTION,
      lastAction: LAST_ACTION.CARD_DISPLAYED,
    });
  });

  it('classifies refresh rebuild with invalid persisted action as persisted-progress fail-loud path', function() {
    expect(classifyCardRefreshRebuild({
      lastAction: 'QUESTION',
      currentUnitNumber: 2,
    })).to.deep.equal({
      intent: CARD_ENTRY_INTENT.PERSISTED_PROGRESS_RESUME,
      reason: CARD_REFRESH_REBUILD_REASON.INVALID_LAST_ACTION,
      lastAction: 'QUESTION',
    });
  });

  it('resolves launch to persisted-progress resume when history exists', function() {
    expect(resolveCardLaunchProgress({
      lastAction: LAST_ACTION.CARD_RESPONSE_RECORDED,
      currentUnitNumber: 1,
    }, 4)).to.deep.equal({
      intent: CARD_ENTRY_INTENT.PERSISTED_PROGRESS_RESUME,
      hasMeaningfulHistory: true,
      moduleCompleted: false,
      persistedUnitNumber: 1,
      lastUnitCompleted: null,
      lastAction: LAST_ACTION.CARD_RESPONSE_RECORDED,
    });
  });

  it('treats out-of-bounds currentUnitNumber as completed launch sentinel', function() {
    expect(resolveCardLaunchProgress({
      lastAction: LAST_ACTION.UNIT_ENDED,
      currentUnitNumber: 4,
      lastUnitCompleted: 3,
    }, 4)).to.deep.equal({
      intent: CARD_ENTRY_INTENT.PERSISTED_PROGRESS_RESUME,
      hasMeaningfulHistory: true,
      moduleCompleted: true,
      persistedUnitNumber: 4,
      lastUnitCompleted: 3,
      lastAction: LAST_ACTION.UNIT_ENDED,
    });
  });

  it('treats final completed unit with UNIT_ENDED as completed even without out-of-bounds pointer', function() {
    expect(resolveCardLaunchProgress({
      lastAction: LAST_ACTION.UNIT_ENDED,
      currentUnitNumber: 3,
      lastUnitCompleted: 3,
    }, 4)).to.deep.equal({
      intent: CARD_ENTRY_INTENT.PERSISTED_PROGRESS_RESUME,
      hasMeaningfulHistory: true,
      moduleCompleted: true,
      persistedUnitNumber: 3,
      lastUnitCompleted: 3,
      lastAction: LAST_ACTION.UNIT_ENDED,
    });
  });

  it('treats UNIT_ENDED on the final valid unit as completed even if lastUnitCompleted is missing', function() {
    expect(resolveCardLaunchProgress({
      lastAction: LAST_ACTION.UNIT_ENDED,
      currentUnitNumber: 3,
    }, 4)).to.deep.equal({
      intent: CARD_ENTRY_INTENT.PERSISTED_PROGRESS_RESUME,
      hasMeaningfulHistory: true,
      moduleCompleted: true,
      persistedUnitNumber: 3,
      lastUnitCompleted: null,
      lastAction: LAST_ACTION.UNIT_ENDED,
    });
  });
});
