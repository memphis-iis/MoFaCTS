import { Meteor } from 'meteor/meteor';
import type { CreationModuleId } from './aiContentTypes';
import {
  type OpenRouterJsonSchema,
  type OpenRouterRequestMessage,
} from './openRouterClient';
import {
  type AiContentPromptImage,
  buildIntentAuthoringPrompt,
  buildAutoTutorAuthoringPrompt,
  buildItemCountRepairPrompt,
  buildItemCueRepairPrompt,
  buildItemAuthoringPrompt,
} from './aiContentPrompts';
import type { AiAuthoringIntent } from '../../common/aiContentDrafts';
import type { CueLeak } from './aiContentCueValidation';

const AI_CONTENT_ITEM_SCHEMA: OpenRouterJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['prompt', 'response', 'sourceType'],
  properties: {
    prompt: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'string' },
        imgSrc: { type: 'string' },
        mediaQuery: { type: 'string' },
        mediaConstraints: { type: 'array', items: { type: 'string' } },
        attribution: {
          type: 'object',
          additionalProperties: false,
          properties: {
            creatorName: { type: 'string' }, sourceName: { type: 'string' }, sourceUrl: { type: 'string' },
            licenseName: { type: 'string' }, licenseUrl: { type: 'string' },
          },
        },
      },
    },
    response: {
      type: 'object',
      additionalProperties: false,
      required: ['correctResponse'],
      properties: {
        correctResponse: { type: 'string' },
        incorrectResponses: { type: 'array', items: { type: 'string' } },
      },
    },
    sourceType: { type: 'string', enum: ['freeResponse', 'choice'] },
  },
};

const AI_CONTENT_OBJECT_SCHEMA: OpenRouterJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['lessonName', 'promptType', 'responseType', 'items', 'creationSummary'],
  properties: {
    lessonName: { type: 'string' },
    instructions: { type: 'string' },
    promptType: { type: 'string', enum: ['text', 'image', 'text-image', 'audio', 'video'] },
    responseType: { type: 'string', enum: ['typed', 'multiple-choice'] },
    shuffle: { type: 'boolean' },
    buttonOrder: { type: 'string', enum: ['fixed', 'random'] },
    textToSpeechMode: { type: 'string' },
    topBarMode: { type: 'string' },
    visibility: { type: 'string', enum: ['private', 'public'] },
    visibilityLockReason: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    creationSummary: { type: 'string' },
    items: {
      type: 'array',
      minItems: 1,
      items: AI_CONTENT_ITEM_SCHEMA,
    },
  },
};

export const AI_AUTHORING_INTENT_SCHEMA: OpenRouterJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['requestedItemCount', 'promptModality', 'responseModality', 'imagesExplicitlyRequested', 'imageRequestEvidence', 'imageConstraints'],
  properties: {
    requestedItemCount: { type: ['integer', 'null'], minimum: 1, maximum: 500 },
    promptModality: { type: 'string', enum: ['text', 'image', 'text-image'] },
    responseModality: { type: 'string', enum: ['typed', 'multiple-choice'] },
    imagesExplicitlyRequested: { type: 'boolean' },
    imageRequestEvidence: { type: 'array', items: { type: 'string' } },
    imageConstraints: { type: 'array', items: { type: 'string' } },
  },
};

const AI_CUE_REPAIR_SCHEMA: OpenRouterJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['repairs'],
  properties: {
    repairs: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['itemIndex', 'prompt'],
        properties: {
          itemIndex: { type: 'integer', minimum: 0 },
          prompt: {
            type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } },
          },
        },
      },
    },
  },
};

const AI_COUNT_REPAIR_SCHEMA: OpenRouterJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: { type: 'array', minItems: 1, items: AI_CONTENT_ITEM_SCHEMA },
  },
};

const GENERIC_OBJECT_SCHEMA: OpenRouterJsonSchema = { type: 'object', additionalProperties: true };

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
  schema: OpenRouterJsonSchema = AI_CONTENT_OBJECT_SCHEMA,
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
        schema,
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
  intent?: AiAuthoringIntent,
): OpenRouterRequestMessage {
  const prompt = buildItemAuthoringPrompt(sourceText, selectedModules, uploadedImages, intent);
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
  intent?: AiAuthoringIntent,
) {
  return callOpenRouterJson([
    { role: 'system', content: 'You create compact import-ready MoFaCTS authoring JSON. Return JSON only.' },
    buildItemUserMessage(sourceText, selectedModules, uploadedImages, intent),
  ], apiKey, model, 'MoFaCTS AI Content Creator', 'OpenRouter request', 'OpenRouter response did not include message content.', 0.3, 'item-generation');
}

export async function callOpenRouterForIntent(sourceText: string, apiKey: string, model: string) {
  return callOpenRouterJson([
    { role: 'system', content: 'You interpret MoFaCTS authoring requests. Return JSON only.' },
    { role: 'user', content: buildIntentAuthoringPrompt(sourceText) },
  ], apiKey, model, 'MoFaCTS AI Authoring Intent', 'OpenRouter intent request', 'OpenRouter intent response did not include message content.', 0, 'intent-interpretation', AI_AUTHORING_INTENT_SCHEMA);
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
  ], apiKey, model, 'MoFaCTS AI Content Repair', 'OpenRouter item repair request', 'OpenRouter item repair response did not include message content.', 0.1, 'item-cue-repair', AI_CUE_REPAIR_SCHEMA);
}

export async function callOpenRouterForItemCountRepair(
  sourceText: string,
  selectedModules: CreationModuleId[],
  existingOutput: { items?: unknown[] },
  missingCount: number,
  intent: AiAuthoringIntent,
  apiKey: string,
  model: string,
  uploadedImages: AiContentRequestImage[] = [],
) {
  return callOpenRouterJson([
    { role: 'system', content: 'You complete a validated MoFaCTS item set. Return JSON only.' },
    buildItemUserMessage(sourceText, selectedModules, uploadedImages, intent),
    { role: 'user', content: buildItemCountRepairPrompt(missingCount, existingOutput.items || [], intent) },
  ], apiKey, model, 'MoFaCTS AI Item Count Repair', 'OpenRouter item-count repair request', 'OpenRouter item-count repair response did not include message content.', 0.2, 'item-count-repair', AI_COUNT_REPAIR_SCHEMA);
}

export async function callOpenRouterForAutoTutor(sourceText: string, apiKey: string, model: string) {
  return callOpenRouterJson([
    { role: 'system', content: 'You create compact import-ready MoFaCTS AutoTutor JSON. Return JSON only.' },
    { role: 'user', content: buildAutoTutorAuthoringPrompt(sourceText) },
  ], apiKey, model, 'MoFaCTS AI AutoTutor Creator', 'OpenRouter AutoTutor request', 'OpenRouter AutoTutor response did not include message content.', 0.35, 'autotutor-authoring', GENERIC_OBJECT_SCHEMA);
}
