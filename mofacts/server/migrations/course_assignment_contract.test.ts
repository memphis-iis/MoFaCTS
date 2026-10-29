import { strict as assert } from 'node:assert';
import {
  COURSE_ASSIGNMENT_CONTRACT_MIGRATION_KEY as KEY,
  COURSE_ASSIGNMENT_PLAN_FIELD as PLAN,
  compareHistoricalCourseAssignments,
  migrateCourseAssignmentContract,
  type CourseAssignmentMigrationDeps,
  type CourseMigrationCollection,
  type CourseMigrationSession,
} from './course_assignment_contract';
import { runStartupCleanupMigrations } from './startup_cleanup_migrations';

type Row = Record<string, any>;
type Database = Record<'courses' | 'assignments' | 'snapshots' | 'settings', Map<string, Row>>;
type Session = CourseMigrationSession & { database: Database };
const clone = <T>(value: T): T => structuredClone(value);
const at = (row: Row, key: string) => key.split('.').reduce((value: any, part) => value?.[part], row);
function set(row: Row, key: string, value: unknown) {
  const parts = key.split('.');
  let target = row;
  for (const part of parts.slice(0, -1)) target = target[part] ??= {};
  target[parts.at(-1)!] = clone(value);
}
function matches(row: Row, selector: Row) {
  return Object.entries(selector).every(([key, value]) => {
    const actual = at(row, key);
    return value && typeof value === 'object'
      ? ('$gt' in value ? actual > value.$gt : value.$in.includes(actual))
      : actual === value;
  });
}

function fixture(input: { courses?: Row[]; assignments?: Row[]; snapshots?: Row[]; settings?: Row[] } = {}) {
  let database: Database = Object.fromEntries(['courses', 'assignments', 'snapshots', 'settings'].map(name =>
    [name, new Map((input[name as keyof typeof input] ?? []).map(row => [row._id, clone(row)]))])) as Database;
  let queue = Promise.resolve();
  let ended = 0;
  let queries = 0;
  let largestRead = 0;
  let transactionalWrites = 0;
  let bulkCalls = 0;
  let largestBulk = 0;
  let fail: ((name: string, row: Row, modifier: Row) => boolean) | undefined;
  let afterRead: ((name: string, rows: Row[]) => Promise<void>) | undefined;
  const logs: unknown[][] = [];
  const project = (row: Row, projection: Row = {}) => Object.fromEntries(
    Object.keys(projection).filter(key => projection[key] && Object.hasOwn(row, key)).map(key => [key, clone(row[key])]),
  );
  const update = async (name: keyof Database, selector: Row, modifier: Row, options: Row = {}) => {
    const session = options.session as Session | undefined;
    const store = session?.database ?? database;
    let row = [...store[name].values()].find(row => matches(row, selector));
    if (!row && options.upsert) {
      row = { _id: selector._id };
      for (const [key, value] of Object.entries(modifier.$setOnInsert ?? {})) set(row, key, value);
      store[name].set(row._id, row);
      return { matchedCount: 0 };
    }
    if (!row) return { matchedCount: 0 };
    if (fail?.(name, row, modifier)) throw new Error('synthetic database failure with private document data');
    if (name !== 'settings') { assert.ok(session, 'course contract writes require a transaction'); transactionalWrites += 1; }
    for (const [key, value] of Object.entries(modifier.$set ?? {})) set(row, key, value);
    for (const [key, value] of Object.entries(modifier.$inc ?? {})) set(row, key, Number(at(row, key) ?? 0) + Number(value));
    for (const key of Object.keys(modifier.$unset ?? {})) delete row[key];
    return { matchedCount: 1 };
  };
  const collection = (name: keyof Database): CourseMigrationCollection => ({
    find(selector, options: Row) {
      assert.deepEqual(options.sort, { _id: 1 });
      assert.ok(options.limit > 0 && options.limit <= 100, 'every multi-row read is bounded');
      assert.ok(options.projection && !('content' in options.projection), 'migration reads have an explicit projection');
      return { async toArray() {
        queries += 1;
        const store = (options.session as Session | undefined)?.database ?? database;
        const rows = [...store[name].values()].filter(row => matches(row, selector))
          .sort((a, b) => a._id < b._id ? -1 : a._id > b._id ? 1 : 0).slice(0, options.limit)
          .map(row => project(row, options.projection));
        largestRead = Math.max(largestRead, rows.length);
        await afterRead?.(name, rows);
        return rows;
      } };
    },
    async findOne(selector, options: Row = {}) {
      assert.equal(name, 'settings', 'source documents must be read in batches rather than by individual identity');
      const store = (options.session as Session | undefined)?.database ?? database;
      const row = [...store[name].values()].find(row => matches(row, selector));
      return row ? options.projection ? project(row, options.projection) : clone(row) : null;
    },
    async updateOne(selector, modifier: Row, options: Row = {}) {
      assert.equal(name, 'settings', 'source documents must be written through a batch');
      return update(name, selector, modifier, options);
    },
    async updateMany(selector, modifier, options) {
      const store = (options?.session as Session | undefined)?.database ?? database;
      for (const row of [...store[name].values()]) if (matches(row, selector)) {
        await update(name, { _id: row._id }, modifier, options);
      }
    },
    async bulkWrite(operations, options) {
      assert.ok(operations.length > 0 && operations.length <= 100, 'bulk writes are bounded to one page');
      assert.equal(options.ordered, true);
      assert.ok(options.session, 'bulk writes share the checkpoint transaction');
      bulkCalls += 1;
      largestBulk = Math.max(largestBulk, operations.length);
      let matchedCount = 0;
      for (const operation of operations) {
        const result = await update(name, operation.updateOne.filter, operation.updateOne.update, options);
        matchedCount += result.matchedCount;
      }
      return { matchedCount };
    },
  });
  const deps: CourseAssignmentMigrationDeps = {
    courses: collection('courses'), assignments: collection('assignments'), snapshots: collection('snapshots'), settings: collection('settings'),
    startSession() {
      const session: Session = {
        database: clone(database),
        async withTransaction(work, options) {
          assert.deepEqual(options, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
          const previous = queue;
          let release!: () => void;
          queue = new Promise<void>(resolve => { release = resolve; });
          await previous;
          try { session.database = clone(database); await work(); database = session.database; }
          finally { release(); }
        },
        async endSession() { ended += 1; },
      };
      return session;
    },
    serverConsole(...args) { logs.push(args); },
  };
  return {
    deps, logs, data: () => database, state: () => database.settings.get(KEY)!.value,
    failWhen: (predicate?: typeof fail) => { fail = predicate; },
    afterRead: (work?: typeof afterRead) => { afterRead = work; },
    metrics: () => ({ ended, queries, largestRead, transactionalWrites, bulkCalls, largestBulk }),
  };
}

const date = new Date('2024-01-01T00:00:00.000Z');
const historical = (index: number, overrides: Row = {}): Row => ({
  _id: `assignment-${String(index).padStart(4, '0')}`, courseId: 'course-a', TDFId: `lesson-${index}`,
  order: index % 5 === 0 ? undefined : String(Math.floor(index / 3)),
  createdAt: index % 7 === 0 ? undefined : new Date(date.getTime() + (index % 3) * 1000),
  ...overrides,
});
const completeLesson = (index: number, overrides: Row = {}) => historical(index, {
  assignmentType: 'lesson', order: index, required: false, releaseAt: null, dueAt: null,
  createdAt: date, updatedAt: date, ...overrides,
});

describe('Bounded course assignment contract migration', () => {
  it('preserves a 251+ historical course and exact historical ordering while normalizing metadata and shape', async () => {
    const assignments = Array.from({ length: 307 }, (_, index) => historical(index));
    assignments.push(completeLesson(400, { courseId: 'course-b' }));
    const expected = [...assignments].sort(compareHistoricalCourseAssignments);
    const test = fixture({ courses: [{ _id: 'course-a' }, { _id: 'course-b', visibility: 'public', timezone: 'UTC' }],
      assignments, snapshots: Array.from({ length: 205 }, (_, index) => ({ _id: `snapshot-${String(index).padStart(3, '0')}` })) });
    await migrateCourseAssignmentContract(test.deps);
    assert.equal(test.state().phase, 'complete');
    assert.equal(test.state().assignmentsPlanned, 308);
    assert.equal(test.state().snapshotsInvalidated, 205);
    assert.deepEqual(test.data().courses.get('course-a'), { _id: 'course-a', visibility: 'private', timezone: 'America/Chicago' });
    let courseId = ''; let order = 0;
    for (const source of expected) {
      if (courseId !== source.courseId) { courseId = source.courseId; order = 0; }
      const row = test.data().assignments.get(source._id)!;
      assert.equal(Number(row.order), order++);
      assert.equal(row.assignmentType, 'lesson');
      assert.equal(row.required, source.required ?? true);
      assert.equal(row.releaseAt, null); assert.equal(row.dueAt, null);
      assert.ok(row.createdAt instanceof Date && row.updatedAt instanceof Date);
      assert.equal(row[PLAN], undefined);
    }
    assert.ok([...test.data().snapshots.values()].every(row => row.invalidatedAt instanceof Date));
    assert.equal(test.metrics().largestRead, 100);
    assert.equal(test.metrics().largestBulk, 100);
    assert.equal(test.metrics().bulkCalls, 9, 'course metadata, staging and application issue one bulk write per changed page');
    assert.ok(test.metrics().queries < 100, 'source round trips scale with pages rather than assignments');
    assert.ok(test.metrics().ended > 10);
    assert.ok(!JSON.stringify(test.logs).includes('assignment-'), 'logs contain progress counts rather than identities');
    const before = clone(test.data()); const reads = test.metrics().queries;
    await migrateCourseAssignmentContract(test.deps);
    assert.deepEqual(test.data(), before);
    assert.equal(test.metrics().queries, reads, 'completed migrations do not rescan sources');
  });

  it('retains current progressive and lesson assignments without changing their intentional behavior', async () => {
    const progressive = completeLesson(1, { assignmentType: 'progressive', TDFId: undefined,
      title: 'Ordered practice', memberTdfIds: ['member-a', 'member-b'], order: 1, required: true,
      releaseAt: '2027-01-01T00:00:00Z', dueAt: new Date('2027-02-01T00:00:00Z') });
    delete progressive.TDFId;
    const lesson = completeLesson(0);
    const test = fixture({ assignments: [lesson, progressive] });
    await migrateCourseAssignmentContract(test.deps);
    assert.deepEqual(test.data().assignments.get(lesson._id), lesson);
    assert.deepEqual(test.data().assignments.get(progressive._id), progressive);
  });

  it('resumes interrupted staging before changing any original order or creation date', async () => {
    const assignments = Array.from({ length: 261 }, (_, index) => historical(index));
    const sorted = [...assignments].sort(compareHistoricalCourseAssignments);
    const failId = sorted[105]!._id;
    const test = fixture({ assignments });
    test.failWhen((name, row, modifier) => name === 'assignments' && row._id === failId && !!modifier.$set?.[PLAN]);
    await assert.rejects(migrateCourseAssignmentContract(test.deps), /failed during stage-order$/);
    assert.equal(test.state().assignmentsPlanned, 100);
    assert.equal([...test.data().assignments.values()].filter(row => row[PLAN]).length, 100);
    for (const source of assignments) {
      const current = { ...test.data().assignments.get(source._id) }; delete current[PLAN];
      assert.deepEqual(current, source, 'staging cannot mutate the historical sort inputs');
    }
    test.failWhen();
    await migrateCourseAssignmentContract(test.deps);
    sorted.forEach((source, index) => assert.equal(Number(test.data().assignments.get(source._id)!.order), index));
    assert.equal(test.state().phase, 'complete');
  });

  it('resumes partially applied orders from the stored plan instead of sorting transformed rows again', async () => {
    const assignments = Array.from({ length: 261 }, (_, index) => historical(index));
    const expected = [...assignments].sort(compareHistoricalCourseAssignments);
    const test = fixture({ assignments });
    test.failWhen((name, row, modifier) => name === 'assignments' && row._id === 'assignment-0105' && !!modifier.$set?.assignmentType);
    await assert.rejects(migrateCourseAssignmentContract(test.deps), /failed during apply$/);
    assert.equal(test.state().cursor, 'assignment-0099');
    assert.equal(test.state().assignmentsScanned, 100);
    assert.equal([...test.data().assignments.values()].filter(row => row.assignmentType === 'lesson').length, 100);
    test.failWhen();
    await migrateCourseAssignmentContract(test.deps);
    expected.forEach((row, index) => assert.equal(Number(test.data().assignments.get(row._id)!.order), index));
    assert.equal(test.state().phase, 'complete');
  });

  it('resumes snapshot invalidation and temporary-plan cleanup in bounded transactional pages', async () => {
    for (const phase of ['invalidate-snapshots', 'cleanup-plan']) {
      const test = fixture({ assignments: Array.from({ length: 205 }, (_, index) => historical(index)),
        snapshots: Array.from({ length: 205 }, (_, index) => ({ _id: `snapshot-${String(index).padStart(4, '0')}` })) });
      test.failWhen((name, row, modifier) => phase === 'invalidate-snapshots'
        ? name === 'snapshots' && row._id === 'snapshot-0105'
        : name === 'assignments' && row._id === 'assignment-0105' && Object.hasOwn(modifier.$unset ?? {}, PLAN));
      await assert.rejects(migrateCourseAssignmentContract(test.deps), new RegExp(`failed during ${phase}$`));
      assert.equal(test.state().phase, phase);
      const remaining = [...test.data().assignments.values()].filter(row => row[PLAN]).length;
      assert.equal(remaining, phase === 'cleanup-plan' ? 105 : 205);
      test.failWhen(); await migrateCourseAssignmentContract(test.deps);
      assert.equal(test.state().phase, 'complete');
      assert.ok([...test.data().assignments.values()].every(row => row[PLAN] === undefined));
      assert.ok([...test.data().snapshots.values()].every(row => row.invalidatedAt instanceof Date));
    }
  });

  it('rejects changed staged source data without overwriting it or hiding failure details in a warning', async () => {
    const test = fixture({ assignments: Array.from({ length: 205 }, (_, index) => historical(index)) });
    test.failWhen((name, _row, modifier) => name === 'assignments' && !!modifier.$set?.assignmentType);
    await assert.rejects(migrateCourseAssignmentContract(test.deps), /failed during apply/);
    const changed = test.data().assignments.get('assignment-0000')!;
    changed.required = false;
    test.failWhen();
    await assert.rejects(migrateCourseAssignmentContract(test.deps), /Assignment source changed/);
    assert.equal(changed.assignmentType, undefined);
    assert.equal(changed.required, false);
    assert.equal(test.state().phase, 'apply');
    assert.ok(!JSON.stringify(test.logs).includes('private document data'));
  });

  it('does not advance an apply checkpoint when a page member disappears before the transactional batch read', async () => {
    const test = fixture({ assignments: Array.from({ length: 105 }, (_, index) => historical(index)) });
    let removed = false;
    test.afterRead(async (name) => {
      if (name !== 'assignments' || test.state().phase !== 'apply' || removed) return;
      removed = true;
      test.data().assignments.delete('assignment-0000');
    });
    await assert.rejects(migrateCourseAssignmentContract(test.deps), /Assignment disappeared during contract migration/);
    assert.equal(test.state().phase, 'apply');
    assert.equal(test.state().cursor, null);
    assert.equal(test.state().assignmentsScanned, 0);
    assert.ok([...test.data().assignments.values()].every(row => row.assignmentType === undefined));
  });

  it('validates every planned result before applying any assignment transformation', async () => {
    const assignments = Array.from({ length: 105 }, (_, index) => historical(index));
    assignments[104]!.TDFId = '';
    const test = fixture({ assignments });
    await assert.rejects(migrateCourseAssignmentContract(test.deps), /Historical lesson assignment requires/);
    assert.ok([...test.data().assignments.values()].every(row => row.assignmentType === undefined));
    assert.notEqual(test.state().phase, 'complete');
  });

  it('lets overlapping startups share the checkpoint instead of applying stale phase work', async () => {
    const assignments = Array.from({ length: 205 }, (_, index) => historical(index));
    const expected = [...assignments].sort(compareHistoricalCourseAssignments);
    const test = fixture({ assignments });
    let competitor: Promise<void> | undefined;
    let started = false;
    test.afterRead(async (name) => {
      if (name !== 'assignments' || started) return;
      started = true;
      // This first sort holds original rows while the second startup stages,
      // applies and cleans up its plan. The first must reload the checkpoint.
      competitor = migrateCourseAssignmentContract(test.deps);
      await competitor;
    });
    await migrateCourseAssignmentContract(test.deps);
    await competitor;
    expected.forEach((row, index) => assert.equal(Number(test.data().assignments.get(row._id)!.order), index));
    assert.equal(test.state().phase, 'complete');
    assert.ok([...test.data().assignments.values()].every(row => row[PLAN] === undefined));
  });

  it('keeps old v1 completion markers from bypassing v2 validation and rejects malformed checkpoints', async () => {
    const test = fixture({ assignments: [historical(0)], settings: [
      { _id: 'old-metadata', key: 'migration.courseAssignmentMetadata.v1', value: { completedAt: date } },
      { _id: 'old-shape', key: 'migration.courseAssignmentShape.v1', value: { completedAt: date } },
    ] });
    await migrateCourseAssignmentContract(test.deps);
    assert.equal(test.data().assignments.get('assignment-0000')!.assignmentType, 'lesson');
    const malformed = fixture({ settings: [{ _id: KEY, value: { version: 2, phase: 'complete' } }] });
    await assert.rejects(migrateCourseAssignmentContract(malformed.deps), /checkpoint is malformed/);
  });

  it('makes a required course migration failure reject the startup cleanup promise', async () => {
    const test = fixture({ assignments: [historical(0, { TDFId: '' })] });
    await assert.rejects(runStartupCleanupMigrations({
      DynamicSettings: { async findOneAsync() { return { value: { completedAt: date } }; },
        async removeAsync() { return 0; }, async upsertAsync() {} },
      courseMigration: test.deps,
      usersCollection: { async findOneAsync() { return null; }, async updateAsync() { return 0; } },
      serverConsole() {}, async updateActiveThemeDocument() {},
    }), /Course assignment contract migration failed/);
    assert.notEqual(test.state().phase, 'complete');
  });
});
