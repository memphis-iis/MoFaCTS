import { SPARC_PROMPT_IMAGE_SETTINGS } from '../../common/lib/sparcPromptImage';
import { redactOpenRouterSecretText, type OpenRouterUsageSummary } from '../../common/lib/openRouterClient';

export type GeneratedSparcPromptImage = Readonly<{ bytes: Buffer; mediaType: string; extension: string; usage: OpenRouterUsageSummary }>;

/** Never log raw provider bodies. Return only bounded, redacted error fields. */
export async function generateSparcPromptImage(apiKey: string, prompt: string, fetchImpl: typeof fetch = fetch): Promise<GeneratedSparcPromptImage> {
  const response = await fetchImpl('https://openrouter.ai/api/v1/images', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'MoFaCTS SPARC Supported Prompt' },
    body: JSON.stringify({
      model: SPARC_PROMPT_IMAGE_SETTINGS.model, prompt, n: 1,
      quality: SPARC_PROMPT_IMAGE_SETTINGS.quality, aspect_ratio: SPARC_PROMPT_IMAGE_SETTINGS.aspectRatio,
      provider: { only: [SPARC_PROMPT_IMAGE_SETTINGS.provider], allow_fallbacks: false },
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) {
    let failure: Record<string, any> = {};
    try { failure = await response.json(); } catch { /* Non-JSON failures retain their HTTP status. */ }
    const safe = (value: unknown) => typeof value === 'string'
      ? redactOpenRouterSecretText(value.split(apiKey).join('[redacted API key]').split(prompt).join('[redacted image brief]'))
        .replace(/data:image\/[^\s"']+/gi, '[redacted image bytes]').slice(0, 800)
      : '';
    const error = failure?.error;
    const metadata = error?.metadata;
    let upstream: Record<string, any> = {};
    if (typeof metadata?.raw === 'string') {
      try { upstream = JSON.parse(metadata.raw); } catch { /* Do not expose unstructured provider bodies. */ }
    }
    const details = [safe(error?.message), safe(metadata?.provider_name),
      safe(metadata?.limit_source), safe(upstream?.error?.status), safe(upstream?.error?.message)].filter(Boolean);
    const retryAfter = safe(response.headers?.get('Retry-After'));
    if (retryAfter) details.push(`Retry-After: ${retryAfter}`);
    throw new Error(`SPARC image provider failed (HTTP ${response.status})${details.length ? ': ' + details.join('; ') : ''}`);
  }
  const body = await response.json();
  if (!Array.isArray(body?.data) || body.data.length !== 1) throw new Error('SPARC image provider must return exactly one image');
  const image = body.data[0];
  const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  if (!extensions[image?.media_type] || typeof image?.b64_json !== 'string'
    || !/^[a-zA-Z0-9+/]+={0,2}$/.test(image.b64_json)
    || image.b64_json.length > Math.ceil(SPARC_PROMPT_IMAGE_SETTINGS.maxBytes / 3) * 4) {
    throw new Error('SPARC image provider returned an invalid or oversized raster image');
  }
  const bytes = Buffer.from(image.b64_json, 'base64');
  const validHeader = image.media_type === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : image.media_type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!validHeader || bytes.length > SPARC_PROMPT_IMAGE_SETTINGS.maxBytes) throw new Error('SPARC image bytes do not match their raster format');
  const usage: { -readonly [K in keyof OpenRouterUsageSummary]: OpenRouterUsageSummary[K] } = {};
  for (const [source, target] of [['prompt_tokens', 'promptTokens'], ['completion_tokens', 'completionTokens'], ['total_tokens', 'totalTokens'], ['cost', 'costUsd']] as const) {
    const value = body.usage?.[source];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) usage[target] = value;
  }
  return { bytes, mediaType: image.media_type, extension: extensions[image.media_type]!, usage };
}
