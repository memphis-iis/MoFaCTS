import { strict as assert } from 'node:assert';
import { registeredMeteorMethodSurfaces } from '../securitySurfaces/registerMeteorMethods';
import { randomUUID } from 'node:crypto';
import { Tdfs } from '../../common/Collections';
import { Meteor } from 'meteor/meteor';
import { createAccessMethods } from './accessMethods';
import { ProlificStudies } from '../lib/prolificCollections';

describe('accessor identity query authorization', () => {
  it('omits the retired assignable-lesson method from the live Meteor registry', () => {
    const handlers = (Meteor as any).server.method_handlers;
    assert.equal(Object.hasOwn(handlers, 'getAssignableTDFSForUser'), false);
    assert.equal(typeof handlers.getAccessableTDFSForUser, 'function');
    assert.equal(typeof handlers.getAccessors, 'function');
  });

  it('limits both installed owner lookups to their documented identity fields', async () => {
    const lessonId = randomUUID();
    const owner = randomUUID();
    const learner = randomUUID();
    const lessons = Tdfs.rawCollection() as unknown as import('mongodb').Collection<{ _id: string; ownerId: string; accessors: unknown[] }>;
    const users = Meteor.users.rawCollection() as unknown as import('mongodb').Collection<{ _id: string; username: string; accessedTDFs: string[] }>;
    const handlers = (Meteor as any).server.method_handlers;
    const observation = registeredMeteorMethodSurfaces();
    assert.equal(observation.state, 'observed');
    try {
      await lessons.insertOne({ _id: lessonId, ownerId: owner, accessors: [
        { userId: learner, username: 'old', extra: 'synthetic' },
        { userId: 'missing-account', username: 'Stored display name', extra: 'synthetic' },
      ] });
      await users.insertOne({ _id: learner, username: learner, accessedTDFs: [lessonId] });
      for (const name of ['getAccessorsTDFID', 'getAccessors']) {
        const binding: typeof observation.surfaces[number] | undefined = observation.surfaces.find(row => row.name === name);
        assert.deepEqual(binding?.policy, { kind: 'lesson-sharing', operation: 'owner-read' });
        assert.equal(binding?.dataEgress, 'accessor-identities');
        await assert.rejects(handlers[name].call({}, lessonId), { error: 401 });
        await assert.rejects(handlers[name].call({ userId: learner }, lessonId), { error: 403 });
      }
      assert.deepEqual(await handlers.getAccessorsTDFID.call({ userId: owner }, lessonId), [
        { userId: learner, username: learner }, { userId: 'missing-account', username: 'Stored display name' },
      ]);
      assert.deepEqual(await handlers.getAccessors.call({ userId: owner }, lessonId), [{ _id: learner, username: learner }]);
    } finally {
      await lessons.deleteOne({ _id: lessonId });
      await users.deleteOne({ _id: learner });
    }
  });

  it('rejects ambiguous recipient lists and resolves repeated aliases of one account', async () => {
    const lesson = randomUUID();
    const owner = randomUUID();
    const first = randomUUID();
    const second = randomUUID();
    const alias = randomUUID() + '@example.invalid';
    const lessons = Tdfs.rawCollection() as unknown as import('mongodb').Collection<{ _id: string; ownerId: string }>;
    const users = Meteor.users.rawCollection();
    const observation = registeredMeteorMethodSurfaces();
    assert.equal(observation.state, 'observed');
    const binding = observation.surfaces.find(row => row.name === 'resolveUsersForTdf');
    assert.deepEqual(binding?.policy, { kind: 'lesson-sharing', operation: 'owner-read' });
    assert.equal(binding?.dataEgress, 'recipient-lookup-result');
    const lookup = (Meteor as any).server.method_handlers.resolveUsersForTdf;
    const resolve = lookup.bind({ userId: owner });
    try {
      await lessons.insertOne({ _id: lesson, ownerId: owner });
      await users.insertOne({ _id: first, username: alias, email_canonical: alias } as Meteor.User);
      await assert.rejects(lookup.call({ userId: first }, lesson, [alias]), { error: 403 });
      const resolved = await resolve(lesson, [alias.toUpperCase()]);
      assert.deepEqual(resolved, { users: [{ _id: first, username: alias, displayIdentifier: alias }], missing: [] });
      await users.insertOne({ _id: second, username: second, emails: [{ address: alias.toUpperCase(), verified: false }] });
      for (const inputs of [[alias], [second, alias], [alias, second]]) {
        await assert.rejects(resolve(lesson, inputs), { error: 'ambiguous-recipient' });
      }
      assert.deepEqual(await resolve(lesson, [second]), {
        users: [{ _id: second, username: alias.toUpperCase(), displayIdentifier: alias.toUpperCase() }], missing: [],
      });
    } finally {
      await lessons.deleteOne({ _id: lesson });
      await users.deleteMany({ _id: { $in: [first, second] } });
    }
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
      getUserDisplayIdentifier: user => user?.username || '',
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
  it('rejects missing new recipients atomically and allows retaining or revoking stale entries', async () => {
    const lesson = randomUUID();
    const owner = randomUUID();
    const learner = randomUUID();
    const stale = { userId: randomUUID(), username: 'Former account' };
    const active = { userId: learner, username: 'Current account' };
    const missing = { userId: randomUUID(), username: 'Removed account' };
    const lessons = Tdfs.rawCollection() as unknown as import('mongodb').Collection<{ _id: string; ownerId: string; accessors: typeof active[]; content: unknown; tdfRevision: number }>;
    const users = Meteor.users.rawCollection() as unknown as import('mongodb').Collection<{ _id: string; accessedTDFs: string[] }>;
    const assign = (Meteor as any).server.method_handlers.assignAccessors.bind({ userId: owner });
    try {
      await lessons.insertOne({ _id: lesson, ownerId: owner, accessors: [stale], tdfRevision: 4, content: { tdfs: { tutor: { unit: [{}] } } } });
      await users.insertOne({ _id: learner, accessedTDFs: [] });
      await assert.rejects(assign(lesson, [active, missing], [stale.userId]), { error: 'sharing-recipient-missing' });
      const original = await lessons.findOne({ _id: lesson });
      assert.equal(original?.tdfRevision, 4);
      assert.deepEqual(original?.accessors, [stale]);
      assert.deepEqual((await users.findOne({ _id: learner }))?.accessedTDFs, []);
      await assign(lesson, [stale, active], []);
      assert.deepEqual((await lessons.findOne({ _id: lesson }))?.accessors, [stale, active]);
      assert.deepEqual((await users.findOne({ _id: learner }))?.accessedTDFs, [lesson]);
      await assign(lesson, [], [stale.userId]);
      assert.deepEqual((await lessons.findOne({ _id: lesson }))?.accessors, [active]);
    } finally {
      await lessons.deleteOne({ _id: lesson });
      await users.deleteOne({ _id: learner });
    }
  });

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

describe('lesson access bindings', () => {
  it('lists only owned lessons and transfers ownership only for the owner', async () => {
    const lesson = randomUUID();
    const owner = randomUUID();
    const recipient = randomUUID();
    const lessons = Tdfs.rawCollection() as unknown as import('mongodb').Collection<{ _id: string; ownerId: string; content: unknown; tdfRevision: number }>;
    const handlers = (Meteor as any).server.method_handlers;
    const observation = registeredMeteorMethodSurfaces();
    assert.equal(observation.state, 'observed');
    const list = 'getAccessableTDFSForUser';
    const transfer = 'transferDataOwnership';
    assert.deepEqual(observation.surfaces.find(row => row.name === list)?.policy, { kind: 'lesson-list', operation: 'self' });
    assert.deepEqual(observation.surfaces.find(row => row.name === transfer)?.policy, { kind: 'lesson-sharing', operation: 'family-owner-transfer' });
    try {
      await lessons.insertOne({ _id: lesson, ownerId: owner, content: { fileName: 'test.json', tdfs: { tutor: { unit: [{}] } } }, tdfRevision: 1 });
      await Meteor.users.rawCollection().insertOne({ _id: recipient });
      await assert.rejects(handlers[list].call({}, owner), { error: 401 });
      await assert.rejects(handlers[list].call({ userId: recipient }, owner), { error: 403 });
      assert.deepEqual(await handlers[list].call({ userId: recipient }, recipient), []);
      const rows = await handlers[list].call({ userId: owner }, owner);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]._id, lesson);
      assert.equal(rows[0].ownerId, undefined);
      assert.equal(rows[0].content.tdfs?.tutor?.unit, undefined);
      await assert.rejects(handlers[transfer].call({ userId: recipient }, lesson, recipient), { error: 403 });
      assert.equal(await handlers[transfer].call({ userId: owner }, lesson, recipient), 'success');
      assert.equal((await lessons.findOne({ _id: lesson }))?.ownerId, recipient);
    } finally {
      await lessons.deleteOne({ _id: lesson });
      await Meteor.users.rawCollection().deleteOne({ _id: recipient });
    }
  });

  it('rejects transfer of a Prolific-bound lesson at the installed method', async () => {
    const lesson = randomUUID(), owner = randomUUID(), recipient = randomUUID();
    const handlers = (Meteor as any).server.method_handlers;
    try {
      await Tdfs.insertAsync({ _id: lesson, ownerId: owner, content: { fileName: 'test.json', tdfs: { tutor: { unit: [{}] } } }, tdfRevision: 1 });
      await Meteor.users.rawCollection().insertOne({ _id: recipient });
      await ProlificStudies.insertAsync({ rootTdfId: lesson, ownerId: owner, studyId: randomUUID() });

      await assert.rejects(handlers.transferDataOwnership.call({ userId: owner }, lesson, recipient), { error: 'prolific-study-bound' });
      const saved = await Tdfs.findOneAsync(lesson);
      assert.equal(saved?.ownerId, owner);
      assert.equal(saved?.tdfRevision, 1);
    } finally {
      await ProlificStudies.removeAsync({ rootTdfId: lesson });
      await Tdfs.removeAsync({ _id: lesson });
      await Meteor.users.rawCollection().deleteOne({ _id: recipient });
    }
  });
});
