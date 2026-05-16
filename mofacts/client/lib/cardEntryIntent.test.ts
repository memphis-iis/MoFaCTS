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
    expect(shouldUseProgressBootstrapForEntryIntent(CARD_ENTRY_INTENT.CARD_REFRESH_REBUILD)).to.equal(false);
    expect(shouldUseProgressBootstrapForEntryIntent(CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY)).to.equal(false);
    expect(shouldUseProgressBootstrapForEntryIntent(CARD_ENTRY_INTENT.INSTRUCTION_CONTINUE)).to.equal(false);
    expect(shouldUseProgressBootstrapForEntryIntent(null)).to.equal(false);
  });

  it('classifies refresh rebuild with no experiment state as initial TDF entry', function() {
    expect(classifyCardRefreshRebuild(null)).to.deep.equal({
      intent: CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY,
      reason: CARD_REFRESH_REBUILD_REASON.NO_EXPERIMENT_STATE,
      moduleCompleted: false,
      persistedUnitNumber: null,
      lastUnitCompleted: null,
    });

    expect(classifyCardRefreshRebuild({})).to.deep.equal({
      intent: CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY,
      reason: CARD_REFRESH_REBUILD_REASON.NO_EXPERIMENT_STATE,
      moduleCompleted: false,
      persistedUnitNumber: null,
      lastUnitCompleted: null,
    });
  });

  it('classifies refresh rebuild with unit progress as persisted-progress resume', function() {
    expect(classifyCardRefreshRebuild({
      currentUnitNumber: 0,
      currentTdfId: 'tdf-1',
    })).to.deep.equal({
      intent: CARD_ENTRY_INTENT.PERSISTED_PROGRESS_RESUME,
      reason: CARD_REFRESH_REBUILD_REASON.SAVED_PROGRESS_STATE,
      moduleCompleted: false,
      persistedUnitNumber: 0,
      lastUnitCompleted: null,
    });
  });

  it('classifies refresh rebuild with saved schedule progress as persisted-progress resume', function() {
    expect(classifyCardRefreshRebuild({
      schedule: { q: [{ clusterIndex: 0 }] },
      scheduleUnitNumber: 0,
    })).to.deep.equal({
      intent: CARD_ENTRY_INTENT.PERSISTED_PROGRESS_RESUME,
      reason: CARD_REFRESH_REBUILD_REASON.SAVED_PROGRESS_STATE,
      moduleCompleted: false,
      persistedUnitNumber: null,
      lastUnitCompleted: null,
    });
  });

  it('classifies refresh rebuild with either completion sentinel as completed', function() {
    expect(classifyCardRefreshRebuild({
      currentUnitNumber: 4,
    }, 4)).to.deep.equal({
      intent: CARD_ENTRY_INTENT.PERSISTED_PROGRESS_RESUME,
      reason: CARD_REFRESH_REBUILD_REASON.SAVED_PROGRESS_STATE,
      moduleCompleted: true,
      persistedUnitNumber: 4,
      lastUnitCompleted: null,
    });

    expect(classifyCardRefreshRebuild({
      lastUnitCompleted: 3,
    }, 4)).to.deep.equal({
      intent: CARD_ENTRY_INTENT.PERSISTED_PROGRESS_RESUME,
      reason: CARD_REFRESH_REBUILD_REASON.SAVED_PROGRESS_STATE,
      moduleCompleted: true,
      persistedUnitNumber: null,
      lastUnitCompleted: 3,
    });
  });

  it('classifies refresh rebuild without progress anchors as initial TDF entry', function() {
    expect(classifyCardRefreshRebuild({
      currentTdfId: 'tdf-1',
      mappingSignature: 'sig',
    })).to.deep.equal({
      intent: CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY,
      reason: CARD_REFRESH_REBUILD_REASON.NO_PROGRESS_STATE,
      moduleCompleted: false,
      persistedUnitNumber: null,
      lastUnitCompleted: null,
    });
  });

  it('resolves launch to persisted-progress resume when history exists', function() {
    expect(resolveCardLaunchProgress({
      currentUnitNumber: 1,
    }, 4)).to.deep.equal({
      intent: CARD_ENTRY_INTENT.PERSISTED_PROGRESS_RESUME,
      hasMeaningfulHistory: true,
      moduleCompleted: false,
      persistedUnitNumber: 1,
      lastUnitCompleted: null,
    });
  });

  it('treats out-of-bounds currentUnitNumber as completed launch sentinel', function() {
    expect(resolveCardLaunchProgress({
      currentUnitNumber: 4,
      lastUnitCompleted: 3,
    }, 4)).to.deep.equal({
      intent: CARD_ENTRY_INTENT.PERSISTED_PROGRESS_RESUME,
      hasMeaningfulHistory: true,
      moduleCompleted: true,
      persistedUnitNumber: 4,
      lastUnitCompleted: 3,
    });
  });

  it('treats final completed unit as completed even without out-of-bounds pointer', function() {
    expect(resolveCardLaunchProgress({
      currentUnitNumber: 3,
      lastUnitCompleted: 3,
    }, 4)).to.deep.equal({
      intent: CARD_ENTRY_INTENT.PERSISTED_PROGRESS_RESUME,
      hasMeaningfulHistory: true,
      moduleCompleted: true,
      persistedUnitNumber: 3,
      lastUnitCompleted: 3,
    });
  });

  it('does not treat the final valid unit as completed without lastUnitCompleted', function() {
    expect(resolveCardLaunchProgress({
      currentUnitNumber: 3,
    }, 4)).to.deep.equal({
      intent: CARD_ENTRY_INTENT.PERSISTED_PROGRESS_RESUME,
      hasMeaningfulHistory: true,
      moduleCompleted: false,
      persistedUnitNumber: 3,
      lastUnitCompleted: null,
    });
  });
});
