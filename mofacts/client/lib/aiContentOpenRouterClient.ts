import type { CreationModuleId } from './aiContentTypes';
import {
  getOwnOpenRouterSettings,
  OPENROUTER_CHAT_COMPLETIONS_URL,
} from './openRouterClientProfile';
import {
  buildAutoTutorAuthoringPrompt,
  buildItemCueRepairPrompt,
  buildItemAuthoringPrompt,
} from './aiContentPrompts';
import type { CueLeak } from './aiContentCueValidation';

type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

async function callOpenRouterJson(
  messages: OpenRouterMessage[],
  model: string,
  title: string,
  errorPrefix: string,
  missingContentMessage: string,
  temperature: number,
) {
  const settings = await getOwnOpenRouterSettings();
  const apiKey = settings.apiKey;
  if (!apiKey) {
    throw new Error('OpenRouter API key is not saved for this account.');
  }
  const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-OpenRouter-Title': title,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      stream: false,
    }),
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`${errorPrefix} failed with HTTP ${response.status}: ${bodyText.slice(0, 500)}`);
  }
  const body = JSON.parse(bodyText);
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(missingContentMessage);
  }
  return content;
}

export async function callOpenRouterForItems(
  sourceText: string,
  selectedModules: CreationModuleId[],
  model: string,
) {
  return callOpenRouterJson([
    { role: 'system', content: 'You create compact import-ready MoFaCTS authoring JSON. Return JSON only.' },
    { role: 'user', content: buildItemAuthoringPrompt(sourceText, selectedModules) },
  ], model, 'MoFaCTS AI Content Creator', 'OpenRouter request', 'OpenRouter response did not include message content.', 0.3);
}

export async function callOpenRouterForItemCueRepair(
  sourceText: string,
  selectedModules: CreationModuleId[],
  originalAiResponse: string,
  leaks: CueLeak[],
  model: string,
) {
  return callOpenRouterJson([
    { role: 'system', content: 'You create compact import-ready MoFaCTS authoring JSON. Return JSON only.' },
    { role: 'user', content: buildItemAuthoringPrompt(sourceText, selectedModules) },
    { role: 'assistant', content: originalAiResponse },
    { role: 'user', content: buildItemCueRepairPrompt(leaks) },
  ], model, 'MoFaCTS AI Content Repair', 'OpenRouter item repair request', 'OpenRouter item repair response did not include message content.', 0.1);
}

export async function callOpenRouterForAutoTutor(sourceText: string, model: string) {
  return callOpenRouterJson([
    { role: 'system', content: 'You create compact import-ready MoFaCTS AutoTutor JSON. Return JSON only.' },
    { role: 'user', content: buildAutoTutorAuthoringPrompt(sourceText) },
  ], model, 'MoFaCTS AI AutoTutor Creator', 'OpenRouter AutoTutor request', 'OpenRouter AutoTutor response did not include message content.', 0.35);
}
