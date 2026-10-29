import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import { createCourseMethods } from './courseMethods';
import { COURSE_SNAPSHOT_VERSION } from '../lib/courseLearnerSnapshotCache';

function cursor(rows: any[] = []) {
  return {
    async fetchAsync() {
      return rows;
    },
    async countAsync() {
      return rows.length;
    },
  };
}

function matchesSelector(row: any, selector: Record<string, any> = {}): boolean {
  if (Array.isArray(selector.$or)) {
    if (!selector.$or.some((branch: Record<string, any>) => matchesSelector(row, branch))) return false;
  }
  return Object.entries(selector).every(([key, expected]) => {
    if (key === '$or') return true;
    const actual = row[key];
    if (Array.isArray(expected)) return JSON.stringify(actual) === JSON.stringify(expected);
    if (expected === null) return actual === null || actual === undefined;
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$in' in expected) {
        return Array.isArray(actual)
          ? actual.some((value) => expected.$in.includes(value))
          : expected.$in.includes(actual);
      }
      return Object.entries(expected).every(([operator, value]) => {
        if (operator === '$ne') return actual !== value;
        if (operator === '$exists') return value ? actual !== undefined : actual === undefined;
        return false;
      });
    }
    if (Array.isArray(actual)) return actual.includes(expected);
    return actual === expected;
  });
}

function createMemoryCollection(initialRows: any[] = []) {
  const rows = initialRows.map((row) => ({ ...row }));
  return {
    rows,
    find: (selector: Record<string, any> = {}) => cursor(rows.filter((row) => matchesSelector(row, selector))),
    async findOneAsync(selector: Record<string, any> = {}) {
      return rows.find((row) => matchesSelector(row, selector)) || null;
    },
    async insertAsync(document: any) {
      const id = document._id || `inserted-${rows.length + 1}`;
      rows.push({ _id: id, ...document });
      return id;
    },
    async updateAsync(selector: Record<string, any>, modifier: any, options: Record<string, any> = {}) {
      let count = 0;
      for (const row of rows) {
        if (!matchesSelector(row, selector)) continue;
        if (modifier?.$set) {
          for (const [path, value] of Object.entries(modifier.$set)) {
            const parts = path.split('.');
            let target = row;
            for (const part of parts.slice(0, -1)) target = target[part] ||= {};
            target[parts[parts.length - 1]!] = value;
          }
        }
        if (!modifier?.$set) Object.assign(row, modifier);
        count += 1;
      }
      if (count === 0 && options.upsert) {
        const document = { ...selector, ...(modifier?.$set || modifier || {}) };
        rows.push(document);
        count = 1;
      }
      return count;
    },
    async removeAsync(selector: Record<string, any>) {
      let count = 0;
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (matchesSelector(rows[index], selector)) {
          rows.splice(index, 1);
          count += 1;
        }
      }
      return count;
    },
    rawCollection: () => ({
      aggregate: () => ({
        async toArray() {
          return [];
        },
      }),
    }),
  };
}

function createDeps(overrides: Record<string, any> = {}) {
  const collection = {
    find: () => cursor(),
    async findOneAsync() {
      return null;
    },
    async insertAsync() {
      return 'inserted-id';
    },
    async updateAsync() {
      return 1;
    },
    async removeAsync() {
      return 1;
    },
    rawCollection: () => ({
      aggregate: () => ({
        async toArray() {
          return [];
        },
      }),
    }),
  };
  return {
    serverConsole: () => undefined,
    Roles: { getUsersInRoleAsync: async () => cursor() },
    Courses: collection,
    Sections: collection,
    SectionUserMap: collection,
    Assignments: collection,
    Tdfs: collection,
    DynamicAssets: collection,
    Histories: {
      async findOneAsync() {
        return null;
      },
    },
    itemSourceSentences: {
      find: () => ({ sourceSentences: [] }),
    },
    usersCollection: {
      find: () => cursor(),
      async findOneAsync() {
        return null;
      },
      async updateAsync() {
        return 1;
      },
    },
    getMethodAuthorizationDeps: () => ({
      async userIsInRoleAsync(_userId: string, roles: string[]) {
        return roles.includes('admin');
      },
    }),
    getUserDisplayIdentifier: () => 'user',
    normalizeCanonicalId: (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null,
    sendEmail: () => undefined,
    emailFrom: 'noreply@example.test',
    thisServerUrl: 'https://mofacts.example.test',
    getStimuliSetById: async () => [],
    removeRuntimeTdfSecrets: <T>(value: T) => value,
    ...overrides,
  };
}

function progressiveMember(id: string, stimuliSetId: string) {
  return {
    _id: id,
    ownerId: 'teacher-user',
    stimuliSetId,
    content: {
      fileName: `${id}.json`,
      tdfs: {
        tutor: {
          setspec: { lessonname: id },
          unit: [
            { unitname: 'Instructions', unitinstructions: '<p>Read</p>' },
            { unitname: `${id} practice`, learningsession: { clusterlist: '0', maxTrials: 0 } },
          ],
        },
      },
    },
    rawStimuliFile: {
      setspec: {
        clusters: [{
          clusterKC: `${id}-cluster`,
          stims: [{ stimulusKC: `${id}-stim`, response: { correctResponse: id } }],
        }],
      },
    },
    stimuli: [{
      stimuliSetId,
      clusterKC: `${id}-cluster`,
      stimulusKC: `${id}-stim`,
      correctResponse: id,
    }],
  };
}

function createCachedProgressiveLaunch(userId = 'student-user') {
  const courses = createMemoryCollection([{
    _id: 'course-progressive', courseName: 'Progressive Course', teacherUserId: 'teacher-user',
    semester: 'current', visibility: 'private', timezone: 'America/Chicago',
  }]);
  const sections = createMemoryCollection([{ _id: 'section-current', courseId: 'course-progressive', sectionName: '001' }]);
  const enrollments = createMemoryCollection([{ _id: 'enrollment-current', sectionId: 'section-current', userId }]);
  const assignments = createMemoryCollection([{
    _id: 'assignment-progressive', courseId: 'course-progressive', assignmentType: 'progressive',
    title: 'Progressive Assignment', memberTdfIds: ['lesson-1', 'lesson-2'], releaseAt: null,
  }]);
  const snapshots = createMemoryCollection([{
    userId, version: COURSE_SNAPSHOT_VERSION, invalidatedAt: null, generatedAt: new Date(),
    assignedCourseIds: ['course-progressive'], assignmentIds: ['assignment-progressive'],
    publicCourseIds: [],
    snapshot: {
      expiresAt: null,
      assignedCourses: [{ courseId: 'course-progressive', assignments: [{
        assignmentId: 'assignment-progressive', courseId: 'course-progressive',
        assignmentType: 'progressive', availability: 'available',
      }] }],
      publicCourses: [],
    },
  }]);
  const tdfs = createMemoryCollection([progressiveMember('lesson-1', 'set-1'), progressiveMember('lesson-2', 'set-2')]);
  let memberReads = 0;
  const methods = createCourseMethods(createDeps({
    Courses: courses,
    Sections: sections,
    SectionUserMap: enrollments,
    Assignments: assignments,
    Tdfs: {
      ...tdfs,
      find(selector: Record<string, any>) {
        memberReads += 1;
        return tdfs.find(selector);
      },
    },
    CourseLearnerSnapshotCache: snapshots,
    UserDashboardCache: createMemoryCollection(),
    getMethodAuthorizationDeps: () => ({
      async userIsInRoleAsync(id: string, roles: string[]) {
        return id === 'admin-user' && roles.includes('admin');
      },
    }),
  }));
  return { methods, courses, sections, enrollments, snapshots, memberReads: () => memberReads };
}

describe('course method operational errors', function() {
  it('discovers teachers from current role assignments while ignoring obsolete user role fields', async function() {
    const assignments = new Set<string>();
    const users = [
      { _id: 'current-teacher', username: 'Teacher', email_canonical: 'teacher@example.test', emails: [{ address: 'teacher@example.test', verified: true }], roles: [], privateSetting: 'private' },
      { _id: 'former-teacher', username: 'Former teacher', email_canonical: 'former@example.test', emails: [], roles: ['teacher'] },
    ];
    const queries: Array<{ role: string; options: unknown }> = [];
    const methods = createCourseMethods(createDeps({
      Roles: {
        async getUsersInRoleAsync(role: string, options: { queryOptions: { fields: Record<string, 1> } }) {
          queries.push({ role, options });
          return cursor(users.filter(user => assignments.has(user._id)).map(user => ({
            _id: user._id,
            username: user.username,
            email_canonical: user.email_canonical,
            emails: user.emails.map(email => ({ address: email.address })),
          })));
        },
      },
      usersCollection: {
        find: () => { throw new Error('Teacher discovery must not query obsolete users.roles'); },
        findOneAsync: async () => null,
        updateAsync: async () => 0,
      },
      getUserDisplayIdentifier: (user: any) => user.email_canonical,
    }));

    expect(await methods.getAllTeachers.call({ userId: 'learner' })).to.deep.equal([]);
    assignments.add('current-teacher');
    expect(await methods.getAllTeachers.call({ userId: 'learner' })).to.deep.equal([{
      _id: 'current-teacher', username: 'teacher@example.test', displayIdentifier: 'teacher@example.test',
      email_canonical: 'teacher@example.test', emails: [{ address: 'teacher@example.test' }],
    }]);
    assignments.delete('current-teacher');
    expect(await methods.getAllTeachers.call({ userId: 'learner' })).to.deep.equal([]);
    expect(queries).to.have.length(3);
    for (const query of queries) expect(query).to.deep.equal({
      role: 'teacher',
      options: { queryOptions: { fields: { _id: 1, username: 1, email_canonical: 1, 'emails.address': 1 } } },
    });
  });

  it('rejects teacher discovery before reading role assignments for a signed-out caller', async function() {
    let queries = 0;
    const methods = createCourseMethods(createDeps({
      Roles: { async getUsersInRoleAsync() { queries++; return cursor(); } },
    }));
    try {
      await methods.getAllTeachers.call({ userId: null });
      expect.fail('Expected teacher discovery to require login');
    } catch (error) {
      expect(error).to.be.instanceOf(Meteor.Error);
      expect((error as Meteor.Error).error).to.equal(401);
    }
    expect(queries).to.equal(0);
  });

  it('reads and removes exceptions by assignment without matching another course or old formats', async function() {
    const date = new Date('2026-09-10T12:00:00Z');
    const users = createMemoryCollection([{ _id: 'student', dueDateExceptions: [
      { assignmentId: 'other', courseId: 'other-course', TDFId: 'lesson', date },
      { tdfId: 'lesson', classId: 'course', date },
      { TDFId: 'lesson', courseId: 'course', date },
      { assignmentId: 'target', courseId: 'course', TDFId: 'lesson', date },
    ] }]);
    const methods = createCourseMethods(createDeps({
      usersCollection: users,
      Courses: createMemoryCollection([{ _id: 'course', teacherUserId: 'teacher' }]),
      Assignments: createMemoryCollection([{ _id: 'target', courseId: 'course', assignmentType: 'lesson', TDFId: 'lesson' }]),
    }));
    expect(await methods.checkForUserException.call({ userId: 'student' }, 'student', 'target')).to.equal(date.toLocaleDateString());
    expect(await methods.checkForUserException.call({ userId: 'student' }, 'student', 'lesson')).to.equal(false);
    await methods.removeUserDueDateException.call({ userId: 'teacher' }, 'student', 'lesson', 'course', 'target');
    expect(users.rows[0].dueDateExceptions).to.have.length(3);
    expect(users.rows[0].dueDateExceptions[0].assignmentId).to.equal('other');
    expect(await methods.checkForUserException.call({ userId: 'student' }, 'student', 'target')).to.equal(false);
  });
  it('returns an empty array for a valid empty broad course listing', async function() {
    const methods = createCourseMethods(createDeps());

    const result = await methods.getAllCourses.call({ userId: 'admin-user' });

    expect(result).to.deep.equal([]);
  });

  it('throws Meteor.Error instead of returning null for listing failures', async function() {
    const methods = createCourseMethods(createDeps({
      Courses: {
        ...createDeps().Courses,
        find: () => ({
          async fetchAsync() {
            throw new Error('database unavailable');
          },
        }),
      },
    }));

    try {
      await methods.getAllCourses.call({ userId: 'admin-user' });
      expect.fail('Expected getAllCourses to throw');
    } catch (error) {
      expect(error).to.be.instanceOf(Meteor.Error);
      expect((error as Meteor.Error).error).to.equal('course-operation-failed');
      expect((error as Meteor.Error).reason).to.equal('getAllCourses failed');
    }
  });
});

describe('course assignment metadata methods', function() {
  it('defaults new courses to private visibility and persists explicit timezone metadata', async function() {
    const courses = createMemoryCollection();
    const deps = createDeps({
      Courses: courses,
      Sections: createMemoryCollection(),
      SectionUserMap: createMemoryCollection(),
      CourseLearnerSnapshotCache: createMemoryCollection(),
      UserDashboardCache: createMemoryCollection(),
    });
    const methods = createCourseMethods(deps);

    await methods.addCourse.call({ userId: 'teacher-user' }, {
      courseName: 'Intro Course',
      semester: 'current',
      timezone: 'America/Chicago',
      beginDate: null,
      endDate: null,
      sections: ['A'],
    });

    expect(courses.rows[0]).to.include({
      courseName: 'Intro Course',
      teacherUserId: 'teacher-user',
      visibility: 'private',
      timezone: 'America/Chicago',
    });
  });

  it('creates a default section for new courses when no section names are supplied', async function() {
    const sections = createMemoryCollection();
    const methods = createCourseMethods(createDeps({
      Courses: createMemoryCollection(),
      Sections: sections,
      SectionUserMap: createMemoryCollection(),
      CourseLearnerSnapshotCache: createMemoryCollection(),
      UserDashboardCache: createMemoryCollection(),
    }));

    const courseId = await methods.addCourse.call({ userId: 'teacher-user' }, {
      courseName: 'Intro Course',
      semester: 'current',
      timezone: 'America/Chicago',
      beginDate: null,
      endDate: null,
      sections: [],
    });

    expect(sections.rows).to.deep.include({
      _id: 'inserted-1',
      courseId,
      sectionName: '001',
    });
  });

  it('rejects duplicate course names for the same instructor and semester', async function() {
    const methods = createCourseMethods(createDeps({
      Courses: createMemoryCollection([{ _id: 'course-1', courseName: 'Intro Course', teacherUserId: 'teacher-user', semester: 'current' }]),
      Sections: createMemoryCollection(),
      SectionUserMap: createMemoryCollection(),
      CourseLearnerSnapshotCache: createMemoryCollection(),
      UserDashboardCache: createMemoryCollection(),
    }));

    try {
      await methods.addCourse.call({ userId: 'teacher-user' }, {
        courseName: ' intro course ',
        semester: 'current',
        timezone: 'America/Chicago',
        sections: ['A'],
      });
      expect.fail('Expected duplicate course name to throw');
    } catch (error) {
      expect(error).to.be.instanceOf(Meteor.Error);
      expect((error as Meteor.Error).reason).to.equal('A course with that name already exists for this instructor');
    }
  });

  it('deletes course management records without touching histories', async function() {
    const courses = createMemoryCollection([{ _id: 'course-1', courseName: 'Intro Course', teacherUserId: 'teacher-user', semester: 'current' }]);
    const sections = createMemoryCollection([{ _id: 'section-1', courseId: 'course-1', sectionName: '001' }]);
    const sectionUserMap = createMemoryCollection([{ _id: 'enrollment-1', sectionId: 'section-1', userId: 'student-user' }]);
    const assignments = createMemoryCollection([{ _id: 'assignment-1', courseId: 'course-1', assignmentType: 'lesson', TDFId: 'tdf-1' }]);
    const histories = {
      rows: [{ _id: 'history-1', userId: 'student-user', courseAssignment: { courseId: 'course-1' } }],
      async findOneAsync() {
        return this.rows[0] || null;
      },
    };
    const methods = createCourseMethods(createDeps({
      Courses: courses,
      Sections: sections,
      SectionUserMap: sectionUserMap,
      Assignments: assignments,
      Histories: histories,
      CourseLearnerSnapshotCache: createMemoryCollection(),
      UserDashboardCache: createMemoryCollection(),
    }));

    await methods.deleteCourse.call({ userId: 'teacher-user' }, 'course-1');

    expect(courses.rows).to.deep.equal([]);
    expect(sections.rows).to.deep.equal([]);
    expect(sectionUserMap.rows).to.deep.equal([]);
    expect(assignments.rows).to.deep.equal([]);
    expect(histories.rows).to.have.length(1);
  });

  it('removes deleted section enrollments and invalidates former assigned viewers without changing history or assignments', async function() {
    const courses = createMemoryCollection([{ _id: 'course-1', courseName: 'Intro Course', teacherUserId: 'teacher-user',
      semester: 'current', visibility: 'private', timezone: 'America/Chicago' }]);
    const sections = createMemoryCollection([
      { _id: 'section-removed', courseId: 'course-1', sectionName: 'A' },
      { _id: 'section-kept', courseId: 'course-1', sectionName: 'B' },
      { _id: 'section-other', courseId: 'course-other', sectionName: 'A' },
    ]);
    const enrollments = createMemoryCollection([
      { _id: 'enrollment-removed', sectionId: 'section-removed', userId: 'student-removed' },
      { _id: 'enrollment-kept', sectionId: 'section-kept', userId: 'student-kept' },
      { _id: 'enrollment-other', sectionId: 'section-other', userId: 'student-other' },
    ]);
    const snapshots = createMemoryCollection([
      { userId: 'student-removed', version: COURSE_SNAPSHOT_VERSION, assignedCourseIds: ['course-1'], publicCourseIds: [], invalidatedAt: null },
      { userId: 'student-kept', version: COURSE_SNAPSHOT_VERSION, assignedCourseIds: ['course-1'], publicCourseIds: [], invalidatedAt: null },
      { userId: 'student-other', version: COURSE_SNAPSHOT_VERSION, assignedCourseIds: ['course-other'], publicCourseIds: [], invalidatedAt: null },
    ]);
    const assignments = createMemoryCollection([{ _id: 'assignment-1', courseId: 'course-1', assignmentType: 'lesson', TDFId: 'tdf-1' }]);
    const histories = { async findOneAsync() { throw new Error('Course editing must not read or alter learner history'); } };
    const methods = createCourseMethods(createDeps({
      Courses: courses, Sections: sections, SectionUserMap: enrollments, Assignments: assignments,
      CourseLearnerSnapshotCache: snapshots, UserDashboardCache: createMemoryCollection(), Histories: histories,
    }));

    await methods.editCourse.call({ userId: 'teacher-user' }, {
      _id: 'course-1', courseName: 'Intro Course', sections: ['B'],
    } as any);

    expect(sections.rows.map((row) => row._id)).to.deep.equal(['section-kept', 'section-other']);
    expect(enrollments.rows.map((row) => row._id)).to.deep.equal(['enrollment-kept', 'enrollment-other']);
    expect(snapshots.rows[0].invalidatedAt).to.be.instanceOf(Date);
    expect(snapshots.rows[1].invalidatedAt).to.be.instanceOf(Date);
    expect(snapshots.rows[2].invalidatedAt).to.equal(null);
    expect(assignments.rows).to.deep.equal([{ _id: 'assignment-1', courseId: 'course-1', assignmentType: 'lesson', TDFId: 'tdf-1' }]);
  });

  it('rejects invalid course visibility values', async function() {
    const methods = createCourseMethods(createDeps({
      Courses: createMemoryCollection(),
      Sections: createMemoryCollection(),
      SectionUserMap: createMemoryCollection(),
      CourseLearnerSnapshotCache: createMemoryCollection(),
      UserDashboardCache: createMemoryCollection(),
    }));

    try {
      await methods.addCourse.call({ userId: 'teacher-user' }, {
        courseName: 'Intro Course',
        semester: 'current',
        timezone: 'America/Chicago',
        visibility: 'secret',
        sections: ['A'],
      });
      expect.fail('Expected invalid visibility to throw');
    } catch (error) {
      expect(error).to.be.instanceOf(Meteor.Error);
      expect((error as Meteor.Error).reason).to.equal('Course visibility must be private or public');
    }
  });

  it('sends one course assignment email when a learner joins a new section membership', async function() {
    const sentEmails: any[] = [];
    const sectionUserMap = createMemoryCollection();
    const users = createMemoryCollection([
      { _id: 'student-user', username: 'Student One', emails: [{ address: 'student@example.test' }], loginParams: {} },
    ]);
    const methods = createCourseMethods(createDeps({
      Courses: createMemoryCollection([{ _id: 'course-1', courseName: 'Course One', teacherUserId: 'teacher-1', semester: 'current', timezone: 'America/Chicago' }]),
      Sections: createMemoryCollection([{ _id: 'section-1', courseId: 'course-1', sectionName: 'Section A' }]),
      SectionUserMap: sectionUserMap,
      Assignments: createMemoryCollection([{ _id: 'assignment-1', courseId: 'course-1', assignmentType: 'lesson', TDFId: 'tdf-1' }]),
      usersCollection: users,
      CourseLearnerSnapshotCache: createMemoryCollection(),
      UserDashboardCache: createMemoryCollection(),
      sendEmail: (to: string, from: string, subject: string, text: string) => {
        sentEmails.push({ to, from, subject, text });
      },
    }));

    await methods.addUserToTeachersClass.call({ userId: 'student-user' }, 'teacher-1', 'section-1');
    await methods.addUserToTeachersClass.call({ userId: 'student-user' }, 'teacher-1', 'section-1');

    expect(sectionUserMap.rows).to.have.length(1);
    expect(sentEmails).to.have.length(1);
    expect(sentEmails[0].to).to.equal('student@example.test');
    expect(sentEmails[0].subject).to.contain('Course One');
    expect(sentEmails[0].text).to.contain('https://mofacts.example.test/courses');
    expect(sentEmails[0].text).to.contain('choose Courses from the Learn menu');
    expect(users.rows.find((user) => user._id === 'student-user')?.loginParams).to.deep.equal({});
  });

  it('shows public courses as joinable but unavailable until section membership exists', async function() {
    const sectionUserMap = createMemoryCollection();
    const courseSnapshotCache = createMemoryCollection();
    const methods = createCourseMethods(createDeps({
      Courses: createMemoryCollection([
        { _id: 'course-public', courseName: 'Public Course', teacherUserId: 'teacher-1', semester: 'current', visibility: 'public', timezone: 'America/Chicago' },
      ]),
      Sections: createMemoryCollection([
        { _id: 'section-a', courseId: 'course-public', sectionName: 'A' },
        { _id: 'section-b', courseId: 'course-public', sectionName: 'B' },
      ]),
      SectionUserMap: sectionUserMap,
      Assignments: createMemoryCollection([
        { _id: 'assignment-1', courseId: 'course-public', assignmentType: 'lesson', TDFId: 'tdf-1', order: 0, required: true },
      ]),
      Tdfs: createMemoryCollection([
        { _id: 'tdf-1', ownerId: 'teacher-1', stimuliSetId: 'stim-1', content: { fileName: 'lesson.json', tdfs: { tutor: { setspec: { lessonname: 'Lesson One' } } } } },
      ]),
      usersCollection: createMemoryCollection([
        { _id: 'teacher-1', username: 'Teacher One', emails: [{ address: 'teacher@example.test' }] },
        { _id: 'student-user', username: 'Student One', emails: [{ address: 'student@example.test' }], loginParams: {} },
      ]),
      CourseLearnerSnapshotCache: courseSnapshotCache,
      UserDashboardCache: createMemoryCollection([{ userId: 'student-user', tdfStats: {} }]),
      getMethodAuthorizationDeps: () => ({
        async userIsInRoleAsync() {
          return false;
        },
      }),
    }));

    const beforeJoin = await methods.getLearnerCoursesSnapshot.call({ userId: 'student-user' });
    expect(beforeJoin.assignedCourses).to.deep.equal([]);
    expect(beforeJoin.publicCourses).to.have.length(1);
    const publicCourse = beforeJoin.publicCourses[0];
    if (!publicCourse) throw new Error('Expected public course before join');
    expect(publicCourse.membership).to.equal('public');
    expect(publicCourse.joinableSections).to.deep.equal([
      { sectionId: 'section-a', sectionName: 'A' },
      { sectionId: 'section-b', sectionName: 'B' },
    ]);
    expect(publicCourse.assignments[0]?.availability).to.equal('unavailable');

    await methods.addUserToTeachersClass.call({ userId: 'student-user' }, 'teacher-1', 'section-a');
    const afterJoin = await methods.getLearnerCoursesSnapshot.call({ userId: 'student-user' });
    expect(afterJoin.publicCourses).to.deep.equal([]);
    expect(afterJoin.assignedCourses).to.have.length(1);
    const assignedCourse = afterJoin.assignedCourses[0];
    if (!assignedCourse) throw new Error('Expected assigned course after join');
    expect(assignedCourse.membership).to.equal('assigned');
    expect(assignedCourse.joinableSections).to.deep.equal([]);
    expect(assignedCourse.assignments[0]?.availability).to.equal('available');
  });

  it('lets a teacher see and launch their private course from the learner course snapshot', async function() {
    const methods = createCourseMethods(createDeps({
      Courses: createMemoryCollection([
        { _id: 'course-private', courseName: 'Private Course', teacherUserId: 'teacher-user', semester: 'current', visibility: 'private', timezone: 'America/Chicago' },
      ]),
      Sections: createMemoryCollection([
        { _id: 'section-private', courseId: 'course-private', sectionName: '001' },
      ]),
      SectionUserMap: createMemoryCollection(),
      Assignments: createMemoryCollection([
        { _id: 'assignment-1', courseId: 'course-private', assignmentType: 'lesson', TDFId: 'tdf-1', order: 0, required: true },
      ]),
      Tdfs: createMemoryCollection([
        { _id: 'tdf-1', ownerId: 'teacher-user', stimuliSetId: 'stim-1', content: { fileName: 'lesson.json', tdfs: { tutor: { setspec: { lessonname: 'Lesson One' } } } } },
      ]),
      usersCollection: createMemoryCollection([
        { _id: 'teacher-user', username: 'Teacher One', emails: [{ address: 'teacher@example.test' }] },
      ]),
      CourseLearnerSnapshotCache: createMemoryCollection(),
      UserDashboardCache: createMemoryCollection([{ userId: 'teacher-user', tdfStats: {} }]),
      getMethodAuthorizationDeps: () => ({
        async userIsInRoleAsync(userId: string, roles: string[]) {
          return userId === 'teacher-user' && roles.includes('teacher');
        },
      }),
    }));

    const snapshot = await methods.getLearnerCoursesSnapshot.call({ userId: 'teacher-user' });
    expect(snapshot.publicCourses).to.deep.equal([]);
    expect(snapshot.assignedCourses).to.have.length(1);
    const teacherCourse = snapshot.assignedCourses[0];
    if (!teacherCourse) throw new Error('Expected teacher course');
    expect(teacherCourse.membership).to.equal('teacher');
    expect(teacherCourse.assignments[0]?.availability).to.equal('available');
  });

  it('saves and launches the current ordered progressive prefix without creating aggregate progress', async function() {
    const assignments = createMemoryCollection();
    const methods = createCourseMethods(createDeps({
      Courses: createMemoryCollection([{
        _id: 'course-progressive',
        courseName: 'Progressive Course',
        teacherUserId: 'teacher-user',
        semester: 'current',
        visibility: 'private',
        timezone: 'America/Chicago',
      }]),
      Sections: createMemoryCollection(),
      SectionUserMap: createMemoryCollection(),
      Assignments: assignments,
      Tdfs: createMemoryCollection([
        progressiveMember('lesson-1', 'set-1'),
        progressiveMember('lesson-2', 'set-2'),
        progressiveMember('lesson-3', 'set-3'),
      ]),
      CourseLearnerSnapshotCache: createMemoryCollection(),
      UserDashboardCache: createMemoryCollection([{ userId: 'teacher-user', tdfStats: {} }]),
      usersCollection: createMemoryCollection([{ _id: 'teacher-user', username: 'Teacher' }]),
    }));

    const saved = await methods.saveCourseAssignments.call({ userId: 'teacher-user' }, {
      courseId: 'course-progressive',
      assignments: [{
        assignmentType: 'progressive',
        title: 'Cumulative sequence',
        memberTdfIds: ['lesson-1', 'lesson-2', 'lesson-3'],
        order: 0,
        releaseAt: null,
        dueAt: null,
        required: true,
      }],
    });
    const progressive = saved.assignments[0];
    expect(progressive).to.include({ assignmentType: 'progressive', title: 'Cumulative sequence' });
    expect((progressive as any).memberTdfIds).to.deep.equal(['lesson-1', 'lesson-2', 'lesson-3']);
    expect((progressive as any).progress).to.equal(undefined);
    const settingsSnapshot = await methods.getLearnerCoursesSnapshot.call({ userId: 'teacher-user' });
    expect(settingsSnapshot.version).to.equal(COURSE_SNAPSHOT_VERSION);
    const settingsAssignment = settingsSnapshot.assignedCourses[0]?.assignments[0];
    expect(settingsAssignment?.assignmentType).to.equal('progressive');
    expect((settingsAssignment as any).members.map((member: any) => member.hasConfigurableSettings)).to.deep.equal([true, true, true]);

    const launch = await methods.getProgressiveAssignmentLaunch.call(
      { userId: 'teacher-user' },
      String(progressive?.assignmentId),
      'lesson-2',
    );
    expect(launch.memberTdfIds).to.deep.equal(['lesson-1', 'lesson-2']);
    expect(launch.tdfs.map((tdf: any) => tdf._id)).to.deep.equal(['lesson-1', 'lesson-2']);
    expect(launch.tdfs.map((tdf: any) => tdf.stimuli[0].stimuliSetId)).to.deep.equal(['set-1', 'set-2']);
    // An insertion before the endpoint affects new launches only.
    await methods.saveCourseAssignments.call({ userId: 'teacher-user' }, {
      courseId: 'course-progressive',
      assignments: [{ assignmentId: progressive!.assignmentId, assignmentType: 'progressive',
        title: 'Cumulative sequence', memberTdfIds: ['lesson-1', 'lesson-3', 'lesson-2'], order: 0, required: true }],
    });
    const resumed = await methods.getProgressiveAssignmentLaunch.call(
      { userId: 'teacher-user' }, progressive!.assignmentId, 'lesson-2', launch.progressiveRevisionId,
    );
    expect(resumed.tdfs.map((tdf: any) => tdf._id)).to.deep.equal(['lesson-1', 'lesson-2']);
    const fresh = await methods.getProgressiveAssignmentLaunch.call(
      { userId: 'teacher-user' }, progressive!.assignmentId, 'lesson-2',
    );
    expect(fresh.memberTdfIds).to.deep.equal(['lesson-1', 'lesson-3', 'lesson-2']);
    expect(fresh.progressiveRevisionId).not.to.equal(launch.progressiveRevisionId);
  });

  it('rejects progressive content reads when a cached learner no longer belongs to any current course section', async function() {
    const fixture = createCachedProgressiveLaunch();
    await fixture.sections.removeAsync({ _id: 'section-current' });
    try {
      await fixture.methods.getProgressiveAssignmentLaunch.call({ userId: 'student-user' }, 'assignment-progressive', 'lesson-2');
      expect.fail('Expected stale course membership to be rejected');
    } catch (error) {
      expect(error).to.be.instanceOf(Meteor.Error);
      expect((error as Meteor.Error).error).to.equal(403);
      expect((error as Meteor.Error).reason).to.equal('User is not enrolled in this course');
    }
    expect(fixture.memberReads()).to.equal(0);
  });

  it('rejects cached progressive access when the current course date window has ended', async function() {
    const fixture = createCachedProgressiveLaunch();
    await fixture.courses.updateAsync({ _id: 'course-progressive' }, { $set: { endDate: new Date(Date.now() - 60000) } });
    try {
      await fixture.methods.getProgressiveAssignmentLaunch.call({ userId: 'student-user' }, 'assignment-progressive', 'lesson-2');
      expect.fail('Expected an ended course to be rejected');
    } catch (error) {
      expect(error).to.be.instanceOf(Meteor.Error);
      expect((error as Meteor.Error).error).to.equal(403);
      expect((error as Meteor.Error).reason).to.equal('Course is not currently available');
    }
    expect(fixture.memberReads()).to.equal(0);
  });

  it('allows progressive content reads for a currently enrolled learner', async function() {
    const fixture = createCachedProgressiveLaunch();
    const launch = await fixture.methods.getProgressiveAssignmentLaunch.call({ userId: 'student-user' }, 'assignment-progressive', 'lesson-2');
    expect(launch.tdfs.map((tdf: any) => tdf._id)).to.deep.equal(['lesson-1', 'lesson-2']);
    expect(fixture.memberReads()).to.equal(1);
  });

  for (const userId of ['teacher-user', 'admin-user']) {
    it(`preserves progressive course access for ${userId} without learner enrollment`, async function() {
      const fixture = createCachedProgressiveLaunch(userId);
      await fixture.enrollments.removeAsync({ userId });
      const launch = await fixture.methods.getProgressiveAssignmentLaunch.call({ userId }, 'assignment-progressive', 'lesson-2');
      expect(launch.tdfs.map((tdf: any) => tdf._id)).to.deep.equal(['lesson-1', 'lesson-2']);
    });
  }
});


describe('course assignment package visibility', function() {
  it('groups by package identity and blocks a partially accessible package without exposing private member IDs', async function() {
    const methods = createCourseMethods(createDeps({
      Courses: createMemoryCollection([{ _id: 'course-1', teacherUserId: 'teacher-1', timezone: 'America/Chicago' }]),
      DynamicAssets: createMemoryCollection([{ _id: 'zip-1', name: 'stats.zip' }]),
      Tdfs: createMemoryCollection([
        { _id: 'visible', ownerId: 'teacher-1', packageAssetId: 'zip-1', content: { fileName: 'visible.json', tdfs: { tutor: { setspec: { lessonname: 'Visible' } } } } },
        { _id: 'private', ownerId: 'someone-else', packageAssetId: 'zip-1' },
        { _id: 'unrelated', ownerId: 'someone-else', packageAssetId: 'zip-other' },
      ]),
      getMethodAuthorizationDeps: () => ({ async userIsInRoleAsync(_id: string, roles: string[]) { return roles.includes('teacher'); } }),
    }));
    const snapshot = await methods.getCourseAssignmentEditorSnapshot.call({ userId: 'teacher-1' }, 'course-1');
    expect(snapshot.packages).to.deep.equal([{ packageAssetId: 'zip-1', fileName: 'stats.zip', lessonCount: 2,
      memberTdfIds: [], blockedReason: 'This package contains lessons you cannot access.' }]);
  });
});
