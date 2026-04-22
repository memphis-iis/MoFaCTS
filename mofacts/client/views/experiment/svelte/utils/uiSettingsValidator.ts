/**
 * @fileoverview UISettings Validator
 * Sanitizes UI settings from TDFs using the canonical field registry.
 */

import {
  UI_SETTINGS_DEPRECATED_GUIDANCE,
  UI_SETTINGS_RUNTIME_DEFAULTS,
  UI_SETTINGS_SUPPORTED_KEYS,
  coerceAndValidateUiSetting,
} from '../../../../../common/fieldRegistry.ts';
import { clientConsole } from '../../../../lib/clientLogger';

type UiSettings = Record<string, unknown>;

const KEPT_FIELDS = new Set(UI_SETTINGS_SUPPORTED_KEYS);
const DEPRECATED_FIELDS = UI_SETTINGS_DEPRECATED_GUIDANCE;

let hasWarnedThisSession = false;

export function sanitizeUiSettings(
  rawSettings: Record<string, unknown> = {},
  options: { silent?: boolean; tdfName?: string } = {}
): UiSettings {
  const { silent = false, tdfName = '' } = options;
  const safeRawSettings = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const cleanSettings = { ...(UI_SETTINGS_RUNTIME_DEFAULTS as UiSettings) };

  const deprecatedFields: Array<{ name: string; guidance: string }> = [];
  const unknownFields: string[] = [];
  const invalidFields: Array<{ name: string; value: unknown; default: unknown }> = [];

  for (const [fieldName, rawValue] of Object.entries(safeRawSettings)) {
    if (KEPT_FIELDS.has(fieldName)) {
      const result = coerceAndValidateUiSetting(fieldName, rawValue);
      if (result.valid) {
        cleanSettings[fieldName] = result.value;
      } else {
        invalidFields.push({
          name: fieldName,
          value: result.value,
          default: result.defaultValue,
        });
      }
      continue;
    }

    if (DEPRECATED_FIELDS[fieldName]) {
      deprecatedFields.push({
        name: fieldName,
        guidance: DEPRECATED_FIELDS[fieldName],
      });
      continue;
    }

    unknownFields.push(fieldName);
  }

  if (
    !silent &&
    !hasWarnedThisSession &&
    (deprecatedFields.length > 0 || unknownFields.length > 0 || invalidFields.length > 0)
  ) {
    logWarnings(tdfName, deprecatedFields, unknownFields, invalidFields);
    hasWarnedThisSession = true;
  }

  if (safeRawSettings.displayUserAnswerInFeedback !== undefined) {
    if (cleanSettings.displayUserAnswerInFeedback === 'onCorrect') {
      cleanSettings.displayUserAnswerInCorrectFeedback = true;
      cleanSettings.displayUserAnswerInIncorrectFeedback = false;
    } else if (cleanSettings.displayUserAnswerInFeedback === 'onIncorrect') {
      cleanSettings.displayUserAnswerInCorrectFeedback = false;
      cleanSettings.displayUserAnswerInIncorrectFeedback = true;
    } else if (cleanSettings.displayUserAnswerInFeedback === true) {
      cleanSettings.displayUserAnswerInCorrectFeedback = true;
      cleanSettings.displayUserAnswerInIncorrectFeedback = true;
    } else if (cleanSettings.displayUserAnswerInFeedback === false) {
      cleanSettings.displayUserAnswerInCorrectFeedback = false;
      cleanSettings.displayUserAnswerInIncorrectFeedback = false;
    }
  } else if (
    safeRawSettings.displayUserAnswerInCorrectFeedback !== undefined ||
    safeRawSettings.displayUserAnswerInIncorrectFeedback !== undefined
  ) {
    const correct = !!cleanSettings.displayUserAnswerInCorrectFeedback;
    const incorrect = !!cleanSettings.displayUserAnswerInIncorrectFeedback;
    if (correct && incorrect) {
      cleanSettings.displayUserAnswerInFeedback = true;
    } else if (correct) {
      cleanSettings.displayUserAnswerInFeedback = 'onCorrect';
    } else if (incorrect) {
      cleanSettings.displayUserAnswerInFeedback = 'onIncorrect';
    } else {
      cleanSettings.displayUserAnswerInFeedback = false;
    }
  }

  if (
    safeRawSettings.onlyShowSimpleFeedback === undefined &&
    (safeRawSettings.simplefeedbackOnCorrect !== undefined ||
      safeRawSettings.simplefeedbackOnIncorrect !== undefined)
  ) {
    const correct = coerceLegacyBoolean(safeRawSettings.simplefeedbackOnCorrect) === true;
    const incorrect = coerceLegacyBoolean(safeRawSettings.simplefeedbackOnIncorrect) === true;
    if (correct && incorrect) {
      cleanSettings.onlyShowSimpleFeedback = true;
    } else if (correct) {
      cleanSettings.onlyShowSimpleFeedback = 'onCorrect';
    } else if (incorrect) {
      cleanSettings.onlyShowSimpleFeedback = 'onIncorrect';
    } else {
      cleanSettings.onlyShowSimpleFeedback = false;
    }
  }

  return cleanSettings;
}

function coerceLegacyBoolean(value: unknown): unknown {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return value;
}

function logWarnings(
  tdfName: string,
  deprecatedFields: Array<{ name: string; guidance: string }>,
  unknownFields: string[],
  invalidFields: Array<{ name: string; value: unknown; default: unknown }>
): void {
  const tdfLabel = tdfName ? ` in TDF "${tdfName}"` : '';

  if (deprecatedFields.length > 0) {
    clientConsole(1, `[UISettings] Deprecated fields detected${tdfLabel}:`);
    deprecatedFields.forEach(({ name, guidance }) => {
      clientConsole(1, `[UISettings] Deprecated field ${name}: ${guidance}`);
    });
    clientConsole(1, `[UISettings] ${deprecatedFields.length} deprecated field(s) ignored. Update TDF to remove warnings.`);
  }

  if (unknownFields.length > 0) {
    clientConsole(1, `[UISettings] Unknown fields detected${tdfLabel}:`, unknownFields);
    clientConsole(1, `[UISettings] ${unknownFields.length} unknown field(s) ignored.`);
  }

  if (invalidFields.length > 0) {
    clientConsole(1, `[UISettings] Invalid values detected${tdfLabel}:`);
    invalidFields.forEach(({ name, value, default: def }) => {
      clientConsole(
        1,
        `[UISettings] Invalid value for ${name}: ${JSON.stringify(value)} (using default: ${JSON.stringify(def)})`
      );
    });
    clientConsole(1, `[UISettings] ${invalidFields.length} invalid value(s) replaced with defaults.`);
  }
}

export function resetWarningState(): void {
  hasWarnedThisSession = false;
}

export function getDeprecatedFields(rawSettings: Record<string, unknown> = {}): string[] {
  if (!rawSettings || typeof rawSettings !== 'object') {
    return [];
  }
  return Object.keys(rawSettings).filter((fieldName) => Boolean(DEPRECATED_FIELDS[fieldName]));
}

export function getUnknownFields(rawSettings: Record<string, unknown> = {}): string[] {
  if (!rawSettings || typeof rawSettings !== 'object') {
    return [];
  }
  return Object.keys(rawSettings).filter(
    (fieldName) => !KEPT_FIELDS.has(fieldName) && !DEPRECATED_FIELDS[fieldName]
  );
}

export function getDeprecationReport(
  rawSettings: Record<string, unknown> = {},
  tdfId = '',
  tdfName = ''
): Record<string, unknown> {
  const deprecated = getDeprecatedFields(rawSettings);
  const unknown = getUnknownFields(rawSettings);

  return {
    tdfId,
    tdfName,
    timestamp: Date.now(),
    deprecatedFields: deprecated,
    unknownFields: unknown,
    deprecatedCount: deprecated.length,
    unknownCount: unknown.length,
    needsMigration: deprecated.length > 0 || unknown.length > 0,
  };
}
