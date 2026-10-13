import { parseSparcRaster } from './sparcRaster';
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
  const { bytes, mediaType, extension } = parseSparcRaster(image?.media_type, image?.b64_json);
  const usage: { -readonly [K in keyof OpenRouterUsageSummary]: OpenRouterUsageSummary[K] } = {};
  for (const [source, target] of [['prompt_tokens', 'promptTokens'], ['completion_tokens', 'completionTokens'], ['total_tokens', 'totalTokens'], ['cost', 'costUsd']] as const) {
    const value = body.usage?.[source];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) usage[target] = value;
  }
  return { bytes, mediaType, extension, usage };
}
