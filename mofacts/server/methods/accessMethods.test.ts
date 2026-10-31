import { strict as assert } from 'node:assert';
import { createAccessMethods } from './accessMethods';
import { isTdfOwner } from '../lib/contentAccessPolicy';

describe('accessor identity query authorization', () => {
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
