import type { CreationModuleId } from './aiContentTypes';
import {
  getSavedOpenRouterApiKey,
  OPENROUTER_CHAT_COMPLETIONS_URL,
} from './openRouterClientProfile';
import {
  buildAutoTutorAuthoringPrompt,
  buildItemAuthoringPrompt,
} from './aiContentPrompts';

export async function callOpenRouterForItems(
  sourceText: string,
  selectedModules: CreationModuleId[],
  model: string,
) {
  const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getSavedOpenRouterApiKey()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-OpenRouter-Title': 'MoFaCTS AI Content Creator',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You create compact import-ready MoFaCTS authoring JSON. Return JSON only.' },
        { role: 'user', content: buildItemAuthoringPrompt(sourceText, selectedModules) },
      ],
      temperature: 0.3,
      stream: false,
    }),
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenRouter request failed with HTTP ${response.status}: ${bodyText.slice(0, 500)}`);
  }
  const body = JSON.parse(bodyText);
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenRouter response did not include message content.');
  }
  return content;
}

export async function callOpenRouterForAutoTutor(sourceText: string, model: string) {
  const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getSavedOpenRouterApiKey()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-OpenRouter-Title': 'MoFaCTS AI AutoTutor Creator',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You create compact import-ready MoFaCTS AutoTutor JSON. Return JSON only.' },
        { role: 'user', content: buildAutoTutorAuthoringPrompt(sourceText) },
      ],
      temperature: 0.35,
      stream: false,
    }),
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenRouter AutoTutor request failed with HTTP ${response.status}: ${bodyText.slice(0, 500)}`);
  }
  const body = JSON.parse(bodyText);
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenRouter AutoTutor response did not include message content.');
  }
  return content;
}
