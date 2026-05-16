/**
 * @fileoverview DeliverySettings Validator
 * Sanitizes delivery settings from TDFs using the canonical field registry.
 */

import {
  DELIVERY_DISPLAY_SETTINGS_DEPRECATED_GUIDANCE,
  DELIVERY_DISPLAY_SETTINGS_RUNTIME_DEFAULTS,
  DELIVERY_DISPLAY_SETTINGS_RUNTIME_KEYS,
  coerceAndValidateDeliveryDisplaySetting,
} from '../../common/fieldRegistry.ts';
import { clientConsole } from './clientLogger';

type DeliverySettings = Record<string, unknown>;

const KEPT_FIELDS = new Set(DELIVERY_DISPLAY_SETTINGS_RUNTIME_KEYS);
const DEPRECATED_FIELDS = DELIVERY_DISPLAY_SETTINGS_DEPRECATED_GUIDANCE;

let hasWarnedThisSession = false;

export function sanitizeDeliverySettings(
  rawSettings: Record<string, unknown> = {},
  options: { silent?: boolean; tdfName?: string } = {}
): DeliverySettings {
  const { silent = false, tdfName = '' } = options;
  const safeRawSettings = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const cleanSettings = { ...(DELIVERY_DISPLAY_SETTINGS_RUNTIME_DEFAULTS as DeliverySettings) };

  const deprecatedFields: Array<{ name: string; guidance: string }> = [];
  const unknownFields: string[] = [];
  const invalidFields: Array<{ name: string; value: unknown; default: unknown }> = [];

  for (const [fieldName, rawValue] of Object.entries(safeRawSettings)) {
    if (KEPT_FIELDS.has(fieldName)) {
      const result = coerceAndValidateDeliveryDisplaySetting(fieldName, rawValue);
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

  return cleanSettings;
}

function logWarnings(
  tdfName: string,
  deprecatedFields: Array<{ name: string; guidance: string }>,
  unknownFields: string[],
  invalidFields: Array<{ name: string; value: unknown; default: unknown }>
): void {
  const tdfLabel = tdfName ? ` in TDF "${tdfName}"` : '';

  if (deprecatedFields.length > 0) {
    clientConsole(1, `[DeliverySettings] Deprecated fields detected${tdfLabel}:`);
    deprecatedFields.forEach(({ name, guidance }) => {
      clientConsole(1, `[DeliverySettings] Deprecated field ${name}: ${guidance}`);
    });
    clientConsole(1, `[DeliverySettings] ${deprecatedFields.length} deprecated field(s) ignored. Update TDF to remove warnings.`);
  }

  if (unknownFields.length > 0) {
    clientConsole(1, `[DeliverySettings] Unknown fields detected${tdfLabel}:`, unknownFields);
    clientConsole(1, `[DeliverySettings] ${unknownFields.length} unknown field(s) ignored.`);
  }

  if (invalidFields.length > 0) {
    clientConsole(1, `[DeliverySettings] Invalid values detected${tdfLabel}:`);
    invalidFields.forEach(({ name, value, default: def }) => {
      clientConsole(
        1,
        `[DeliverySettings] Invalid value for ${name}: ${JSON.stringify(value)} (using default: ${JSON.stringify(def)})`
      );
    });
    clientConsole(1, `[DeliverySettings] ${invalidFields.length} invalid value(s) replaced with defaults.`);
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
