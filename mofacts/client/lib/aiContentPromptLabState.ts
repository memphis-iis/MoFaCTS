import { AI_CONTENT_CONTRACT_VERSION } from '../../common/aiContentContract';
import {
  isOpenRouterReasoningLevel,
  type OpenRouterReasoningLevel,
} from '../../common/lib/openRouterModelCatalog';
import { createAiContentPipelineSettings, type AiContentPipelineSettings } from './aiContentPipeline';
import { AI_CONTENT_AI_STAGE_IDS, type AiContentAiStageId } from './aiContentPrompts';

export type AiContentPromptLabDraft = Readonly<{
  contractVersion: typeof AI_CONTENT_CONTRACT_VERSION;
  authorNotes: string;
  model: string;
  stages: AiContentPipelineSettings;
}>;

export type AiContentPromptLabCheckpoint = Readonly<{
  id: string;
  label: string;
  savedAt: string;
  draft: Readonly<Omit<AiContentPromptLabDraft, 'model'>>;
}>;

export type AiContentPromptLabWorkspace = Readonly<{
  contractVersion: typeof AI_CONTENT_CONTRACT_VERSION;
  draft: AiContentPromptLabDraft;
  checkpoints: readonly AiContentPromptLabCheckpoint[];
}>;

const AI_CONTENT_PROMPT_LAB_DEFAULT_AUTHOR_NOTES = 'Create image prompts for the U.S. states using plain outline maps.';
export const AI_CONTENT_PROMPT_LAB_MAX_CHECKPOINTS = 30;

function copySettings(settings: AiContentPipelineSettings): AiContentPipelineSettings {
  return Object.fromEntries(AI_CONTENT_AI_STAGE_IDS.map((stage) => [stage, { ...settings[stage] }])) as AiContentPipelineSettings;
}

const PRE_SOURCE_FIELD_STAGE_IDS = AI_CONTENT_AI_STAGE_IDS.filter((stage) => stage !== 'select-source-fields');

function parsedStageSettings(value: unknown): AiContentPipelineSettings | null {
  if (!value || typeof value !== 'object') return null;
  const settings = value as Partial<AiContentPipelineSettings>;
  if (!PRE_SOURCE_FIELD_STAGE_IDS.every((stage) => Boolean(settings[stage]))) return null;
  const inheritedReasoning = Object.values(settings)
    .map((entry) => entry?.reasoningLevel)
    .find(isOpenRouterReasoningLevel) || 'none';
  const defaults = createAiContentPipelineSettings(inheritedReasoning);
  const migrated = Object.fromEntries(AI_CONTENT_AI_STAGE_IDS.map((stage) => [
    stage,
    settings[stage] ? { ...settings[stage] } : { ...defaults[stage] },
  ])) as AiContentPipelineSettings;
  const valid = AI_CONTENT_AI_STAGE_IDS.every((stage) => {
    const entry = migrated[stage];
    if (!entry) return false;
    return typeof entry.systemPrompt === 'string'
      && typeof entry.instructions === 'string'
      && typeof entry.visibleOutputTokens === 'number'
      && Number.isFinite(entry.visibleOutputTokens)
      && entry.visibleOutputTokens > 0
      && isOpenRouterReasoningLevel(entry.reasoningLevel);
  });
  return valid ? migrated : null;
}

function validCheckpoint(value: unknown): value is AiContentPromptLabCheckpoint {
  if (!value || typeof value !== 'object') return false;
  const checkpoint = value as Partial<AiContentPromptLabCheckpoint>;
  return typeof checkpoint.id === 'string'
    && typeof checkpoint.label === 'string'
    && typeof checkpoint.savedAt === 'string'
    && checkpoint.draft?.contractVersion === AI_CONTENT_CONTRACT_VERSION
    && typeof checkpoint.draft.authorNotes === 'string'
    && Boolean(parsedStageSettings(checkpoint.draft.stages));
}

export function createAiContentPromptLabDraft(
  configuration: {
    model?: string;
    reasoningLevel?: OpenRouterReasoningLevel;
  } = {},
): AiContentPromptLabDraft {
  return {
    contractVersion: AI_CONTENT_CONTRACT_VERSION,
    authorNotes: AI_CONTENT_PROMPT_LAB_DEFAULT_AUTHOR_NOTES,
    model: String(configuration.model || '').trim(),
    stages: createAiContentPipelineSettings(configuration.reasoningLevel || 'none'),
  };
}

export function updatePromptLabStage(
  draft: AiContentPromptLabDraft,
  stage: AiContentAiStageId,
  patch: Partial<AiContentPipelineSettings[AiContentAiStageId]>,
): AiContentPromptLabDraft {
  return {
    ...draft,
    stages: {
      ...draft.stages,
      [stage]: { ...draft.stages[stage], ...patch },
    },
  };
}

export function promptLabCheckpoint(
  draft: AiContentPromptLabDraft,
  savedAt: string,
  label: string,
): AiContentPromptLabCheckpoint {
  return {
    id: globalThis.crypto.randomUUID(),
    label: String(label || '').trim() || `Checkpoint ${new Date(savedAt).toLocaleString()}`,
    savedAt,
    draft: {
      contractVersion: draft.contractVersion,
      authorNotes: draft.authorNotes,
      stages: copySettings(draft.stages),
    },
  };
}

export function parsePromptLabWorkspace(value: unknown): AiContentPromptLabWorkspace | null {
  if (!value || typeof value !== 'object') return null;
  const workspace = value as Partial<AiContentPromptLabWorkspace>;
  if (workspace.contractVersion !== AI_CONTENT_CONTRACT_VERSION) return null;
  if (!workspace.draft || workspace.draft.contractVersion !== AI_CONTENT_CONTRACT_VERSION) return null;
  if (!Array.isArray(workspace.checkpoints)) return null;
  const draftStages = parsedStageSettings(workspace.draft.stages);
  if (!draftStages) return null;
  return {
    contractVersion: AI_CONTENT_CONTRACT_VERSION,
    draft: {
      ...workspace.draft,
      model: String(workspace.draft.model || '').trim(),
      authorNotes: String(workspace.draft.authorNotes || ''),
      stages: copySettings(draftStages),
    },
    checkpoints: workspace.checkpoints
      .filter(validCheckpoint)
      .slice(0, AI_CONTENT_PROMPT_LAB_MAX_CHECKPOINTS)
      .map((checkpoint) => ({
        id: checkpoint.id,
        label: checkpoint.label,
        savedAt: checkpoint.savedAt,
        draft: {
          contractVersion: AI_CONTENT_CONTRACT_VERSION,
          authorNotes: checkpoint.draft.authorNotes,
          stages: copySettings(parsedStageSettings(checkpoint.draft.stages)!),
        },
      })),
  };
}

export function promptLabStageLabel(stage: AiContentAiStageId): string {
  const labels: Record<AiContentAiStageId, string> = {
    'interpret-request': 'Interpret request and construct list search',
    'select-list-page': 'Select Wikipedia list page',
    'select-list-region': 'Select authoritative list region',
    'select-source-fields': 'Select prompt and response source fields',
    'generate-definition': 'Generate per-item definition',
    'evaluate-direct-images': 'Evaluate list-entry images',
    'select-detail-link': 'Select canonical detail page',
    'evaluate-detail-images': 'Evaluate detail-page images',
  };
  return labels[stage];
}
