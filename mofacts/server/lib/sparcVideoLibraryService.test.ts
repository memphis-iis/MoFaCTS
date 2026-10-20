import { strict as assert } from 'node:assert';
import { selectSparcLibraryVideo, type SparcVideoCandidate } from './sparcVideoLibraryService';

const candidate = (index: number, embedding: number[] = [1, 0]): SparcVideoCandidate => {
  const id = index.toString(16).padStart(64, '0');
  return { _id: id, embedding, content: { video: { segmentId: id, videoId: 'abcdefghijk', language: 'en',
    title: 'Synthetic passage', channel: 'Teaching', startSeconds: 0, endSeconds: 20, transcript: 'A relationship is illustrated.' } } };
};
describe('SPARC video library selection', () => {
  it('returns a miss for an empty catalog or only below-threshold passages, and accepts the cutoff itself', async () => {
    const search = (rows: SparcVideoCandidate[]) => selectSparcLibraryVideo({ vector: [1, 0], language: 'en', minimumSimilarity: .8, page: async () => rows });
    assert.equal(await search([]), undefined);
    assert.equal(await search([candidate(1, [0, 1])]), undefined);
    assert.equal((await search([candidate(1, [.8, .6])]))?.video.segmentId, candidate(1)._id);
  });
  it('selects the nearest eligible passage across all pages with stable tie breaking', async () => {
    const rows = Array.from({ length: 105 }, (_, i) => candidate(i + 1, i >= 103 ? [1, 0] : [.8, .6]));
    const pages: string[] = [];
    const found = await selectSparcLibraryVideo({ vector: [1, 0], language: 'en', minimumSimilarity: .9,
      page: async after => { pages.push(after); return rows.filter(row => row._id > after).slice(0, 100); } });
    assert.equal(pages.length, 2); assert.equal(found?.video.segmentId, candidate(104)._id);
  });
  it('propagates storage errors and rejects invalid language, vectors and candidate records', async () => {
    const params = { vector: [1, 0], language: 'en', minimumSimilarity: .9, page: async () => [candidate(1)] };
    await assert.rejects(selectSparcLibraryVideo({ ...params, page: async () => { throw new Error('Storage unavailable'); } }), /Storage unavailable/);
    await assert.rejects(selectSparcLibraryVideo({ ...params, language: '' }), /content language/);
    await assert.rejects(selectSparcLibraryVideo({ ...params, vector: [1, 0, 0] }), /dimensions/);
    await assert.rejects(selectSparcLibraryVideo({ ...params, page: async () => [{ ...candidate(1), _id: candidate(2)._id }] }), /invalid candidate/);
    await assert.rejects(selectSparcLibraryVideo({ ...params, minimumSimilarity: 2 }), /between 0 and 1/);
  });
});
