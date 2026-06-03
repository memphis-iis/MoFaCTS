import type { ManualCreatorState } from './manualDraftBuilder';
import type { PromptAttribution } from './normalizedImportTypes';
import type {
  AiAutoTutorExpectation,
  AiAutoTutorOutput,
  AiItem,
  AiLessonOutput,
} from './aiContentTypes';

const PROMPT_TYPES = new Set<ManualCreatorState['promptType']>(['text', 'image', 'audio', 'video', 'text-image']);
const RESPONSE_TYPES = new Set<ManualCreatorState['responseType']>(['typed', 'multiple-choice']);
const TTS_MODES = new Set<ManualCreatorState['textToSpeechMode']>(['none', 'prompts', 'feedback', 'both']);
const TOP_BAR_MODES = new Set<ManualCreatorState['topBarMode']>(['time-score', 'time', 'score', 'none']);

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return extractJsonObject(fenced[1]);
    }
    const candidates = extractBalancedJsonObjectCandidates(trimmed);
    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {
        // Try the next balanced object candidate.
      }
    }
    throw new Error('AI response did not include a valid JSON object.');
  }
}

function extractBalancedJsonObjectCandidates(text: string): string[] {
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaping = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === '\\') {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }
    if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return candidates;
}

function hasPrompt(item: AiItem): boolean {
  const prompt = item.prompt || {};
  return ['text', 'imgSrc', 'audioSrc', 'videoSrc'].some((field) => typeof (prompt as any)[field] === 'string' && (prompt as any)[field].trim());
}

function normalizeComparable(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeVisibility(value: unknown): ManualCreatorState['visibility'] {
  return value === 'public' ? 'public' : 'private';
}

function normalizePromptType(value: unknown, warnings: string[]): ManualCreatorState['promptType'] {
  if (PROMPT_TYPES.has(value as ManualCreatorState['promptType'])) {
    return value as ManualCreatorState['promptType'];
  }
  if (value !== undefined) {
    warnings.push(`Unsupported promptType "${String(value)}" replaced with "text".`);
  }
  return 'text';
}

function normalizeResponseType(value: unknown, items: AiItem[], warnings: string[]): ManualCreatorState['responseType'] {
  if (RESPONSE_TYPES.has(value as ManualCreatorState['responseType'])) {
    return value as ManualCreatorState['responseType'];
  }
  if (value !== undefined) {
    warnings.push(`Unsupported responseType "${String(value)}" replaced with an inferred response type.`);
  }
  return items.some((item) => item.sourceType === 'choice') ? 'multiple-choice' : 'typed';
}

function normalizeTtsMode(value: unknown, warnings: string[]): ManualCreatorState['textToSpeechMode'] {
  if (TTS_MODES.has(value as ManualCreatorState['textToSpeechMode'])) {
    return value as ManualCreatorState['textToSpeechMode'];
  }
  if (value !== undefined) {
    warnings.push(`Unsupported textToSpeechMode "${String(value)}" replaced with "none".`);
  }
  return 'none';
}

function normalizeTopBarMode(value: unknown, warnings: string[]): ManualCreatorState['topBarMode'] {
  if (TOP_BAR_MODES.has(value as ManualCreatorState['topBarMode'])) {
    return value as ManualCreatorState['topBarMode'];
  }
  if (value !== undefined) {
    warnings.push(`Unsupported topBarMode "${String(value)}" replaced with "time-score".`);
  }
  return 'time-score';
}

export function normalizeAttribution(value: unknown): PromptAttribution | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const source = value as PromptAttribution;
  const attribution: PromptAttribution = {
    creatorName: String(source.creatorName || '').trim(),
    sourceName: String(source.sourceName || '').trim(),
    sourceUrl: String(source.sourceUrl || '').trim(),
    licenseName: String(source.licenseName || '').trim(),
    licenseUrl: String(source.licenseUrl || '').trim(),
  };
  return Object.values(attribution).some(Boolean) ? attribution : undefined;
}

export function validateAiOutput(value: unknown) {
  const warnings: string[] = [];
  const rejectedItems: Array<{ item: unknown; reason: string }> = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI response was not a JSON object.');
  }
  const output = value as AiLessonOutput;
  const rawItems = Array.isArray(output.items) ? output.items : [];
  const responseType = normalizeResponseType(output.responseType, rawItems as AiItem[], warnings);
  const seenItems = new Set<string>();
  const items = rawItems.filter((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      rejectedItems.push({ item, reason: 'Item is not an object.' });
      return false;
    }
    const typedItem = item as AiItem;
    const correctResponse = String(typedItem.response?.correctResponse || '').trim();
    const promptKey = normalizeComparable(
      typedItem.prompt?.text ||
      typedItem.prompt?.imgSrc ||
      typedItem.prompt?.audioSrc ||
      typedItem.prompt?.videoSrc
    );
    const answerKey = normalizeComparable(correctResponse);
    if (!hasPrompt(typedItem)) {
      rejectedItems.push({ item, reason: 'Item has no usable prompt.' });
      return false;
    }
    if (!correctResponse) {
      rejectedItems.push({ item, reason: 'Item has no correct response.' });
      return false;
    }
    const duplicateKey = `${promptKey}::${answerKey}`;
    if (seenItems.has(duplicateKey)) {
      rejectedItems.push({ item, reason: 'Item duplicates an earlier prompt/answer pair.' });
      return false;
    }
    seenItems.add(duplicateKey);
    if (typedItem.sourceType === 'choice' || responseType === 'multiple-choice') {
      const incorrect = typedItem.response?.incorrectResponses || [];
      const incorrectChoices = Array.isArray(incorrect)
        ? incorrect.map((choice) => String(choice || '').trim()).filter(Boolean)
        : [];
      const uniqueIncorrect = new Set(incorrectChoices.map((choice) => normalizeComparable(choice)));
      if (incorrectChoices.length < 2) {
        rejectedItems.push({ item, reason: 'Multiple-choice item needs at least two incorrect responses.' });
        return false;
      }
      if (uniqueIncorrect.size !== incorrectChoices.length) {
        rejectedItems.push({ item, reason: 'Multiple-choice item has duplicate incorrect responses.' });
        return false;
      }
      if (uniqueIncorrect.has(answerKey)) {
        rejectedItems.push({ item, reason: 'Multiple-choice item repeats the correct answer as an incorrect response.' });
        return false;
      }
    }
    return true;
  }) as AiItem[];

  if (items.length === 0) {
    throw new Error('AI response did not contain any usable prompt/response items.');
  }
  if (rejectedItems.length > 0) {
    warnings.push(`${rejectedItems.length} generated item${rejectedItems.length === 1 ? '' : 's'} rejected during validation.`);
  }

  return {
    output: {
      lessonName: String(output.lessonName || 'AI Created Lesson').trim() || 'AI Created Lesson',
      instructions: String(output.instructions || '').trim(),
      promptType: normalizePromptType(output.promptType, warnings),
      responseType,
      shuffle: output.shuffle !== false,
      buttonOrder: (output.buttonOrder === 'fixed' ? 'fixed' : 'random') as ManualCreatorState['buttonOrder'],
      textToSpeechMode: normalizeTtsMode(output.textToSpeechMode, warnings),
      topBarMode: normalizeTopBarMode(output.topBarMode, warnings),
      visibility: normalizeVisibility(output.visibility),
      tags: Array.isArray(output.tags) ? output.tags.map((tag) => String(tag).trim()).filter(Boolean) : ['ai-created'],
      items,
      creationSummary: String(output.creationSummary || '').trim(),
    },
    warnings,
    rejectedItems,
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];
}

export function validateAutoTutorOutput(value: unknown) {
  const warnings: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI AutoTutor response was not a JSON object.');
  }
  const output = value as AiAutoTutorOutput;
  const rawExpectations = Array.isArray(output.expectations) ? output.expectations : [];
  const seenExpectationIds = new Set<string>();
  const expectations = rawExpectations.map((entry, index) => {
    const id = String(entry?.id || `E${index + 1}`).trim();
    const proposition = String(entry?.proposition || '').trim();
    const assertion = String(entry?.assertion || proposition).trim();
    if (!proposition || !assertion) {
      return null;
    }
    if (seenExpectationIds.has(id)) {
      throw new Error(`AI AutoTutor response included duplicate expectation ID "${id}".`);
    }
    seenExpectationIds.add(id);
    return {
      id,
      label: String(entry?.label || id).trim(),
      proposition,
      hints: asStringArray(entry?.hints).length > 0 ? asStringArray(entry?.hints) : [`Think about ${proposition}`],
      prompts: Array.isArray(entry?.prompts) && entry.prompts.length > 0
        ? entry.prompts.map((prompt) => ({
            stem: String(prompt?.stem || '').trim(),
            target: String(prompt?.target || '').trim(),
          })).filter((prompt) => prompt.stem || prompt.target)
        : [{ stem: 'Explain this idea:', target: proposition }],
      assertion,
    };
  }).filter(Boolean) as Array<Required<Pick<AiAutoTutorExpectation, 'id' | 'label' | 'proposition' | 'hints' | 'prompts' | 'assertion'>>>;

  if (expectations.length === 0) {
    throw new Error('AI AutoTutor response did not include any usable expectations.');
  }

  const expectationIds = new Set(expectations.map((entry) => entry.id));
  const rawMisconceptions = Array.isArray(output.misconceptions) ? output.misconceptions : [];
  const seenMisconceptionIds = new Set<string>();
  const misconceptions = rawMisconceptions.map((entry, index) => {
    const id = String(entry?.id || `M${index + 1}`).trim();
    const misconception = String(entry?.misconception || '').trim();
    const correction = String(entry?.correction || '').trim();
    const repairQuestion = String(entry?.repairQuestion || '').trim();
    if (!misconception || !correction || !repairQuestion) {
      return null;
    }
    if (seenMisconceptionIds.has(id)) {
      throw new Error(`AI AutoTutor response included duplicate misconception ID "${id}".`);
    }
    seenMisconceptionIds.add(id);
    const contrasts = asStringArray(entry?.contrastWithExpectations).filter((contrastId) => expectationIds.has(contrastId));
    return {
      id,
      label: String(entry?.label || id).trim(),
      misconception,
      detectionCues: asStringArray(entry?.detectionCues),
      contrastWithExpectations: contrasts.length > 0 ? contrasts : [expectations[0]!.id],
      correction,
      repairQuestion,
      repairCriteria: String(entry?.repairCriteria || `Learner rejects the misconception and explains ${expectations[0]!.proposition}`).trim(),
      acceptableRepairAnswers: asStringArray(entry?.acceptableRepairAnswers),
    };
  }).filter(Boolean);

  if (rawMisconceptions.length > misconceptions.length) {
    warnings.push(`${rawMisconceptions.length - misconceptions.length} AutoTutor misconception${rawMisconceptions.length - misconceptions.length === 1 ? '' : 's'} rejected during validation.`);
  }

  const requiredExpectationCount = Math.max(
    1,
    Math.min(expectations.length, Number.isInteger(output.requiredExpectationCount) ? Number(output.requiredExpectationCount) : expectations.length),
  );
  const maxActiveMisconceptions = Math.max(
    0,
    Math.min(misconceptions.length, Number.isInteger(output.maxActiveMisconceptions) ? Number(output.maxActiveMisconceptions) : 0),
  );

  return {
    output: {
      lessonName: String(output.lessonName || 'AI AutoTutor').trim() || 'AI AutoTutor',
      prompt: String(output.prompt || output.learningGoal || output.idealAnswer || '').trim(),
      topic: String(output.topic || output.lessonName || 'AutoTutor topic').trim(),
      learningGoal: String(output.learningGoal || output.prompt || '').trim(),
      idealAnswer: String(output.idealAnswer || expectations.map((entry) => entry.proposition).join(' ')).trim(),
      expectations,
      misconceptions,
      maxTurns: Math.max(1, Number.isInteger(output.maxTurns) ? Number(output.maxTurns) : 20),
      requiredExpectationCount,
      maxActiveMisconceptions,
      visibility: normalizeVisibility(output.visibility),
      attribution: normalizeAttribution(output.attribution),
      summary: String(output.summary || output.creationSummary || '').trim(),
      creationSummary: String(output.creationSummary || output.summary || '').trim(),
    },
    warnings,
  };
}
