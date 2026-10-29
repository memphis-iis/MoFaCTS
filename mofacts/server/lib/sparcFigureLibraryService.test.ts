import { strict as assert } from 'node:assert';
import { getOrGenerateSparcLibraryVisual, type SparcVisualDecision, type SparcFigureLibraryEntry, type SparcFigureLibraryStore } from './sparcFigureLibraryService';
import { sparcInstructionalNeedText } from '../../../learning-components/runtime/sparcInstructionalNeed';
import type { SparcVideoSegment } from '../../../learning-components/runtime/sparcVideo';
export function sparcLibraryFixture() {
    const entries = new Map<string, SparcFigureLibraryEntry>(), decisions = new Map<string, SparcVisualDecision>(), videos = new Map<string, SparcVideoSegment>();
    const store: SparcFigureLibraryStore = { inspectEntries: async (ids) => [...entries.values()].filter(e => ids.includes(e._id) && e.ready), inspectPage: async (after) => [...entries.values()].filter(e => e._id > after && e.ready).sort((a, b) => a._id.localeCompare(b._id)).slice(0, 25), findDecision: async (id, userId) => decisions.get(id)?.userId === userId ? decisions.get(id) : undefined, saveDecision: async (d) => {
            if (decisions.has(d._id)) return;
            if ([...decisions.values()].some(previous => previous.userId === d.userId && previous.assetId === d.assetId)) throw new Error('SPARC content has already been used by this learner');
            decisions.set(d._id, structuredClone(d)); }, findEntry: async (id) => entries.get(id), saveEntry: async (e) => { entries.set(e._id, structuredClone(e)); }, findVisual: async (id, language) => { const video = videos.get(id); if (video?.language === language)
            return { video }; const entry = entries.get(id); return entry?.ready ? { entry } : undefined; }, withLock: async (work) => work() };
    return { entries, decisions, videos, store };
}
describe('Browser-selected visual persistence', () => {
    const situation = sparcInstructionalNeedText({ target: { texts: ['Coverage'] }, assistance: 2.77, evidence: [], illustrationBrief: 'Repeated intervals' });
    const request = (store: SparcFigureLibraryStore, id: string) => ({ store, identity: id, assetId: id, userId: 'admin', tdfId: 'lesson', sessionId: 'attempt', situation, imagePrompt: 'Draw intervals', tutorMessage: 'Intervals', description: 'Repeated intervals', displayWidth: 360, selection: null, embedding: [1, 0], language: 'en', generate: async () => ({ usage: { costUsd: .01 } }) });
    it('accepts exactly the selected video at .95 and resumes without reselection', async () => {
        const f = sparcLibraryFixture(), video = { segmentId: 'a'.repeat(64), videoId: 'abcdefghijk', language: 'en', title: 'Passage', channel: 'Teaching', startSeconds: 0, endSeconds: 10, transcript: 'Intervals vary.' };
        f.videos.set(video.segmentId, video);
        const result = await getOrGenerateSparcLibraryVisual({ ...request(f.store, 'turn'), selection: { entryId: video.segmentId, similarity: .95 }, generate: async () => { throw Error('Must not generate'); } });
        assert.deepEqual(result.video, video);
        assert.equal(f.entries.size, 0);
        f.store.findVisual = async () => { throw Error('Must not reselect'); };
        assert.equal((await getOrGenerateSparcLibraryVisual(request(f.store, 'turn'))).source, 'resume');
    });
    it('allows simultaneous misses to generate independent images without any lock', async () => {
        const f = sparcLibraryFixture();
        let calls = 0;
        f.store.withLock = async () => { throw Error('Practice must not lock'); };
        await Promise.all(['a', 'b'].map(id => getOrGenerateSparcLibraryVisual({ ...request(f.store, id), generate: async () => { calls++; return {}; } })));
        assert.equal(calls, 2);
        assert.equal(f.entries.size, 2);
        assert.equal(f.decisions.size, 2);
    });
    it('reads one selected image and fails clearly on stale or below-threshold selection', async () => {
        const f = sparcLibraryFixture();
        await getOrGenerateSparcLibraryVisual(request(f.store, 'image'));
        const hit = await getOrGenerateSparcLibraryVisual({ ...request(f.store, 'other'), userId: 'another-learner', selection: { entryId: 'image', similarity: .95 } });
        assert.equal(hit.assetId, 'image');
        assert.equal(f.entries.size, 1);
        await assert.rejects(getOrGenerateSparcLibraryVisual({ ...request(f.store, 'missing'), selection: { entryId: 'gone', similarity: 1 } }), /unavailable/);
        await assert.rejects(getOrGenerateSparcLibraryVisual({ ...request(f.store, 'low'), selection: { entryId: 'image', similarity: .94 } }), /0.95/);
    });
    it('rejects reuse of an image or video by the same learner and preserves the accepted event on resume', async () => {
        const f = sparcLibraryFixture();
        const first = await getOrGenerateSparcLibraryVisual(request(f.store, 'first'));
        await assert.rejects(getOrGenerateSparcLibraryVisual({ ...request(f.store, 'second'), sessionId: 'next-attempt',
            selection: { entryId: first.assetId, similarity: 1 } }), /already been used/);
        assert.equal((await getOrGenerateSparcLibraryVisual(request(f.store, 'first'))).assetId, first.assetId);
        const video = { segmentId: 'a'.repeat(64), videoId: 'abcdefghijk', language: 'en', title: 'Passage', channel: 'Teaching', startSeconds: 0, endSeconds: 10, transcript: 'Intervals vary.' };
        f.videos.set(video.segmentId, video);
        const selected = { ...request(f.store, 'video-first'), selection: { entryId: video.segmentId, similarity: 1 } };
        await getOrGenerateSparcLibraryVisual(selected);
        await assert.rejects(getOrGenerateSparcLibraryVisual({ ...selected, identity: 'video-next', sessionId: 'next-attempt' }), /already been used/);
        assert.equal(f.decisions.size, 2);
    });
});
