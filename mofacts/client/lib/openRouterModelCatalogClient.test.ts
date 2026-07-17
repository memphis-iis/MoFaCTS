import { expect } from 'chai';
import { createOpenRouterModelCatalogLoader } from './openRouterModelCatalogClient';

describe('openRouterModelCatalogClient', function() {
  it('loads the authenticated server catalog and validates its contract', async function() {
    const calls: unknown[][] = [];
    const loadCatalog = createOpenRouterModelCatalogLoader(async (...args: unknown[]) => {
      calls.push(args);
      return [{ id: 'vendor/model', name: 'Model', reasoning: null }];
    });

    expect(await loadCatalog()).to.deep.equal([
      { id: 'vendor/model', name: 'Model', reasoning: null },
    ]);
    expect(calls).to.deep.equal([['getOpenRouterModelCatalog']]);
  });

  it('rejects malformed server results instead of substituting local model data', async function() {
    const loadCatalog = createOpenRouterModelCatalogLoader(async () => ({ models: [] }));

    try {
      await loadCatalog();
      throw new Error('Expected malformed catalog to fail');
    } catch (error) {
      expect(error).to.be.instanceOf(TypeError);
      expect((error as Error).message).to.include('non-empty array');
    }
  });

  it('propagates explicit server catalog errors', async function() {
    const providerError = new Error('OpenRouter model catalog could not be reached');
    const loadCatalog = createOpenRouterModelCatalogLoader(async () => {
      throw providerError;
    });

    try {
      await loadCatalog();
      throw new Error('Expected provider failure to propagate');
    } catch (error) {
      expect(error).to.equal(providerError);
    }
  });
});
