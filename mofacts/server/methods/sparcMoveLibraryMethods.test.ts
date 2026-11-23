import { strict as assert } from 'node:assert';
import { createSparcMoveLibraryMethods } from './sparcMoveLibraryMethods';
import type { MoveStore } from '../lib/sparcMoveLibraryService';

describe('Shared move-library authorization', () => {
  it('denies unauthenticated and ordinary learner access before storage or provider resolution', async () => {
    const methods = createSparcMoveLibraryMethods({ store: {} as MoveStore,
      getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async () => false }),
      verifyFigure: async () => {},
    });
    for (const method of Object.values(methods)) for (const userId of [null, 'learner']) {
      await assert.rejects((method as (...args: unknown[]) => Promise<unknown>).call({ userId }), /Must be logged in|Permission denied|Reopen this lesson/);
    }
  });
});
