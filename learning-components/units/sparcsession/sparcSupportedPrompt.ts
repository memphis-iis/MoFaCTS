import { requireBoundedSparcDialogueMessage } from './sparcDialogueTurnNodes';
import { parseSparcPromptFigure, parseSparcPromptDisplayWidth, SPARC_PROMPT_IMAGE_SETTINGS, type SparcPromptFigure } from '../../../mofacts/common/lib/sparcPromptImage';
export { parseSparcPromptFigure, type SparcPromptFigure } from '../../../mofacts/common/lib/sparcPromptImage';

export const SPARC_SUPPORTED_PROMPT_SCHEMA_ID = 'autotutor.supported_prompt';
export const SPARC_SUPPORTED_PROMPT_COMPOSITION_POLICY = 'Choose a compact canvas shape that fits the required figure rather than a fixed poster layout. For a sparse horizontal schematic, choose a wide, shallow canvas; for other content, choose the shape that fits its actual layout. Frame the entire figure as one tightly fitted textbook panel, with outer padding of roughly one or two label heights. Scale and arrange the content to occupy most of the canvas, rather than leaving a poster-sized background. Group related elements closely and keep labels next to their elements; separate legend symbols need only a small gap from the main figure. Avoid oversized blank regions and excessive gaps; an omitted feature or relation does not require a large empty area. Use empty space only where it has instructional meaning, and preserve spacing that encodes a meaningful distance, time, magnitude, or other relationship. Keep the figure legible and do not imply an unknown relationship through accidental positioning.';
export type SparcSupportedPrompt = { readonly tutorMessage: string; readonly figure: SparcPromptFigure };
export const SPARC_SUPPORTED_PROMPT_SIZING_POLICY = `Estimate the smallest comfortable displayWidth in CSS pixels, from ${SPARC_PROMPT_IMAGE_SETTINGS.minDisplayWidth} to ${SPARC_PROMPT_IMAGE_SETTINGS.maxDisplayWidth}, based on the required visual elements, number and length of labels, and relationships that must be understood. Sparse figures with a few short labels need less display space; denser figures may use the maximum. Keep labels readable at the estimated width, aiming for at least 14-pixel text when displayed. Estimate display space only, not detailed element positions or a full layout specification. Include the intended display width and readability requirements in imagePrompt.`;
export type SparcSupportedPromptBrief = Readonly<{ tutorMessage: string; imagePrompt: string; figureDescription: string; displayWidth: number }>;

export const SPARC_SUPPORTED_PROMPT_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['tutorMessage', 'imagePrompt', 'figureDescription', 'displayWidth'],
  properties: {
    tutorMessage: { type: 'string', minLength: 1, maxLength: 2048 },
    imagePrompt: { type: 'string', minLength: 1, maxLength: 8000 },
    figureDescription: { type: 'string', minLength: 1, maxLength: 2048 },
    displayWidth: { type: 'integer', minimum: SPARC_PROMPT_IMAGE_SETTINGS.minDisplayWidth, maximum: SPARC_PROMPT_IMAGE_SETTINGS.maxDisplayWidth },
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
  const output = object(value, ['tutorMessage', 'imagePrompt', 'figureDescription', 'displayWidth']);
  if (typeof output.imagePrompt !== 'string' || !output.imagePrompt.trim() || output.imagePrompt.length > 8000) {
    throw new Error('Supported Prompt requires a bounded image-generation brief');
  }
  return {
    tutorMessage: requireBoundedSparcDialogueMessage(output.tutorMessage, 'Supported Prompt tutor message'),
    imagePrompt: output.imagePrompt.trim(),
    figureDescription: requireBoundedSparcDialogueMessage(output.figureDescription, 'Supported Prompt figure description'),
    displayWidth: parseSparcPromptDisplayWidth(output.displayWidth),
  };
}

export function parseSparcSupportedPrompt(value: unknown): SparcSupportedPrompt {
  const output = object(value, ['tutorMessage', 'figure']);
  return { tutorMessage: requireBoundedSparcDialogueMessage(output.tutorMessage, 'Supported Prompt tutor message'),
    figure: parseSparcPromptFigure(output.figure) };
}
