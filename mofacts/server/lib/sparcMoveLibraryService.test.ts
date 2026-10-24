import { SPARC_VIDEO_EMBEDDING_VERSION } from '../../../learning-components/runtime/sparcVideo';
import { strict as assert } from 'node:assert';
import { createMoveLibraryService, type MoveStore, type MoveEntry, type MoveRequest } from './sparcMoveLibraryService';
import { SPARC_MOVE_LIBRARY_VERSION, type SparcPrimitiveQuery } from '../../../learning-components/runtime/sparcMoveLibraryContract';
import { SPARC_INSTRUCTIONAL_NEED_VERSION, sparcInstructionalNeedText } from '../../../learning-components/runtime/sparcInstructionalNeed';
function query(eventId = 'one', kind: SparcPrimitiveQuery['context']['kind'] = 'explanation'): SparcPrimitiveQuery {
    return { tdfId: 'lesson', sessionId: 'attempt', eventId, context: { version: SPARC_MOVE_LIBRARY_VERSION, kind, target: 'kc', move: 'example', assistance: 2.52, responseFormat: 'text', requirements: 'Meaning', components: [kind], focus: 'Unresolved', dependencies: 'null', specification: 'fixture' }, queryText: sparcInstructionalNeedText({ target: { texts: ['Meaning'] }, assistance: 2.52, evidence: [] }), previousQuestions: [] };
}
function fixture() {
    const entries = new Map<string, MoveEntry>(), requests = new Map<string, MoveRequest>(), removed = new Set<string>(), reads: string[] = [];
    const store: MoveStore = { request: async (id) => requests.get(id), saveRequest: async (r) => { if (!requests.get(r._id)?.entryId)
            requests.set(r._id, structuredClone(r)); return requests.get(r._id)!; }, entry: async (id) => { reads.push(id); return entries.get(id); }, saveEntry: async (e) => { entries.set(e._id, structuredClone(e)); }, list: async () => [...entries.values()], removed: async (id) => removed.has(id), revise: async (e) => { entries.set(e._id, e); } };
    return { entries, requests, removed, reads, service: createMoveLibraryService({ store, embeddingModel: 'fixture', videoReuseStatus: async videos => new Map(videos.map(video => [video.segmentId, true])), verifyFigure: async () => { } }) };
}
describe('Client-selected instructional persistence', () => {
    it('accepts feedback at 0.975 and rejects lower scores before reading content', async () => {
        const f = fixture();
        const saved = await f.service.publish('a', { query: query('feedback-seed', 'feedback'), embedding: [1, 0] }, { text: 'Feedback for this answer.' });
        const hit = await f.service.lookup('b', query('feedback-boundary', 'feedback'), { entryId: saved.reference.entryId, similarity: 0.975 }, [1, 0]);
        assert.equal(hit.status, 'hit');
        const reads = f.reads.length;
        for (const similarity of [0.95, 0.974999]) {
            await assert.rejects(f.service.lookup('c', query('feedback-below-' + similarity, 'feedback'), { entryId: saved.reference.entryId, similarity }, [1, 0]), /Invalid local retrieval selection/);
        }
        assert.equal(f.reads.length, reads);
    });
    it('accepts a local maximum at 0.95 and rejects a score below it before reading content', async () => {
        const f = fixture();
        const saved = await f.service.publish('a', { query: query('seed'), embedding: [1, 0] }, { text: 'Reusable instruction.' });
        const hit = await f.service.lookup('b', query('boundary'), { entryId: saved.reference.entryId, similarity: 0.95 }, [1, 0]);
        assert.equal(hit.status, 'hit');
        const reads = f.reads.length;
        await assert.rejects(f.service.lookup('c', query('below-boundary'), { entryId: saved.reference.entryId, similarity: 0.949999 }, [1, 0]), /Invalid local retrieval selection/);
        assert.equal(f.reads.length, reads);
    });
    it('fetches only the selected content and preserves its accepted decision on resume', async () => {
        const f = fixture(), q = query(), miss = await f.service.lookup('a', q, null, [1, 0]);
        if (miss.status !== 'generate')
            throw Error('Expected generation');
        assert.equal(f.requests.size, 0, 'A miss requires no pending database record');
        const saved = await f.service.publish('a', miss.ticket, { text: 'Explanation' });
        assert.equal(f.reads.length, 0, 'Publication returns accepted content without reading it again');
        const before = f.reads.length;
        const hit = await f.service.lookup('b', query('two'), { entryId: saved.reference.entryId, similarity: .995 }, [1, 0]);
        assert.equal(hit.status, 'hit');
        assert.equal(f.reads.length - before, 1, 'Retrieval fetches the selected content once');
        assert.ok(f.reads.every(id => id === saved.reference.entryId));
        assert.deepEqual(await f.service.lookup('b', query('two'), { entryId: 'different', similarity: 1 }, [0, 1]), hit);
    });
    it('publishes and retrieves a matched instruction without mixing support or accepting a partial pair', async () => {
        const f = fixture(), q = query('paired', 'instruction');
        q.context.components = ['explanation', 'richContent', 'question']; q.context.supportKind = 'written';
        const ticket = { query: q, embedding: [1, 0] };
        await assert.rejects(f.service.publish('a', ticket, { text: 'Unpaired explanation' }), /composition/);
        const content = { text: 'The governing idea.', support: { text: 'A matching worked case.', supportHeading: 'Worked Example' } };
        const saved = await f.service.publish('a', ticket, content);
        const retry = await f.service.publish('a', ticket, { text: 'Different explanation', support: { text: 'Different case' } });
        assert.deepEqual(retry, saved, 'Lost publication acknowledgements preserve the entire accepted pair');
        const hit = await f.service.lookup('b', q, { entryId: saved.reference.entryId, similarity: .999 }, [1, 0]);
        assert.equal(hit.status, 'hit');
        if (hit.status === 'hit') assert.deepEqual(hit.content, content);
        const visual = structuredClone(q); visual.context.supportKind = 'visual';
        await assert.rejects(f.service.lookup('c', visual, { entryId: saved.reference.entryId, similarity: .999 }, [1, 0]), /category/);
        f.entries.delete(saved.reference.entryId); f.removed.add(saved.reference.entryId);
        const removed = await f.service.publish('a', ticket, content);
        assert.equal(removed.content.administrativeRemoval, true);
        assert.equal(removed.content.support?.administrativeRemoval, true);
    });
    it('generates independent identical copies on concurrent misses without waiting', async () => {
        const f = fixture();
        const misses = await Promise.all([f.service.lookup('a', query('a'), null, [1, 0]), f.service.lookup('b', query('b'), null, [1, 0])]);
        const saved = await Promise.all(misses.map(async (m, i) => { if (m.status !== 'generate')
            throw Error('Expected independent miss'); return f.service.publish(i ? 'b' : 'a', m.ticket, { text: 'Same content' }); }));
        assert.notEqual(saved[0]!.reference.entryId, saved[1]!.reference.entryId);
        assert.equal(f.entries.size, 2);
    });
    it('publishes a visual directly using the existing resource vector, without an empty-vector catalog entry', async () => {
        const f = fixture(), q = query('visual', 'richContent');
        q.context.supportKind = 'visual';
        f.entries.set('asset', { _id: 'asset', embedding: [0, 1], embeddingVersion: SPARC_INSTRUCTIONAL_NEED_VERSION, embeddingModel: 'fixture' } as MoveEntry);
        const saved = await f.service.publish('a', { query: q, embedding: [] }, { text: 'Diagram', figure: { assetId: 'asset', description: 'Diagram', displayWidth: 300 } });
        assert.deepEqual(f.entries.get(saved.reference.entryId)!.embedding, [0, 1]);
        assert.deepEqual(f.reads, ['asset']);
        assert.equal(f.requests.size, 1);
        await assert.rejects(f.service.publish('a', { query: query('bad'), embedding: [] }, { text: 'Text' }), /embedding/);
    });
    it('keeps the selected video vector version when publishing its visual component', async () => {
        const f = fixture(), q = query('video', 'richContent'); q.context.supportKind = 'visual';
        const video = { segmentId: 'a'.repeat(64), videoId: 'abcdefghijk', startSeconds: 0, endSeconds: 30, transcript: 'Meaning', language: 'en', title: 'Teaching', channel: 'Channel' };
        f.entries.set(video.segmentId, { _id: video.segmentId, embedding: [1, 0], embeddingVersion: SPARC_VIDEO_EMBEDDING_VERSION, embeddingModel: 'fixture' } as MoveEntry);
        const result = await f.service.publish('a', { query: q, embedding: [] }, { text: video.transcript, video });
        assert.equal(f.entries.get(result.reference.entryId)!.embeddingVersion, SPARC_VIDEO_EMBEDDING_VERSION);
        assert.deepEqual(f.reads, [video.segmentId]);
    });
    it('rejects a selected question in another response category without trying alternatives', async () => {
        const f = fixture(), miss = await f.service.lookup('a', query('text', 'question'), null, [1, 0]);
        if (miss.status !== 'generate')
            throw Error('Expected miss');
        const saved = await f.service.publish('a', miss.ticket, { text: 'Explain meaning.' }), q = query('mc', 'question');
        q.context.responseFormat = 'multiple-choice';
        await assert.rejects(f.service.lookup('b', q, { entryId: saved.reference.entryId, similarity: 1 }, [1, 0]), /category/);
    });
    it('preserves shuffled choices across resume', async () => {
        const f = fixture(), q = query('mc', 'question');
        q.context.responseFormat = 'multiple-choice';
        const m = await f.service.lookup('a', q, null, [1, 0]);
        if (m.status !== 'generate')
            throw Error('Expected miss');
        const saved = await f.service.publish('a', m.ticket, { text: 'Choose.', choices: [{ id: 'a', label: 'A', correct: true }, { id: 'b', label: 'B', correct: false }, { id: 'c', label: 'C', correct: false }] });
        const resumed = await f.service.lookup('a', q, null, [1, 0]);
        if (resumed.status !== 'hit')
            throw Error('Expected hit');
        assert.deepEqual(resumed.content, saved.content);
    });
    it('preserves administrative removal receipts and rejects unsafe writes', async () => {
        const f = fixture(), q = query(), m = await f.service.lookup('a', q, null, [1, 0]);
        if (m.status !== 'generate')
            throw Error('Expected miss');
        await assert.rejects(f.service.publish('a', m.ticket, { text: '<script>bad()</script>' }), /Unsafe/);
        const saved = await f.service.publish('a', m.ticket, { text: 'Original' });
        await f.service.revise('a', saved.reference.entryId, { text: 'Revised' });
        assert.equal(f.entries.size, 1);
        f.removed.add(saved.reference.entryId);
        f.entries.delete(saved.reference.entryId);
        const r = await f.service.lookup('a', q, null, [1, 0]);
        if (r.status !== 'hit')
            throw Error('Expected saved receipt');
        assert.equal(r.content.administrativeRemoval, true);
    });
});
