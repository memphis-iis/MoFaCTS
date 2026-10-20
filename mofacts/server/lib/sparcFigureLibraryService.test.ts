import { sparcInstructionalNeedText, SPARC_INSTRUCTIONAL_NEED_VERSION } from '../../../learning-components/runtime/sparcInstructionalNeed';
import { strict as assert } from 'node:assert';
import { getOrGenerateSparcLibraryVisual, selectSparcLibraryFigure, type SparcVisualDecision,
  type SparcFigureLibraryEntry, type SparcFigureLibraryStore } from './sparcFigureLibraryService';
import { SPARC_FIGURE_LIBRARY_SETTINGS, normalizeSparcFigureEmbedding,
  sparcFigureMinimumSimilarity } from '../../common/lib/sparcFigureLibrary';
import { SPARC_PROMPT_IMAGE_SETTINGS } from '../../common/lib/sparcPromptImage';

export function sparcLibraryFixture() {
  const entries = new Map<string, SparcFigureLibraryEntry>();
  const decisions = new Map<string, SparcVisualDecision>();
  let lock = Promise.resolve();
  const store: SparcFigureLibraryStore = {
    async inspectEntries(ids) {
      return [...entries.values()].filter(entry => ids.includes(entry._id) && entry.ready)
        .map(({ _id, version, imageModel, createdAt }) => ({ _id, version, imageModel, createdAt }));
    },
    async inspectPage(afterId) {
      return [...entries.values()].filter(entry => entry.ready && entry._id > afterId)
        .sort((a, b) => a._id.localeCompare(b._id)).slice(0, SPARC_FIGURE_LIBRARY_SETTINGS.inspectionPageSize + 1)
        .map(({ _id, version, imageModel, createdAt }) => ({ _id, version, imageModel, createdAt }));
    },
    async findDecision(id, userId) { const value = decisions.get(id); return value?.userId === userId ? structuredClone(value) : undefined; },
    async saveDecision(decision) { if (!decisions.has(decision._id)) decisions.set(decision._id, structuredClone(decision)); },
    async findEntry(id) { const value = entries.get(id); return value ? structuredClone(value) : undefined; },
    async saveEntry(entry) { entries.set(entry._id, structuredClone(entry)); },
    async candidates(query) {
      return [...entries.values()].filter(entry => entry._id > query.afterId && entry.ready
        && entry.version === query.version && entry.imageModel === query.imageModel
        && entry.embeddingModel === query.embeddingModel && entry.dimensions === query.dimensions)
        .sort((a, b) => a._id.localeCompare(b._id)).slice(0, SPARC_FIGURE_LIBRARY_SETTINGS.batchSize).map(entry => structuredClone(entry));
    },
    async withLock(work) {
      const previous = lock;
      let release!: () => void;
      lock = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try { return await work(); } finally { release(); }
    },
  };
  return { entries, decisions, store };
}

describe('SPARC shared figure situation library', () => {
  const situation = { target: { texts: ['Confidence is long-run interval coverage.'] }, evidence: [],
    currentValue: .2, assistance: 2.77, illustrationBrief: 'Repeated intervals and one fixed mean.' };
  function request(store: SparcFigureLibraryStore, id: string, overrides = {}) {
    return { store, identity: id, assetId: id, userId: 'admin', tdfId: 'lesson', sessionId: 'session',
      situation: sparcInstructionalNeedText(situation), imagePrompt: 'Draw repeated intervals.', tutorMessage: 'Teaching intervals.',
      description: 'Intervals around a fixed mean.', displayWidth: 360, minimumSimilarity: .9,
      embed: async () => ({ vector: [1, 0], usage: { costUsd: .0001 } }),
      findVideo: async () => undefined, generate: async () => ({ usage: { costUsd: .00997 } }), ...overrides };
  }

  const video = { segmentId: 'a'.repeat(64), videoId: 'abcdefghijk', language: 'en', title: 'Synthetic passage',
    channel: 'Teaching', startSeconds: 0, endSeconds: 20, transcript: 'Intervals vary around one fixed mean.' };
  it('selects video before any image search or generation and resumes its durable snapshot without another search', async () => {
    const f = sparcLibraryFixture(); let searches = 0;
    f.store.candidates = async () => { throw new Error('Must not search images after a video hit'); };
    const first = await getOrGenerateSparcLibraryVisual(request(f.store, 'video', {
      findVideo: async () => { searches++; return { video, similarity: 1 }; },
      generate: async () => { throw new Error('Must not generate after a video hit'); },
    }));
    assert.deepEqual(first.video, video); assert.equal(first.source, 'semantic');
    const retry = await getOrGenerateSparcLibraryVisual(request(f.store, 'video', {
      embed: async () => { throw new Error('Must not embed accepted video'); },
      findVideo: async () => { throw new Error('Must not search again'); },
    }));
    assert.deepEqual(retry.video, video); assert.equal(retry.source, 'resume'); assert.equal(searches, 1);
  });
  it('uses the same brief embedding for video and image search, reusing an image only after a video miss', async () => {
    const f = sparcLibraryFixture();
    await getOrGenerateSparcLibraryVisual(request(f.store, 'seed'));
    const order: string[] = [];
    const candidates = f.store.candidates;
    f.store.candidates = async query => { order.push('image'); return candidates(query); };
    const result = await getOrGenerateSparcLibraryVisual(request(f.store, 'image', {
      embed: async (input: string) => { assert.equal(input, sparcInstructionalNeedText(situation)); order.push('embed'); return { vector: [3, 0] }; },
      findVideo: async (vector: number[]) => { assert.deepEqual(vector, [1, 0]); order.push('video'); return undefined; },
      generate: async () => { throw new Error('Image hit must not generate'); },
    }));
    assert.equal(result.assetId, 'seed'); assert.equal(result.source, 'semantic');
    assert.deepEqual(order, ['embed', 'video', 'image']);
  });
  it('returns the first durable resource if another replica saves a video while image generation is finishing', async () => {
    const f = sparcLibraryFixture();
    const result = await getOrGenerateSparcLibraryVisual(request(f.store, 'concurrent', {
      generate: async () => {
        await f.store.saveDecision({ _id: 'concurrent', kind: 'decision', userId: 'admin', tdfId: 'lesson', sessionId: 'session',
          assetId: video.segmentId, video, source: 'semantic', similarity: 1, createdAt: new Date() });
        return {};
      },
    }));
    assert.deepEqual(result.video, video); assert.equal(result.assetId, video.segmentId);
    assert.equal(result.source, 'resume');
  });
  it('generates an image after both valid misses and propagates embedding, video, image and generation errors', async () => {
    for (const failure of ['none', 'embed', 'video', 'image', 'generate']) {
      const f = sparcLibraryFixture(), order: string[] = [];
      const stage = (name: string) => { order.push(name); if (failure === name) throw new Error(`${name} unavailable`); };
      f.store.candidates = async () => { stage('image'); return []; };
      const work = getOrGenerateSparcLibraryVisual(request(f.store, failure, {
        embed: async () => { stage('embed'); return { vector: [1, 0] }; },
        findVideo: async () => { stage('video'); return undefined; },
        generate: async () => { stage('generate'); return {}; },
      }));
      if (failure === 'none') { assert.equal((await work).source, 'generated'); assert.deepEqual(order, ['embed', 'video', 'image', 'image', 'generate']); }
      else { await assert.rejects(work, new RegExp(`${failure} unavailable`)); assert.equal(order.at(-1), failure); assert.equal(f.decisions.size, 0); }
    }
  });

  it('generates for the first encounter and immediately reuses a close situation across users', async () => {
    const f = sparcLibraryFixture(); let calls = 0;
    const generate = async () => { calls++; return { usage: { costUsd: .00997 } }; };
    const first = await getOrGenerateSparcLibraryVisual(request(f.store, 'first', { generate }));
    const second = await getOrGenerateSparcLibraryVisual(request(f.store, 'second', { userId: 'otherAdmin', generate,
      embed: async () => ({ vector: [.99, .01] }) }));
    assert.equal(first.source, 'generated'); assert.equal(first.usage?.costUsd, .00997);
    assert.equal(second.source, 'semantic'); assert.equal(second.assetId, first.assetId);
    assert.equal('usage' in second, false); assert.equal(calls, 1);
    assert.equal(f.entries.get('first')!.ready, true); assert.equal(f.entries.get('first')!.generation, undefined);
  });

  it('saves and searches images with the identical canonical instructional-need input', async () => {
    const f = sparcLibraryFixture(), inputs: string[] = [];
    const embed = async (input: string) => { inputs.push(input); return { vector: [3, 4] }; };
    const first = await getOrGenerateSparcLibraryVisual(request(f.store, 'save', { embed }));
    const entry = f.entries.get(first.assetId)!;
    assert.equal(entry.situation, sparcInstructionalNeedText(situation));
    assert.equal(entry.embeddingVersion, SPARC_INSTRUCTIONAL_NEED_VERSION);
    assert.deepEqual(entry.embedding, [.6, .8]);
    const reused = await getOrGenerateSparcLibraryVisual(request(f.store, 'retrieve', { userId: 'otherAdmin', embed,
      generate: async () => { throw new Error('A matching saved figure must not generate another image'); } }));
    assert.equal(reused.source, 'semantic');
    assert.equal(reused.assetId, first.assetId);
    assert.deepEqual(inputs, [entry.situation, entry.situation]);
  });
  it('generates a new figure below the similarity threshold', async () => {
    const f = sparcLibraryFixture();
    await getOrGenerateSparcLibraryVisual(request(f.store, 'first'));
    const novel = await getOrGenerateSparcLibraryVisual(request(f.store, 'novel', { embed: async () => ({ vector: [0, 1] }) }));
    assert.equal(novel.source, 'generated'); assert.equal(novel.assetId, 'novel'); assert.equal(f.entries.size, 2);
  });
  it('resumes the original decision without another embedding or generation after library changes', async () => {
    const f = sparcLibraryFixture();
    await getOrGenerateSparcLibraryVisual(request(f.store, 'first'));
    f.entries.delete('first');
    const retry = await getOrGenerateSparcLibraryVisual(request(f.store, 'first', {
      situation: 'Changed situation', embed: async () => { throw new Error('Must not embed'); },
      generate: async () => { throw new Error('Must not generate'); } }));
    assert.equal(retry.source, 'resume'); assert.equal(retry.assetId, 'first');
    const next = await getOrGenerateSparcLibraryVisual(request(f.store, 'next'));
    assert.equal(next.source, 'generated');
  });
  it('keeps the original pending brief and embedding after an interrupted first generation', async () => {
    const f = sparcLibraryFixture();
    await assert.rejects(getOrGenerateSparcLibraryVisual(request(f.store, 'first', {
      generate: async () => { throw new Error('Provider unavailable'); } })), /Provider unavailable/);
    assert.equal(f.entries.get('first')!.ready, false);
    const retry = await getOrGenerateSparcLibraryVisual(request(f.store, 'first', {
      imagePrompt: 'Changed brief', embed: async () => { throw new Error('Must retain original embedding'); },
      generate: async (entry: SparcFigureLibraryEntry) => {
        assert.equal(entry.generation!.imagePrompt, 'Draw repeated intervals.'); return {};
      } }));
    assert.equal(retry.source, 'generated'); assert.equal(f.entries.get('first')!.ready, true);
  });
  it('serializes simultaneous first encounters and charges one image generation', async () => {
    const f = sparcLibraryFixture(); let calls = 0;
    const generate = async () => { calls++; return {}; };
    const results = await Promise.all(['first', 'second'].map(id => getOrGenerateSparcLibraryVisual(request(f.store, id, { generate }))));
    assert.equal(calls, 1); assert.equal(results[0]!.assetId, results[1]!.assetId);
    assert.equal(f.decisions.size, 2);
  });
  it('finds the true nearest entry beyond the first page without truncating the search', async () => {
    const f = sparcLibraryFixture();
    await getOrGenerateSparcLibraryVisual(request(f.store, 'seed'));
    const seed = f.entries.get('seed')!; f.entries.clear();
    for (let index = 0; index < 105; index++) {
      const id = String(index).padStart(5, '0');
      f.entries.set(id, { ...structuredClone(seed), _id: id, embedding: index === 104 ? [1, 0] : [.6, .8] });
    }
    const best = await selectSparcLibraryFigure(f.store, [1, 0], .9);
    assert.equal(best!.entry._id, '00104'); assert.equal(best!.similarity, 1);
  });
  it('rejects invalid configuration, embeddings, and unapproved identity/history fields', () => {
    assert.throws(() => sparcFigureMinimumSimilarity(1.1)); assert.throws(() => sparcFigureMinimumSimilarity('0.9'));
    assert.throws(() => normalizeSparcFigureEmbedding([0, 0])); assert.throws(() => normalizeSparcFigureEmbedding([NaN, 1]));
    assert.throws(() => sparcInstructionalNeedText({ ...situation, userId: 'private-user' }));
    assert.throws(() => sparcInstructionalNeedText({ ...situation, dialogueHistory: ['private answer'] }));
    assert.equal(sparcFigureMinimumSimilarity(undefined), .992);
    assert.equal(SPARC_PROMPT_IMAGE_SETTINGS.model, 'openai/gpt-image-2.5-sunburst');
  });
  it('keeps accepted image decisions while preventing searches across representation versions', async () => {
    const f = sparcLibraryFixture();
    await getOrGenerateSparcLibraryVisual(request(f.store, 'seed'));
    const entry = f.entries.get('seed')!;
    assert.equal(entry.embeddingVersion, SPARC_INSTRUCTIONAL_NEED_VERSION);
    entry.embeddingVersion = 'previous-representation';
    assert.equal((await getOrGenerateSparcLibraryVisual(request(f.store, 'seed'))).source, 'resume');
    await assert.rejects(selectSparcLibraryFigure(f.store, [1, 0], .992), /reindexing/);
  });
});
