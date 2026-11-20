import { strict as assert } from 'node:assert';
import { registeredMeteorMethodSurfaces } from '../securitySurfaces/registerMeteorMethods';
import { randomUUID } from 'node:crypto';
import { Tdfs } from '../../common/Collections';
import { Meteor } from 'meteor/meteor';
import { createAccessMethods } from './accessMethods';
import { isTdfOwner } from '../lib/contentAccessPolicy';

describe('accessor identity query authorization', () => {
  it('omits the retired assignable-lesson method from the live Meteor registry', () => {
    const handlers = (Meteor as any).server.method_handlers;
    assert.equal(Object.hasOwn(handlers, 'getAssignableTDFSForUser'), false);
    assert.equal(typeof handlers.getAccessableTDFSForUser, 'function');
    assert.equal(typeof handlers.getAccessors, 'function');
  });

  function fixture(tdf: { ownerId: string } | null = { ownerId: 'synthetic-owner' }) {
    const calls: Array<{ selector: Record<string, unknown>; options?: Record<string, unknown> }> = [];
    let lessonReads = 0;
    const users = [{ _id: 'synthetic-learner', username: 'synthetic-name', accessedTDFs: ['synthetic-lesson'],
      services: { password: { bcrypt: 'synthetic-placeholder' } }, profile: { private: true }, emails: [{ address: 'synthetic@example.invalid' }] }];
    const unexpectedWrite = async () => { throw new Error('Accessor listing must not write'); };
    const methods = createAccessMethods({
      Tdfs: {
        find: () => { throw new Error('Accessor listing must not list lessons'); },
        findOneAsync: async () => { lessonReads++; return tdf; }, updateAsync: unexpectedWrite,
      },
      usersCollection: {
        find: (selector, options) => {
          calls.push({ selector, ...(options ? { options } : {}) });
          return { fetchAsync: async () => users.filter(user => user.accessedTDFs.includes(String(selector.accessedTDFs))).map(user => {
            const fields = options?.fields as Record<string, number> | undefined;
            return fields ? Object.fromEntries(Object.entries(user).filter(([name]) => fields[name] === 1)) : user;
          }) };
        }, updateAsync: unexpectedWrite,
      },
      serverConsole: () => undefined, getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async () => false }),
      isTdfOwner, getUserDisplayIdentifier: user => user?.username || '',
      exactCaseInsensitiveRegex: value => new RegExp(value, 'i'), isValidEmailAddress: () => false,
      normalizeCanonicalId: value => typeof value === 'string' ? value : null,
      transferTdfOwnership: async () => { throw new Error('Accessor listing must not transfer ownership'); },
    });
    return { methods, calls, lessonReads: () => lessonReads };
  }

  it('returns only matching user IDs and usernames to the lesson owner', async () => {
    const f = fixture();
    const rows = await f.methods.getAccessors.call({ userId: 'synthetic-owner' }, 'synthetic-lesson');
    assert.deepEqual(rows, [{ _id: 'synthetic-learner', username: 'synthetic-name' }]);
    assert.deepEqual(f.calls, [{ selector: { accessedTDFs: 'synthetic-lesson' }, options: { fields: { _id: 1, username: 1 } } }]);
  });

  it('rejects a missing lesson before querying stale user references', async () => {
    const f = fixture(null);
    await assert.rejects(f.methods.getAccessors.call({ userId: 'synthetic-other' }, 'synthetic-lesson'), { error: 404 });
    assert.equal(f.calls.length, 0);
  });

  it('rejects a nonowner before reading users', async () => {
    const f = fixture();
    await assert.rejects(f.methods.getAccessors.call({ userId: 'synthetic-other' }, 'synthetic-lesson'), { error: 403 });
    assert.equal(f.calls.length, 0);
  });

  it('rejects an unauthenticated caller before any reads', async () => {
    const f = fixture();
    await assert.rejects(f.methods.getAccessors.call({}, 'synthetic-lesson'), { error: 401 });
    assert.equal(f.lessonReads(), 0);
    assert.equal(f.calls.length, 0);
  });

  it('rejects blank and non-string lesson identities before any reads', async () => {
    const f = fixture();
    for (const value of ['', ' ', null, undefined, { $ne: null }]) {
      await assert.rejects(f.methods.getAccessors.call({ userId: 'synthetic-owner' }, value as unknown as string), { error: 400 });
    }
    assert.equal(f.lessonReads(), 0);
    assert.equal(f.calls.length, 0);
  });
});

describe('atomic lesson sharing', () => {
  it('rolls back a late child failure and commits owner grants and revocations together', async () => {
    const observation = registeredMeteorMethodSurfaces();
    assert.equal(observation.state, 'observed');
    const binding = observation.surfaces.find(row => row.name === 'assignAccessors');
    assert.deepEqual(binding?.policy, { kind: 'lesson-sharing', operation: 'owner-assignment' });
    assert.equal(binding?.dataEgress, 'none');
    const prefix = randomUUID();
    const root = prefix + '-root';
    const child = prefix + '-child';
    const foreign = prefix + '-foreign';
    const owner = prefix + '-owner';
    const learner = prefix + '-learner';
    const lessons = Tdfs.rawCollection() as unknown as import('mongodb').Collection<{ _id: string; ownerId: string; tdfRevision: number | string; accessors: unknown[]; content?: unknown }>;
    const users = Meteor.users.rawCollection() as unknown as import('mongodb').Collection<{ _id: string; accessedTDFs: string[] }>;
    const assign = (Meteor as any).server.method_handlers.assignAccessors;
    const accessors = [{ userId: learner, username: 'Synthetic learner' }];
    const tutor = { setspec: { condition: ['child.json', 'foreign.json'], conditionTdfIds: [child, foreign] } };
    try {
      await lessons.insertMany([
        { _id: root, ownerId: owner, tdfRevision: 0, accessors: [], content: { tdfs: { tutor } } },
        { _id: child, ownerId: owner, tdfRevision: 'invalid', accessors: [] },
        { _id: foreign, ownerId: learner, tdfRevision: 0, accessors: [] },
      ]);
      await users.insertOne({ _id: learner, accessedTDFs: [] });
      await assert.rejects(assign.call({ userId: learner }, root, accessors, []), { error: 403 });
      await assert.rejects(assign.call({ userId: owner }, root, accessors, []), /non.numeric/i);
      assert.equal((await lessons.findOne({ _id: root }))!.tdfRevision, 0);
      assert.deepEqual((await lessons.findOne({ _id: root }))!.accessors, []);
      assert.deepEqual((await users.findOne({ _id: learner }))!.accessedTDFs, []);
      await lessons.updateOne({ _id: child }, { $set: { tdfRevision: 0 } });
      await assign.call({ userId: owner }, root, accessors, []);
      for (const id of [root, child]) assert.deepEqual((await lessons.findOne({ _id: id }))!.accessors, accessors);
      assert.deepEqual((await users.findOne({ _id: learner }))!.accessedTDFs.sort(), [root, child].sort());
      await assign.call({ userId: owner }, root, [], [learner]);
      for (const id of [root, child]) {
        const lesson = await lessons.findOne({ _id: id });
        assert.equal(lesson!.tdfRevision, 2);
        assert.deepEqual(lesson!.accessors, []);
      }
      assert.deepEqual((await users.findOne({ _id: learner }))!.accessedTDFs, []);
      assert.equal((await lessons.findOne({ _id: foreign }))!.tdfRevision, 0);
    } finally {
      await lessons.deleteMany({ _id: { $in: [root, child, foreign] } });
      await users.deleteOne({ _id: learner });
    }
  });
});
