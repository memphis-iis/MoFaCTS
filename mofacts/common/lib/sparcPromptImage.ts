/** System-owned image settings; the dialogue model remains account-configured. */
export const SPARC_PROMPT_IMAGE_SETTINGS = Object.freeze({
  model: 'google/gemini-nano-banana-2.1',
  resolution: '1K',
  aspectRatio: '4:3',
  provider: 'google-ai-studio',
  maxBytes: 8 * 1024 * 1024,
  maxPromptCharacters: 12000,
});
export const SPARC_PROMPT_IMAGE_PURPOSE = 'sparc-prompt-image';

/** The generic FilesCollection route cannot authorize these session-owned images. */
export function allowsGenericSparcImageDownload(asset: { meta?: { uploadPurpose?: unknown } }): boolean {
  return asset.meta?.uploadPurpose !== SPARC_PROMPT_IMAGE_PURPOSE;
}

/** History stores an owned asset reference, never image bytes or a public URL. */
export type SparcPromptFigure = Readonly<{ assetId: string; description: string }>;

export function parseSparcPromptFigure(value: unknown): SparcPromptFigure {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid supported Prompt figure fields');
  const figure = value as Record<string, unknown>;
  if (Object.keys(figure).length !== 2 || typeof figure.assetId !== 'string'
    || !/^[a-zA-Z0-9]{1,20}$/.test(figure.assetId)
    || typeof figure.description !== 'string' || !figure.description.trim()
    || figure.description.length > 2048 || /[<>]/.test(figure.description)) {
    throw new Error('Invalid supported Prompt figure fields');
  }
  return { assetId: figure.assetId, description: figure.description.trim() };
}
