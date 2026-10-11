import { requireBoundedSparcDialogueMessage } from './sparcDialogueTurnNodes';
import { parseSparcPromptFigure, type SparcPromptFigure } from '../../../mofacts/common/lib/sparcPromptImage';
export { parseSparcPromptFigure, type SparcPromptFigure } from '../../../mofacts/common/lib/sparcPromptImage';

export const SPARC_SUPPORTED_PROMPT_SCHEMA_ID = 'autotutor.supported_prompt';
export type SparcSupportedPrompt = { readonly tutorMessage: string; readonly figure: SparcPromptFigure };
export type SparcSupportedPromptBrief = Readonly<{ tutorMessage: string; imagePrompt: string; figureDescription: string }>;

export const SPARC_SUPPORTED_PROMPT_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['tutorMessage', 'imagePrompt', 'figureDescription'],
  properties: {
    tutorMessage: { type: 'string', minLength: 1, maxLength: 2048 },
    imagePrompt: { type: 'string', minLength: 1, maxLength: 8000 },
    figureDescription: { type: 'string', minLength: 1, maxLength: 2048 },
  },
};

function object(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== fields.length || fields.some(field => !Object.prototype.hasOwnProperty.call(value, field))) {
    throw new Error('Invalid supported Prompt fields');
  }
  return value as Record<string, unknown>;
}

export function parseSparcSupportedPromptBrief(value: unknown): SparcSupportedPromptBrief {
  const output = object(value, ['tutorMessage', 'imagePrompt', 'figureDescription']);
  if (typeof output.imagePrompt !== 'string' || !output.imagePrompt.trim() || output.imagePrompt.length > 8000) {
    throw new Error('Supported Prompt requires a bounded image-generation brief');
  }
  return {
    tutorMessage: requireBoundedSparcDialogueMessage(output.tutorMessage, 'Supported Prompt tutor message'),
    imagePrompt: output.imagePrompt.trim(),
    figureDescription: requireBoundedSparcDialogueMessage(output.figureDescription, 'Supported Prompt figure description'),
  };
}

export function parseSparcSupportedPrompt(value: unknown): SparcSupportedPrompt {
  const output = object(value, ['tutorMessage', 'figure']);
  return { tutorMessage: requireBoundedSparcDialogueMessage(output.tutorMessage, 'Supported Prompt tutor message'),
    figure: parseSparcPromptFigure(output.figure) };
}
