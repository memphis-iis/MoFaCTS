type YouTubeVideoInfo = {
  id: string;
  watchUrl: string;
  embedUrl: string;
  noCookieEmbedUrl: string;
  sourceHost: string;
};

const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function buildYouTubeVideoInfo(id: string, sourceHost: string): YouTubeVideoInfo {
  return {
    id,
    watchUrl: `https://www.youtube.com/watch?v=${id}`,
    embedUrl: `https://www.youtube.com/embed/${id}`,
    noCookieEmbedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
    sourceHost,
  };
}

function trimVideoId(rawValue: string): string {
  return rawValue.trim().split(/[?&#/]/)[0] || '';
}

function parseYouTubeVideoUrl(rawUrl: unknown): YouTubeVideoInfo | null {
  const value = String(rawUrl || '').trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let id = '';

    if (host === 'youtu.be') {
      id = trimVideoId(url.pathname.replace(/^\//, ''));
    } else if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host.endsWith('.youtube.com')) {
      id = trimVideoId(url.searchParams.get('v') || '');

      if (!id) {
        const embedMatch = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/);
        id = trimVideoId(embedMatch?.[1] || '');
      }
    }

    return YOUTUBE_VIDEO_ID_PATTERN.test(id) ? buildYouTubeVideoInfo(id, host) : null;
  } catch (_error) {
    const bareId = trimVideoId(value);
    return YOUTUBE_VIDEO_ID_PATTERN.test(bareId) ? buildYouTubeVideoInfo(bareId, 'bare-id') : null;
  }
}

export { parseYouTubeVideoUrl };
