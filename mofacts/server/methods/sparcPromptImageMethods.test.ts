import { strict as assert } from 'node:assert';
import { createSparcPromptImageMethods } from './sparcPromptImageMethods';
import { generateSparcPromptImage } from '../lib/sparcPromptImageGeneration';
import { allowsGenericSparcImageDownload, SPARC_PROMPT_IMAGE_PURPOSE } from '../../common/lib/sparcPromptImage';

describe('SPARC private supported Prompt image contracts', () => {
  function fixture() {
    let providerCalls = 0;
    const assets = new Map<string, Record<string, any>>();
    const deps = {
      getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async (id: string) => id === 'admin' || id === 'otherAdmin' }),
      getApiKeyResolutionDeps: () => ({
        getUserById: async () => ({ services: { openRouter: { keyEncrypted: 'synthetic-encrypted-key' } } }),
        getTdfById: async () => ({ ownerId: 'admin' }),
        hasHistoryWithTdf: async () => false,
        userIsInRoleAsync: async () => true,
        decryptData: () => 'synthetic-api-key',
      }),
      storageBoundary: { backend: 'local' },
      DynamicAssets: {
        collection: {
          async findOneAsync(selector: Record<string, unknown>) {
            const asset = assets.get(String(selector._id));
            return asset && asset.userId === selector.userId && asset.meta.public === false && asset.meta.uploadPurpose === selector['meta.uploadPurpose'] ? asset : undefined;
          },
          async updateAsync() { throw new Error('Unexpected local metadata update'); },
        },
        async writeAsync(_bytes: Buffer, options: Record<string, any>) {
          const asset = { _id: options.fileId, userId: options.userId, type: options.type, path: 'synthetic-image', meta: options.meta };
          assets.set(asset._id, asset);
          return asset;
        },
      },
      async readFile() { return Buffer.from('synthetic-raster'); },
      async generateImage() {
        providerCalls++;
        return { bytes: Buffer.from('synthetic-raster'), mediaType: 'image/png', extension: 'png', usage: { costUsd: .0336 } };
      },
    };
    const methods = createSparcPromptImageMethods(deps as unknown as Parameters<typeof createSparcPromptImageMethods>[0]);
    return { methods, assets, providerCalls: () => providerCalls };
  }
  const request = { tdfId: 'lesson', sessionId: 'session', generationId: 'turn', tutorMessage: 'What happens in the empty middle stage?', imagePrompt: 'Show two stages, leaving the intervening process unillustrated.', figureDescription: 'Two visible stages with an empty area between them.' };

  it('blocks unauthorized generation before calling the provider', async () => {
    const f = fixture();
    await assert.rejects(f.methods.generateSparcPromptImage.call({ userId: 'student' }, request), /Permission denied/);
    assert.equal(f.providerCalls(), 0);
    assert.equal(f.assets.size, 0);
    assert.equal(allowsGenericSparcImageDownload({ meta: { uploadPurpose: SPARC_PROMPT_IMAGE_PURPOSE } }), false);
    assert.equal(allowsGenericSparcImageDownload({ meta: { uploadPurpose: 'content-media' } }), true);
  });
  it('retains the original pairing on retry, shares concurrent generation, and enforces reader ownership', async () => {
    const f = fixture();
    const [first, concurrent] = await Promise.all([
      f.methods.generateSparcPromptImage.call({ userId: 'admin' }, request),
      f.methods.generateSparcPromptImage.call({ userId: 'admin' }, request),
    ]) as Array<{ tutorMessage: string; figure: { assetId: string }; usage?: unknown }>;
    assert.deepEqual(first, concurrent);
    const retry = await f.methods.generateSparcPromptImage.call({ userId: 'admin' }, { ...request, tutorMessage: 'A different generated question', imagePrompt: 'A different brief' }) as NonNullable<typeof first>;
    assert.equal(retry.tutorMessage, request.tutorMessage);
    assert.deepEqual(retry.figure, first!.figure);
    assert.equal(retry.usage, undefined);
    assert.equal(f.providerCalls(), 1);
    assert.equal(f.assets.get(first!.figure.assetId)!.meta.public, false);
    await assert.rejects(f.methods.getSparcPromptImage.call({ userId: 'otherAdmin' }, first!.figure.assetId), /not found/);
    const read = await f.methods.getSparcPromptImage.call({ userId: 'admin' }, first!.figure.assetId);
    assert.ok(read.dataUrl.startsWith('data:image/png;base64,'));
  });
  it('uses one pinned 1K image request and rejects active markup or a mislabeled raster response', async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    const fakeFetch = (result: unknown) => (async (_url: unknown, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      assert.equal(body.model, 'google/gemini-nano-banana-2.1');
      assert.equal(body.resolution, '1K');
      assert.equal(body.n, 1);
      assert.deepEqual(body.provider, { only: ['google-ai-studio'], allow_fallbacks: false });
      return { ok: true, json: async () => result };
    }) as unknown as typeof fetch;
    const image = await generateSparcPromptImage('synthetic-api-key', 'Brief', fakeFetch({ data: [{ media_type: 'image/png', b64_json: png.toString('base64') }], usage: { cost: .0336 } }));
    assert.deepEqual(image.bytes, png);
    assert.equal(image.usage.costUsd, .0336);
    for (const media_type of ['image/svg+xml', 'image/jpeg']) {
      await assert.rejects(generateSparcPromptImage('synthetic-api-key', 'Brief', fakeFetch({ data: [{ media_type, b64_json: png.toString('base64') }] })));
    }
  });
  it('retains the provider reason for a 429 without exposing keys or raw responses', async () => {
    const fakeFetch = (async () => ({ ok: false, status: 429,
      headers: { get: () => '60' },
      json: async () => ({ error: { message: 'Provider returned error', metadata: {
        provider_name: 'Google AI Studio', raw: JSON.stringify({ error: {
          status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for synthetic-api-key',
        }, unrelated: 'private raw detail' }),
      } } }),
    })) as unknown as typeof fetch;
    await assert.rejects(generateSparcPromptImage('synthetic-api-key', 'Brief', fakeFetch), error => {
      assert.match(String(error), /HTTP 429.*RESOURCE_EXHAUSTED.*Quota exceeded/);
      assert.match(String(error), /Retry-After: 60/);
      assert.doesNotMatch(String(error), /synthetic-api-key|private raw detail/);
      return true;
    });
  });
});
