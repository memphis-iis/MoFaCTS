import type { SparcVideoCaption } from '../../../learning-components/runtime/sparcVideo';

export class SparcVideoUnavailable extends Error {}
type JsonRecord = Record<string, any>;
async function jsonRequest(url: URL, headers: Record<string, string>, provider: string): Promise<JsonRecord> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as JsonRecord | null;
    if (provider === 'Supadata' && body?.error === 'transcript-unavailable') throw new SparcVideoUnavailable('Existing captions are unavailable for the selected video');
    throw new Error(`${provider} request failed (HTTP ${response.status}); catalog preparation stopped`);
  }
  if (response.status === 206) throw new Error(`${provider} returned a partial transcript; catalog preparation stopped`);
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`Invalid ${provider} response`);
  return data as JsonRecord;
}
export async function searchSparcVideo(apiKey: string, query: string, language: string) {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  for (const [key, value] of Object.entries({ key: apiKey, part: 'snippet', type: 'video', q: query, maxResults: '1',
    order: 'relevance', videoCaption: 'closedCaption', videoEmbeddable: 'true', safeSearch: 'strict', relevanceLanguage: ['zh-Hans', 'zh-Hant'].includes(language) ? language : language.split('-')[0]! })) url.searchParams.set(key, value);
  const data = await jsonRequest(url, {}, 'YouTube');
  if (!Array.isArray(data.items)) throw new Error('Invalid YouTube search results');
  if (!data.items.length) throw new SparcVideoUnavailable('No captioned, embeddable video matched this target');
  const item = data.items[0];
  if (!/^[A-Za-z0-9_-]{11}$/.test(item?.id?.videoId) || typeof item?.snippet?.title !== 'string' || typeof item?.snippet?.channelTitle !== 'string') throw new Error('Invalid YouTube video metadata');
  return { videoId: String(item.id.videoId), title: String(item.snippet.title), channel: String(item.snippet.channelTitle) };
}
export async function fetchSparcVideoCaptions(apiKey: string, videoId: string, language: string, jobId?: string): Promise<{ captions: SparcVideoCaption[] } | { jobId: string }> {
  if (jobId !== undefined && !/^[A-Za-z0-9_-]{1,200}$/.test(jobId)) throw new Error('Invalid saved transcript job');
  const url = new URL(jobId ? `https://api.supadata.ai/v1/transcript/${encodeURIComponent(jobId)}` : 'https://api.supadata.ai/v1/transcript');
  if (!jobId) for (const [key, value] of Object.entries({ url: `https://www.youtube.com/watch?v=${videoId}`, lang: language.split('-')[0]!, text: 'false', mode: 'native', chunkSize: '100' })) url.searchParams.set(key, value);
  const data = await jsonRequest(url, { 'x-api-key': apiKey }, 'Supadata');
  if (typeof data.jobId === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(data.jobId)) return { jobId: data.jobId };
  if (jobId && ['queued', 'active'].includes(data.status)) return { jobId };
  if (jobId && data.status !== 'completed') throw new Error('The saved transcript job failed or returned an invalid status');
  if (typeof data.lang !== 'string' || data.lang.toLowerCase().split('-')[0] !== language.toLowerCase().split('-')[0]) throw new SparcVideoUnavailable('Selected video captions do not match the authored content language');
  if (!Array.isArray(data.content) || !data.content.length || data.content.length > 20000) throw new Error('Invalid or oversized caption response');
  const captions: SparcVideoCaption[] = data.content.map((cue: JsonRecord, id: number) => {
    if (!cue || typeof cue.text !== 'string' || !cue.text.trim() || !Number.isFinite(cue.offset) || !Number.isFinite(cue.duration)
      || cue.offset < 0 || cue.duration <= 0 || cue.text.length > 2048) throw new Error('Invalid timestamped caption');
    return { id, text: cue.text.trim(), startSeconds: cue.offset / 1000, endSeconds: (cue.offset + cue.duration) / 1000 };
  });
  if (captions.some((cue, i) => i > 0 && cue.startSeconds < captions[i - 1]!.startSeconds) || JSON.stringify(captions).length > 1000000) throw new Error('Caption timeline is unordered or too large');
  return { captions };
}
