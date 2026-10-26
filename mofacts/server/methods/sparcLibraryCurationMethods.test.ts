import { strict as assert } from 'node:assert';
import { createSparcLibraryCurationMethods } from './sparcLibraryCurationMethods';

describe('Instructional library deletion authorization', () => {
  it('rejects unauthorized calls before any deletion or receipt lookup', async () => {
    const methods = createSparcLibraryCurationMethods({
      getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async () => false }),
      remove: async () => { throw new Error('Storage must not be reached'); },
      removed: async () => { throw new Error('Storage must not be reached'); },
    });
    for (const userId of [null, 'student']) {
      const denied = (error: unknown) => (error as { error?: unknown }).error === (userId ? 403 : 401);
      await assert.rejects(methods.deleteSparcInstructionalComponent.call({ userId }, 'item'), denied);
      await assert.rejects(methods.getSparcAdministrativeRemovals.call({ userId }, ['item'], 'private-lesson'), denied);
    }
    // A missing execution scope is a distinct invalid request, still before storage.
    await assert.rejects(methods.getSparcAdministrativeRemovals.call({ userId: 'student' }, ['item']),
      (error: unknown) => (error as { error?: unknown }).error === 400);
  });
  it('accepts exact component IDs and bounds batched receipt reads', async () => {
    const removed: string[] = [];
    const methods = createSparcLibraryCurationMethods({
      getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async () => true }),
      remove: async id => { removed.push(id); }, removed: async ids => ids.filter(id => id === 'deleted'),
    });
    await methods.deleteSparcInstructionalComponent.call({ userId: 'admin' }, 'deleted');
    assert.deepEqual(removed, ['deleted']);
    assert.deepEqual(await methods.getSparcAdministrativeRemovals.call({ userId: 'admin' }, ['deleted', 'present', 'deleted']), ['deleted']);
    await assert.rejects(methods.getSparcAdministrativeRemovals.call({ userId: 'admin' }, Array(101).fill('deleted')), /Invalid/);
    await assert.rejects(methods.deleteSparcInstructionalComponent.call({ userId: 'admin' }, '../asset'), /Invalid/);
  });
});
