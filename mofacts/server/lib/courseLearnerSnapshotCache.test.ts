import { expect } from 'chai';
import type { CourseAssignmentSummary } from '../../common/courseAssignments.contracts';
import { COURSE_SNAPSHOT_VERSION, createCourseLearnerSnapshotCacheHelpers } from './courseLearnerSnapshotCache';

type Row = Record<string, any>;

function matches(row: Row, selector: Row): boolean {
  return Object.entries(selector).every(([key, expected]) => {
    if (key === '$or') return expected.some((branch: Row) => matches(row, branch));
    const actual = row[key];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$in' in expected) return Array.isArray(actual)
        ? actual.some((value) => expected.$in.includes(value))
        : expected.$in.includes(actual);
      if ('$exists' in expected) return expected.$exists ? actual !== undefined : actual === undefined;
    }
    return Array.isArray(actual) ? actual.includes(expected) : actual === expected;
  });
}

function collection(initialRows: Row[] = []) {
  const rows = initialRows.map((row) => ({ ...row }));
  const writes: Row[] = [];
  let findCount = 0;
  return {
    rows,
    writes,
    findCount: () => findCount,
    find(selector: Row = {}) {
      findCount += 1;
      return { fetchAsync: async () => rows.filter((row) => matches(row, selector)) };
    },
    async findOneAsync(selector: Row) {
      return rows.find((row) => matches(row, selector)) || null;
    },
    async updateAsync(selector: Row, modifier: Row, options: Row = {}) {
      writes.push(modifier.$set);
      const selected = rows.filter((row) => matches(row, selector));
      if (!selected.length && options.upsert) {
        rows.push({ ...selector, ...modifier.$set });
        return 1;
      }
      for (const row of selected) Object.assign(row, modifier.$set);
      return selected.length;
    },
  };
}

const START = Date.UTC(2026, 9, 28, 12);

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const date = new Date(value as string | number | Date);
  return Number.isFinite(date.getTime()) ? date : null;
}

function fixture(options: {
  userId?: string;
  roles?: string[];
  enrolled?: boolean;
  course?: Row;
  assignment?: Row;
  cache?: Row[];
} = {}) {
  const userId = options.userId ?? 'student';
  let now = START;
  const courses = collection([{
    _id: 'course', courseName: 'Course', teacherUserId: 'teacher', visibility: 'private',
    timezone: 'America/Chicago', beginDate: null, endDate: null, ...options.course,
  }]);
  const assignments = collection([{
    _id: 'assignment', courseId: 'course', assignmentType: 'lesson', TDFId: 'lesson',
    title: 'Lesson', order: 0, releaseAt: null, dueAt: null, required: true, ...options.assignment,
  }]);
  const cache = collection(options.cache);
  const log: unknown[][] = [];
  const helpers = createCourseLearnerSnapshotCacheHelpers({
    Courses: courses,
    Sections: collection([{ _id: 'section', courseId: 'course', sectionName: '001' }]),
    SectionUserMap: collection(options.enrolled === false ? [] : [{ _id: 'enrollment', userId, sectionId: 'section' }]),
    Assignments: assignments,
    Tdfs: collection(),
    usersCollection: collection([{ _id: 'teacher', username: 'Teacher' }]),
    UserDashboardCache: collection(),
    CourseLearnerSnapshotCache: cache,
    serverConsole: (...args) => { log.push(args); },
    now: () => now,
    getMethodAuthorizationDeps: () => ({
      userIsInRoleAsync: async (_userId, roles) => roles.some((role) => options.roles?.includes(role)),
    }),
    getUserDisplayIdentifier: (user) => user.username,
    normalizeCourseVisibility: (value) => value === 'public' ? 'public' : 'private',
    normalizeTimezone: (value) => String(value),
    parseNullablePersistedDate: parseDate,
    normalizeAssignmentRow: (row, _index, summaries, at = new Date(now)): CourseAssignmentSummary | null => {
      const summary = summaries.get(row.TDFId);
      if (!summary) return null;
      return {
        assignmentId: row._id, courseId: row.courseId, assignmentType: 'lesson', TDFId: row.TDFId,
        title: summary.title, order: 0, releaseAt: parseDate(row.releaseAt), dueAt: parseDate(row.dueAt),
        required: true, createdAt: null, updatedAt: null,
        availability: row.releaseAt && new Date(row.releaseAt).getTime() > at.getTime() ? 'scheduled' : 'available',
      };
    },
    getTdfSummariesByIds: async (ids) => new Map(ids.map((id) => [id, {
      TDFId: id, title: 'Lesson', displayName: 'Lesson', fileName: 'lesson.json', tags: [], currentStimuliSetId: 'stimuli',
    }])),
  });
  return { courses, assignments, cache, log, setTime: (time: number) => { now = time; },
    read: () => helpers.ensureLearnerCoursesSnapshot(userId) };
}

describe('course learner snapshot temporal validity', function() {
  it('reuses a snapshot before release and rebuilds at the exact release without a dashboard update', async function() {
    const test = fixture({ assignment: { releaseAt: new Date(START + 1000) } });
    const scheduled = await test.read();
    expect(scheduled.expiresAt).to.equal(START + 1000);
    expect(scheduled.assignedCourses[0]?.assignments[0]?.availability).to.equal('scheduled');
    test.setTime(START + 999);
    expect((await test.read()).source).to.equal('cache');
    expect(test.courses.findCount()).to.equal(1);

    test.setTime(START + 1000);
    const released = await test.read();
    expect(released.source).to.equal('rebuilt');
    expect(released.assignedCourses[0]?.assignments[0]?.availability).to.equal('available');
    expect(released.expiresAt).to.equal(null);
    expect(test.cache.rows[0]?.rebuildReason).to.equal('expired');
  });

  for (const visibility of ['private', 'public']) {
    it(`tracks a hidden future ${visibility} course and preserves its inclusive end timestamp`, async function() {
      const test = fixture({ enrolled: visibility === 'private', course: {
        visibility, beginDate: new Date(START + 1000), endDate: new Date(START + 2000),
      } });
      const hidden = await test.read();
      expect([...hidden.assignedCourses, ...hidden.publicCourses]).to.have.length(0);
      expect(hidden.expiresAt).to.equal(START + 1000);

      test.setTime(START + 1000);
      const opened = await test.read();
      expect([...opened.assignedCourses, ...opened.publicCourses]).to.have.length(1);
      expect(opened.expiresAt).to.equal(START + 2001);
      test.setTime(START + 2000);
      expect((await test.read()).source).to.equal('cache');
      test.setTime(START + 2001);
      const closed = await test.read();
      expect([...closed.assignedCourses, ...closed.publicCourses]).to.have.length(0);
      expect(closed.expiresAt).to.equal(null);
    });
  }

  it('refreshes overdue presentation one millisecond after dueAt without locking assignment access', async function() {
    const test = fixture({ assignment: { dueAt: new Date(START + 1000) } });
    const before = await test.read();
    expect(before.expiresAt).to.equal(START + 1001);
    test.setTime(START + 1000);
    expect((await test.read()).source).to.equal('cache');
    test.setTime(START + 1001);
    const overdue = await test.read();
    expect(overdue.source).to.equal('rebuilt');
    expect(overdue.assignedCourses[0]?.assignments[0]?.availability).to.equal('available');
    expect(overdue.expiresAt).to.equal(null);
  });

  for (const role of ['teacher', 'admin']) {
    it(`keeps ${role} bypass for course dates and release while scheduling the visible due label`, async function() {
      const test = fixture({
        userId: role === 'teacher' ? 'teacher' : 'admin', roles: [role], enrolled: false,
        course: { beginDate: new Date(START + 2000), endDate: new Date(START + 3000) },
        assignment: { releaseAt: new Date(START + 1000), dueAt: new Date(START + 4000) },
      });
      const privileged = await test.read();
      expect(privileged.assignedCourses[0]?.assignments[0]?.availability).to.equal('available');
      expect(privileged.expiresAt).to.equal(START + 4001);
      test.setTime(START + 3500);
      expect((await test.read()).source).to.equal('cache');
      test.setTime(START + 4001);
      expect((await test.read()).source).to.equal('rebuilt');
    });
  }

  it('does not turn public browsing into scheduled learner access for an unenrolled viewer', async function() {
    const test = fixture({ enrolled: false, course: { visibility: 'public' }, assignment: { releaseAt: new Date(START + 1000) } });
    const browsing = await test.read();
    expect(browsing.publicCourses[0]?.assignments[0]?.availability).to.equal('unavailable');
    expect(browsing.expiresAt).to.equal(null);
    test.setTime(START + 1000);
    expect((await test.read()).source).to.equal('cache');
  });

  it('keeps a cache with no remaining temporal boundary until a source invalidation requires a rebuild', async function() {
    const test = fixture();
    expect((await test.read()).expiresAt).to.equal(null);
    test.setTime(START + 86400000);
    expect((await test.read()).source).to.equal('cache');
    expect(test.courses.findCount()).to.equal(1);
  });

  it('returns the current server time on every response without persisting transport clock metadata', async function() {
    const test = fixture();
    const rebuilt = await test.read();
    expect(rebuilt.serverNow).to.equal(START);
    expect(test.cache.rows[0]?.snapshot).not.to.have.property('serverNow');
    test.setTime(START + 500);
    const cached = await test.read();
    expect(cached.source).to.equal('cache');
    expect(cached.generatedAt).to.equal(START);
    expect(cached.serverNow).to.equal(START + 500);
    expect(test.cache.rows[0]?.snapshot).not.to.have.property('serverNow');
  });

  it('captures generation before source reads and restarts once when a boundary is crossed during rebuild', async function() {
    const test = fixture({ assignment: { releaseAt: new Date(START + 1000) } });
    const findCourses = test.courses.find.bind(test.courses);
    test.courses.find = (selector = {}) => {
      test.setTime(START + 2000);
      return findCourses(selector);
    };
    const refreshed = await test.read();
    expect(test.cache.writes[0]?.snapshot.generatedAt).to.equal(START);
    expect(test.cache.writes[0]?.snapshot.expiresAt).to.equal(START + 1000);
    expect(refreshed.generatedAt).to.equal(START + 2000);
    expect(refreshed.assignedCourses[0]?.assignments[0]?.availability).to.equal('available');
    expect(refreshed.expiresAt).to.equal(null);
    expect(test.courses.findCount()).to.equal(2);
    expect(test.cache.rows[0]?.rebuildReason).to.equal('boundary-crossed');
  });

  it('rejects an unstable result after two source reads instead of returning an expired snapshot', async function() {
    const test = fixture({ assignment: { releaseAt: new Date(START + 1000), dueAt: new Date(START + 3000) } });
    const findCourses = test.courses.find.bind(test.courses);
    test.courses.find = (selector = {}) => {
      test.setTime(START + (test.courses.findCount() === 0 ? 2000 : 4000));
      return findCourses(selector);
    };
    let failure: unknown;
    try {
      await test.read();
    } catch (error) {
      failure = error;
    }
    expect(failure).to.be.instanceOf(Error);
    expect((failure as Error).message).to.equal('Course snapshot could not be read before its next time boundary. Try again.');
    expect(test.courses.findCount()).to.equal(2);
    expect(test.log.filter((entry) => entry[0] === '[CourseSnapshot] boundary-crossed during derived snapshot rebuild')).to.have.length(2);
  });

  it('checks expiry again after asynchronous validation of an otherwise reusable cache hit', async function() {
    const test = fixture({ assignment: { releaseAt: new Date(START + 1000) } });
    await test.read();
    test.setTime(START + 999);
    const findAssignments = test.assignments.find.bind(test.assignments);
    test.assignments.find = (selector = {}) => {
      test.setTime(START + 1000);
      return findAssignments(selector);
    };
    const refreshed = await test.read();
    expect(refreshed.source).to.equal('rebuilt');
    expect(refreshed.assignedCourses[0]?.assignments[0]?.availability).to.equal('available');
  });

  for (const invalidExpiry of [undefined, Number.NaN, 'not-a-timestamp', START + 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    it(`explicitly rebuilds invalid derived expiry metadata (${String(invalidExpiry)})`, async function() {
      const test = fixture();
      await test.read();
      test.cache.rows[0]!.snapshot.expiresAt = invalidExpiry;
      const rebuilt = await test.read();
      expect(rebuilt.source).to.equal('rebuilt');
      expect(rebuilt.expiresAt).to.equal(null);
      expect(test.cache.rows[0]?.rebuildReason).to.equal('invalid-expiry');
      expect(test.log.some((entry) => (entry[1] as Row)?.reason === 'invalid-expiry')).to.equal(true);
    });
  }

  it('rebuilds v5 from source rather than interpreting a stored v4 snapshot', async function() {
    const test = fixture({ cache: [{
      userId: 'student', version: 4, invalidatedAt: null, generatedAt: new Date(START),
      snapshot: { version: 4, assignedCourses: [], publicCourses: [] },
    }] });
    const rebuilt = await test.read();
    expect(rebuilt.version).to.equal(COURSE_SNAPSHOT_VERSION);
    expect(rebuilt.source).to.equal('rebuilt');
    expect(rebuilt.assignedCourses).to.have.length(1);
    expect(test.cache.rows.some((row) => row.version === COURSE_SNAPSHOT_VERSION && row.snapshot.expiresAt === null)).to.equal(true);
  });
});
