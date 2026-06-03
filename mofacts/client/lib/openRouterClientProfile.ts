const OPENROUTER_KEY_STORAGE_KEY = 'mofacts.openRouter.apiKey';

export const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

export function getSavedOpenRouterApiKey(): string {
  if (!canUseLocalStorage()) {
    return '';
  }
  return String(window.localStorage.getItem(OPENROUTER_KEY_STORAGE_KEY) || '').trim();
}

export function hasSavedOpenRouterApiKey(): boolean {
  return getSavedOpenRouterApiKey().length > 0;
}

export function saveOpenRouterApiKey(apiKey: string): void {
  if (!canUseLocalStorage()) {
    throw new Error('Browser storage is unavailable; OpenRouter keys must stay client-side.');
  }
  const trimmed = String(apiKey || '').trim();
  if (!trimmed) {
    return;
  }
  if (/\s/.test(trimmed)) {
    throw new Error('OpenRouter API key cannot contain whitespace.');
  }
  window.localStorage.setItem(OPENROUTER_KEY_STORAGE_KEY, trimmed);
}

export function deleteSavedOpenRouterApiKey(): void {
  if (canUseLocalStorage()) {
    window.localStorage.removeItem(OPENROUTER_KEY_STORAGE_KEY);
  }
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
      max_tokens: 3,
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
  if (response.status === 401 || response.status === 403) return { success: false, message: 'Invalid OpenRouter key' };
  if (response.status === 404 || (lowerBody.includes('model') && lowerBody.includes('not found'))) return { success: false, message: 'Model not found' };
  if (response.status === 402 || lowerBody.includes('billing') || lowerBody.includes('quota') || lowerBody.includes('credits')) return { success: false, message: 'Billing or quota problem' };
  if (response.status === 429) return { success: false, message: 'Rate limited' };
  if (response.status >= 500) return { success: false, message: 'OpenRouter unavailable' };
  return { success: false, message: `OpenRouter request failed with HTTP ${response.status}` };
}
