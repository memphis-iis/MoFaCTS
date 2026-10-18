import assert from 'node:assert/strict';
import { createSparcVideoCatalogMethods } from './sparcVideoCatalogMethods';
describe('SPARC video catalog authorization', () => {
  it('rejects unauthenticated and non-admin callers before reading content or contacting a provider', async () => {
    const methods = createSparcVideoCatalogMethods({ getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async () => false }),
      getApiKeyResolutionDeps: () => { throw new Error('Credentials must not be reached'); },
      loadTdf: async () => { throw new Error('Content must not be read'); } });
    for (const method of Object.values(methods)) for (const userId of [null, 'learner']) {
      await assert.rejects((method as (...args: unknown[]) => Promise<unknown>).call({ userId }), /Must be logged in|Permission denied/);
    }
  });
  it('reports missing authored language as a visible validation error', async () => {
    const methods = createSparcVideoCatalogMethods({ getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async () => true }),
      getApiKeyResolutionDeps: () => { throw new Error('Credentials must not be reached'); }, loadTdf: async () => ({}) });
    await assert.rejects(methods.getSparcVideoCatalogTargets.call({ userId: 'admin' }, 'lesson'),
      (error: any) => error.error === 400 && /contentLanguage/.test(error.reason));
  });
});
