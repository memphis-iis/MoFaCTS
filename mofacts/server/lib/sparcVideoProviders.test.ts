import assert from 'node:assert/strict';
import { searchSparcVideo, fetchSparcVideoCaptions, SparcVideoUnavailable } from './sparcVideoProviders';
describe('SPARC video provider contracts', () => {
  it('requests one captioned embeddable YouTube result and fetches native captions only', async () => {
    const original = globalThis.fetch;
    const urls: URL[] = [];
    globalThis.fetch = async input => {
      const url = new URL(String(input)); urls.push(url);
      return new Response(JSON.stringify(url.hostname.includes('googleapis') ? {
        items: [{ id: { videoId: 'abcdefghijk' }, snippet: { title: 'A lesson', channelTitle: 'Teaching' } }],
      } : { lang: 'en', content: [{ text: 'Variation exists.', offset: 12000, duration: 3000 }] }), { status: 200 });
    };
    try {
      await searchSparcVideo('test', 'variation', 'en');
      const result = await fetchSparcVideoCaptions('test', 'abcdefghijk', 'en');
      assert.equal(urls[0]!.searchParams.get('maxResults'), '1'); assert.equal(urls[0]!.searchParams.get('videoCaption'), 'closedCaption');
      assert.equal(urls[0]!.searchParams.get('videoEmbeddable'), 'true'); assert.equal(urls[1]!.searchParams.get('mode'), 'native');
      assert.ok('captions' in result); assert.equal(result.captions[0]!.startSeconds, 12); assert.equal(result.captions[0]!.endSeconds, 15);
    } finally { globalThis.fetch = original; }
  });
  it('stops on rate limits without retries or provider switching', async () => {
    const original = globalThis.fetch; let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('{}', { status: 429 }); };
    try { await assert.rejects(fetchSparcVideoCaptions('test', 'abcdefghijk', 'en'), /HTTP 429/); assert.equal(calls, 1); }
    finally { globalThis.fetch = original; }
  });
  it('rejects a provider language substitution and preserves asynchronous caption jobs', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ lang: 'es', content: [] }));
    try {
      await assert.rejects(fetchSparcVideoCaptions('test', 'abcdefghijk', 'en'), SparcVideoUnavailable);
      globalThis.fetch = async () => new Response(JSON.stringify({ jobId: 'saved-job' }), { status: 202 });
      assert.deepEqual(await fetchSparcVideoCaptions('test', 'abcdefghijk', 'en'), { jobId: 'saved-job' });
      globalThis.fetch = async input => { assert.equal(new URL(String(input)).pathname, '/v1/transcript/saved-job'); return new Response(JSON.stringify({ status: 'active' })); };
      assert.deepEqual(await fetchSparcVideoCaptions('test', 'abcdefghijk', 'en', 'saved-job'), { jobId: 'saved-job' });
    } finally { globalThis.fetch = original; }
  });
});
