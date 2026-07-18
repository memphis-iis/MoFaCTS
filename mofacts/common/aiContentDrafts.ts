export type AiCreationModuleId = 'learningSession' | 'assessmentSession' | 'autoTutor';

export type AiContentDraftPhase =
  | 'interpreting'
  | 'generating'
  | 'resolving-media'
  | 'review'
  | 'saving'
  | 'complete'
  | 'failed';

export type AiAuthoringIntent = {
  requestedItemCount: number | null;
  promptModality: 'text' | 'image' | 'text-image';
  responseModality: 'typed' | 'multiple-choice';
  imagesExplicitlyRequested: boolean;
  imageRequestEvidence: string[];
  imageConstraints: string[];
};

export type AiMediaSlotStatus = 'pending' | 'resolved' | 'unresolved';

export type AiMediaSlot = {
  id: string;
  role: 'prompt';
  kind: 'image';
  required: boolean;
  query: string;
  constraints: string[];
  status: AiMediaSlotStatus;
  source?: 'wikimedia' | 'uploaded' | 'user-replacement';
  assetId?: string;
  fileName?: string;
  previewUrl?: string;
  failureReason?: string;
};

export type AiContentDraftFailure = {
  stage: AiContentDraftPhase;
  code: string;
  message: string;
};

export type AiContentDraft<TOutput = unknown> = {
  _id: string;
  ownerId: string;
  draftType: 'ai-content-creator';
  phase: AiContentDraftPhase;
  revision: number;
  sourceText: string;
  selectedModules: AiCreationModuleId[];
  model: string;
  intent?: AiAuthoringIntent;
  output?: TOutput;
  warnings: string[];
  failure?: AiContentDraftFailure;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export const AI_CONTENT_DRAFT_TYPE = 'ai-content-creator' as const;
export const AI_CONTENT_DRAFT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type DraftCompletenessOutput = {
  items?: Array<{
    prompt?: { text?: unknown; imgSrc?: unknown; mediaSlot?: AiMediaSlot };
    response?: { correctResponse?: unknown };
  }>;
};

export function isAiDraftReviewComplete(draft: { output?: DraftCompletenessOutput }): boolean {
  const items = Array.isArray(draft.output?.items) ? draft.output.items : [];
  return items.length > 0 && items.every((item) => {
    const prompt = item.prompt || {};
    const hasPrompt = Boolean(
      String(prompt.text || '').trim() ||
      String(prompt.imgSrc || '').trim() ||
      (prompt.mediaSlot && prompt.mediaSlot.status === 'resolved')
    );
    return hasPrompt && Boolean(String(item.response?.correctResponse || '').trim()) &&
      (!prompt.mediaSlot?.required || prompt.mediaSlot.status === 'resolved');
  });
}
