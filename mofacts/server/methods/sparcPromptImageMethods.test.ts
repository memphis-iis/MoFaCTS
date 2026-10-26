import { SPARC_INSTRUCTIONAL_NEED_VERSION } from '../../../learning-components/runtime/sparcInstructionalNeed';
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
    const fileBytes = new Map<string, Buffer>();
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
      DynamicAssets: {
        collection: {
          find(selector: Record<string, any>, options: Record<string, any>) {
            assert.ok(selector._id.$in.length <= 24);
            assert.ok(Object.keys(options.fields).every(key => ['_id', 'meta.description', 'meta.figureLibraryVersion', 'meta.model', 'meta.humanReplacement', 'meta.replacedAt'].includes(key)));
            return { fetchAsync: async () => [...assets.values()].filter(asset => selector._id.$in.includes(asset._id)
              && asset.meta.public === false && asset.meta.uploadPurpose === selector['meta.uploadPurpose'] && asset.meta.ready === true) };
          },
          async findOneAsync(selector: Record<string, unknown>) {
            const asset = assets.get(String(selector._id));
            return asset && (selector.userId === undefined || asset.userId === selector.userId)
              && asset.meta.public === false && (selector['meta.uploadPurpose'] === undefined || asset.meta.uploadPurpose === selector['meta.uploadPurpose'])
              && (selector['meta.figureLibraryVersion'] === undefined || asset.meta.figureLibraryVersion === selector['meta.figureLibraryVersion']) ? asset : undefined;
          },
          async updateAsync(selector: Record<string, unknown>, modifier: { $set: Record<string, unknown> }) {
            const asset = assets.get(String(selector._id))!;
            for (const [key, value] of Object.entries(modifier.$set)) {
              const parts = key.split('.'); let target = asset;
              for (const part of parts.slice(0, -1)) target = (target[part] ??= {});
              target[parts.at(-1)!] = value;
            }
            return 1;
          },
        },
        async writeAsync(_bytes: Buffer, options: Record<string, any>) {
          assert.ok(!assets.has(options.fileId), 'Saved image bytes must never be overwritten');
          const asset = { _id: options.fileId, userId: options.userId, type: options.type, path: options.fileId, meta: options.meta };
          assets.set(asset._id, asset);
          fileBytes.set(asset._id, Buffer.from(_bytes));
          return asset;
        },
      },
      isRemoved: async (_id: string) => false,
      async writeFile(path: string, bytes: Buffer) { fileBytes.set(path, bytes); },
      async removeFile(path: string) { fileBytes.delete(path); },
      async readFile(path: string) { return fileBytes.get(path) ?? Buffer.from('synthetic-raster'); },
      async generateImage() {
        providerCalls++;
        return { bytes: Buffer.from('synthetic-raster'), mediaType: 'image/png', extension: 'png', usage: { costUsd: .0336 } };
      },
    };
    const methods = createSparcPromptImageMethods(deps as unknown as Parameters<typeof createSparcPromptImageMethods>[0]);
    return { methods, assets, deps, providerCalls: () => providerCalls };
  }
  const request = { selection: null as { entryId: string; similarity: number } | null, embedding: [1, 0], language: 'en', tdfId: 'lesson', sessionId: 'session', generationId: 'turn', tutorMessage: 'What happens in the empty middle stage?', imagePrompt: 'Show two stages, leaving the intervening process unillustrated.', figureDescription: 'Two visible stages with an empty area between them.', displayWidth: 360 };

  it('authorizes exact selected video reads and resumes the saved decision without a new search', async () => {
    const library = sparcLibraryFixture(), f = fixture(library.store);
    const video = { segmentId: 'a'.repeat(64), videoId: 'abcdefghijk', language: 'en', title: 'Synthetic passage', channel: 'Teaching', startSeconds: 0, endSeconds: 20, transcript: 'A process changes.' };
    library.videos.set(video.segmentId, video);
    const teaching = { ...request, selection: { entryId: video.segmentId, similarity: .95 }, situation: { target: { texts: ['A process'] }, evidence: [], assistance: 2.5, illustrationBrief: 'The process' } };
    const first = await f.methods.resolveSparcVisualSupport.call({ userId: 'admin' }, teaching) as { video: unknown };
    assert.deepEqual(first.video, video); assert.equal(f.providerCalls(), 0);
    library.store.findVisual = async () => { throw new Error('Must not search again'); };
    const resumed = await f.methods.resolveSparcVisualSupport.call({ userId: 'admin' }, teaching) as typeof first;
    assert.deepEqual(resumed.video, video);
  });
  it('propagates a selected-resource error without generating a substitute and requires the brief', async () => {
    const library = sparcLibraryFixture(), f = fixture(library.store);
    library.store.findVisual = async () => { throw new Error('Visual storage unavailable'); };
    const situation = { target: { texts: ['A process.'] }, evidence: [], assistance: 2.5 };
    await assert.rejects(f.methods.resolveSparcVisualSupport.call({ userId: 'admin' }, { ...request, situation }), /visual brief/);
    await assert.rejects(f.methods.resolveSparcVisualSupport.call({ userId: 'admin' }, { ...request, selection: { entryId: 'a'.repeat(64), similarity: 1 }, situation: { ...situation, illustrationBrief: 'A complete process.' } }), /Visual storage unavailable/);
    assert.equal(f.providerCalls(), 0);
  });

  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3XcAAAAASUVORK5CYII=';
  it('revises the current image without adding catalog items, assets or revision links', async () => {
    const library = sparcLibraryFixture(); const f = fixture(library.store);
    const teaching = { ...request, situation: { target: { texts: ['Long-run coverage.'] }, evidence: [], assistance: 2.77, illustrationBrief: 'A complete teaching model.' } };
    const original = await f.methods.resolveSparcVisualSupport.call({ userId: 'admin' }, teaching) as { figure: { assetId: string } };
    const assetId = original.figure.assetId;
    const revised = await f.methods.replaceSparcLibraryImage.call({ userId: 'otherAdmin' }, {
      assetId, description: 'Corrected teaching figure.', mediaType: 'image/png', base64: png,
    });
    assert.equal(revised.assetId, assetId);
    assert.equal(revised.description, 'Corrected teaching figure.');
    assert.equal(library.entries.size, 1); assert.equal(f.assets.size, 1);
    assert.equal('revision' in revised, false); assert.equal('libraryId' in revised, false);
    const saved = await f.methods.getSparcPromptImage.call({ userId: 'admin' }, assetId);
    assert.equal(saved.dataUrl, 'data:image/png;base64,' + png);
    assert.equal(f.providerCalls(), 1);
  });
  it('checks authorization and raster signatures before revision', async () => {
    const library = sparcLibraryFixture(); const f = fixture(library.store);
    const upload = { assetId: 'missing', description: 'Corrected figure.', mediaType: 'image/png', base64: png };
    await assert.rejects(f.methods.replaceSparcLibraryImage.call({ userId: 'student' }, upload), /Permission denied|Reopen this lesson|do not have access/);
    await assert.rejects(f.methods.replaceSparcLibraryImage.call({ userId: 'admin' }, { ...upload, mediaType: 'image/svg+xml' }), /raster/);
    await assert.rejects(f.methods.replaceSparcLibraryImage.call({ userId: 'admin' }, upload), /not found/);
  });
  it('returns an administrative removal marker only for a recorded removal', async () => {
    const f = fixture(); f.deps.isRemoved = async id => id === 'deleted';
    assert.deepEqual(await f.methods.getSparcPromptImage.call({ userId: 'admin' }, 'deleted'), { administrativeRemoval: true });
    await assert.rejects(f.methods.getSparcPromptImage.call({ userId: 'admin' }, 'missing'), /not found/);
  });

  it('inspects all completed shared figures across systems and versions, in bounded pages without private state', async () => {
    const library = sparcLibraryFixture(); const f = fixture(library.store);
    for (let i = 0; i < 25; i++) {
      const id = String(i).padStart(20, '0');
      const version = i === 0 ? 'earlier-library-version' : 'sparc-teaching-figure-library-v1';
      library.entries.set(id, { _id: id, version, imageModel: 'synthetic-model', embeddingModel: 'synthetic-embedding', embeddingVersion: SPARC_INSTRUCTIONAL_NEED_VERSION,
        dimensions: 2, situation: 'Private situation', embedding: [1, 0], ready: true, createdAt: new Date('2026-10-12T00:00:00Z') });
      f.assets.set(id, { _id: id, userId: 'another-admin', type: 'image/png', path: 'synthetic-image',
        meta: { public: false, uploadPurpose: SPARC_PROMPT_IMAGE_PURPOSE, figureLibraryVersion: version, ready: true,
          tdfId: i % 2 ? 'system-a' : 'system-b', sessionId: 'private-session', description: `Teaching figure ${i}` } });
    }
    f.assets.set('private-prompt', { _id: 'private-prompt', meta: { public: false, ready: true, uploadPurpose: SPARC_PROMPT_IMAGE_PURPOSE } });
    library.entries.set('unfinished', { ...library.entries.get('00000000000000000001')!, _id: 'unfinished', ready: false });
    const first = await f.methods.listSparcLibraryImages.call({ userId: 'admin' });
    assert.equal(first.images.length, 24);
    assert.equal(first.nextCursor, '00000000000000000023');
    assert.deepEqual(Object.keys(first.images[0]!).sort(), ['assetId', 'createdAt', 'description', 'model']);
    const last = await f.methods.listSparcLibraryImages.call({ userId: 'otherAdmin' }, { afterId: first.nextCursor! });
    assert.equal(last.images.length, 1); assert.equal(last.nextCursor, null);
    const raster = await f.methods.getSparcPromptImage.call({ userId: 'admin' }, first.images[0]!.assetId);
    assert.ok(raster.dataUrl!.startsWith('data:image/png;base64,'));
    await assert.rejects(f.methods.listSparcLibraryImages.call({ userId: 'student' }), /Permission denied|Reopen this lesson|do not have access/);
    await assert.rejects(f.methods.listSparcLibraryImages.call({}), /logged in/);
    await assert.rejects(f.methods.listSparcLibraryImages.call({ userId: 'admin' }, { afterId: '$invalid' }), /Invalid image cursor/);
    assert.equal(f.providerCalls(), 0);
  });

  it('reports a broken canonical asset rather than silently hiding library records', async () => {
    const library = sparcLibraryFixture(); const f = fixture(library.store);
    library.entries.set('missing', { _id: 'missing', version: 'v1', imageModel: 'synthetic-model', embeddingModel: 'synthetic-embedding', embeddingVersion: SPARC_INSTRUCTIONAL_NEED_VERSION,
      dimensions: 2, situation: 'Private situation', embedding: [1, 0], ready: true, createdAt: new Date() });
    await assert.rejects(f.methods.listSparcLibraryImages.call({ userId: 'admin' }), /missing its completed canonical asset/);
  });

  it('shares only canonical teaching-library figures across authorized users and retains each decision', async () => {
    const library = sparcLibraryFixture(); const f = fixture(library.store);
    const teaching = { ...request, tutorMessage: 'The complete teaching figure.', imagePrompt: 'Draw the full model.',
      figureDescription: 'A fixed mean and repeated intervals.', situation: { target: { texts: ['Long-run interval coverage.'] }, evidence: [], currentValue: .2, assistance: 2.77, illustrationBrief: 'Draw the full model.' } };
    const first = await f.methods.resolveSparcVisualSupport.call({ userId: 'admin' }, teaching) as { figure: { assetId: string; description: string }; usage?: unknown };
    const second = await f.methods.resolveSparcVisualSupport.call({ userId: 'otherAdmin' }, { ...teaching,
      sessionId: 'another-session', selection: { entryId: first.figure.assetId, similarity: .95 }, figureDescription: 'A different proposed description.' }) as typeof first;
    assert.deepEqual(first.figure, second.figure); assert.equal(second.usage, undefined); assert.equal(f.providerCalls(), 1);
    assert.equal(library.decisions.size, 2);
    const shared = await f.methods.getSparcPromptImage.call({ userId: 'otherAdmin' }, first.figure.assetId);
    assert.ok(shared.dataUrl!.startsWith('data:image/png;base64,'));
    await assert.rejects(f.methods.getSparcPromptImage.call({ userId: 'student' }, first.figure.assetId), /Permission denied|Reopen this lesson|do not have access/);
    await assert.rejects(f.methods.resolveSparcVisualSupport.call({ userId: 'student' }, teaching), /Permission denied|Reopen this lesson|do not have access/);
  });

  it('blocks unauthorized generation before calling the provider', async () => {
    const f = fixture();
    await assert.rejects(f.methods.generateSparcPromptImage.call({ userId: 'student' }, request), /Permission denied|Reopen this lesson|do not have access/);
    assert.equal(f.providerCalls(), 0);
    assert.equal(f.assets.size, 0);
    assert.equal(allowsGenericSparcImageDownload({ meta: { uploadPurpose: SPARC_PROMPT_IMAGE_PURPOSE } }), false);
    assert.equal(allowsGenericSparcImageDownload({ meta: { uploadPurpose: 'content-media' } }), true);
  });
  it('keeps concurrent image calls independent and enforces saved-asset reader ownership', async () => {
    const f = fixture();
    const [first, concurrent] = await Promise.all([
      f.methods.generateSparcPromptImage.call({ userId: 'admin' }, request),
      f.methods.generateSparcPromptImage.call({ userId: 'admin' }, request),
    ]) as Array<{ tutorMessage: string; figure: { assetId: string } }>;
    assert.notEqual(first!.figure.assetId, concurrent!.figure.assetId);
    assert.equal(f.providerCalls(), 2); assert.equal(f.assets.size, 2);
    assert.equal(f.assets.get(first!.figure.assetId)!.meta.displayWidth, 360);
    assert.equal(f.assets.get(first!.figure.assetId)!.meta.public, false);
    await assert.rejects(f.methods.getSparcPromptImage.call({ userId: 'otherAdmin' }, first!.figure.assetId), /not found/);
    const read = await f.methods.getSparcPromptImage.call({ userId: 'admin' }, first!.figure.assetId);
    assert.ok(read.dataUrl!.startsWith('data:image/png;base64,'));
  });
  it('rejects invalid sizing before provider access or asset writes', async () => {
    const f = fixture();
    for (const displayWidth of [undefined, 239, 641, 360.5, '360']) {
      await assert.rejects(f.methods.generateSparcPromptImage.call({ userId: 'admin' }, { ...request, displayWidth } as unknown as typeof request));
    }
    assert.equal(f.providerCalls(), 0);
    assert.equal(f.assets.size, 0);
  });
  it('reads historical canonical assets without rewriting their size or regenerating', async () => {
    const f = fixture();
    const generated = await f.methods.generateSparcPromptImage.call({ userId: 'admin' }, request) as { figure: { assetId: string } };
    const asset = f.assets.get(generated.figure.assetId)!;
    delete asset.meta.displayWidth; // Synthetic pre-sizing canonical asset.
    const read = await f.methods.getSparcPromptImage.call({ userId: 'admin' }, generated.figure.assetId);
    assert.ok(read.dataUrl!.startsWith('data:image/png;base64,'));
    assert.equal(Object.prototype.hasOwnProperty.call(asset.meta, 'displayWidth'), false);
    assert.equal(f.providerCalls(), 1);
  });
  it('uses the pinned Nano Banana 2 resolution request and rejects active markup or a mislabeled raster response', async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    const fakeFetch = (result: unknown) => (async (_url: unknown, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      assert.equal(body.model, 'google/gemini-3.1-flash-image-preview');
      assert.equal(body.quality, undefined);
      assert.equal(body.resolution, '1K');
      assert.equal(body.aspect_ratio, undefined);
      assert.equal(body.n, 1);
      assert.deepEqual(body.provider, { only: ['google-ai-studio'], allow_fallbacks: false });
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
