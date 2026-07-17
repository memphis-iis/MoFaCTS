import { Meteor } from 'meteor/meteor';
import type { CreationModuleId } from './aiContentTypes';
import {
  type OpenRouterJsonSchema,
  type OpenRouterRequestMessage,
} from './openRouterClient';
import {
  type AiContentPromptImage,
  buildAutoTutorAuthoringPrompt,
  buildItemCueRepairPrompt,
  buildItemAuthoringPrompt,
} from './aiContentPrompts';
import type { CueLeak } from './aiContentCueValidation';

const AI_CONTENT_OBJECT_SCHEMA: OpenRouterJsonSchema = {
  type: 'object',
  additionalProperties: true,
};

const MeteorAny = Meteor as typeof Meteor & { callAsync: (name: string, ...args: any[]) => Promise<any> };

async function callOpenRouterJson(
  messages: OpenRouterRequestMessage[],
  apiKey: string,
  model: string,
  title: string,
  errorPrefix: string,
  missingContentMessage: string,
  temperature: number,
  operation: string,
) {
  try {
    const result = await MeteorAny.callAsync('callResolvedOpenRouterJson', {
      model,
      messages,
      temperature,
      telemetry: {
        surface: 'ai-content-creator',
        operation,
      },
      intent: {
        title,
        schemaName: title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'mofacts_ai_content',
        schema: AI_CONTENT_OBJECT_SCHEMA,
        missingContentMessage,
      },
      ...(apiKey ? { initialUserKeyPresent: true } : {}),
    });
    return result.rawContent;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('OpenRouter API key') || message === missingContentMessage) {
      throw error;
    }
    throw new Error(`${errorPrefix} failed: ${message}`);
  }
}

export type AiContentRequestImage = AiContentPromptImage & {
  dataUrl: string;
};

function buildItemUserMessage(
  sourceText: string,
  selectedModules: CreationModuleId[],
  uploadedImages: AiContentRequestImage[],
): OpenRouterRequestMessage {
  const prompt = buildItemAuthoringPrompt(sourceText, selectedModules, uploadedImages);
  if (uploadedImages.length === 0) {
    return { role: 'user', content: prompt };
  }
  return {
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      ...uploadedImages.flatMap((image) => [
        { type: 'text' as const, text: `Uploaded image assetFileName: ${image.packageFileName}; originalFileName: ${image.originalName}` },
        { type: 'image_url' as const, image_url: { url: image.dataUrl } },
      ]),
    ],
  };
}

export async function callOpenRouterForItems(
  sourceText: string,
  selectedModules: CreationModuleId[],
  apiKey: string,
  model: string,
  uploadedImages: AiContentRequestImage[] = [],
) {
  return callOpenRouterJson([
    { role: 'system', content: 'You create compact import-ready MoFaCTS authoring JSON. Return JSON only.' },
    buildItemUserMessage(sourceText, selectedModules, uploadedImages),
  ], apiKey, model, 'MoFaCTS AI Content Creator', 'OpenRouter request', 'OpenRouter response did not include message content.', 0.3, 'item-generation');
}

export async function callOpenRouterForItemCueRepair(
  sourceText: string,
  selectedModules: CreationModuleId[],
  originalAiResponse: string,
  leaks: CueLeak[],
  apiKey: string,
  model: string,
  uploadedImages: AiContentRequestImage[] = [],
) {
  return callOpenRouterJson([
    { role: 'system', content: 'You create compact import-ready MoFaCTS authoring JSON. Return JSON only.' },
    buildItemUserMessage(sourceText, selectedModules, uploadedImages),
    { role: 'assistant', content: originalAiResponse },
    { role: 'user', content: buildItemCueRepairPrompt(leaks) },
  ], apiKey, model, 'MoFaCTS AI Content Repair', 'OpenRouter item repair request', 'OpenRouter item repair response did not include message content.', 0.1, 'item-cue-repair');
}

export async function callOpenRouterForAutoTutor(sourceText: string, apiKey: string, model: string) {
  return callOpenRouterJson([
    { role: 'system', content: 'You create compact import-ready MoFaCTS AutoTutor JSON. Return JSON only.' },
    { role: 'user', content: buildAutoTutorAuthoringPrompt(sourceText) },
  ], apiKey, model, 'MoFaCTS AI AutoTutor Creator', 'OpenRouter AutoTutor request', 'OpenRouter AutoTutor response did not include message content.', 0.35, 'autotutor-authoring');
}
