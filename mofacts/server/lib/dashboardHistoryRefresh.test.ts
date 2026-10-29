import { strict as assert } from 'node:assert';
import { applyDashboardHistoryRecordToStats, computeCacheStats } from '../methods/dashboardCacheMethods';
import type { DashboardStatsByTdf } from '../methods/dashboardCacheMethods.contracts';
import {
  createDashboardHistoryRefresh,
  DASHBOARD_HISTORY_REFRESH_BATCH_SIZE,
  type DashboardHistoryPageRequest,
  type DashboardHistoryRefreshIo,
  type DashboardHistorySource,
  type DashboardRefreshCache,
  type DashboardRefreshCachePatch,
  type DashboardRefreshHistoryRow,
} from './dashboardHistoryRefresh';

const VERSION = 9;
const USER = 'synthetic-dashboard-user';
const practiceTime = (end: number | null | undefined, feedback: number | null | undefined) => (end ?? 0) + (feedback ?? 0);
const reduceRow = (stats: Parameters<typeof applyDashboardHistoryRecordToStats>[0], row: DashboardRefreshHistoryRow, name: string) =>
  applyDashboardHistoryRecordToStats(stats, row, name, practiceTime);

function history(id: string, tdfId: string, sequence?: number, overrides: Partial<DashboardRefreshHistoryRow> = {}): DashboardRefreshHistoryRow {
  return { _id: id, userId: USER, TDFId: tdfId, levelUnitType: 'model', outcome: 'correct',
    stimuliSetId: `set-${tdfId}`, stimulusKC: `${tdfId}-item`,
    recordedServerTime: new Date('2026-10-01T12:00:00Z'), CFEndLatency: 1000, CFFeedbackLatency: 100,
    ...(sequence === undefined ? {} : { historySequence: sequence }), ...overrides };
}

type StoredCache = DashboardRefreshCache & Partial<DashboardRefreshCachePatch> & {
  learnerTdfConfigs?: Record<string, unknown>;
  createdAt?: Date;
};

function cacheFrom(rows: DashboardRefreshHistoryRow[], source: DashboardHistorySource): StoredCache {
  const stats: DashboardStatsByTdf = {};
  for (const row of rows) if (row.TDFId) stats[row.TDFId] = reduceRow(stats[row.TDFId], row, `Lesson ${row.TDFId}`);
  return { version: VERSION, tdfStats: stats, lastHistorySequence: source.sequence,
    historyRepairRevision: source.repairRevision,
    historyTdfTargets: Object.fromEntries(rows.flatMap(row => row.TDFId ? [[row.TDFId, row.TDFId]] : [])),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    learnerTdfConfigs: { A: { overrides: { audioPromptMode: 'silent' } } } };
}

/** Snapshot copies plus optimistic commit retry model the injected transaction contract. */
function fixture(initialRows: DashboardRefreshHistoryRow[], initialCache: StoredCache | null = null) {
  const rows = structuredClone(initialRows);
  let source: DashboardHistorySource = { sequence: Math.max(0, ...rows.map(row => row.historySequence ?? 0)), repairRevision: 0 };
  let saved = structuredClone(initialCache);
  let cacheRevision = 0;
  let commits = 0;
  let transactions = 0;
  let failAfterWrite = false;
  let beforePage: (() => void) | undefined;
  const reads: DashboardHistoryPageRequest[] = [];
  const resolutions: string[][] = [];
  const targets = new Map<string, { targetTdfId: string; displayName: string }>(rows.flatMap(row => row.TDFId ? [[row.TDFId, { targetTdfId: row.TDFId, displayName: `Lesson ${row.TDFId}` }] as const] : []));
  const refresh = createDashboardHistoryRefresh({
    version: VERSION,
    now: () => new Date('2026-10-28T00:00:00Z').getTime(),
    applyHistoryRecord: (stats, row, name) => applyDashboardHistoryRecordToStats(stats, row, name, practiceTime),
    async transaction<T>(work: (io: DashboardHistoryRefreshIo) => Promise<T>): Promise<T> {
      for (let attempt = 0; attempt < 5; attempt++) {
        transactions++;
        const revision = cacheRevision;
        const snapshotRows = structuredClone(rows);
        const snapshotSource = structuredClone(source);
        let pending = structuredClone(saved);
        let wrote = false;
        const result = await work({
          async readSource(userId) { assert.equal(userId, USER); return snapshotSource; },
          async readCache(userId) { assert.equal(userId, USER); return pending; },
          async readHistoryPage(request) {
            reads.push(request);
            const hook = beforePage; beforePage = undefined; hook?.();
            const matching = snapshotRows.filter(row => row.userId === request.userId && (request.mode === 'rebuild'
              ? request.afterId === undefined || row._id > request.afterId
              : row.historySequence !== undefined && row.historySequence > request.afterSequence && row.historySequence <= request.throughSequence));
            matching.sort((a, b) => request.mode === 'rebuild' ? (a._id < b._id ? -1 : a._id > b._id ? 1 : 0) : a.historySequence! - b.historySequence!);
            return matching.slice(0, request.limit);
          },
          async resolveTdfTargets(userId, ids) {
            assert.equal(userId, USER); resolutions.push(ids);
            return new Map(ids.flatMap(id => targets.has(id) ? [[id, targets.get(id)!]] : []));
          },
          async writeCache(userId, patch) {
            assert.equal(userId, USER);
            pending = { ...(pending ?? { createdAt: new Date('2026-01-01T00:00:00Z') }), ...patch };
            wrote = true;
            if (failAfterWrite) { failAfterWrite = false; throw new Error('Synthetic cache commit failure'); }
          },
        });
        if (wrote && revision !== cacheRevision) continue;
        if (wrote) { saved = pending; cacheRevision++; commits++; }
        return result;
      }
      throw new Error('Synthetic transaction retry limit reached');
    },
  });
  return {
    refresh, rows, reads, resolutions, targets,
    cache: () => saved,
    source: () => source,
    commits: () => commits,
    transactions: () => transactions,
    failNextWrite: () => { failAfterWrite = true; },
    beforeNextPage: (hook: () => void) => { beforePage = hook; },
    commit(row: DashboardRefreshHistoryRow) { source.sequence++; rows.push({ ...row, historySequence: source.sequence }); },
    repair() { source.repairRevision++; },
    setSource(value: DashboardHistorySource) { source = value; },
  };
}

describe('transactional dashboard history refresh', () => {
  it('applies only new history, preserves unchanged lessons/settings, and is current on the next read', async () => {
    const original = [history('a1', 'A', 1), history('b1', 'B', 2)];
    const initial = cacheFrom(original, { sequence: 2, repairRevision: 0 });
    const owner = fixture(original, initial);
    owner.commit(history('a2', 'A', undefined, { outcome: 'incorrect' }));
    owner.commit(history('a3', 'A', undefined, { stimulusKC: 'A-new-item', recordedServerTime: new Date('2026-10-02T12:00:00Z') }));

    assert.deepEqual(await owner.refresh(USER), { success: true, action: 'refreshed', reason: 'history-newer', tdfCount: 2 });
    assert.deepEqual(owner.cache()!.tdfStats!.A, computeCacheStats(owner.rows.filter(row => row.TDFId === 'A'), 'Lesson A', practiceTime));
    assert.deepEqual(owner.cache()!.tdfStats!.B, initial.tdfStats!.B);
    assert.deepEqual(owner.cache()!.learnerTdfConfigs, initial.learnerTdfConfigs);
    assert.deepEqual(owner.cache()!.createdAt, initial.createdAt);
    assert.deepEqual(owner.resolutions, [['A']]);
    assert.equal(owner.reads[0]!.mode, 'delta');
    assert.equal(owner.reads[0]!.afterSequence, 2);
    assert.equal(owner.reads[0]!.throughSequence, 4);
    assert.deepEqual(await owner.refresh(USER), { success: true, action: 'current', tdfCount: 2 });
    assert.equal(owner.reads.length, 1);
    assert.equal(owner.commits(), 1);
  });

  it('discovers a new condition child and lesson without rebuilding unchanged history', async () => {
    const base = history('child-one-old', 'child-one', 1);
    const initial = cacheFrom([base], { sequence: 1, repairRevision: 0 });
    initial.tdfStats = { root: { ...initial.tdfStats!['child-one']!, displayName: 'Root lesson' } };
    initial.historyTdfTargets = { 'child-one': 'root' };
    const owner = fixture([base], initial);
    owner.targets.set('child-two', { targetTdfId: 'root', displayName: 'Root lesson' });
    owner.targets.set('new-lesson', { targetTdfId: 'new-lesson', displayName: 'New lesson' });
    owner.commit(history('new-child-row', 'child-two'));
    owner.commit(history('new-lesson-row', 'new-lesson'));

    await owner.refresh(USER);
    assert.equal(owner.cache()!.tdfStats!.root!.totalTrials, 2);
    assert.equal(owner.cache()!.tdfStats!.root!.itemsPracticedCount, 2);
    assert.equal(owner.cache()!.tdfStats!['new-lesson']!.totalTrials, 1);
    assert.equal(owner.cache()!.tdfStats!['child-two'], undefined);
    assert.deepEqual(owner.resolutions, [['child-two', 'new-lesson']]);
    assert.equal(owner.reads[0]!.mode, 'delta');
  });

  it('includes a late commit with an older timestamp and lower identity on the next refresh exactly once', async () => {
    const owner = fixture([history('z-first', 'A', 1)]);
    owner.beforeNextPage(() => owner.commit(history('a-late', 'A', undefined, { recordedServerTime: new Date('2026-09-01T12:00:00Z') })));
    await owner.refresh(USER);
    assert.equal(owner.cache()!.lastHistorySequence, 1);
    assert.equal(owner.cache()!.tdfStats!.A!.totalTrials, 1);
    await owner.refresh(USER);
    assert.equal(owner.cache()!.lastHistorySequence, 2);
    assert.equal(owner.cache()!.tdfStats!.A!.totalTrials, 2);
    assert.equal(owner.cache()!.tdfStats!.A!.lastPracticeTimestamp, new Date('2026-10-01T12:00:00Z').getTime());
    await owner.refresh(USER);
    assert.equal(owner.cache()!.tdfStats!.A!.totalTrials, 2);
    assert.equal(owner.reads[1]!.afterSequence, 1);
  });

  it('rebuilds in the same snapshot when a formerly standalone lesson gains a parent before new activity', async () => {
    const rows = [history('old-child', 'child', 1)];
    const owner = fixture(rows, cacheFrom(rows, { sequence: 1, repairRevision: 0 }));
    owner.targets.set('child', { targetTdfId: 'root', displayName: 'Root lesson' });
    owner.commit(history('new-child', 'child'));
    const result = await owner.refresh(USER);
    assert.equal(result.reason, 'repair');
    assert.equal(owner.transactions(), 1);
    assert.equal(owner.commits(), 1);
    assert.deepEqual(owner.reads.map(request => request.mode), ['delta', 'rebuild']);
    assert.deepEqual(Object.keys(owner.cache()!.tdfStats!), ['root']);
    assert.equal(owner.cache()!.tdfStats!.root!.totalTrials, 2);
    assert.deepEqual(owner.cache()!.historyTdfTargets, { child: 'root' });
  });

  it('rebuilds prior root contributions when an active child is reparented', async () => {
    const rows = [history('child-old', 'child', 1), history('sibling-old', 'sibling', 2)];
    const initial = cacheFrom(rows, { sequence: 2, repairRevision: 0 });
    initial.tdfStats = { 'old-root': computeCacheStats(rows, 'Old root', practiceTime) };
    initial.historyTdfTargets = { child: 'old-root', sibling: 'old-root' };
    const owner = fixture(rows, initial);
    owner.targets.set('child', { targetTdfId: 'new-root', displayName: 'New root' });
    owner.targets.set('sibling', { targetTdfId: 'old-root', displayName: 'Old root' });
    owner.commit(history('child-new', 'child'));
    assert.equal((await owner.refresh(USER)).reason, 'repair');
    assert.equal(owner.cache()!.tdfStats!['old-root']!.totalTrials, 1);
    assert.equal(owner.cache()!.tdfStats!['new-root']!.totalTrials, 2);
    assert.deepEqual(owner.cache()!.historyTdfTargets, { child: 'new-root', sibling: 'old-root' });
  });

  it('records unavailable sources as null and reconsiders skipped old history when new activity finds a target', async () => {
    const owner = fixture([history('unavailable-old', 'unavailable', 1)]);
    owner.targets.delete('unavailable');
    await owner.refresh(USER);
    assert.deepEqual(owner.cache()!.tdfStats, {});
    assert.deepEqual(owner.cache()!.historyTdfTargets, { unavailable: null });
    owner.targets.set('unavailable', { targetTdfId: 'available', displayName: 'Available lesson' });
    owner.commit(history('available-new', 'unavailable'));
    assert.equal((await owner.refresh(USER)).reason, 'repair');
    assert.equal(owner.cache()!.tdfStats!.available!.totalTrials, 2);
    assert.deepEqual(owner.cache()!.historyTdfTargets, { unavailable: 'available' });
  });

  it('does not resolve unchanged source metadata when there is no new history', async () => {
    const rows = [history('old', 'A', 1)];
    const owner = fixture(rows, cacheFrom(rows, { sequence: 1, repairRevision: 0 }));
    owner.targets.set('A', { targetTdfId: 'new-root', displayName: 'New root' });
    assert.equal((await owner.refresh(USER)).action, 'current');
    assert.deepEqual(owner.resolutions, []);
    assert.deepEqual(owner.reads, []);
  });

  it('advances past non-trial SPARC checkpoints and counts the later assessment once', async () => {
    const checkpoint = history('checkpoint', 'A', 1, { levelUnitType: 'sparc', sparc: { stateTransition: {
      transitionId: 'answer:submission', event: { eventId: 'answer', type: 'response-submitted' },
    } } });
    const owner = fixture([checkpoint]);
    await owner.refresh(USER);
    assert.equal(owner.cache()!.tdfStats!.A!.totalTrials, 0);
    assert.equal(owner.cache()!.lastHistorySequence, 1);
    owner.commit({ ...checkpoint, _id: 'assessment', sparc: { stateTransition: {
      transitionId: 'answer:assessment', event: { eventId: 'answer', type: 'response-submitted' },
    } } });
    await owner.refresh(USER);
    assert.equal(owner.cache()!.tdfStats!.A!.totalTrials, 1);
    const reads = owner.reads.length;
    await owner.refresh(USER);
    assert.equal(owner.reads.length, reads);
  });

  it('rolls back stats and source position on failure and applies the retry once', async () => {
    const original = [history('old', 'A', 1)];
    const initial = cacheFrom(original, { sequence: 1, repairRevision: 0 });
    const owner = fixture(original, initial);
    owner.commit(history('new', 'A'));
    owner.failNextWrite();
    await assert.rejects(owner.refresh(USER), /Synthetic cache commit failure/);
    assert.deepEqual(owner.cache(), initial);
    await owner.refresh(USER);
    assert.equal(owner.cache()!.tdfStats!.A!.totalTrials, 2);
    assert.equal(owner.cache()!.lastHistorySequence, 2);
    assert.equal(owner.commits(), 1);
  });

  it('retries an overlapping snapshot against the committed cursor instead of double counting', async () => {
    const original = [history('old', 'A', 1)];
    const owner = fixture(original, cacheFrom(original, { sequence: 1, repairRevision: 0 }));
    owner.commit(history('new', 'A'));
    const results = await Promise.all([owner.refresh(USER), owner.refresh(USER)]);
    assert.equal(owner.cache()!.tdfStats!.A!.totalTrials, 2);
    assert.equal(owner.cache()!.lastHistorySequence, 2);
    assert.equal(owner.commits(), 1);
    assert.equal(owner.transactions(), 3);
    assert.deepEqual(results.map(result => result.action).sort(), ['current', 'refreshed']);
  });

  it('rebuilds old or incomplete caches from unsequenced history without backfilling source rows', async () => {
    for (const corruption of ['version', 'missing-cursor', 'missing-targets', 'invalid-stats', 'weighted'] as const) {
      const rows = [history('legacy', 'A')];
      const initial = cacheFrom(rows, { sequence: 0, repairRevision: 0 });
      if (corruption === 'version') initial.version = VERSION - 1;
      if (corruption === 'missing-cursor') delete initial.lastHistorySequence;
      if (corruption === 'missing-targets') delete initial.historyTdfTargets;
      if (corruption === 'invalid-stats') delete initial.tdfStats!.A!.practicedItemKeys;
      if (corruption === 'weighted') initial.tdfStats!.A!.accuracyWeightedTotal = 100;
      const owner = fixture(rows, initial);
      const result = await owner.refresh(USER);
      assert.equal(result.reason, corruption === 'weighted' || corruption === 'missing-targets' ? 'invalid-stats' : corruption);
      assert.equal(owner.cache()!.version, VERSION);
      assert.equal(owner.cache()!.tdfStats!.A!.totalTrials, 1);
      assert.equal(owner.cache()!.lastHistorySequence, 0);
      assert.equal(owner.rows[0]!.historySequence, undefined);
      assert.deepEqual(owner.cache()!.learnerTdfConfigs, initial.learnerTdfConfigs);
      assert.deepEqual(owner.cache()!.createdAt, initial.createdAt);
      assert.equal((await owner.refresh(USER)).action, 'current');
    }
  });

  it('uses a repair revision to rebuild deletions and initializes empty history', async () => {
    const rows = [history('removed', 'A', 1), history('retained', 'B', 2)];
    const owner = fixture(rows, cacheFrom(rows, { sequence: 2, repairRevision: 0 }));
    owner.rows.splice(0, 1);
    owner.repair();
    assert.equal((await owner.refresh(USER)).reason, 'repair');
    assert.deepEqual(Object.keys(owner.cache()!.tdfStats!), ['B']);
    assert.equal(owner.cache()!.historyRepairRevision, 1);
    assert.equal(owner.cache()!.lastHistorySequence, 2);
    const empty = fixture([]);
    assert.deepEqual(await empty.refresh(USER), { success: true, action: 'refreshed', reason: 'missing', tdfCount: 0 });
    assert.deepEqual(empty.cache()!.tdfStats, {});
    assert.equal(empty.cache()!.lastHistorySequence, 0);
  });

  it('paginates a full initialization and a large delta with the declared bound', async () => {
    const count = DASHBOARD_HISTORY_REFRESH_BATCH_SIZE + 1;
    const rows = Array.from({ length: count }, (_, index) => history(`row-${String(index).padStart(5, '0')}`, 'A', index + 1));
    const owner = fixture(rows);
    await owner.refresh(USER);
    assert.equal(owner.reads.length, 2);
    assert.equal(owner.cache()!.tdfStats!.A!.totalTrials, count);
    for (let index = 0; index < count; index++) owner.commit(history(`delta-${index}`, 'A'));
    await owner.refresh(USER);
    assert.equal(owner.reads.length, 4);
    assert.equal(owner.cache()!.tdfStats!.A!.totalTrials, count * 2);
    assert.ok(owner.reads.every(request => request.limit === DASHBOARD_HISTORY_REFRESH_BATCH_SIZE));
    assert.equal(owner.reads[2]!.afterSequence, count);
    assert.equal(owner.reads[3]!.afterSequence, count + DASHBOARD_HISTORY_REFRESH_BATCH_SIZE);
  });

  it('retains finite negative time semantics and fails clearly on an impossible source position', async () => {
    const rows = [history('negative', 'A', 1, { CFEndLatency: -2000 })];
    const owner = fixture(rows, cacheFrom(rows, { sequence: 1, repairRevision: 0 }));
    assert.equal((await owner.refresh(USER)).action, 'current');
    owner.setSource({ sequence: 0, repairRevision: 0 });
    await assert.rejects(owner.refresh(USER), /exceeds its source/);
    owner.setSource({ sequence: Number.NaN, repairRevision: 0 });
    await assert.rejects(owner.refresh(USER), /source position is invalid/);
    assert.equal(owner.commits(), 0);
  });
});
