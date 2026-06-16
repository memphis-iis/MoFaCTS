import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import { createCourseMethods } from './courseMethods';

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

function matchesSelector(row: any, selector: Record<string, any> = {}) {
  return Object.entries(selector).every(([key, expected]) => {
    const actual = row[key];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$in' in expected) {
        return expected.$in.includes(actual);
      }
      return Object.entries(expected).every(([operator, value]) => {
        if (operator === '$ne') return actual !== value;
        if (operator === '$exists') return value ? actual !== undefined : actual === undefined;
        return false;
      });
    }
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
    async updateAsync(selector: Record<string, any>, modifier: any) {
      let count = 0;
      for (const row of rows) {
        if (!matchesSelector(row, selector)) continue;
        if (modifier?.$set) Object.assign(row, modifier.$set);
        if (!modifier?.$set) Object.assign(row, modifier);
        count += 1;
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
    Courses: collection,
    Sections: collection,
    SectionUserMap: collection,
    Assignments: collection,
    Tdfs: collection,
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
    ...overrides,
  };
}

describe('course method operational errors', function() {
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
      Assignments: createMemoryCollection([{ _id: 'assignment-1', courseId: 'course-1', TDFId: 'tdf-1' }]),
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
  });
});
