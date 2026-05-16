import {
  DELIVERY_SETTINGS_RUNTIME_INVENTORY,
  normalizeDeliverySettingValue,
} from '../fieldRegistry.ts';
import {
  DELIVERY_DISPLAY_SETTINGS_RUNTIME_INVENTORY,
  coerceAndValidateDeliveryDisplaySetting,
} from '../fieldRegistrySections.ts';

type JsonRecord = Record<string, unknown>;

export type DeliverySettingsMigrationWarning = {
  path: string;
  message: string;
};

export type DeliverySettingsMigrationResult<T = unknown> = {
  tdf: T;
  changed: boolean;
  warnings: DeliverySettingsMigrationWarning[];
};

export type LearnerConfigDeliverySettingsMigrationResult<T = unknown> = {
  config: T;
  changed: boolean;
  warnings: DeliverySettingsMigrationWarning[];
};

export type DeliverySettingsMigrationOptions = {
  removeLegacy?: boolean;
};

const DELIVERY_CONTROL_SETTING_KEYS = new Set<string>(DELIVERY_SETTINGS_RUNTIME_INVENTORY.canonicalKeys);
const DELIVERY_DISPLAY_SETTING_KEYS = new Set<string>(DELIVERY_DISPLAY_SETTINGS_RUNTIME_INVENTORY.supportedKeys);
const DELIVERY_CONTROL_ALIAS_TO_CANONICAL =
  DELIVERY_SETTINGS_RUNTIME_INVENTORY.aliasToCanonical as Record<string, string>;

const LEGACY_FIELD_RENAMES: Record<string, { target: string; convert?: (value: unknown) => unknown }> = {
  correctMessage: { target: 'correctLabelText' },
  incorrectMessage: { target: 'incorrectLabelText' },
  forcecorrectprompt: { target: 'forceCorrectPrompt' },
  readyprompt: { target: 'readyPromptStringDisplayTime' },
  displayReviewTimeoutAsBarOrText: { target: 'displayTimeoutBar' },
  displayReadyPromptTimeoutAsBarOrText: { target: 'displayTimeoutBar' },
  displayCardTimeoutAsBarOrText: { target: 'displayTimeoutBar' },
  displayTimeOutDuringStudy: { target: 'displayTimeoutCountdown' },
  displayPerformanceDuringTrial: { target: 'displayPerformance' },
  displayPerformanceDuringStudy: { target: 'displayPerformance' },
  singleLineFeedback: {
    target: 'feedbackLayout',
    convert: (value: unknown) => value === true || value === 'true' ? 'inline' : 'stacked',
  },
};

const REMOVED_FIELDS = new Set<string>([
  'allowFeedbackTypeSelect',
  'onlyShowSimpleFeedback',
  'feedbackType',
  'simplefeedbackOnCorrect',
  'simplefeedbackOnIncorrect',
  'suppressFeedbackDisplay',
  'feedbackDisplayPosition',
  'finalInstructions',
  'showhistory',
  'correctscore',
  'incorrectscore',
  'scoringEnabled',
]);

const SETSPEC_FIELDS = new Set<string>([
  'lfparameter',
]);

const LEGACY_COLOR_VALUE_RENAMES: Record<string, string> = {
  green: '#008000',
  orange: '#ffa500',
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function cloneRecord<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeValue(
  key: string,
  value: unknown,
  sourcePath: string,
  warnings: DeliverySettingsMigrationWarning[]
): unknown {
  if ((key === 'correctColor' || key === 'incorrectColor') && typeof value === 'string') {
    const legacyColor = LEGACY_COLOR_VALUE_RENAMES[value.trim().toLowerCase()];
    if (legacyColor) {
      warnings.push({
        path: sourcePath,
        message: `Legacy CSS color name "${value}" was converted to "${legacyColor}".`,
      });
      value = legacyColor;
    }
  }

  if (DELIVERY_CONTROL_SETTING_KEYS.has(key)) {
    return normalizeDeliverySettingValue(key, value);
  }

  if (DELIVERY_DISPLAY_SETTING_KEYS.has(key)) {
    const result = coerceAndValidateDeliveryDisplaySetting(key, value);
    if (!result.valid) {
      warnings.push({
        path: sourcePath,
        message: `Invalid value for "${key}" was replaced with the deliverySettings default.`,
      });
    }
    return result.valid ? result.value : result.defaultValue;
  }

  return value;
}

function isEqualValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const record = value as JsonRecord;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

function addField(
  target: JsonRecord,
  key: string,
  value: unknown,
  sourcePath: string,
  warnings: DeliverySettingsMigrationWarning[]
): void {
  if (REMOVED_FIELDS.has(key)) {
    warnings.push({
      path: sourcePath,
      message: `Removed field "${key}" was dropped during deliverySettings migration.`,
    });
    return;
  }

  if (SETSPEC_FIELDS.has(key)) {
    warnings.push({
      path: sourcePath,
      message: `Set-spec field "${key}" was not copied to deliverySettings.`,
    });
    return;
  }

  const rename = LEGACY_FIELD_RENAMES[key];
  const targetKey = DELIVERY_CONTROL_ALIAS_TO_CANONICAL[rename?.target || key] || rename?.target || key;

  if (!DELIVERY_CONTROL_SETTING_KEYS.has(targetKey) && !DELIVERY_DISPLAY_SETTING_KEYS.has(targetKey)) {
    warnings.push({
      path: sourcePath,
      message: `Unknown field "${key}" was ignored during deliverySettings migration.`,
    });
    return;
  }

  const convertedValue = normalizeValue(targetKey, rename?.convert ? rename.convert(value) : value, sourcePath, warnings);

  if (rename) {
    warnings.push({
      path: sourcePath,
      message: `Legacy field "${key}" was mapped to deliverySettings.${targetKey}.`,
    });
  }

  if (Object.prototype.hasOwnProperty.call(target, targetKey)) {
    const existingValue = target[targetKey];
    if (!isEqualValue(existingValue, convertedValue)) {
      warnings.push({
        path: sourcePath,
        message: `Value for "${targetKey}" ignored because deliverySettings already defines a different value.`,
      });
    }
    return;
  }

  target[targetKey] = convertedValue;
}

function promoteMisplacedSetSpecFields(
  source: unknown,
  sourcePath: string,
  setspec: JsonRecord,
  warnings: DeliverySettingsMigrationWarning[],
  removeLegacy: boolean,
): void {
  const sourceRecords = Array.isArray(source)
    ? source.map((entry, index) => ({ record: asRecord(entry), path: `${sourcePath}[${index}]` }))
    : [{ record: asRecord(source), path: sourcePath }];

  for (const { record: sourceRecord, path: recordPath } of sourceRecords) {
    for (const key of SETSPEC_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(sourceRecord, key)) {
        continue;
      }

      const value = sourceRecord[key];
      if (!Object.prototype.hasOwnProperty.call(setspec, key)) {
        setspec[key] = value;
        warnings.push({
          path: `${recordPath}.${key}`,
          message: `Misplaced set-spec field "${key}" was moved to tutor.setspec.${key}.`,
        });
        if (removeLegacy) {
          delete sourceRecord[key];
        }
        continue;
      }

      if (isEqualValue(setspec[key], value)) {
        warnings.push({
          path: `${recordPath}.${key}`,
          message: `Misplaced duplicate set-spec field "${key}" was dropped because tutor.setspec.${key} already has the same value.`,
        });
        if (removeLegacy) {
          delete sourceRecord[key];
        }
        continue;
      }

      warnings.push({
        path: `${recordPath}.${key}`,
        message: `Misplaced set-spec field "${key}" was ignored because tutor.setspec.${key} already defines a different value.`,
      });
      if (removeLegacy) {
        delete sourceRecord[key];
      }
    }
  }
}

function mergeLegacySource(
  target: JsonRecord,
  source: unknown,
  sourcePath: string,
  warnings: DeliverySettingsMigrationWarning[]
): void {
  for (const [key, value] of Object.entries(asRecord(source))) {
    addField(target, key, value, `${sourcePath}.${key}`, warnings);
  }
}

function sourceAtIndex(source: unknown, index: number): unknown {
  if (Array.isArray(source)) {
    return source[index];
  }
  return source;
}

function sourcePathAtIndex(source: unknown, sourcePath: string, index: number): string {
  return Array.isArray(source) ? `${sourcePath}[${index}]` : sourcePath;
}

function migrateDeliverySettingsObject({
  targetRecord,
  deliverySettings,
  uiSettings,
  deliveryparams,
  path,
  removeLegacy,
  warnings,
}: {
  targetRecord: JsonRecord;
  deliverySettings: unknown;
  uiSettings: unknown;
  deliveryparams: unknown;
  path: string;
  removeLegacy: boolean;
  warnings: DeliverySettingsMigrationWarning[];
}): void {
  const arrayLength = Math.max(
    asArray(deliverySettings)?.length || 0,
    asArray(uiSettings)?.length || 0,
    asArray(deliveryparams)?.length || 0,
  );

  if (arrayLength > 0) {
    const mergedArray: JsonRecord[] = [];
    for (let index = 0; index < arrayLength; index += 1) {
      const merged: JsonRecord = {};
      mergeLegacySource(
        merged,
        sourceAtIndex(deliverySettings, index),
        sourcePathAtIndex(deliverySettings, `${path}.deliverySettings`, index),
        warnings
      );
      mergeLegacySource(
        merged,
        sourceAtIndex(uiSettings, index),
        sourcePathAtIndex(uiSettings, `${path}.uiSettings`, index),
        warnings
      );
      mergeLegacySource(
        merged,
        sourceAtIndex(deliveryparams, index),
        sourcePathAtIndex(deliveryparams, `${path}.deliveryparams`, index),
        warnings
      );
      mergedArray.push(merged);
    }

    if (mergedArray.some((entry) => Object.keys(entry).length > 0)) {
      targetRecord.deliverySettings = mergedArray;
    } else {
      delete targetRecord.deliverySettings;
    }

    if (removeLegacy) {
      delete targetRecord.deliveryparams;
      delete targetRecord.uiSettings;
    }
    return;
  }

  const merged: JsonRecord = {};

  mergeLegacySource(merged, deliverySettings, `${path}.deliverySettings`, warnings);
  mergeLegacySource(merged, uiSettings, `${path}.uiSettings`, warnings);
  mergeLegacySource(merged, deliveryparams, `${path}.deliveryparams`, warnings);

  if (Object.keys(merged).length) {
    targetRecord.deliverySettings = merged;
  } else {
    delete targetRecord.deliverySettings;
  }

  if (removeLegacy) {
    delete targetRecord.deliveryparams;
    delete targetRecord.uiSettings;
  }
}

export function migrateTdfDeliverySettings<T = unknown>(
  rawTdf: T,
  options: DeliverySettingsMigrationOptions = {}
): DeliverySettingsMigrationResult<T> {
  const removeLegacy = options.removeLegacy !== false;
  const before = JSON.stringify(rawTdf);
  const tdf = cloneRecord(rawTdf);
  const warnings: DeliverySettingsMigrationWarning[] = [];
  const tutor = asRecord(asRecord(asRecord(tdf).tdfs).tutor);
  const setspec = asRecord(tutor.setspec);

  promoteMisplacedSetSpecFields(
    tutor.deliveryparams,
    'tutor.deliveryparams',
    setspec,
    warnings,
    removeLegacy,
  );

  migrateDeliverySettingsObject({
    targetRecord: tutor,
    deliverySettings: tutor.deliverySettings,
    uiSettings: setspec.uiSettings,
    deliveryparams: tutor.deliveryparams,
    path: 'tutor',
    removeLegacy,
    warnings,
  });

  if (removeLegacy) {
    delete setspec.uiSettings;
  }

  const units = Array.isArray(tutor.unit) ? tutor.unit : [];
  units.forEach((unit, index) => {
    const unitRecord = asRecord(unit);
    promoteMisplacedSetSpecFields(
      unitRecord.deliveryparams,
      `tutor.unit[${index}].deliveryparams`,
      setspec,
      warnings,
      removeLegacy,
    );
    migrateDeliverySettingsObject({
      targetRecord: unitRecord,
      deliverySettings: unitRecord.deliverySettings,
      uiSettings: unitRecord.uiSettings,
      deliveryparams: unitRecord.deliveryparams,
      path: `tutor.unit[${index}]`,
      removeLegacy,
      warnings,
    });
  });

  const unitTemplates = Array.isArray(setspec.unitTemplate) ? setspec.unitTemplate : [];
  unitTemplates.forEach((unitTemplate, index) => {
    const unitTemplateRecord = asRecord(unitTemplate);
    promoteMisplacedSetSpecFields(
      unitTemplateRecord.deliveryparams,
      `tutor.setspec.unitTemplate[${index}].deliveryparams`,
      setspec,
      warnings,
      removeLegacy,
    );
    migrateDeliverySettingsObject({
      targetRecord: unitTemplateRecord,
      deliverySettings: unitTemplateRecord.deliverySettings,
      uiSettings: unitTemplateRecord.uiSettings,
      deliveryparams: unitTemplateRecord.deliveryparams,
      path: `tutor.setspec.unitTemplate[${index}]`,
      removeLegacy,
      warnings,
    });
  });

  return {
    tdf,
    changed: before !== JSON.stringify(tdf),
    warnings,
  };
}

export function migrateLearnerConfigDeliverySettings<T = unknown>(
  rawConfig: T,
  options: DeliverySettingsMigrationOptions = {}
): LearnerConfigDeliverySettingsMigrationResult<T> {
  const removeLegacy = options.removeLegacy !== false;
  const before = JSON.stringify(rawConfig);
  const config = cloneRecord(rawConfig);
  const warnings: DeliverySettingsMigrationWarning[] = [];
  const source = asRecord(asRecord(config).source);
  const overrides = asRecord(asRecord(config).overrides);
  const setspec = asRecord(overrides.setspec);

  if (Array.isArray(source.unitSignature)) {
    source.unitSignature = source.unitSignature.map((entry, index) => {
      if (typeof entry !== 'string') {
        return entry;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(entry);
      } catch {
        warnings.push({
          path: `source.unitSignature[${index}]`,
          message: 'Unit signature entry was not valid JSON and could not be migrated.',
        });
        return entry;
      }

      const unitSignatureEntry = asRecord(parsed);
      migrateDeliverySettingsObject({
        targetRecord: unitSignatureEntry,
        deliverySettings: unitSignatureEntry.deliverySettings,
        uiSettings: unitSignatureEntry.uiSettings,
        deliveryparams: unitSignatureEntry.deliveryparams,
        path: `source.unitSignature[${index}]`,
        removeLegacy,
        warnings,
      });
      if (!Object.prototype.hasOwnProperty.call(unitSignatureEntry, 'deliverySettings')) {
        unitSignatureEntry.deliverySettings = {};
      }
      return stableStringify(unitSignatureEntry);
    });
  }

  migrateDeliverySettingsObject({
    targetRecord: overrides,
    deliverySettings: overrides.deliverySettings,
    uiSettings: setspec.uiSettings,
    deliveryparams: overrides.deliveryparams,
    path: 'overrides',
    removeLegacy,
    warnings,
  });

  if (removeLegacy) {
    delete setspec.uiSettings;
  }

  if (Object.keys(setspec).length === 0) {
    delete overrides.setspec;
  }

  const units = asRecord(overrides.unit);
  for (const [unitIndex, unitConfig] of Object.entries(units)) {
    const unitRecord = asRecord(unitConfig);
    migrateDeliverySettingsObject({
      targetRecord: unitRecord,
      deliverySettings: unitRecord.deliverySettings,
      uiSettings: unitRecord.uiSettings,
      deliveryparams: unitRecord.deliveryparams,
      path: `overrides.unit.${unitIndex}`,
      removeLegacy,
      warnings,
    });

    if (Object.keys(unitRecord).length === 0) {
      delete units[unitIndex];
    }
  }

  if (Object.keys(units).length === 0) {
    delete overrides.unit;
  }

  return {
    config,
    changed: before !== JSON.stringify(config),
    warnings,
  };
}
