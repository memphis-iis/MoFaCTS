import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import { createCourseMethods } from './courseMethods';

function cursor(rows: any[] = []) {
  return {
    async fetchAsync() {
      return rows;
    },
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
