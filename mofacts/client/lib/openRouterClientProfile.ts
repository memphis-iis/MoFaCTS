import { Meteor } from 'meteor/meteor';
import {
  OPENROUTER_CHAT_COMPLETIONS_URL,
  testOpenRouterConnection,
} from './openRouterClient';
import {
  normalizeOpenRouterReasoningLevel,
  type OpenRouterReasoningLevel,
} from '../../common/lib/openRouterModelCatalog';

export { OPENROUTER_CHAT_COMPLETIONS_URL };

const MeteorAny = Meteor as typeof Meteor & { callAsync: (name: string, ...args: any[]) => Promise<any> };

export type OpenRouterSettings = {
  model: string;
  reasoningLevel: OpenRouterReasoningLevel;
  hasOpenRouterKey: boolean;
};

export type OpenRouterCapability = {
  configured: boolean;
  source: 'tdf' | 'user' | 'admin' | null;
  model: string;
  reasoningLevel: OpenRouterReasoningLevel;
};

export function userHasServerOpenRouterKey(user: unknown): boolean {
  return Boolean((user as any)?.profile?.openRouterHasKey);
}

export async function getOwnOpenRouterSettings(): Promise<OpenRouterSettings> {
  const settings = await MeteorAny.callAsync('getOwnOpenRouterSettings');
  return {
    model: String(settings?.model || '').trim(),
    reasoningLevel: normalizeOpenRouterReasoningLevel(
      settings?.reasoningLevel,
      'Stored OpenRouter reasoning level',
    ),
    hasOpenRouterKey: Boolean(settings?.hasOpenRouterKey),
  };
}

export async function getOpenRouterCapability(tdfId?: string | null): Promise<OpenRouterCapability> {
  const result = await MeteorAny.callAsync('getOpenRouterCapability', tdfId || null);
  return {
    configured: Boolean(result?.configured),
    source: ['tdf', 'user', 'admin'].includes(String(result?.source || ''))
      ? result.source
      : null,
    model: String(result?.model || '').trim(),
    reasoningLevel: normalizeOpenRouterReasoningLevel(
      result?.reasoningLevel,
      'Resolved OpenRouter reasoning level',
    ),
  };
}

export async function testOpenRouterClientConfig(
  apiKey: string,
  model: string,
  reasoningLevel: OpenRouterReasoningLevel = 'none',
): Promise<{ success: boolean; message: string }> {
  return testOpenRouterConnection(apiKey, model, reasoningLevel);
}
