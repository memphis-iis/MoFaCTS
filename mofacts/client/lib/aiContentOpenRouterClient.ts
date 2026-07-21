import { Meteor } from 'meteor/meteor';
import {
  AI_CONTENT_CONTRACT_VERSION,
  AI_GENERATED_PAIR_RESPONSE_SCHEMA,
  canonicalizeGeneratedImageStimuli,
  validateGeneratedPairResponse,
} from '../../common/aiContentContract';
import type { OpenRouterRequestMessage } from './openRouterClient';
import {
  AI_CONTENT_SYSTEM_PROMPT,
  buildPairGenerationPrompt,
  buildPairRepairPrompt,
  type AiPromptUpload,
} from './aiContentPrompts';

const MeteorAny = Meteor as typeof Meteor & {
  callAsync: (name: string, ...args: any[]) => Promise<any>;
};

export type AiPairPromptImage = AiPromptUpload & {
  dataUrl: string;
};

function userMessage(prompt: string, images: AiPairPromptImage[]): OpenRouterRequestMessage {
  if (images.length === 0) return { role: 'user', content: prompt };
  return {
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      ...images.flatMap((image) => [
        { type: 'text' as const, text: `Uploaded image ${image.id}: ${image.originalName}` },
        { type: 'image_url' as const, image_url: { url: image.dataUrl } },
      ]),
    ],
  };
}

async function callPairRequest(
  model: string,
  messages: OpenRouterRequestMessage[],
  operation: 'pair-generation' | 'pair-repair',
): Promise<unknown> {
  try {
    const result = await MeteorAny.callAsync('callResolvedOpenRouterJson', {
      model,
      messages,
      maxTokens: 12000,
      telemetry: {
        surface: 'ai-content-creator',
        operation,
        contractVersion: AI_CONTENT_CONTRACT_VERSION,
      },
      intent: {
        title: operation === 'pair-generation' ? 'MoFaCTS AI Content Pairs' : 'MoFaCTS AI Content Pair Repair',
        schemaName: `mofacts_ai_content_pairs_v${AI_CONTENT_CONTRACT_VERSION}`,
        schema: AI_GENERATED_PAIR_RESPONSE_SCHEMA,
        strictSchema: true,
        missingContentMessage: 'OpenRouter did not return stimulus-response pairs.',
      },
    });
    return validateGeneratedPairResponse(canonicalizeGeneratedImageStimuli(result?.parsedContent));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('HTTP 404') && message.includes('No endpoints found that can handle the requested parameters')) {
      throw new Error(`OpenRouter pair request failed for model ${JSON.stringify(model)} because none of its current endpoints support every required strict-schema parameter. Run the Admin Tests OpenRouter preflight or select a schema-capable model. ${message}`);
    }
    throw error;
  }
}

export async function callOpenRouterForPairs(
  notes: string,
  model: string,
  images: AiPairPromptImage[] = [],
): Promise<unknown> {
  const uploadReferences = images.map(({ id, originalName }) => ({ id, originalName }));
  return callPairRequest(model, [
    { role: 'system', content: AI_CONTENT_SYSTEM_PROMPT },
    userMessage(buildPairGenerationPrompt(notes, uploadReferences), images),
  ], 'pair-generation');
}

export async function callOpenRouterForPairRepair(
  notes: string,
  model: string,
  images: AiPairPromptImage[],
  rejected: unknown,
  validationErrors: string[],
): Promise<unknown> {
  const uploadReferences = images.map(({ id, originalName }) => ({ id, originalName }));
  return callPairRequest(model, [
    { role: 'system', content: `${AI_CONTENT_SYSTEM_PROMPT}\n\nRepair the supplied candidate without changing requested image pairs into text.` },
    userMessage(buildPairRepairPrompt(notes, uploadReferences, rejected, validationErrors), images),
  ], 'pair-repair');
}
