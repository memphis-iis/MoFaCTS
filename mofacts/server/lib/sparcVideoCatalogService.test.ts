import assert from 'node:assert/strict';
import { createSparcVideoCatalog, sparcVideoCatalogTargets, type VideoCatalogStore, type VideoCatalogEntry,
  type VideoSource, type VideoTargetState, type CatalogTarget } from './sparcVideoCatalogService';
import { SparcVideoUnavailable } from './sparcVideoProviders';

const captions = [
  { id: 0, text: 'Heritable variation exists before selection.', startSeconds: 10, endSeconds: 18 },
  { id: 1, text: 'Individuals differ in reproductive success.', startSeconds: 18, endSeconds: 28 },
  { id: 2, text: 'Other discussion.', startSeconds: 40, endSeconds: 50 },
];
const range = [{ firstCaptionId: 0, lastCaptionId: 1 }];
const target: CatalogTarget = { id: 'target-one', tdfId: 'biology', pageId: 'selection', targetId: 'kc-a', targetKind: 'expectation', text: 'Heritable variation precedes selection.', topic: 'Natural selection', language: 'en' };
function fixture() {
  const sources = new Map<string, VideoSource>(), targets = new Map<string, VideoTargetState>(), entries = new Map<string, VideoCatalogEntry>();
  const origins = new Set<string>();
  const queries: string[] = [];
  let searches = 0, downloads = 0, embeddings = 0, failEmbedding = false, unavailable = false, noResults = false, pending = false;
  const store: VideoCatalogStore = {
    target: async id => targets.get(id), source: async id => sources.get(id),
    async insertTarget(row) { if (!targets.has(row._id)) targets.set(row._id, row); },
    async insertSource(row) { if (!sources.has(row._id)) sources.set(row._id, row); },
    async updateSource(id, value) { Object.assign(sources.get(id)!, value); },
    segmentIds: async ids => ids.filter(id => entries.has(id)),
    async insertSegments(rows) { for (const row of rows) entries.set(row._id, row); },
    async associate(ids, row) { for (const id of ids) origins.add(`${id}:${row.id}`); },
    withLock: async work => work(), invalidate: async () => {},
  };
  const service = createSparcVideoCatalog({ store, credentials: () => ({ youtubeApiKey: 'test', supadataApiKey: 'test' }), wait: async () => {},
    async search(_key, query) {
      searches++; queries.push(query);
      if (noResults) throw new SparcVideoUnavailable('No matching video');
      return { videoId: 'abcdefghijk', title: 'Natural selection', channel: 'Teaching channel' };
    },
    async captions(_key, _video, _language, jobId) {
      if (!jobId) downloads++;
      if (unavailable) throw new SparcVideoUnavailable('Captions unavailable');
      if (pending && !jobId) return { jobId: 'saved-job' };
      return { captions };
    },
    async embed(texts) { embeddings++; if (failEmbedding) throw new Error('Embedding service unavailable'); return texts.map(() => [1, 0]); },
  });
  return { service, entries, sources, targets, origins, queries, counts: () => ({ searches, downloads, embeddings }), noResults: () => { noResults = true; },
    failEmbedding: (value: boolean) => { failEmbedding = value; }, unavailable: () => { unavailable = true; }, pending: () => { pending = true; } };
}
describe('SPARC explicit video catalog preparation', () => {
  it('has no automatic provider work; saves one source per KC and reuses a shared transcript and passages', async () => {
    const f = fixture(); assert.deepEqual(f.counts(), { searches: 0, downloads: 0, embeddings: 0 });
    await f.service.prepare(target); await f.service.save(target, range);
    const second = { ...target, id: 'target-two', targetId: 'kc-b' };
    assert.equal((await f.service.prepare(second)).status, 'complete');
    await f.service.save(second, range); await f.service.prepare(target);
    assert.deepEqual(f.counts(), { searches: 2, downloads: 1, embeddings: 1 });
    assert.equal(f.entries.size, 1); assert.equal(f.origins.size, 2);
    const video = [...f.entries.values()][0]!.content.video;
    assert.equal(video.startSeconds, 10); assert.equal(video.endSeconds, 28);
  });
  it('reports unavailable captions for this attempt and retries that first video on the next explicit attempt', async () => {
    const f = fixture(); f.unavailable();
    assert.equal((await f.service.prepare(target)).status, 'failed');
    assert.deepEqual(f.counts(), { searches: 1, downloads: 1, embeddings: 0 });
    assert.equal((await f.service.prepare(target)).status, 'failed');
    assert.deepEqual(f.counts(), { searches: 1, downloads: 2, embeddings: 0 });
    assert.ok([...f.sources.values()].every(source => !('excluded' in source)));
  });
  it('searches the complete authored KC unchanged and stores no exclusion after empty results', async () => {
    const f = fixture(); f.noResults();
    const misconception = { ...target, id: 'misconception', targetKind: 'misconception', text: 'Evolution occurs because individuals need to change.' };
    assert.equal((await f.service.prepare(target)).status, 'failed');
    assert.equal((await f.service.prepare(misconception)).status, 'failed');
    assert.equal((await f.service.prepare(target)).status, 'failed');
    assert.deepEqual(f.queries, [target.text, misconception.text, target.text]);
    assert.equal(f.targets.size, 0); assert.equal(f.sources.size, 0);
  });
  it('preserves the provider job instead of issuing another transcript request', async () => {
    const f = fixture(); f.pending();
    assert.equal((await f.service.prepare(target)).status, 'pending');
    assert.equal((await f.service.prepare(target)).status, 'segment');
    assert.equal(f.counts().downloads, 1);
  });
  it('retains passage selection after an embedding failure and resumes without downloading or changing it', async () => {
    const f = fixture(); await f.service.prepare(target); f.failEmbedding(true);
    await assert.rejects(f.service.save(target, range), /Embedding service/);
    const resumed = await f.service.prepare(target);
    assert.ok('ranges' in resumed); assert.deepEqual(resumed.ranges, range);
    f.failEmbedding(false); await f.service.save(target, range);
    await assert.rejects(f.service.save(target, []), /Resume the saved/);
    assert.equal(f.counts().downloads, 1); assert.equal(f.entries.size, 1);
  });
  it('rejects an interval longer than 30 seconds before any embedding request', async () => {
    const f = fixture(); await f.service.prepare(target);
    await assert.rejects(f.service.save(target, [{ firstCaptionId: 0, lastCaptionId: 2 }]), /Invalid or duplicate/);
    assert.equal(f.counts().embeddings, 0);
  });
  it('retains the transcript after an empty passage selection without caching a failed selection', async () => {
    const f = fixture(); await f.service.prepare(target); assert.deepEqual(await f.service.save(target, []), { passages: 0 });
    const resumed = await f.service.prepare(target);
    assert.equal(resumed.status, 'segment'); assert.ok('captions' in resumed); assert.deepEqual(resumed.captions, captions);
    assert.ok(!('ranges' in resumed)); assert.equal(f.counts().embeddings, 0); assert.equal(f.counts().downloads, 1);
  });
  it('uses authored expectations and misconceptions, and requires the authored content language', () => {
    const tdf = { content: { tdfs: { tutor: { setspec: { lessonname: 'Biology', contentLanguage: 'en' } } } },
      rawStimuliFile: { setspec: { sparcPages: [{ pageId: 'page', display: { autoTutorTargets: { expectations: [{ clusterKC: 'a', text: 'Variation exists.' }], misconceptions: [{ id: 'm', text: 'Selection is intentional.' }] } } }] } } };
    const rows = sparcVideoCatalogTargets('tdf', tdf); assert.equal(rows.length, 2); assert.equal(rows[1]!.targetKind, 'misconception');
    tdf.content.tdfs.tutor.setspec.contentLanguage = '';
    assert.throws(() => sparcVideoCatalogTargets('tdf', tdf), /contentLanguage/);
  });
});
