/** Immutable YouTube interval. Source media stays on YouTube; this is not a media upload. */
export type SparcVideoSegment = {
  segmentId: string; videoId: string; startSeconds: number; endSeconds: number;
  transcript: string; language: string; title: string; channel: string;
};
export type SparcVideoCaption = { id: number; text: string; startSeconds: number; endSeconds: number };
export type SparcVideoRange = { firstCaptionId: number; lastCaptionId: number };
export const SPARC_VIDEO_EMBEDDING_VERSION = 'sparc-transcript-passage-v1';
export const SPARC_VIDEO_MAX_SECONDS = 30;

export function parseSparcVideoSegment(value: unknown): SparcVideoSegment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid video segment');
  const data = value as Record<string, unknown>;
  const keys = ['segmentId', 'videoId', 'startSeconds', 'endSeconds', 'transcript', 'language', 'title', 'channel'];
  if (Object.keys(data).length !== keys.length || Object.keys(data).some(key => !keys.includes(key))) throw new Error('Unexpected video segment fields');
  for (const key of ['segmentId', 'videoId', 'transcript', 'language', 'title', 'channel']) {
    if (typeof data[key] !== 'string' || !(data[key] as string).trim() || (data[key] as string).length > (key === 'transcript' ? 2048 : 500)) throw new Error(`Invalid video ${key}`);
  }
  if (!/^[a-f0-9]{64}$/.test(String(data.segmentId)) || !/^[A-Za-z0-9_-]{11}$/.test(String(data.videoId))
    || !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(String(data.language))
    || typeof data.startSeconds !== 'number' || typeof data.endSeconds !== 'number'
    || !Number.isFinite(data.startSeconds) || !Number.isFinite(data.endSeconds) || data.startSeconds < 0
    || data.endSeconds <= data.startSeconds || data.endSeconds - data.startSeconds > SPARC_VIDEO_MAX_SECONDS) throw new Error('Invalid video identity or interval');
  return data as SparcVideoSegment;
}

/** The model selects caption IDs; only code determines the actual source interval. */
export function sparcVideoPassages(captions: readonly SparcVideoCaption[], ranges: readonly SparcVideoRange[]) {
  if (!Array.isArray(ranges) || ranges.length > 200) throw new Error('Invalid video passage selection');
  const seen = new Set<string>();
  return ranges.map(range => {
    if (!range || Object.keys(range).some(key => !['firstCaptionId', 'lastCaptionId'].includes(key))
      || !Number.isInteger(range.firstCaptionId) || !Number.isInteger(range.lastCaptionId)
      || range.firstCaptionId < 0 || range.lastCaptionId < range.firstCaptionId || range.lastCaptionId >= captions.length) throw new Error('Invalid video caption IDs');
    const cues = captions.slice(range.firstCaptionId, range.lastCaptionId + 1);
    const startSeconds = cues[0]!.startSeconds, endSeconds = Math.max(...cues.map(cue => cue.endSeconds));
    const transcript = cues.map(cue => cue.text).join(' ').trim();
    const key = `${startSeconds}:${endSeconds}`;
    if (endSeconds - startSeconds > SPARC_VIDEO_MAX_SECONDS || endSeconds <= startSeconds || !transcript || transcript.length > 2048 || seen.has(key)) throw new Error('Invalid or duplicate video passage');
    seen.add(key);
    return { startSeconds, endSeconds, transcript };
  });
}
