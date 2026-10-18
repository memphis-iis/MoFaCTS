import { strict as assert } from 'node:assert';
import { createSparcMoveLibraryMethods } from './sparcMoveLibraryMethods';
import type { MoveStore } from '../lib/sparcMoveLibraryService';

describe('Shared move-library authorization', () => {
  it('denies unauthenticated and ordinary learner access before storage or provider resolution', async () => {
    const methods = createSparcMoveLibraryMethods({ store: {} as MoveStore,
      getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async () => false }),
      getApiKeyResolutionDeps: () => { throw new Error('Provider must not be reached'); },
      verifyFigure: async () => {}, figureReusable: async () => false,
    });
    for (const method of Object.values(methods)) for (const userId of [null, 'learner']) {
      await assert.rejects((method as (...args: unknown[]) => Promise<unknown>).call({ userId }), /Must be logged in|Permission denied/);
    }
  });
  it('returns bounded public content metadata without embeddings or private context', async () => {
    const methods = createSparcMoveLibraryMethods({ store: { list: async () => [{ _id: 'entry', kind: 'explanation', content: { text: 'Public instructional content' }, target: 'kc', move: 'move', createdAt: new Date(),
      embedding: [1, 0], context: { secret: 'private transcript' }, queryDigest: 'private' }] } as unknown as MoveStore,
      getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async () => true }), getApiKeyResolutionDeps: () => { throw new Error(); },
      verifyFigure: async () => {}, figureReusable: async () => true });
    // DDP arrays cannot preserve undefined positional arguments; all types is explicitly null.
    const page = await methods.listSparcMoveLibrary.call({ userId: 'admin' }, null, '');
    assert.equal(page.entries.length, 1);
    assert.equal(JSON.stringify(page).includes('private'), false); assert.equal(JSON.stringify(page).includes('embedding'), false);
  });
});
