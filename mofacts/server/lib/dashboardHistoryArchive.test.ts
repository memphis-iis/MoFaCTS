import { expect } from 'chai';
import { archiveDashboardHistory, type DashboardHistoryArchiveProgress } from './dashboardHistoryArchive';

type Row = Record<string, unknown>;
type Session = { rows: Row[] };

function createFixture(initialRows: Row[]) {
  let rows = initialRows.map(row => ({ ...row }));
  const sources = new Map<string, { sequence: number; repairRevision: number }>();
  const progress: DashboardHistoryArchiveProgress[] = [];
  const queries: Array<{ selector: Row; options: { projection: Record<string, 0 | 1>; sort?: Record<string, 1>; limit: number } }> = [];
  const batches: number[] = [];
  let failingWriteNumber = 0;
  const matches = (row: Row, selector: Row) => row.TDFId === selector.TDFId
    && !Object.prototype.hasOwnProperty.call(row, 'tdfDeletedAt')
    && (selector.userId === undefined || row.userId === selector.userId)
    && (!selector._id || (selector._id as { $in: unknown[] }).$in.includes(row._id));
  const histories = {
    find(selector: Row, options: { projection: Record<string, 0 | 1>; sort?: Record<string, 1>; limit: number }) {
      queries.push({ selector, options });
      return { toArray: async () => {
        const sorted = rows.filter(row => matches(row, selector)).sort((left, right) => {
          const sortKey = Object.keys(options.sort || {})[0] || '_id';
          return String(left[sortKey] || '').localeCompare(String(right[sortKey] || ''));
        });
        return sorted.slice(0, options.limit).map(row => Object.fromEntries(Object.entries(row)
          .filter(([key]) => options.projection[key] === 1)));
      } };
    },
    async updateMany(selector: Row, modifier: Row, options: { session: Session }) {
      const selected = options.session.rows.filter(row => matches(row, selector));
      batches.push(selected.length);
      for (const row of selected) Object.assign(row, modifier.$set);
      if (batches.length === failingWriteNumber) {
        failingWriteNumber = 0;
        throw new Error('Injected archive write failure');
      }
      return { modifiedCount: selected.length };
    },
  };
  const deps = {
    histories,
    async mutate<T>(userId: string, work: (session: Session) => Promise<T>) {
      const source = sources.get(userId) || { sequence: 5000, repairRevision: 0 };
      const session = { rows: rows.map(row => ({ ...row })) };
      const result = await work(session);
      rows = session.rows;
      sources.set(userId, { sequence: source.sequence, repairRevision: source.repairRevision + 1 });
      return { result };
    },
    reportProgress: (value: DashboardHistoryArchiveProgress) => { progress.push(value); },
  };
  return {
    deps, sources, progress, queries, batches,
    getRows: () => rows,
    failWriteNumber: (number: number) => { failingWriteNumber = number; },
  };
}

describe('dashboard history archival', function() {
  it('archives bounded per-user batches with source repair while preserving histories and prior archive times', async function() {
    const originalArchiveTime = new Date('2026-10-01T00:00:00Z');
    const fixture = createFixture([
      ...Array.from({ length: 2001 }, (_, index) => ({
        _id: `history-${String(index).padStart(4, '0')}`, TDFId: 'deleted-lesson', userId: 'learner-one',
        historySequence: index + 1, outcome: 'correct',
      })),
      { _id: 'another-learner', TDFId: 'deleted-lesson', userId: 'learner-two', outcome: 'incorrect' },
      { _id: 'already-archived', TDFId: 'deleted-lesson', userId: 'learner-three', tdfDeletedAt: originalArchiveTime },
      { _id: 'other-lesson', TDFId: 'active-lesson', userId: 'learner-one', outcome: 'correct' },
    ]);

    expect(await archiveDashboardHistory('deleted-lesson', fixture.deps)).to.equal(2002);

    expect(fixture.batches).to.deep.equal([1000, 1000, 1, 1]);
    expect(fixture.sources.get('learner-one')).to.deep.equal({ sequence: 5000, repairRevision: 3 });
    expect(fixture.sources.get('learner-two')).to.deep.equal({ sequence: 5000, repairRevision: 1 });
    expect(fixture.sources.has('learner-three')).to.equal(false);
    expect(fixture.getRows()).to.have.length(2004);
    expect(fixture.getRows().find(row => row._id === 'history-0000')).to.include({
      historySequence: 1, outcome: 'correct',
    }).and.have.property('tdfDeletedAt').that.is.instanceOf(Date);
    expect(fixture.getRows().find(row => row._id === 'already-archived')?.tdfDeletedAt).to.equal(originalArchiveTime);
    expect(fixture.getRows().find(row => row._id === 'other-lesson')).not.to.have.property('tdfDeletedAt');
    expect(fixture.queries.every(query => query.options.limit <= 1000)).to.equal(true);
    expect(fixture.queries.filter(query => query.options.limit === 1).every(query =>
      JSON.stringify(query.options.projection) === JSON.stringify({ _id: 0, userId: 1 })
      && JSON.stringify(query.options.sort) === JSON.stringify({ userId: 1 }))).to.equal(true);
    expect(fixture.progress.at(-1)).to.include({ status: 'complete', usersProcessed: 2, archivedRows: 2002 });
    for (const entry of fixture.progress) {
      expect(Object.keys(entry).sort()).to.deep.equal(['archivedRows', 'elapsedMs', 'status', 'usersProcessed']);
    }
  });

  it('leaves a failed batch and repair revision uncommitted, then resumes without changing earlier archive times', async function() {
    const fixture = createFixture(Array.from({ length: 1001 }, (_, index) => ({
      _id: `history-${String(index).padStart(4, '0')}`, TDFId: 'lesson', userId: 'learner', historySequence: index + 1,
    })));
    fixture.failWriteNumber(2);
    let failure: unknown;
    try { await archiveDashboardHistory('lesson', fixture.deps); } catch (error) { failure = error; }
    expect(failure).to.be.instanceOf(Error);
    const firstArchiveTime = fixture.getRows()[0]?.tdfDeletedAt;
    expect(firstArchiveTime).to.be.instanceOf(Date);
    expect(fixture.getRows()[1000]).not.to.have.property('tdfDeletedAt');
    expect(fixture.sources.get('learner')).to.deep.equal({ sequence: 5000, repairRevision: 1 });
    expect(fixture.progress.at(-1)).to.include({ status: 'failed', archivedRows: 1000 });

    expect(await archiveDashboardHistory('lesson', fixture.deps)).to.equal(1);
    expect(fixture.getRows()[0]?.tdfDeletedAt).to.equal(firstArchiveTime);
    expect(fixture.sources.get('learner')).to.deep.equal({ sequence: 5000, repairRevision: 2 });
    expect(await archiveDashboardHistory('lesson', fixture.deps)).to.equal(0);
    expect(fixture.getRows()[0]?.tdfDeletedAt).to.equal(firstArchiveTime);
    expect(fixture.sources.get('learner')).to.deep.equal({ sequence: 5000, repairRevision: 2 });
  });

  it('fails clearly on malformed learner identity without inventing a source owner', async function() {
    const fixture = createFixture([{ _id: 'history', TDFId: 'lesson', userId: ' learner ' }]);
    let failure: unknown;
    try { await archiveDashboardHistory('lesson', fixture.deps); } catch (error) { failure = error; }
    expect(failure).to.be.instanceOf(Error);
    expect((failure as Error).message).to.equal('History archival found a noncanonical learner identity');
    expect(fixture.sources.size).to.equal(0);
    expect(fixture.batches).to.deep.equal([]);
    expect(fixture.progress.at(-1)).to.include({ status: 'failed', archivedRows: 0 });
  });
});
