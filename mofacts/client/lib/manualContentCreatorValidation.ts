import { type ManualCreatorState, type StarterRow } from './manualDraftBuilder';
import {
  getMediaLabel,
  isMediaPromptEnabled,
  isPromptTextEnabled,
  parseSeedTableText,
  structureIncludesInstructions,
} from './manualContentCreatorUtils';

const CONSERVATIVE_BCP47_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export function parsePositiveInteger(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseLocaleList(value: unknown): string[] {
  return String(value || '')
    .split(',')
    .map((locale) => locale.trim())
    .filter(Boolean);
}

function isBcp47Like(value: string): boolean {
  return CONSERVATIVE_BCP47_PATTERN.test(value);
}

function parseNonNegativeNumber(value: unknown) {
  const parsed = Number(String(value ?? '').trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function resolveSeedRowsForValidation(
  state: ManualCreatorState,
  createId: () => string,
) {
  if (state.seedMode === 'paste-table' && state.rows.length === 0) {
    return parseSeedTableText(state, createId);
  }
  return state.rows;
}

export function validateStarterRow(state: ManualCreatorState, row: StarterRow, index: number) {
  const errors: string[] = [];
  const rowLabel = `Row ${index + 1}`;

  if (isPromptTextEnabled(state.promptType) && !row.promptText.trim()) {
    errors.push(`${rowLabel}: prompt required.`);
  }

  if (isMediaPromptEnabled(state.promptType) && !row.mediaRef.trim()) {
    errors.push(`${rowLabel}: ${getMediaLabel(state.promptType).toLowerCase()} required.`);
  }

  if (!row.answer.trim()) {
    errors.push(`${rowLabel}: answer required.`);
  }

  if (state.responseType === 'multiple-choice') {
    if (!row.choice2.trim() || !row.choice3.trim() || !row.choice4.trim()) {
      errors.push(`${rowLabel}: three distractors required.`);
    }
  }

  return errors;
}

export function validateManualCreatorStep(
  step: number,
  state: ManualCreatorState,
  createId: () => string,
) {
  const errors: string[] = [];

  if (step === 1) {
    if (!state.lessonName.trim()) {
      errors.push('Lesson name required.');
    }
    if (structureIncludesInstructions(state.structure) && !state.instructionText.trim()) {
      errors.push('Instruction text required when the selected structure includes instructions.');
    }
    if (state.experimentLinkEnabled) {
      const slug = state.experimentTarget.trim();
      if (!slug) {
        errors.push('Link name required when experiment link is enabled.');
      } else if (!/^[A-Za-z0-9_-]+$/.test(slug)) {
        errors.push('Link name must use letters, numbers, underscores, or hyphens.');
      }
    }
    if (state.contentLanguage.trim() && !isBcp47Like(state.contentLanguage.trim())) {
      errors.push('Content language must be a BCP 47 language tag such as en, es, zh-Hans, or hi.');
    }
    const invalidRecommendedLocales = parseLocaleList(state.recommendedUiLocales)
      .filter((locale) => !isBcp47Like(locale));
    if (invalidRecommendedLocales.length > 0) {
      errors.push(`Recommended UI locales must be comma-separated BCP 47 language tags. Invalid: ${invalidRecommendedLocales.join(', ')}.`);
    }
  }

  if (step === 2) {
    if (!parsePositiveInteger(state.cardCount)) {
      errors.push('Cards must be a whole number greater than 0.');
    }
  }

  if (step === 3) {
    if (state.textToSpeechMode !== 'none' && !state.speechLanguage.trim()) {
      errors.push('Speech language required when text-to-speech is enabled.');
    }

    if (state.practiceTimingEnabled) {
      const minPracticeTime = parseNonNegativeNumber(state.minPracticeTime);
      const maxPracticeTime = parseNonNegativeNumber(state.maxPracticeTime);

      if (minPracticeTime === null) {
        errors.push('Minimum practice time must be 0 or greater.');
      }
      if (maxPracticeTime === null) {
        errors.push('Maximum practice time must be 0 or greater.');
      }
      if (
        minPracticeTime !== null &&
        maxPracticeTime !== null &&
        maxPracticeTime < minPracticeTime
      ) {
        errors.push('Maximum practice time must be greater than or equal to minimum practice time.');
      }
    }
  }

  if (step === 4) {
    const seedRows = resolveSeedRowsForValidation(state, createId);

    if (state.seedMode === 'paste-table' && !String(state.seedTableText || '').trim() && seedRows.length === 0) {
      errors.push('Paste at least one starter row or switch to another starting mode.');
    }

    if (!Array.isArray(seedRows) || seedRows.length === 0) {
      errors.push('Add at least one starter row.');
    } else {
      seedRows.forEach((row, index) => {
        errors.push(...validateStarterRow(state, row, index));
      });
    }
  }

  return errors;
}
