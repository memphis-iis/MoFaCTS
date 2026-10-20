/** System-owned image settings; the dialogue model remains account-configured. */
export const SPARC_PROMPT_IMAGE_SETTINGS = Object.freeze({
  model: 'openai/gpt-image-2.5-sunburst',
  quality: 'medium',
  aspectRatio: 'auto',
  provider: 'openai',
  maxBytes: 8 * 1024 * 1024,
  maxPromptCharacters: 12000,
  minDisplayWidth: 240,
  maxDisplayWidth: 640,
});
export const SPARC_PROMPT_IMAGE_PURPOSE = 'sparc-prompt-image';

/** The generic FilesCollection route cannot authorize these session-owned images. */
export function allowsGenericSparcImageDownload(asset: { meta?: { uploadPurpose?: unknown } }): boolean {
  return asset.meta?.uploadPurpose !== SPARC_PROMPT_IMAGE_PURPOSE;
}

/** History stores an owned asset reference, never image bytes or a public URL. */
export type SparcPromptFigure = Readonly<{ assetId: string; description: string; displayWidth?: number }>;

export function parseSparcPromptDisplayWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)
    || value < SPARC_PROMPT_IMAGE_SETTINGS.minDisplayWidth || value > SPARC_PROMPT_IMAGE_SETTINGS.maxDisplayWidth) {
    throw new Error('Supported Prompt display width must be an integer from 240 to 640 pixels');
  }
  return value;
}

export function parseSparcPromptFigure(value: unknown): SparcPromptFigure {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid supported Prompt figure fields');
  const figure = value as Record<string, unknown>;
  // Existing canonical figures contain two fields. New figures also retain the planner's width.
  if (Object.keys(figure).some(key => !['assetId', 'description', 'displayWidth'].includes(key)) || typeof figure.assetId !== 'string'
    || !/^[a-zA-Z0-9]{1,20}$/.test(figure.assetId)
    || typeof figure.description !== 'string' || !figure.description.trim()
    || /[<>]/.test(figure.description)) {
    throw new Error('Invalid supported Prompt figure fields');
  }
  return { assetId: figure.assetId, description: figure.description.trim(),
    ...(Object.prototype.hasOwnProperty.call(figure, 'displayWidth') ? { displayWidth: parseSparcPromptDisplayWidth(figure.displayWidth) } : {}) };
}
