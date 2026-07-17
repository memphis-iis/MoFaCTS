import type { validateAiOutput } from './aiContentValidation';

type ValidatedAiOutput = ReturnType<typeof validateAiOutput>;

export function sourceExplicitlyRequestsImages(sourceText: string): boolean {
  const source = String(sourceText || '').toLowerCase();
  const mediaTerm = '(?:image|images|picture|pictures|photo|photos|photograph|photographs|visual|visuals)';
  if (/\b(?:no|without|omit|avoid)\s+(?:any\s+)?(?:image|images|picture|pictures|photo|photos|photograph|photographs|visual|visuals)\b/.test(source) ||
      /\b(?:do not|don't|dont)\s+(?:add|include|use)\s+(?:any\s+)?(?:image|images|picture|pictures|photo|photos|photograph|photographs|visual|visuals)\b/.test(source)) {
    return false;
  }
  return new RegExp(`\\b(?:add|include|use|show|display|create|find|fetch|identify)\\b.{0,48}\\b${mediaTerm}\\b`).test(source) ||
    new RegExp(`\\b(?:with|using|from)\\s+(?:the|these|those|some|my|our|uploaded|provided)?\\s*${mediaTerm}\\b`).test(source) ||
    new RegExp(`\\b${mediaTerm}\\b.{0,32}\\b(?:stimulus|stimuli|prompt|prompts|cue|cues|flashcard|flashcards|identification)\\b`).test(source);
}

export function enforceAiImageAuthorization(
  validation: ValidatedAiOutput,
  sourceText: string,
  uploadedImageCount: number,
): ValidatedAiOutput {
  if (uploadedImageCount > 0 || sourceExplicitlyRequestsImages(sourceText)) {
    return validation;
  }
  let removedImageCount = 0;
  const items = validation.output.items.map((item) => {
    const imageSource = String(item.prompt?.imgSrc || '').trim();
    if (!imageSource) {
      return item;
    }
    const text = String(item.prompt?.text || '').trim();
    if (!text) {
      throw new Error('The model returned an image-only stimulus even though the user did not request images.');
    }
    removedImageCount += 1;
    const { imgSrc: _imgSrc, attribution: _attribution, ...authorizedPrompt } = item.prompt || {};
    return { ...item, prompt: authorizedPrompt };
  });
  if (removedImageCount === 0 && validation.output.promptType !== 'image' && validation.output.promptType !== 'text-image') {
    return validation;
  }
  return {
    ...validation,
    output: {
      ...validation.output,
      promptType: 'text',
      items,
    },
    warnings: validation.warnings.concat(
      removedImageCount > 0
        ? [`Removed ${removedImageCount} unrequested generated image${removedImageCount === 1 ? '' : 's'}.`]
        : []
    ),
  };
}
