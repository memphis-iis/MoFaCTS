import type { AiAuthoringIntent } from '../../common/aiContentDrafts';
import { Random } from 'meteor/random';
import type { AiLessonOutput } from './aiContentTypes';

export function parseStrictAiJson(raw: string, label: string): unknown {
  const trimmed = String(raw || '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`${label} was not valid schema-conforming JSON.`);
  }
}

export function validateAiAuthoringIntent(value: unknown, sourceText: string): AiAuthoringIntent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI authoring intent was not a JSON object.');
  }
  const source = value as Record<string, unknown>;
  const requestedItemCount = source.requestedItemCount === null
    ? null
    : Number(source.requestedItemCount);
  if (requestedItemCount !== null && (!Number.isInteger(requestedItemCount) || requestedItemCount < 1 || requestedItemCount > 500)) {
    throw new Error('AI authoring intent returned an invalid requested item count.');
  }
  const promptModality = String(source.promptModality || '');
  const responseModality = String(source.responseModality || '');
  if (!['text', 'image', 'text-image'].includes(promptModality) || !['typed', 'multiple-choice'].includes(responseModality)) {
    throw new Error('AI authoring intent returned an unsupported prompt or response modality.');
  }
  const imagesExplicitlyRequested = source.imagesExplicitlyRequested === true;
  const imageRequestEvidence = Array.isArray(source.imageRequestEvidence)
    ? source.imageRequestEvidence.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];
  const normalizedSource = sourceText.toLocaleLowerCase();
  const imageRequestIsNegated = /\b(?:no|without|do not|don't|not)\s+(?:any\s+)?(?:images?|pictures?|photos?|photographs?|maps?|diagrams?)\b/i.test(sourceText);
  if (imagesExplicitlyRequested && imageRequestIsNegated) {
    throw new Error('AI authoring intent contradicted an explicit image negation in the request.');
  }
  if (imagesExplicitlyRequested && (
    imageRequestEvidence.length === 0 ||
    imageRequestEvidence.some((evidence) => !normalizedSource.includes(evidence.toLocaleLowerCase()))
  )) {
    throw new Error('AI authoring intent did not provide exact source-text evidence for image use.');
  }
  if (!imagesExplicitlyRequested && promptModality !== 'text') {
    throw new Error('AI authoring intent selected an image prompt without explicit image evidence.');
  }
  if (imagesExplicitlyRequested && promptModality === 'text') {
    throw new Error('AI authoring intent recorded image evidence but selected a text-only prompt modality.');
  }
  return {
    requestedItemCount,
    promptModality: promptModality as AiAuthoringIntent['promptModality'],
    responseModality: responseModality as AiAuthoringIntent['responseModality'],
    imagesExplicitlyRequested,
    imageRequestEvidence,
    imageConstraints: Array.isArray(source.imageConstraints)
      ? source.imageConstraints.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [],
  };
}

export function materializeAiDraftOutput(output: AiLessonOutput, intent: AiAuthoringIntent, requireRequestedCount = true): AiLessonOutput {
  const items = Array.isArray(output.items) ? output.items : [];
  if (requireRequestedCount && intent.requestedItemCount !== null && items.length !== intent.requestedItemCount) {
    throw new Error(`AI generated ${items.length} items, but the authoring request requires exactly ${intent.requestedItemCount}.`);
  }
  return {
    ...output,
    promptType: intent.promptModality,
    responseType: intent.responseModality,
    items: items.map((item) => {
      const id = String(item.id || Random.id());
      const prompt = { ...(item.prompt || {}) };
      if (!intent.imagesExplicitlyRequested) {
        delete prompt.mediaQuery;
        delete prompt.mediaConstraints;
        delete prompt.mediaSlot;
        return { ...item, id, prompt };
      }
      const query = String(prompt.mediaQuery || item.response?.correctResponse || '').trim();
      if (!query) {
        throw new Error(`Generated item ${id} is missing an image search query.`);
      }
      const constraints = Array.from(new Set([
        ...intent.imageConstraints,
        ...(Array.isArray(prompt.mediaConstraints) ? prompt.mediaConstraints : []),
      ].map((entry) => String(entry || '').trim()).filter(Boolean)));
      const uploadedImage = String(prompt.imgSrc || '').trim() && !/^https?:\/\//i.test(String(prompt.imgSrc));
      if (/^https?:\/\//i.test(String(prompt.imgSrc || ''))) {
        delete prompt.imgSrc;
        delete prompt.attribution;
      }
      prompt.mediaQuery = query;
      prompt.mediaConstraints = constraints;
      prompt.mediaSlot = {
        id: String(prompt.mediaSlot?.id || Random.id()),
        role: 'prompt',
        kind: 'image',
        required: true,
        query,
        constraints,
        status: uploadedImage ? 'resolved' : 'pending',
        ...(uploadedImage ? { source: 'uploaded' as const, fileName: String(prompt.imgSrc) } : {}),
      };
      return { ...item, id, prompt };
    }),
  };
}
