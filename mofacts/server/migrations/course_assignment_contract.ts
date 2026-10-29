import { createHash } from 'node:crypto';
import { serialize } from 'node:v8';
import { MIN_PROGRESSIVE_MEMBERS } from '../../common/progressiveAssignments';
import { boundedExternalSort } from '../lib/boundedExternalSort';

type Row = Record<string, any>;
type Selector = Record<string, unknown>;
type UpdateOperation = { updateOne: { filter: Selector; update: Selector } };
export type CourseMigrationSession = {
  withTransaction(work: () => Promise<void>, options: {
    readConcern: { level: 'snapshot' }; writeConcern: { w: 'majority' };
  }): Promise<unknown>;
  endSession(): Promise<void>;
};
export type CourseMigrationCollection = {
  find(selector: Selector, options: Selector): { toArray(): Promise<Row[]> };
  findOne(selector: Selector, options?: Selector): Promise<Row | null>;
  updateOne(selector: Selector, modifier: Selector, options?: Selector): Promise<{ matchedCount: number }>;
  updateMany(selector: Selector, modifier: Selector, options?: Selector): Promise<unknown>;
  bulkWrite(operations: UpdateOperation[], options: Selector): Promise<{ matchedCount: number }>;
};
export type CourseAssignmentMigrationDeps = {
  courses: CourseMigrationCollection;
  assignments: CourseMigrationCollection;
  snapshots: CourseMigrationCollection;
  settings: CourseMigrationCollection;
  startSession(): CourseMigrationSession;
  serverConsole(...args: unknown[]): void;
};

export const COURSE_ASSIGNMENT_CONTRACT_MIGRATION_KEY = 'migration.courseAssignmentContract.v2';
export const COURSE_ASSIGNMENT_PLAN_FIELD = 'courseAssignmentMigrationV2';
const PAGE_SIZE = 100;
const LEGACY_COURSE_TIMEZONE = 'America/Chicago';
const SOURCE_FIELDS = ['_id', 'courseId', 'order', 'required', 'releaseAt', 'dueAt', 'createdAt', 'updatedAt',
  'assignmentType', 'TDFId', 'title', 'memberTdfIds'] as const;
const ASSIGNMENT_PROJECTION = Object.fromEntries([...SOURCE_FIELDS, COURSE_ASSIGNMENT_PLAN_FIELD].map(key => [key, 1]));
const PATCH_FIELDS = new Set(['order', 'required', 'releaseAt', 'dueAt', 'createdAt', 'updatedAt', 'assignmentType']);
const EMPTY_PREFIX = createHash('sha256').digest('hex');
type Phase = 'courses' | 'stage-order' | 'validate-plan' | 'apply' | 'validate-result' | 'invalidate-snapshots' | 'cleanup-plan' | 'complete';
const PHASES: readonly Phase[] = ['courses', 'stage-order', 'validate-plan', 'apply', 'validate-result', 'invalidate-snapshots', 'cleanup-plan', 'complete'];
type State = {
  version: 2; revision: number; phase: Phase; startedAt: Date; cursor: string | null;
  coursesScanned: number; assignmentsPlanned: number; assignmentsScanned: number;
  snapshotsInvalidated: number; prefixHash: string; completedAt?: string;
};
type Plan = { version: 2; targetOrder: number; sourceHash: string; resultHash: string; patch: Selector };

class CourseMigrationInvariantError extends Error {}
function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new CourseMigrationInvariantError(message);
}
function record(value: unknown): value is Row {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function canonicalId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}
function hash(value: unknown): string {
  return createHash('sha256').update(serialize(value)).digest('hex');
}
function sourceHash(row: Row): string {
  // Mongo persists equal Date values independently even when the planned patch
  // shares one Date object. Hash field values separately so object aliasing in
  // memory cannot change the fingerprint of the same stored document.
  return hash(SOURCE_FIELDS.map(key => [Object.hasOwn(row, key), serialize(row[key])]));
}
function validDate(value: unknown): boolean {
  return (value instanceof Date || typeof value === 'string' || typeof value === 'number')
    && Number.isFinite(value instanceof Date ? value.getTime() : new Date(value).getTime());
}
function validateAssignment(row: Row): void {
  invariant(canonicalId(row._id) && canonicalId(row.courseId), 'Assignment requires canonical assignment and course identities');
  invariant(Number.isInteger(Number(row.order)) && Number(row.order) >= 0, 'Assignment order must be a non-negative integer');
  invariant(typeof row.required === 'boolean', 'Assignment required flag must be boolean');
  invariant((row.releaseAt === null || validDate(row.releaseAt)) && (row.dueAt === null || validDate(row.dueAt)),
    'Assignment release and due dates must be valid dates or null');
  invariant(validDate(row.createdAt) && validDate(row.updatedAt), 'Assignment creation and update dates must be valid');
  if (row.assignmentType === 'lesson') {
    invariant(canonicalId(row.TDFId) && row.title === undefined && row.memberTdfIds === undefined,
      'Lesson assignment must contain its TDF identity and no progressive fields');
  } else {
    invariant(row.assignmentType === 'progressive' && canonicalId(row.title) && row.TDFId === undefined,
      'Assignment must have a valid discriminated lesson or progressive shape');
    invariant(Array.isArray(row.memberTdfIds) && row.memberTdfIds.length >= MIN_PROGRESSIVE_MEMBERS
      && row.memberTdfIds.every(canonicalId) && new Set(row.memberTdfIds).size === row.memberTdfIds.length,
    'Progressive assignment must contain distinct canonical member identities');
  }
}
function makePlan(row: Row, targetOrder: number, now: Date): Plan {
  invariant(canonicalId(row._id) && canonicalId(row.courseId), 'Assignment requires canonical assignment and course identities');
  const patch: Selector = {};
  // Keep the v1 forward transformation, including numeric-string orders which
  // already represent their destination. Sorting always uses the original row.
  if (!Number.isInteger(Number(row.order)) || Number(row.order) !== targetOrder) patch.order = targetOrder;
  if (row.required === undefined || row.required === null) patch.required = true;
  if (row.releaseAt === undefined) patch.releaseAt = null;
  if (row.dueAt === undefined) patch.dueAt = null;
  if (!row.createdAt) patch.createdAt = now;
  if (!row.updatedAt) patch.updatedAt = now;
  if (row.assignmentType === undefined) {
    invariant(canonicalId(row.TDFId), 'Historical lesson assignment requires its TDF identity');
    patch.assignmentType = 'lesson';
    patch.updatedAt = now;
  }
  const result = { ...row, ...patch };
  validateAssignment(result);
  return { version: 2, targetOrder, sourceHash: sourceHash(row), resultHash: sourceHash(result), patch };
}
function readPlan(row: Row): Plan {
  const plan = row[COURSE_ASSIGNMENT_PLAN_FIELD];
  invariant(record(plan) && plan.version === 2 && Number.isSafeInteger(plan.targetOrder) && plan.targetOrder >= 0
    && /^[a-f0-9]{64}$/.test(plan.sourceHash) && /^[a-f0-9]{64}$/.test(plan.resultHash)
    && record(plan.patch) && Object.keys(plan.patch).every(key => PATCH_FIELDS.has(key)), 'Assignment migration plan is missing or malformed');
  return plan as Plan;
}
function readState(row: Row | null): State {
  const value = row?.value;
  invariant(row?._id === COURSE_ASSIGNMENT_CONTRACT_MIGRATION_KEY && record(value) && value.version === 2
    && PHASES.includes(value.phase) && value.startedAt instanceof Date && validDate(value.startedAt)
    && (value.cursor === null || canonicalId(value.cursor)) && /^[a-f0-9]{64}$/.test(value.prefixHash),
  'Course assignment migration checkpoint is malformed');
  for (const key of ['revision', 'coursesScanned', 'assignmentsPlanned', 'assignmentsScanned', 'snapshotsInvalidated']) {
    invariant(Number.isSafeInteger(value[key]) && value[key] >= 0, 'Course assignment migration counters are malformed');
  }
  invariant(value.phase !== 'complete' || (typeof value.completedAt === 'string' && validDate(value.completedAt)),
    'Course assignment migration completion checkpoint is malformed');
  return value as State;
}

/** Preserve v1 ordering within each course; course traversal order is immaterial. */
export function compareHistoricalCourseAssignments(a: Row, b: Row): number {
  const courseA = String(a.courseId || '');
  const courseB = String(b.courseId || '');
  if (courseA !== courseB) return courseA < courseB ? -1 : 1;
  const orderA = Number.isInteger(Number(a.order)) && Number(a.order) >= 0 ? Number(a.order) : Number.MAX_SAFE_INTEGER;
  const orderB = Number.isInteger(Number(b.order)) && Number(b.order) >= 0 ? Number(b.order) : Number.MAX_SAFE_INTEGER;
  return orderA - orderB || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a._id).localeCompare(String(b._id));
}

/**
 * Forward: v1 missing metadata defaults and lesson discrimination, with the
 * exact historical per-course ordering. No cardinality cap or field backfill
 * outside that contract. A complete, validated durable plan precedes ordering
 * writes. Each bounded page and its checkpoint commit together; restart resumes
 * the recorded phase. Temporary plan fields are removed before completion.
 */
export async function migrateCourseAssignmentContract(deps: CourseAssignmentMigrationDeps): Promise<void> {
  let phase: Phase | 'initialize' = 'initialize';
  try {
    const initial: State = { version: 2, revision: 0, phase: 'courses', startedAt: new Date(), cursor: null,
      coursesScanned: 0, assignmentsPlanned: 0, assignmentsScanned: 0, snapshotsInvalidated: 0, prefixHash: EMPTY_PREFIX };
    try {
      await deps.settings.updateOne({ _id: COURSE_ASSIGNMENT_CONTRACT_MIGRATION_KEY },
        { $setOnInsert: { key: COURSE_ASSIGNMENT_CONTRACT_MIGRATION_KEY, value: initial } }, { upsert: true });
    } catch (error) {
      // A competing startup may have created the unique control identity. Only
      // that committed, validated state can resolve this initialization race.
      if ((error as { code?: unknown })?.code !== 11000
        || !await deps.settings.findOne({ _id: COURSE_ASSIGNMENT_CONTRACT_MIGRATION_KEY })) throw error;
    }

    const load = async () => readState(await deps.settings.findOne({ _id: COURSE_ASSIGNMENT_CONTRACT_MIGRATION_KEY }));
    async function commit(expected: State, next: State, work: (session: CourseMigrationSession) => Promise<void>) {
      const session = deps.startSession();
      let committed = false;
      try {
        await session.withTransaction(async () => {
          committed = false;
          const current = readState(await deps.settings.findOne({ _id: COURSE_ASSIGNMENT_CONTRACT_MIGRATION_KEY }, { session }));
          if (current.revision !== expected.revision) return;
          const lock = await deps.settings.updateOne({ _id: COURSE_ASSIGNMENT_CONTRACT_MIGRATION_KEY, 'value.revision': expected.revision },
            { $inc: { 'value.revision': 1 } }, { session });
          invariant(lock.matchedCount === 1, 'Course assignment migration checkpoint ownership was lost');
          await work(session);
          await deps.settings.updateOne({ _id: COURSE_ASSIGNMENT_CONTRACT_MIGRATION_KEY },
            { $set: { value: { ...next, revision: expected.revision + 1 } } }, { session });
          committed = true;
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
        if (committed) deps.serverConsole('[Course assignment migration]', { phase: next.phase,
          coursesScanned: next.coursesScanned, assignmentsPlanned: next.assignmentsPlanned,
          assignmentsScanned: next.assignmentsScanned, snapshotsInvalidated: next.snapshotsInvalidated,
          historicalTimezone: LEGACY_COURSE_TIMEZONE });
        return committed;
      } finally { await session.endSession(); }
    }
    const page = (collection: CourseMigrationCollection, cursor: string | null, projection: Selector) => collection.find(
      cursor === null ? {} : { _id: { $gt: cursor } }, { projection, sort: { _id: 1 }, limit: PAGE_SIZE }).toArray();
    const cursorOf = (rows: Row[]) => {
      const id = rows.at(-1)?._id;
      invariant(canonicalId(id), 'Migration source requires canonical string identities');
      return id;
    };
    const rereadPage = async (collection: CourseMigrationCollection, ids: string[], projection: Selector,
      session: CourseMigrationSession, missingMessage: string) => {
      const rows = await collection.find({ _id: { $in: ids } },
        { session, projection, sort: { _id: 1 }, limit: PAGE_SIZE }).toArray();
      invariant(rows.length === ids.length, missingMessage);
      return new Map(rows.map(row => [row._id, row]));
    };
    const writePage = async (collection: CourseMigrationCollection, operations: UpdateOperation[],
      session: CourseMigrationSession) => {
      if (!operations.length) return;
      const result = await collection.bulkWrite(operations, { session, ordered: true });
      invariant(result.matchedCount === operations.length, 'Migration page changed while its updates were applied');
    };
    async function* assignmentSource() {
      let cursor: string | null = null;
      while (true) {
        const rows = await page(deps.assignments, cursor, ASSIGNMENT_PROJECTION);
        if (!rows.length) return;
        cursor = cursorOf(rows);
        yield* rows;
      }
    }

    while (true) {
      const state = await load();
      phase = state.phase;
      if (state.phase === 'complete') return;
      if (state.phase === 'courses') {
        const rows = await page(deps.courses, state.cursor, { _id: 1 });
        const next = rows.length ? { ...state, cursor: cursorOf(rows), coursesScanned: state.coursesScanned + rows.length }
          : { ...state, phase: 'stage-order' as const, cursor: null };
        await commit(state, next, async session => {
          if (!rows.length) return;
          const current = await rereadPage(deps.courses, rows.map(row => row._id), { _id: 1, visibility: 1, timezone: 1 },
            session, 'Course disappeared during metadata migration');
          const updates: UpdateOperation[] = [];
          for (const candidate of rows) {
            const row = current.get(candidate._id)!;
            invariant(canonicalId(row._id), 'Course requires a canonical identity');
            const patch: Selector = {};
            if (row.visibility === undefined || row.visibility === null) patch.visibility = 'private';
            invariant(row.visibility === undefined || row.visibility === null || row.visibility === 'private' || row.visibility === 'public',
              'Course visibility must be private or public');
            if (row.timezone === undefined || row.timezone === null || row.timezone === '') patch.timezone = LEGACY_COURSE_TIMEZONE;
            const timezone = patch.timezone ?? row.timezone;
            invariant(typeof timezone === 'string' && timezone.trim().length > 0, 'Course timezone must be a valid IANA timezone');
            try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(state.startedAt); }
            catch { throw new CourseMigrationInvariantError('Course timezone must be a valid IANA timezone'); }
            if (Object.keys(patch).length) {
              updates.push({ updateOne: { filter: { _id: row._id }, update: { $set: patch } } });
            }
          }
          await writePage(deps.courses, updates, session);
        });
        continue;
      }
      if (state.phase === 'stage-order') {
        let expected = state;
        let staged = 0;
        let prefixHash = EMPTY_PREFIX;
        let courseId: string | null = null;
        let order = 0;
        let stale = false;
        let batch: Array<{ id: string; plan: Plan }> = [];
        const flush = async () => {
          if (!batch.length) return true;
          const next = { ...expected, assignmentsPlanned: staged, prefixHash };
          const pending = batch;
          const done = await commit(expected, next, async session => {
            const currentRows = await rereadPage(deps.assignments, pending.map(entry => entry.id), ASSIGNMENT_PROJECTION,
              session, 'Assignment disappeared while its ordering plan was staged');
            const updates: UpdateOperation[] = [];
            for (const entry of pending) {
              const current = currentRows.get(entry.id)!;
              invariant(current && current[COURSE_ASSIGNMENT_PLAN_FIELD] === undefined && sourceHash(current) === entry.plan.sourceHash,
                'Assignment changed while its ordering plan was staged');
              updates.push({ updateOne: { filter: { _id: entry.id }, update: { $set: { [COURSE_ASSIGNMENT_PLAN_FIELD]: entry.plan } } } });
            }
            await writePage(deps.assignments, updates, session);
          });
          if (done) expected = { ...next, revision: expected.revision + 1 };
          batch = [];
          return done;
        };
        try {
          for await (const row of boundedExternalSort(assignmentSource(), compareHistoricalCourseAssignments)) {
            if (courseId !== row.courseId) { courseId = row.courseId; order = 0; }
            const plan = makePlan(row, order++, state.startedAt);
            staged += 1;
            prefixHash = hash([prefixHash, row._id, plan.sourceHash, plan.targetOrder]);
            if (staged <= state.assignmentsPlanned) {
              const saved = readPlan(row);
              invariant(saved.sourceHash === plan.sourceHash && saved.resultHash === plan.resultHash && saved.targetOrder === plan.targetOrder,
                'Previously staged assignment ordering source changed');
              if (staged === state.assignmentsPlanned) invariant(prefixHash === state.prefixHash, 'Assignment ordering prefix changed');
              continue;
            }
            batch.push({ id: row._id, plan });
            if (batch.length === PAGE_SIZE && !await flush()) { stale = true; break; }
          }
          if (stale || !await flush()) continue;
          invariant(staged >= state.assignmentsPlanned, 'Assignment ordering source lost previously staged rows');
          await commit(expected, { ...expected, phase: 'validate-plan', cursor: null, assignmentsScanned: 0 }, async () => undefined);
        } catch (error) {
          // Another startup can finish staging and apply its plan while this
          // process is reading sort runs. Only a newer committed checkpoint
          // permits retry; unchanged source failures remain fatal.
          if (error instanceof CourseMigrationInvariantError && (await load()).revision !== expected.revision) continue;
          throw error;
        }
        continue;
      }
      if (state.phase === 'validate-plan' || state.phase === 'apply' || state.phase === 'validate-result') {
        const rows = await page(deps.assignments, state.cursor, { _id: 1 });
        if (!rows.length) {
          invariant(state.assignmentsScanned === state.assignmentsPlanned, 'Assignment migration source count changed');
          const nextPhase = state.phase === 'validate-plan' ? 'apply' : state.phase === 'apply' ? 'validate-result' : 'invalidate-snapshots';
          await commit(state, { ...state, phase: nextPhase, cursor: null, assignmentsScanned: 0 }, async () => undefined);
          continue;
        }
        await commit(state, { ...state, cursor: cursorOf(rows), assignmentsScanned: state.assignmentsScanned + rows.length }, async session => {
          const current = await rereadPage(deps.assignments, rows.map(row => row._id), ASSIGNMENT_PROJECTION,
            session, 'Assignment disappeared during contract migration');
          const updates: UpdateOperation[] = [];
          for (const candidate of rows) {
            const row = current.get(candidate._id)!;
            const plan = readPlan(row);
            invariant(sourceHash(row) === (state.phase === 'validate-result' ? plan.resultHash : plan.sourceHash),
              'Assignment source changed during contract migration');
            if (state.phase === 'apply') {
              if (Object.keys(plan.patch).length) updates.push({ updateOne: { filter: { _id: row._id }, update: { $set: plan.patch } } });
            } else validateAssignment({ ...row, ...(state.phase === 'validate-plan' ? plan.patch : {}) });
          }
          await writePage(deps.assignments, updates, session);
        });
        continue;
      }
      const collection = state.phase === 'invalidate-snapshots' ? deps.snapshots : deps.assignments;
      const rows = await page(collection, state.cursor, { _id: 1 });
      if (!rows.length) {
        const next: State = state.phase === 'invalidate-snapshots'
          ? { ...state, phase: 'cleanup-plan', cursor: null }
          : { ...state, phase: 'complete', cursor: null, completedAt: new Date().toISOString() };
        await commit(state, next, async () => undefined);
        continue;
      }
      await commit(state, { ...state, cursor: cursorOf(rows), snapshotsInvalidated: state.snapshotsInvalidated
        + (state.phase === 'invalidate-snapshots' ? rows.length : 0) }, async session => {
        const selector = { _id: { $in: rows.map(row => row._id) } };
        if (state.phase === 'invalidate-snapshots') await deps.snapshots.updateMany(selector,
          { $set: { invalidatedAt: new Date(), rebuildReason: 'course-assignment-contract-migrated' } }, { session });
        else await deps.assignments.updateMany(selector, { $unset: { [COURSE_ASSIGNMENT_PLAN_FIELD]: '' } }, { session });
      });
    }
  } catch (error) {
    // Driver errors can include raw document keys. Retain only an owned invariant
    // message or the failing phase; startup's existing fatal owner handles exit.
    const detail = error instanceof CourseMigrationInvariantError ? `: ${error.message}` : '';
    deps.serverConsole('[Course assignment migration] failed', { phase });
    throw new Error(`Course assignment contract migration failed during ${phase}${detail}`);
  }
}
