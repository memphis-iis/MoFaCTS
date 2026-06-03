import { Meteor } from 'meteor/meteor';

export const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';

const MeteorAny = Meteor as typeof Meteor & { callAsync: (name: string, ...args: any[]) => Promise<any> };

export type OpenRouterSettings = {
  apiKey: string;
  model: string;
  hasOpenRouterKey: boolean;
};

export function userHasServerOpenRouterKey(user: unknown): boolean {
  return Boolean((user as any)?.profile?.openRouterHasKey);
}

export async function getOwnOpenRouterSettings(): Promise<OpenRouterSettings> {
  const settings = await MeteorAny.callAsync('getOwnOpenRouterSettings');
  return {
    apiKey: String(settings?.apiKey || '').trim(),
    model: String(settings?.model || '').trim(),
    hasOpenRouterKey: Boolean(settings?.hasOpenRouterKey || settings?.apiKey),
  };
}

export async function testOpenRouterClientConfig(apiKey: string, model: string): Promise<{ success: boolean; message: string }> {
  const trimmedKey = String(apiKey || '').trim();
  const trimmedModel = String(model || '').trim();
  if (!trimmedKey) {
    return { success: false, message: 'OpenRouter API key is required' };
  }
  if (!trimmedModel) {
    return { success: false, message: 'Default OpenRouter model is required' };
  }

  const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${trimmedKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-OpenRouter-Title': 'MoFaCTS Profile OpenRouter Test',
    },
    body: JSON.stringify({
      model: trimmedModel,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      max_tokens: 16,
      temperature: 0,
      stream: false,
    }),
  });

  if (response.ok) {
    return { success: true, message: 'Connection successful' };
  }

  let body = '';
  try {
    body = await response.text();
  } catch {
    body = '';
  }
  const lowerBody = body.toLowerCase();
  let providerMessage = '';
  try {
    const parsed = JSON.parse(body);
    const raw = parsed?.error?.metadata?.raw;
    if (typeof raw === 'string') {
      const rawParsed = JSON.parse(raw);
      providerMessage = typeof rawParsed?.error?.message === 'string' ? rawParsed.error.message : '';
    }
    if (!providerMessage && typeof parsed?.error?.message === 'string') {
      providerMessage = parsed.error.message;
    }
  } catch {
    providerMessage = '';
  }
  if (response.status === 401 || response.status === 403) return { success: false, message: 'Invalid OpenRouter key' };
  if (response.status === 404 || (lowerBody.includes('model') && lowerBody.includes('not found'))) return { success: false, message: 'Model not found' };
  if (response.status === 402 || lowerBody.includes('billing') || lowerBody.includes('quota') || lowerBody.includes('credits')) return { success: false, message: 'Billing or quota problem' };
  if (response.status === 429) return { success: false, message: 'Rate limited' };
  if (response.status >= 500) return { success: false, message: 'OpenRouter unavailable' };
  if (providerMessage) return { success: false, message: providerMessage };
  return { success: false, message: `OpenRouter request failed with HTTP ${response.status}` };
}
