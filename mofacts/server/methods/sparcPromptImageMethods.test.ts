import { SPARC_INSTRUCTIONAL_NEED_VERSION } from '../../../learning-components/runtime/sparcInstructionalNeed';
import { strict as assert } from 'node:assert';
import { createSparcPromptImageMethods } from './sparcPromptImageMethods';
import { generateSparcPromptImage } from '../lib/sparcPromptImageGeneration';
import { allowsGenericSparcImageDownload, SPARC_PROMPT_IMAGE_PURPOSE } from '../../common/lib/sparcPromptImage';
import { sparcLibraryFixture } from '../lib/sparcFigureLibraryService.test';
import type { SparcFigureLibraryStore } from '../lib/sparcFigureLibraryService';
import type { SparcFigureVersion, SparcFigureVersionStore } from '../lib/sparcFigureVersions';

describe('SPARC private supported Prompt image contracts', () => {
  function fixture(figureLibrary?: SparcFigureLibraryStore, figureVersions?: SparcFigureVersionStore) {
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
      figureVersions,
      async embedSituation() { return { vector: [1, 0], usage: { costUsd: .0001 } }; },
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
          async updateAsync() { throw new Error('Unexpected local metadata update'); },
        },
        async writeAsync(_bytes: Buffer, options: Record<string, any>) {
          assert.ok(!assets.has(options.fileId), 'Saved image bytes must never be overwritten');
          const asset = { _id: options.fileId, userId: options.userId, type: options.type, path: options.fileId, meta: options.meta };
          assets.set(asset._id, asset);
          fileBytes.set(asset._id, Buffer.from(_bytes));
          return asset;
        },
      },
      async readFile(path: string) { return fileBytes.get(path) ?? Buffer.from('synthetic-raster'); },
      async generateImage() {
        providerCalls++;
        return { bytes: Buffer.from('synthetic-raster'), mediaType: 'image/png', extension: 'png', usage: { costUsd: .0336 } };
      },
    };
    const methods = createSparcPromptImageMethods(deps as unknown as Parameters<typeof createSparcPromptImageMethods>[0]);
    return { methods, assets, deps, providerCalls: () => providerCalls };
  }
  const request = { tdfId: 'lesson', sessionId: 'session', generationId: 'turn', tutorMessage: 'What happens in the empty middle stage?', imagePrompt: 'Show two stages, leaving the intervening process unillustrated.', figureDescription: 'Two visible stages with an empty area between them.', displayWidth: 360 };

  function versionFixture(library: ReturnType<typeof sparcLibraryFixture>) {
    const versions = new Map<string, SparcFigureVersion>();
    const store: SparcFigureVersionStore = {
      async find(id) { return versions.get(id); },
      async history(id, before) { return [...versions.values()].filter(row => row.libraryId === id && row.revision < before)
        .sort((a, b) => b.revision - a.revision).slice(0, 25); },
      async publish(p) {
        const entry = library.entries.get(p.libraryId)!;
        if (versions.has(p.assetId)) return structuredClone(entry);
        if ((entry.currentAssetId ?? entry._id) !== p.expectedAssetId) throw new Error('This image has changed');
        const revision = (entry.revision ?? 0) + 1;
        if (revision === 1) versions.set(entry._id, { _id: entry._id, libraryId: entry._id, revision: 0, createdAt: entry.createdAt });
        versions.set(p.assetId, { _id: p.assetId, libraryId: entry._id, revision, previousAssetId: p.expectedAssetId,
          createdAt: new Date(), createdBy: p.userId, replacementIdentity: p.identity });
        entry.currentAssetId = p.assetId; entry.revision = revision;
        return structuredClone(entry);
      },
    };
    return { store, versions };
  }
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64');
  it('does not persist feedback question/answer input in a shared image source', async () => {
    const f = fixture(sparcLibraryFixture().store);
    await assert.rejects(f.methods.generateSparcPromptImage.call({ userId: 'admin' }, { ...request,
      situation: { target: { texts: ['Isolation.'] }, assistance: 1, evidence: [], illustrationBrief: 'Draw populations.',
        feedback: { precedingQuestion: 'What separates them?', learnerResponse: 'My private answer.' } } }), /private primitive requests/);
    assert.equal(f.assets.size, 0); assert.equal(f.providerCalls(), 0);
  });
  it('admits only human uploads, uses the current version for new selections, and preserves original decisions, bytes and captions', async () => {
    const library = sparcLibraryFixture(); const history = versionFixture(library); const f = fixture(library.store, history.store);
    const teaching = { ...request, situation: { target: { texts: ['Long-run coverage.'] }, evidence: [],
      currentValue: .2, assistance: 2.77, illustrationBrief: 'Repeated intervals and a fixed mean.' } };
    const original = await f.methods.generateSparcPromptImage.call({ userId: 'admin' }, teaching) as { figure: { assetId: string; description: string } };
    const libraryId = original.figure.assetId;
    const prior = structuredClone(library.entries.get(libraryId)!);
    const upload = { libraryId, expectedAssetId: libraryId, description: 'A human-corrected teaching figure.', mediaType: 'image/png', base64: png };
    const replacement = await f.methods.replaceSparcLibraryImage.call({ userId: 'otherAdmin' }, upload);
    assert.notEqual(replacement.assetId, libraryId); assert.equal(replacement.libraryId, libraryId);
    assert.equal(replacement.revision, 1); assert.equal(replacement.model, 'Human replacement');
    assert.deepEqual(library.entries.get(libraryId), { ...prior, currentAssetId: replacement.assetId, revision: 1 });
    assert.deepEqual(await f.methods.replaceSparcLibraryImage.call({ userId: 'otherAdmin' }, upload), replacement);
    assert.equal(f.assets.size, 2); assert.equal(history.versions.size, 2);
    const fresh = await f.methods.generateSparcPromptImage.call({ userId: 'admin' }, { ...teaching, generationId: 'new-move' }) as typeof original;
    assert.equal(fresh.figure.assetId, replacement.assetId); assert.equal(fresh.figure.description, upload.description);
    const resumed = await f.methods.generateSparcPromptImage.call({ userId: 'admin' }, teaching) as typeof original;
    assert.deepEqual(resumed.figure, original.figure);
    assert.equal((await f.methods.getSparcPromptImage.call({ userId: 'otherAdmin' }, libraryId)).dataUrl, 'data:image/png;base64,' + Buffer.from('synthetic-raster').toString('base64'));
    assert.equal((await f.methods.getSparcPromptImage.call({ userId: 'admin' }, replacement.assetId)).dataUrl, 'data:image/png;base64,' + png);
    const second = await f.methods.replaceSparcLibraryImage.call({ userId: 'admin' }, { ...upload, expectedAssetId: replacement.assetId, description: 'Second human correction.' });
    const old = await f.methods.listSparcLibraryImageVersions.call({ userId: 'otherAdmin' }, { libraryId });
    assert.deepEqual(old.versions.map(row => [row.assetId, row.revision]), [[replacement.assetId, 1], [libraryId, 0]]);
    assert.equal(old.versions[1]!.description, original.figure.description); assert.equal(old.nextCursor, null);
    // Retrying an earlier completed upload never reinstates it as the current version.
    assert.equal((await f.methods.replaceSparcLibraryImage.call({ userId: 'otherAdmin' }, upload)).assetId, second.assetId);
    const gallery = await f.methods.listSparcLibraryImages.call({ userId: 'admin' });
    assert.equal(gallery.images.length, 1); assert.equal(gallery.images[0]!.assetId, second.assetId);
    await f.methods.setSparcLibraryImageReusable.call({ userId: 'admin' }, { assetId: libraryId, reusable: false });
    const third = await f.methods.replaceSparcLibraryImage.call({ userId: 'admin' }, { ...upload, expectedAssetId: second.assetId, description: 'Third correction.' });
    assert.equal(third.reusable, false); assert.equal(f.providerCalls(), 1);
  });
  it('rejects non-admin, malformed, private and stale replacements without publishing history, and bounds old-version pages', async () => {
    const library = sparcLibraryFixture(); const history = versionFixture(library); const f = fixture(library.store, history.store);
    const teaching = { ...request, situation: { target: { texts: ['Coverage.'] }, evidence: [], currentValue: .2, assistance: 2.77, illustrationBrief: 'Intervals.' } };
    const original = await f.methods.generateSparcPromptImage.call({ userId: 'admin' }, teaching) as { figure: { assetId: string } };
    const upload = { libraryId: original.figure.assetId, expectedAssetId: original.figure.assetId, description: 'Corrected figure.', mediaType: 'image/png', base64: png };
    await assert.rejects(f.methods.replaceSparcLibraryImage.call({ userId: 'student' }, upload), /Permission denied/);
    await assert.rejects(f.methods.listSparcLibraryImageVersions.call({ userId: 'student' }, { libraryId: upload.libraryId }), /Permission denied/);
    await assert.rejects(f.methods.replaceSparcLibraryImage.call({ userId: 'admin' }, { ...upload, mediaType: 'image/svg+xml' }), /raster/);
    await assert.rejects(f.methods.replaceSparcLibraryImage.call({ userId: 'admin' }, { ...upload, base64: Buffer.from('not a PNG').toString('base64') }), /raster format/);
    await assert.rejects(f.methods.replaceSparcLibraryImage.call({ userId: 'admin' }, { ...upload, base64: 'A'.repeat(12 * 1024 * 1024) }), /8 MB/);
    await assert.rejects(f.methods.replaceSparcLibraryImage.call({ userId: 'admin' }, { ...upload, description: '<script>' }), /markup|description/);
    await assert.rejects(f.methods.replaceSparcLibraryImage.call({ userId: 'admin' }, { ...upload, libraryId: 'private' }), /not found/);
    assert.equal(f.assets.size, 1); assert.equal(history.versions.size, 0);
    const results = await Promise.allSettled([
      f.methods.replaceSparcLibraryImage.call({ userId: 'admin' }, upload),
      f.methods.replaceSparcLibraryImage.call({ userId: 'otherAdmin' }, { ...upload, description: 'Competing correction.' }),
    ]);
    assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
    assert.equal(f.assets.size, 2); assert.equal(history.versions.size, 2);
    let current = library.entries.get(upload.libraryId)!.currentAssetId!;
    for (let i = 2; i <= 26; i++) {
      current = (await f.methods.replaceSparcLibraryImage.call({ userId: 'admin' }, { ...upload, expectedAssetId: current, description: `Correction ${i}.` })).assetId;
    }
    const first = await f.methods.listSparcLibraryImageVersions.call({ userId: 'admin' }, { libraryId: upload.libraryId });
    assert.equal(first.versions.length, 24); assert.equal(first.nextCursor, 2);
    const last = await f.methods.listSparcLibraryImageVersions.call({ userId: 'admin' }, { libraryId: upload.libraryId, beforeRevision: first.nextCursor! });
    assert.deepEqual(last.versions.map(row => row.revision), [1, 0]); assert.equal(last.nextCursor, null);
    await assert.rejects(f.methods.listSparcLibraryImageVersions.call({ userId: 'admin' }, { libraryId: upload.libraryId, beforeRevision: -1 }), /cursor/);
  });
  it('does not admit a replacement until durable storage succeeds and retries the same pending asset without rewriting it', async () => {
    const library = sparcLibraryFixture(); const history = versionFixture(library); const f = fixture(library.store, history.store);
    const teaching = { ...request, situation: { target: { texts: ['Coverage.'] }, evidence: [], currentValue: .2, assistance: 2.77, illustrationBrief: 'Intervals.' } };
    const original = await f.methods.generateSparcPromptImage.call({ userId: 'admin' }, teaching) as { figure: { assetId: string } };
    const originalEntry = structuredClone(library.entries.get(original.figure.assetId));
    let fail = true; let uploads = 0;
    Object.assign(f.deps.storageBoundary, { backend: 's3', async putObject() { uploads++; if (fail) throw new Error('Synthetic storage failure'); } });
    Object.assign(f.deps.DynamicAssets.collection, { async updateAsync(selector: Record<string, any>, modifier: Record<string, any>) {
      const asset = f.assets.get(selector._id)!;
      for (const [key, value] of Object.entries(modifier.$set)) asset.meta[key.slice(5)] = value;
    } });
    const upload = { libraryId: original.figure.assetId, expectedAssetId: original.figure.assetId, description: 'Corrected figure.', mediaType: 'image/png', base64: png };
    await assert.rejects(f.methods.replaceSparcLibraryImage.call({ userId: 'admin' }, upload), /storage failure/);
    assert.deepEqual(library.entries.get(upload.libraryId), originalEntry); assert.equal(history.versions.size, 0); assert.equal(f.assets.size, 2);
    fail = false;
    const replacement = await f.methods.replaceSparcLibraryImage.call({ userId: 'admin' }, upload);
    assert.equal(f.assets.size, 2); assert.equal(history.versions.size, 2); assert.equal(uploads, 2);
    assert.equal(f.assets.get(replacement.assetId)!.meta.storageBackend, 's3');
  });

  it('inspects all completed shared figures across systems and versions, including excluded figures, in bounded pages without private state', async () => {
    const library = sparcLibraryFixture(); const f = fixture(library.store);
    for (let i = 0; i < 25; i++) {
      const id = String(i).padStart(20, '0');
      const version = i === 0 ? 'earlier-library-version' : 'sparc-teaching-figure-library-v1';
      library.entries.set(id, { _id: id, version, imageModel: 'synthetic-model', embeddingModel: 'synthetic-embedding', embeddingVersion: SPARC_INSTRUCTIONAL_NEED_VERSION,
        dimensions: 2, situation: 'Private situation', embedding: [1, 0], ready: true, reusable: i !== 0, createdAt: new Date('2026-10-12T00:00:00Z') });
      f.assets.set(id, { _id: id, userId: 'another-admin', type: 'image/png', path: 'synthetic-image',
        meta: { public: false, uploadPurpose: SPARC_PROMPT_IMAGE_PURPOSE, figureLibraryVersion: version, ready: true,
          tdfId: i % 2 ? 'system-a' : 'system-b', sessionId: 'private-session', description: `Teaching figure ${i}` } });
    }
    f.assets.set('private-prompt', { _id: 'private-prompt', meta: { public: false, ready: true, uploadPurpose: SPARC_PROMPT_IMAGE_PURPOSE } });
    library.entries.set('unfinished', { ...library.entries.get('00000000000000000001')!, _id: 'unfinished', ready: false });
    const first = await f.methods.listSparcLibraryImages.call({ userId: 'admin' });
    assert.equal(first.images.length, 24);
    assert.equal(first.images[0]!.reusable, false);
    assert.equal(first.nextCursor, '00000000000000000023');
    assert.deepEqual(Object.keys(first.images[0]!).sort(), ['assetId', 'createdAt', 'description', 'libraryId', 'model', 'reusable', 'revision']);
    const last = await f.methods.listSparcLibraryImages.call({ userId: 'otherAdmin' }, { afterId: first.nextCursor! });
    assert.equal(last.images.length, 1); assert.equal(last.nextCursor, null);
    const raster = await f.methods.getSparcPromptImage.call({ userId: 'admin' }, first.images[0]!.assetId);
    assert.ok(raster.dataUrl.startsWith('data:image/png;base64,'));
    await assert.rejects(f.methods.listSparcLibraryImages.call({ userId: 'student' }), /Permission denied/);
    await assert.rejects(f.methods.listSparcLibraryImages.call({}), /logged in/);
    await assert.rejects(f.methods.listSparcLibraryImages.call({ userId: 'admin' }, { afterId: '$invalid' }), /Invalid image cursor/);
    assert.equal(f.providerCalls(), 0);
  });

  it('reports a broken canonical asset rather than silently hiding library records', async () => {
    const library = sparcLibraryFixture(); const f = fixture(library.store);
    library.entries.set('missing', { _id: 'missing', version: 'v1', imageModel: 'synthetic-model', embeddingModel: 'synthetic-embedding', embeddingVersion: SPARC_INSTRUCTIONAL_NEED_VERSION,
      dimensions: 2, situation: 'Private situation', embedding: [1, 0], ready: true, reusable: true, createdAt: new Date() });
    await assert.rejects(f.methods.listSparcLibraryImages.call({ userId: 'admin' }), /missing its completed canonical asset/);
  });

  it('deprecates and restores shared figures, excludes new matches and preserves the saved decision and image', async () => {
    const library = sparcLibraryFixture(); const f = fixture(library.store);
    const teaching = { ...request, situation: { target: { texts: ['Long-run coverage.'] }, evidence: [],
      currentValue: .2, assistance: 2.77, illustrationBrief: 'Repeated intervals and a fixed mean.' } };
    const first = await f.methods.generateSparcPromptImage.call({ userId: 'admin' }, teaching) as { figure: { assetId: string } };
    const before = structuredClone(library.entries.get(first.figure.assetId)!);
    const decisions = structuredClone([...library.decisions.values()]);
    const excluded = await f.methods.setSparcLibraryImageReusable.call({ userId: 'otherAdmin' }, { assetId: first.figure.assetId, reusable: false });
    assert.deepEqual(excluded, { assetId: first.figure.assetId, reusable: false });
    assert.deepEqual(library.entries.get(first.figure.assetId), { ...before, reusable: false });
    assert.deepEqual([...library.decisions.values()], decisions);
    assert.equal((await f.methods.listSparcLibraryImages.call({ userId: 'admin' })).images[0]!.reusable, false);
    await f.methods.getSparcPromptImage.call({ userId: 'otherAdmin' }, first.figure.assetId);
    const resumed = await f.methods.generateSparcPromptImage.call({ userId: 'admin' }, teaching) as typeof first;
    assert.equal(resumed.figure.assetId, first.figure.assetId); assert.equal(f.providerCalls(), 1);
    const fresh = await f.methods.generateSparcPromptImage.call({ userId: 'admin' }, { ...teaching, generationId: 'next-turn' }) as typeof first;
    assert.notEqual(fresh.figure.assetId, first.figure.assetId); assert.equal(f.providerCalls(), 2);
    await f.methods.setSparcLibraryImageReusable.call({ userId: 'admin' }, { assetId: first.figure.assetId, reusable: true });
    assert.deepEqual(library.entries.get(first.figure.assetId), before);
    const restore = await f.methods.setSparcLibraryImageReusable.call({ userId: 'admin' }, { assetId: first.figure.assetId, reusable: true });
    assert.equal(restore.reusable, true);
  });

  it('rejects unauthorized curation, private or unfinished images, and non-boolean reuse states without writes', async () => {
    const library = sparcLibraryFixture(); const f = fixture(library.store);
    const params = { assetId: 'unknown', reusable: false };
    await assert.rejects(f.methods.setSparcLibraryImageReusable.call({ userId: 'student' }, params), /Permission denied/);
    await assert.rejects(f.methods.setSparcLibraryImageReusable.call({}, params), /logged in/);
    for (const reusable of [undefined, null, 0, 1, 'false', {}]) {
      await assert.rejects(f.methods.setSparcLibraryImageReusable.call({ userId: 'admin' }, { ...params, reusable } as any), /boolean reuse status/);
    }
    await assert.rejects(f.methods.setSparcLibraryImageReusable.call({ userId: 'admin' }, params), /not found/);
    const privateImage = await f.methods.generateSparcPromptImage.call({ userId: 'admin' }, request) as { figure: { assetId: string } };
    await assert.rejects(f.methods.setSparcLibraryImageReusable.call({ userId: 'admin' }, { ...params, assetId: privateImage.figure.assetId }), /not found/);
    assert.equal(library.entries.size, 0);
    assert.equal(library.decisions.size, 0);
    const pending = { _id: 'unfinished', version: 'sparc-teaching-figure-library-v1', imageModel: 'synthetic-model',
      embeddingModel: 'synthetic-embedding', embeddingVersion: SPARC_INSTRUCTIONAL_NEED_VERSION, dimensions: 2, situation: 'Private situation', embedding: [1, 0],
      ready: false, reusable: true, createdAt: new Date() };
    library.entries.set(pending._id, structuredClone(pending));
    await assert.rejects(f.methods.setSparcLibraryImageReusable.call({ userId: 'admin' }, { ...params, assetId: pending._id }), /not found/);
    assert.deepEqual(library.entries.get(pending._id), pending);
  });

  it('shares only canonical teaching-library figures across authorized users and retains each decision', async () => {
    const library = sparcLibraryFixture(); const f = fixture(library.store);
    const teaching = { ...request, tutorMessage: 'The complete teaching figure.', imagePrompt: 'Draw the full model.',
      figureDescription: 'A fixed mean and repeated intervals.', situation: { target: { texts: ['Long-run interval coverage.'] }, evidence: [], currentValue: .2, assistance: 2.77, illustrationBrief: 'Draw the full model.' } };
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
