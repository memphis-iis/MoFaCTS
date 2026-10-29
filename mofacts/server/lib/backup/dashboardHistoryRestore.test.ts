import { expect } from 'chai';
import { collectionMongoName } from '../../../common/collectionOwnership';
import { prepareDashboardHistoryRestore } from './dashboardHistoryRestore';

const historyName = collectionMongoName('Histories');
const stateName = collectionMongoName('HistoryCommitState');
const cacheName = collectionMongoName('UserDashboardCache');

describe('dashboard history restore preparation', function() {
  it('reconstructs source maxima and invalidates derived cache data while preserving learner settings', function() {
    const learnerTdfConfigs = { lesson: { overrides: { audioInputEnabled: true } } };
    const createdAt = new Date('2026-10-01T00:00:00Z');
    const cache = {
      _id: 'cache-1', userId: 'learner', learnerTdfConfigs, createdAt,
      retainedMetadata: { owner: 'dashboard' },
      tdfStats: { stale: { totalTrials: 999 } }, summary: { stale: true }, usageSummary: { stale: true },
      lastUpdated: new Date(), version: 9, lastHistorySequence: 99, historyRepairRevision: 7,
      historyTdfTargets: { child: 'old-root' },
    };
    const history = [
      { _id: 'first', userId: 'learner', historySequence: 3 },
      { _id: 'second', userId: 'learner', historySequence: 8 },
      { _id: 'old', userId: 'learner' },
    ];
    const originalSource = { _id: 'learner', sequence: 5, repairRevision: 7 };
    const input = {
      [historyName]: history,
      [stateName]: [originalSource],
      [cacheName]: [cache],
      other_collection: [{ _id: 'untouched' }],
    };

    const restored = prepareDashboardHistoryRestore(input);

    expect(restored[stateName]).to.deep.equal([{ _id: 'learner', sequence: 8, repairRevision: 8 }]);
    expect(restored[cacheName]).to.deep.equal([{
      _id: 'cache-1', userId: 'learner', learnerTdfConfigs, createdAt,
      retainedMetadata: { owner: 'dashboard' },
    }]);
    expect(restored[historyName]).to.equal(history);
    expect(restored.other_collection).to.equal(input.other_collection);
    expect(input[cacheName]).to.deep.equal([cache]);
    expect(cache.version).to.equal(9);
    expect(originalSource).to.deep.equal({ _id: 'learner', sequence: 5, repairRevision: 7 });
  });

  it('preserves higher counters after removed histories and repairs every source, history, and cache owner', function() {
    const restored = prepareDashboardHistoryRestore({
      [stateName]: [
        { _id: 'removed-history', sequence: 12, repairRevision: 2, retainedMetadata: true },
        { _id: 'state-only', sequence: 4, repairRevision: 0 },
      ],
      [historyName]: [
        { _id: 'remaining', userId: 'removed-history', historySequence: 3 },
        { _id: 'old-history', userId: 'history-only' },
      ],
      [cacheName]: [{ _id: 'only-cache', userId: 'cache-only', learnerTdfConfigs: {} }],
    });

    expect(restored[stateName]).to.deep.equal([
      { _id: 'removed-history', sequence: 12, repairRevision: 3, retainedMetadata: true },
      { _id: 'state-only', sequence: 4, repairRevision: 1 },
      { _id: 'history-only', sequence: 0, repairRevision: 1 },
      { _id: 'cache-only', sequence: 0, repairRevision: 1 },
    ]);
  });

  it('keeps pre-sequence histories unchanged instead of inventing committed positions', function() {
    const history = [{ _id: 'old', userId: 'learner', recordedServerTime: 123 }];
    const restored = prepareDashboardHistoryRestore({ [historyName]: history });
    expect(restored[historyName]).to.equal(history);
    expect(restored[stateName]).to.deep.equal([{ _id: 'learner', sequence: 0, repairRevision: 1 }]);
    expect(restored).not.to.have.property(cacheName);
  });

  it('requires content-use reconciliation after a cross-collection restore without losing its decision counter', function() {
    const source = { _id: 'learner', sequence: 2, repairRevision: 0, contentUseRevision: 5,
      contentUseInitialization: { version: 1, phase: 'complete', cursor: null, requestCount: 3, historyCount: 2 } };
    const history = [{ _id: 'restored-presentation', userId: 'learner', historySequence: 2 }];
    const restored = prepareDashboardHistoryRestore({ [stateName]: [source], [historyName]: history });

    expect(restored[stateName]).to.deep.equal([{ _id: 'learner', sequence: 2, repairRevision: 1, contentUseRevision: 5 }]);
    expect(restored[historyName]).to.equal(history);
    expect(source.contentUseInitialization.phase).to.equal('complete');
  });

  it('rejects duplicate sequences within a learner while allowing independent learner sequences', function() {
    expect(() => prepareDashboardHistoryRestore({
      [historyName]: [
        { _id: 'one', userId: 'learner', historySequence: 1 },
        { _id: 'two', userId: 'learner', historySequence: 1 },
      ],
    })).to.throw('Duplicate committed history restore sequence');
    expect(() => prepareDashboardHistoryRestore({
      [historyName]: [
        { _id: 'one', userId: 'learner-one', historySequence: 1 },
        { _id: 'two', userId: 'learner-two', historySequence: 1 },
      ],
    })).not.to.throw();
  });

  it('rejects malformed checkpoints, invalid sequenced identities, and exhausted repair revisions', function() {
    for (const historySequence of [0, -1, 1.5, null, '1', Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => prepareDashboardHistoryRestore({
        [historyName]: [{ _id: 'row', userId: 'learner', historySequence }],
      })).to.throw();
    }
    expect(() => prepareDashboardHistoryRestore({
      [historyName]: [{ _id: 'row', userId: ' learner ', historySequence: 1 }],
    })).to.throw('Invalid sequenced history restore identity');
    expect(() => prepareDashboardHistoryRestore({
      [stateName]: [{ _id: 'learner', sequence: -1, repairRevision: 0 }],
    })).to.throw('Invalid dashboard history restore checkpoint');
    expect(() => prepareDashboardHistoryRestore({
      [stateName]: [{ _id: 'learner', sequence: 0, repairRevision: Number.MAX_SAFE_INTEGER }],
    })).to.throw('Invalid dashboard history restore checkpoint');
    expect(() => prepareDashboardHistoryRestore({
      [stateName]: [
        { _id: 'learner', sequence: 0, repairRevision: 0 },
        { _id: 'learner', sequence: 0, repairRevision: 0 },
      ],
    })).to.throw('Invalid dashboard history restore source identity');
  });
});
