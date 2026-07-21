import { Meteor } from 'meteor/meteor';
import type { OpenRouterJsonSchema } from '../../common/lib/openRouterClient';

export const WIKIMEDIA_TOPIC_SYSTEM_PROMPT = `Choose the Wikipedia collection-level article topics needed to enumerate the requested items and locate their associated images. Return only JSON matching the supplied schema.

The provider response object contains only topics. When an image-response list is supplied, return one to five unique topic strings ordered from the broadest authoritative overview to more specific collections. When no response list is supplied, return exactly one established Wikipedia overview topic for the central containing subject most likely to link to every requested branch. Prefer the short canonical subject name, not a synthesized phrase that restates the requested parts. For example, notes requesting the bones of the human hand and wrist should use "Hand", not "Human arm and wrist bones", "hand skeleton", or a list-of-all-human-bones topic. Do not add overlapping subtopics, nearby anatomical regions, or alternative phrasings of that one topic. Do not enumerate members. Do not return one query per item. Do not return URLs, explanations, image names, or any other fields.`;

export const WIKIMEDIA_TOPIC_ARRAY_SCHEMA: OpenRouterJsonSchema = {
  type: 'array',
  minItems: 1,
  maxItems: 5,
  items: {
    type: 'string',
    minLength: 1,
    maxLength: 160,
  },
};

export const WIKIMEDIA_TOPIC_RESPONSE_SCHEMA: OpenRouterJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['topics'],
  properties: {
    topics: WIKIMEDIA_TOPIC_ARRAY_SCHEMA,
  },
};

export type WikimediaTopicPlanningAttempt = {
  operation: 'topic-planning' | 'topic-repair';
  request: Record<string, unknown>;
  rawContent?: string;
  parsedContent?: unknown;
  responseBody?: unknown;
  validation: { ok: boolean; errors: string[] };
  resolvedModel?: string;
  credentialSource?: string;
  reasoningLevel?: string;
  costUsd?: number;
  error?: string;
};

export type WikimediaTopicPlan = {
  topics: string[];
  attempts: WikimediaTopicPlanningAttempt[];
};

export class WikimediaTopicPlanningError extends Error {
  constructor(message: string, readonly attempts: WikimediaTopicPlanningAttempt[]) {
    super(message);
  }
}

type OpenRouterCaller = (name: string, params: Record<string, unknown>) => Promise<any>;

const MeteorAny = Meteor as typeof Meteor & {
  callAsync: (name: string, ...args: any[]) => Promise<any>;
};

function normalizedTopic(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function validateWikimediaTopics(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('Wikipedia topic planning must return a JSON array.');
  if (value.length < 1 || value.length > 5) throw new Error('Wikipedia topic planning must return one to five topics.');
  const topics = value.map((entry, index) => {
    if (typeof entry !== 'string') throw new Error(`Wikipedia topic ${index + 1} must be text.`);
    const topic = normalizedTopic(entry);
    if (!topic) throw new Error(`Wikipedia topic ${index + 1} is blank.`);
    if (topic.length > 160) throw new Error(`Wikipedia topic ${index + 1} is longer than 160 characters.`);
    if (/https?:\/\/|\b(?:file|image)\s*:|\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(topic)) {
      throw new Error(`Wikipedia topic ${index + 1} must be a collection topic, not a URL or file name.`);
    }
    return topic;
  });
  const keys = topics.map((topic) => topic.toLocaleLowerCase());
  if (new Set(keys).size !== keys.length) throw new Error('Wikipedia topics must be unique.');
  return topics;
}

export function validateWikimediaTopicResponse(value: unknown, maxTopics = 5): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Wikipedia topic planning must return an object containing topics.');
  }
  const response = value as Record<string, unknown>;
  const extra = Object.keys(response).filter((key) => key !== 'topics');
  if (extra.length > 0) throw new Error(`Wikipedia topic planning returned unsupported fields: ${extra.join(', ')}.`);
  const topics = validateWikimediaTopics(response.topics);
  if (topics.length > maxTopics) throw new Error(`Wikipedia topic planning must return exactly ${maxTopics} topic${maxTopics === 1 ? '' : 's'} for this request.`);
  return topics;
}

export function buildWikimediaTopicPrompt(notes: string, responses: string[]): string {
  const responseSection = responses.length > 0
    ? `IMAGE RESPONSES:\n${responses.map((response, index) => `${index + 1}. ${String(response || '').trim()}`).join('\n')}`
    : 'IMAGE RESPONSES:\n(not supplied; Wikipedia must enumerate the requested set from exactly one broad overview topic)';
  return `AUTHOR NOTES:
${String(notes || '').trim()}

${responseSection}`;
}

function buildRequest(
  notes: string,
  responses: string[],
  model: string,
  operation: 'topic-planning' | 'topic-repair',
  rejected?: unknown,
  errors: string[] = [],
): Record<string, unknown> {
  const basePrompt = buildWikimediaTopicPrompt(notes, responses);
  const userPrompt = operation === 'topic-planning'
    ? basePrompt
    : `${basePrompt}

REJECTED TOPIC RESPONSE:
${JSON.stringify(rejected, null, 2)}

VALIDATION ERRORS:
${errors.map((error) => `- ${error}`).join('\n')}

Repair only the topic array. Preserve useful collection topics and return no explanation.`;
  return {
    model,
    messages: [
      { role: 'system', content: WIKIMEDIA_TOPIC_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    maxTokens: 600,
    telemetry: {
      surface: 'ai-content-creator',
      operation,
    },
    intent: {
      title: operation === 'topic-planning'
        ? 'MoFaCTS Wikimedia Topic Planning'
        : 'MoFaCTS Wikimedia Topic Repair',
      schemaName: 'mofacts_wikimedia_topics_v1',
      schema: responses.length === 0
        ? {
            ...WIKIMEDIA_TOPIC_RESPONSE_SCHEMA,
            properties: {
              topics: { ...WIKIMEDIA_TOPIC_ARRAY_SCHEMA, maxItems: 1 },
            },
          }
        : WIKIMEDIA_TOPIC_RESPONSE_SCHEMA,
      strictSchema: true,
      missingContentMessage: 'OpenRouter did not return Wikipedia search topics.',
    },
  };
}

function errorMessage(error: unknown): string {
  const value = error as { reason?: unknown; message?: unknown; details?: unknown };
  const message = String(value?.reason || value?.message || error || 'Unknown OpenRouter error');
  if (value?.details === undefined || value.details === null || value.details === '') return message;
  return `${message}\n${typeof value.details === 'string' ? value.details : JSON.stringify(value.details, null, 2)}`;
}

async function executeAttempt(
  request: Record<string, unknown>,
  operation: 'topic-planning' | 'topic-repair',
  caller: OpenRouterCaller,
  maxTopics: number,
): Promise<{ attempt: WikimediaTopicPlanningAttempt; topics?: string[]; rejected?: unknown }> {
  try {
    const result = await caller('callResolvedOpenRouterJson', request);
    try {
      const topics = validateWikimediaTopicResponse(result?.parsedContent, maxTopics);
      return {
        topics,
        attempt: {
          operation,
          request: result?.request && typeof result.request === 'object' ? result.request : request,
          rawContent: String(result?.rawContent || ''),
          parsedContent: result?.parsedContent,
          responseBody: result?.responseBody,
          validation: { ok: true, errors: [] },
          resolvedModel: String(result?.model || ''),
          credentialSource: String(result?.source || ''),
          reasoningLevel: String(result?.reasoningLevel || ''),
          ...(typeof result?.costUsd === 'number' ? { costUsd: result.costUsd } : {}),
        },
      };
    } catch (validationError) {
      return {
        rejected: result?.parsedContent,
        attempt: {
          operation,
          request: result?.request && typeof result.request === 'object' ? result.request : request,
          rawContent: String(result?.rawContent || ''),
          parsedContent: result?.parsedContent,
          responseBody: result?.responseBody,
          validation: { ok: false, errors: [errorMessage(validationError)] },
          resolvedModel: String(result?.model || ''),
          credentialSource: String(result?.source || ''),
          reasoningLevel: String(result?.reasoningLevel || ''),
          ...(typeof result?.costUsd === 'number' ? { costUsd: result.costUsd } : {}),
        },
      };
    }
  } catch (error) {
    return {
      attempt: {
        operation,
        request,
        validation: { ok: false, errors: [errorMessage(error)] },
        error: errorMessage(error),
      },
    };
  }
}

export async function planWikimediaTopics(
  notes: string,
  responses: string[],
  model: string,
  caller: OpenRouterCaller = (name, params) => MeteorAny.callAsync(name, params),
): Promise<WikimediaTopicPlan> {
  const uniqueResponses = responses.map(normalizedTopic);
  if (uniqueResponses.some((response) => !response)) {
    throw new Error('Wikipedia topic planning requires nonblank image responses.');
  }
  const responseKeys = uniqueResponses.map((response) => response.toLocaleLowerCase());
  if (new Set(responseKeys).size !== responseKeys.length) {
    throw new Error('Wikipedia topic planning requires unique image responses.');
  }
  const attempts: WikimediaTopicPlanningAttempt[] = [];
  const maxTopics = uniqueResponses.length === 0 ? 1 : 5;
  const initial = await executeAttempt(
    buildRequest(notes, uniqueResponses, model, 'topic-planning'),
    'topic-planning',
    caller,
    maxTopics,
  );
  attempts.push(initial.attempt);
  if (initial.topics) return { topics: initial.topics, attempts };
  if (initial.attempt.error) {
    throw new WikimediaTopicPlanningError(`Wikipedia topic planning failed: ${initial.attempt.error}`, attempts);
  }

  const repairErrors = initial.attempt.validation.errors;
  const repair = await executeAttempt(
    buildRequest(notes, uniqueResponses, model, 'topic-repair', initial.rejected, repairErrors),
    'topic-repair',
    caller,
    maxTopics,
  );
  attempts.push(repair.attempt);
  if (repair.topics) return { topics: repair.topics, attempts };
  throw new WikimediaTopicPlanningError(`Wikipedia topic planning failed after one repair request: ${repair.attempt.validation.errors.join(' ')}`, attempts);
}
