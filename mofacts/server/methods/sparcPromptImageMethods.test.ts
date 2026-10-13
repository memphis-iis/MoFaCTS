import { strict as assert } from 'node:assert';
import { createSparcPromptImageMethods } from './sparcPromptImageMethods';
import { generateSparcPromptImage } from '../lib/sparcPromptImageGeneration';
import { allowsGenericSparcImageDownload, SPARC_PROMPT_IMAGE_PURPOSE } from '../../common/lib/sparcPromptImage';
import { sparcLibraryFixture } from '../lib/sparcFigureLibraryService.test';
import type { SparcFigureLibraryStore } from '../lib/sparcFigureLibraryService';

describe('SPARC private supported Prompt image contracts', () => {
  function fixture(figureLibrary?: SparcFigureLibraryStore) {
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
      figureLibrary,
      async embedSituation() { return { vector: [1, 0], usage: { costUsd: .0001 } }; },
      DynamicAssets: {
        collection: {
          async findOneAsync(selector: Record<string, unknown>) {
            const asset = assets.get(String(selector._id));
            return asset && (selector.userId === undefined || asset.userId === selector.userId)
              && asset.meta.public === false && asset.meta.uploadPurpose === selector['meta.uploadPurpose']
              && (selector['meta.figureLibraryVersion'] === undefined || asset.meta.figureLibraryVersion === selector['meta.figureLibraryVersion']) ? asset : undefined;
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
  const request = { tdfId: 'lesson', sessionId: 'session', generationId: 'turn', tutorMessage: 'What happens in the empty middle stage?', imagePrompt: 'Show two stages, leaving the intervening process unillustrated.', figureDescription: 'Two visible stages with an empty area between them.', displayWidth: 360 };

  it('shares only canonical teaching-library figures across authorized users and retains each decision', async () => {
    const library = sparcLibraryFixture(); const f = fixture(library.store);
    const teaching = { ...request, tutorMessage: 'The complete teaching figure.', imagePrompt: 'Draw the full model.',
      figureDescription: 'A fixed mean and repeated intervals.', situation: { targetType: 'learningTarget' as const,
        targetTexts: ['Long-run interval coverage.'], currentValue: .2, assistance: 2.77, illustrationBrief: 'Draw the full model.' } };
    const first = await f.methods.generateSparcPromptImage.call({ userId: 'admin' }, teaching) as { figure: { assetId: string; description: string }; usage?: unknown };
    const second = await f.methods.generateSparcPromptImage.call({ userId: 'otherAdmin' }, { ...teaching,
      sessionId: 'another-session', figureDescription: 'A different proposed description.' }) as typeof first;
    assert.deepEqual(first.figure, second.figure); assert.equal(second.usage, undefined); assert.equal(f.providerCalls(), 1);
    assert.equal(library.decisions.size, 2);
    const shared = await f.methods.getSparcPromptImage.call({ userId: 'otherAdmin' }, first.figure.assetId);
    assert.ok(shared.dataUrl.startsWith('data:image/png;base64,'));
    await assert.rejects(f.methods.getSparcPromptImage.call({ userId: 'student' }, first.figure.assetId), /Permission denied/);
    await assert.rejects(f.methods.generateSparcPromptImage.call({ userId: 'student' }, teaching), /Permission denied/);
  });

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
    const retry = await f.methods.generateSparcPromptImage.call({ userId: 'admin' }, { ...request, tutorMessage: 'A different generated question', imagePrompt: 'A different brief', displayWidth: 480 }) as NonNullable<typeof first>;
    assert.equal(retry.tutorMessage, request.tutorMessage);
    assert.deepEqual(retry.figure, first!.figure);
    assert.equal(retry.usage, undefined);
    assert.equal(f.providerCalls(), 1);
    assert.equal(f.assets.get(first!.figure.assetId)!.meta.displayWidth, 360);
    assert.equal(f.assets.get(first!.figure.assetId)!.meta.public, false);
    await assert.rejects(f.methods.getSparcPromptImage.call({ userId: 'otherAdmin' }, first!.figure.assetId), /not found/);
    const read = await f.methods.getSparcPromptImage.call({ userId: 'admin' }, first!.figure.assetId);
    assert.ok(read.dataUrl.startsWith('data:image/png;base64,'));
  });
  it('rejects invalid sizing before provider access or asset writes', async () => {
    const f = fixture();
    for (const displayWidth of [undefined, 239, 641, 360.5, '360']) {
      await assert.rejects(f.methods.generateSparcPromptImage.call({ userId: 'admin' }, { ...request, displayWidth } as unknown as typeof request));
    }
    assert.equal(f.providerCalls(), 0);
    assert.equal(f.assets.size, 0);
  });
  it('reuses historical canonical assets without rewriting their size or regenerating', async () => {
    const f = fixture();
    const generated = await f.methods.generateSparcPromptImage.call({ userId: 'admin' }, request) as { figure: { assetId: string } };
    const asset = f.assets.get(generated.figure.assetId)!;
    delete asset.meta.displayWidth; // Synthetic pre-sizing canonical asset.
    const retry = await f.methods.generateSparcPromptImage.call({ userId: 'admin' }, { ...request, displayWidth: 480 }) as { figure: Record<string, unknown> };
    assert.deepEqual(retry.figure, { assetId: generated.figure.assetId, description: request.figureDescription });
    assert.equal(Object.prototype.hasOwnProperty.call(asset.meta, 'displayWidth'), false);
    assert.equal(f.providerCalls(), 1);
  });
  it('uses the pinned Sunburst quality request and rejects active markup or a mislabeled raster response', async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    const fakeFetch = (result: unknown) => (async (_url: unknown, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      assert.equal(body.model, 'openai/gpt-image-2.5-sunburst');
      assert.equal(body.quality, 'medium');
      assert.equal(body.resolution, undefined);
      assert.equal(body.aspect_ratio, 'auto');
      assert.equal(body.n, 1);
      assert.deepEqual(body.provider, { only: ['openai'], allow_fallbacks: false });
      return { ok: true, json: async () => result };
    }) as unknown as typeof fetch;
    const image = await generateSparcPromptImage('synthetic-api-key', 'Brief', fakeFetch({ data: [{ media_type: 'image/png', b64_json: png.toString('base64') }], usage: { cost: .0336 } }));
    assert.deepEqual(image.bytes, png);
    assert.equal(image.usage.costUsd, .0336);
    const jpeg = Buffer.from([255, 216, 255, 224, 0]);
    const seedreamImage = await generateSparcPromptImage('synthetic-api-key', 'Brief', fakeFetch({ data: [{ media_type: 'image/jpeg', b64_json: jpeg.toString('base64') }], usage: { cost: .018 } }));
    assert.deepEqual(seedreamImage.bytes, jpeg);
    assert.equal(seedreamImage.mediaType, 'image/jpeg');
    assert.equal(seedreamImage.extension, 'jpg');
    assert.equal(seedreamImage.usage.costUsd, .018);
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
