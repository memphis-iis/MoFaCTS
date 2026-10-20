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
      getApiKeyResolutionDeps: () => { throw new Error('Credentials must not be reached'); }, loadTdf: async () => ({
        content: { tdfs: { tutor: { unit: [{ sparcsession: { pageId: 'page' } }] } } },
        rawStimuliFile: { setspec: { sparcPages: [{ pageId: 'page', display: { unitType: 'sparc-autotutor-dialogue' } }] } },
      }) });
    await assert.rejects(methods.getSparcVideoCatalogTargets.call({ userId: 'admin' }, 'lesson'),
      (error: any) => error.error === 400 && /contentLanguage/.test(error.reason));
  });
  it('rejects non-SPARC packages at every catalog entry point before reaching credentials or storage', async () => {
    const methods = createSparcVideoCatalogMethods({ getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async () => true }),
      getApiKeyResolutionDeps: () => { throw new Error('Credentials must not be reached'); },
      loadTdf: async () => ({ content: { tdfs: { tutor: { unit: [{ learningsession: {} }] } } } }) });
    for (const method of Object.values(methods)) {
      await assert.rejects((method as (...args: unknown[]) => Promise<unknown>).call({ userId: 'admin' }, 'lesson', 'target', []),
        (error: any) => error.error === 400 && /only for SPARC AutoTutor systems/.test(error.reason));
    }
  });
});
