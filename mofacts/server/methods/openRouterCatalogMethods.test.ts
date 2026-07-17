import { Meteor } from 'meteor/meteor';
import { expect } from 'chai';
import {
  createOpenRouterCatalogMethods,
  createOpenRouterModelCatalogService,
  sanitizeOpenRouterModelCatalogResponse,
} from './openRouterCatalogMethods';

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

const providerCatalog = {
  data: [
    {
      id: 'openai/reasoning-model',
      name: 'Reasoning Model',
      ignored: 'not returned',
      reasoning: {
        mandatory: false,
        default_enabled: false,
        supported_efforts: ['high', 'medium', 'none'],
        default_effort: 'medium',
        ignored: true,
      },
    },
    {
      id: 'vendor/basic-model',
      name: 'Basic Model',
      description: 'not returned',
    },
  ],
};

describe('openRouterCatalogMethods', function() {
  it('sanitizes provider entries to the shared catalog contract', function() {
    expect(sanitizeOpenRouterModelCatalogResponse(providerCatalog)).to.deep.equal([
      {
        id: 'vendor/basic-model',
        name: 'Basic Model',
        reasoning: null,
      },
      {
        id: 'openai/reasoning-model',
        name: 'Reasoning Model',
        reasoning: {
          mandatory: false,
          supportedLevels: ['high', 'medium', 'none'],
          defaultLevel: 'medium',
        },
      },
    ]);
  });

  it('sorts every sanitized catalog by English case-insensitive name and then id', function() {
    const catalog = sanitizeOpenRouterModelCatalogResponse({
      data: [
        { id: 'vendor/zebra', name: 'Zebra' },
        { id: 'vendor/b', name: 'alpha' },
        { id: 'vendor/a', name: 'Alpha' },
      ],
    });

    expect(catalog.map((entry) => entry.id)).to.deep.equal([
      'vendor/a',
      'vendor/b',
      'vendor/zebra',
    ]);
  });

  it('preserves null and omitted supported-effort semantics', function() {
    expect(sanitizeOpenRouterModelCatalogResponse({
      data: [
        {
          id: 'vendor/all-efforts',
          name: 'All Efforts',
          reasoning: {
            mandatory: false,
            supported_efforts: null,
            default_effort: null,
          },
        },
        {
          id: 'vendor/no-selector',
          name: 'No Selector',
          reasoning: { mandatory: true },
        },
      ],
    })).to.deep.equal([
      {
        id: 'vendor/all-efforts',
        name: 'All Efforts',
        reasoning: {
          mandatory: false,
          supportedLevels: null,
          defaultLevel: null,
        },
      },
      {
        id: 'vendor/no-selector',
        name: 'No Selector',
        reasoning: { mandatory: true, defaultLevel: null },
      },
    ]);
  });

  it('requires authentication before reading or populating the cache', async function() {
    let fetchCount = 0;
    const service = createOpenRouterModelCatalogService({
      serverConsole() {},
      fetchImpl: async () => {
        fetchCount += 1;
        return response(providerCatalog);
      },
    });
    const methods = createOpenRouterCatalogMethods(service);

    try {
      await methods.getOpenRouterModelCatalog.call({});
      throw new Error('Expected anonymous catalog access to fail');
    } catch (error) {
      expect(error).to.be.instanceOf(Meteor.Error);
      expect((error as Meteor.Error).error).to.equal(401);
    }
    expect(fetchCount).to.equal(0);
  });

  it('caches successful provider responses and returns isolated copies', async function() {
    let fetchCount = 0;
    let currentTime = 100;
    const service = createOpenRouterModelCatalogService({
      serverConsole() {},
      now: () => currentTime,
      cacheTtlMs: 1000,
      fetchImpl: async () => {
        fetchCount += 1;
        return response(providerCatalog);
      },
    });
    const first = await service.getCatalog();
    first[0]!.name = 'Mutated client copy';
    currentTime = 999;
    const second = await service.getCatalog();

    expect(fetchCount).to.equal(1);
    expect(second[0]!.name).to.equal('Basic Model');
  });

  it('shares one in-flight provider request across concurrent catalog reads', async function() {
    let fetchCount = 0;
    let resolveFetch!: (value: Response) => void;
    const service = createOpenRouterModelCatalogService({
      serverConsole() {},
      fetchImpl: async () => {
        fetchCount += 1;
        return new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        });
      },
    });

    const first = service.getCatalog();
    const second = service.getCatalog();
    await Promise.resolve();
    expect(fetchCount).to.equal(1);
    resolveFetch(response(providerCatalog));
    const [firstModels, secondModels] = await Promise.all([first, second]);
    expect(firstModels).to.deep.equal(secondModels);
    expect(firstModels).not.to.equal(secondModels);
  });

  it('reports expired refresh failures instead of serving stale catalog data', async function() {
    let fetchCount = 0;
    let currentTime = 0;
    const service = createOpenRouterModelCatalogService({
      serverConsole() {},
      now: () => currentTime,
      cacheTtlMs: 10,
      fetchImpl: async () => {
        fetchCount += 1;
        if (fetchCount === 1) {
          return response(providerCatalog);
        }
        throw new Error('network unavailable');
      },
    });
    await service.getCatalog();
    currentTime = 11;

    try {
      await service.getCatalog();
      throw new Error('Expected an expired catalog refresh to fail');
    } catch (error) {
      expect(error).to.be.instanceOf(Meteor.Error);
      expect((error as Meteor.Error).error).to.equal('openrouter-model-catalog-request-failed');
    }
    expect(fetchCount).to.equal(2);
  });

  it('reports malformed provider metadata explicitly', async function() {
    const service = createOpenRouterModelCatalogService({
      serverConsole() {},
      fetchImpl: async () => response({
        data: [{ id: 'vendor/model', name: 'Model', reasoning: { mandatory: 'yes' } }],
      }),
    });

    try {
      await service.getCatalog();
      throw new Error('Expected malformed metadata to fail');
    } catch (error) {
      expect(error).to.be.instanceOf(Meteor.Error);
      expect((error as Meteor.Error).error).to.equal('openrouter-model-catalog-invalid');
    }
  });
});
