import {
  DELIVERY_PARAM_DEFAULTS,
  DELIVERY_PARAM_FIELD_REGISTRY,
  DELIVERY_PARAM_SUPPORTED_KEYS,
  UI_SETTINGS_RUNTIME_DEFAULTS,
  UI_SETTINGS_SUPPORTED_KEYS,
  coerceAndValidateUiSetting,
  createTdfSchemaFromRegistry,
  createTdfValidatorMap,
  normalizeDeliveryParamValue
} from '../fieldRegistry';

type LearnerTdfScope = 'setspec' | 'unit';
type LearnerTdfFamily = 'ui' | 'delivery';
type LearnerTdfControl = 'toggle' | 'select' | 'slider' | 'number' | 'text';
type JsonRecord = Record<string, unknown>;

export type LearnerTdfSourceMetadata = {
  tdfId?: string;
  tdfUpdatedAt?: string;
  unitCount: number;
  unitSignature: string[];
};

export type LearnerTdfOverrides = {
  setspec?: {
    audioPromptMode?: string;
    audioInputSensitivity?: number;
    uiSettings?: Record<string, unknown>;
  };
  deliveryparams?: Record<string, unknown>;
  unit?: Record<string, {
    deliveryparams?: Record<string, unknown>;
    uiSettings?: Record<string, unknown>;
  }>;
};

export type LearnerTdfConfig = {
  source?: LearnerTdfSourceMetadata;
  overrides?: LearnerTdfOverrides;
};

export type LearnerTdfFieldDefinition = {
  id: LearnerTdfFieldId;
  scope: LearnerTdfScope;
  family: LearnerTdfFamily;
  label: string;
  tdfPath: string;
  control: LearnerTdfControl;
  defaultValue: string | number | boolean;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
};

export type LearnerTdfFieldId = string;

export type LearnerTdfValidationResult = {
  valid: boolean;
  errors: string[];
  staleUnitOverrides: boolean;
};

export type LearnerTdfApplyResult<T> = {
  tdf: T;
  applied: boolean;
  warnings: string[];
};

const TDF_SCHEMA = createTdfSchemaFromRegistry();
const TDF_VALIDATORS = createTdfValidatorMap();

function schemaProperties(schema: unknown): Record<string, unknown> {
  return asRecord(asRecord(schema).properties);
}

function getTutorSchema(): JsonRecord {
  return asRecord(schemaProperties(TDF_SCHEMA).tutor);
}

function getSetSpecSchemaProperty(key: string): JsonRecord {
  return asRecord(schemaProperties(asRecord(schemaProperties(getTutorSchema()).setspec))[key]);
}

function getUiSettingsSchemaProperty(key: string): JsonRecord {
  const setspec = asRecord(schemaProperties(getTutorSchema()).setspec);
  const uiSettings = asRecord(schemaProperties(setspec).uiSettings);
  return asRecord(schemaProperties(uiSettings)[key]);
}

function getSchemaDefault(schema: JsonRecord, fallback: string | number | boolean): string | number | boolean {
  const value = schema.default;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return fallback;
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function firstNumericValidator(path: string) {
  return TDF_VALIDATORS[path]?.validators.find((entry) => entry.type === 'range');
}

function schemaEnumValues(schema: JsonRecord): string[] {
  return Array.isArray(schema.enum) ? schema.enum.filter((value): value is string => typeof value === 'string') : [];
}

function schemaHasType(schema: JsonRecord, type: string): boolean {
  if (schema.type === type) return true;
  const anyOf = Array.isArray(schema.anyOf) ? schema.anyOf : [];
  return anyOf.some((entry) => asRecord(entry).type === type);
}

function fieldDefinitionFromSchema(args: {
  id: string;
  scope: LearnerTdfScope;
  family: LearnerTdfFamily;
  tdfPath: string;
  key: string;
  schema: JsonRecord;
  defaultValue: unknown;
  label?: string;
}): LearnerTdfFieldDefinition {
  const enumValues = schemaEnumValues(args.schema);
  const numericValidator = firstNumericValidator(args.tdfPath);
  const isBoolean = schemaHasType(args.schema, 'boolean');
  const isNumber = schemaHasType(args.schema, 'number') || schemaHasType(args.schema, 'integer');
  const defaultValue = typeof args.defaultValue === 'string' || typeof args.defaultValue === 'number' || typeof args.defaultValue === 'boolean'
    ? args.defaultValue
    : isBoolean
      ? false
      : isNumber
        ? 0
        : '';

  return {
    id: args.id,
    scope: args.scope,
    family: args.family,
    label: args.label || String(args.schema.title || humanizeKey(args.key)),
    tdfPath: args.tdfPath,
    control: isBoolean ? 'toggle' : enumValues.length ? 'select' : isNumber ? 'number' : 'text',
    defaultValue,
    ...(enumValues.length ? { options: enumValues.map((value) => ({ value, label: humanizeKey(value) })) } : {}),
    ...(isNumber && typeof numericValidator?.min === 'number' ? { min: numericValidator.min } : {}),
    ...(isNumber && typeof numericValidator?.max === 'number' ? { max: numericValidator.max } : {}),
    ...(isNumber ? { step: schemaHasType(args.schema, 'integer') ? 1 : 0.1 } : {})
  };
}

function deliveryFieldDefinition(scope: LearnerTdfScope, key: string): LearnerTdfFieldDefinition | null {
  const registry = DELIVERY_PARAM_FIELD_REGISTRY[key];
  if (!registry) return null;
  const tdfPath = scope === 'unit' ? `unit[].deliveryparams.${key}` : `deliveryparams.${key}`;
  const enumValues = registry.authoring.enum || [];
  const isBoolean = registry.authoring.type === 'booleanString';
  const isNumber = registry.authoring.type === 'integer' || registry.authoring.type === 'number';
  const validator = firstNumericValidator(tdfPath);
  const defaultValue = DELIVERY_PARAM_DEFAULTS[key];
  const safeDefault = typeof defaultValue === 'string' || typeof defaultValue === 'number' || typeof defaultValue === 'boolean'
    ? defaultValue
    : isBoolean
      ? false
      : isNumber
        ? 0
        : '';

  return {
    id: tdfPath,
    scope,
    family: 'delivery',
    label: registry.tooltip.brief || humanizeKey(key),
    tdfPath,
    control: isBoolean ? 'toggle' : enumValues.length ? 'select' : isNumber ? 'number' : 'text',
    defaultValue: safeDefault,
    ...(enumValues.length ? { options: enumValues.map((value) => ({ value, label: humanizeKey(value) })) } : {}),
    ...(isNumber && typeof validator?.min === 'number' ? { min: validator.min } : {}),
    ...(isNumber && typeof validator?.max === 'number' ? { max: validator.max } : {}),
    ...(isNumber ? { step: registry.authoring.type === 'integer' ? 1 : 0.1 } : {})
  };
}

function uiFieldDefinition(scope: LearnerTdfScope, key: string): LearnerTdfFieldDefinition {
  const schema = getUiSettingsSchemaProperty(key);
  return fieldDefinitionFromSchema({
    id: `${scope === 'unit' ? 'unit[]' : 'setspec'}.uiSettings.${key}`,
    scope,
    family: 'ui',
    tdfPath: `${scope === 'unit' ? 'unit[]' : 'setspec'}.uiSettings.${key}`,
    key,
    schema,
    defaultValue: UI_SETTINGS_RUNTIME_DEFAULTS[key]
  });
}

function getAudioPromptOptions() {
  const schema = getSetSpecSchemaProperty('audioPromptMode');
  const values = Array.isArray(schema.enum) ? schema.enum.filter((value): value is string => typeof value === 'string') : [];
  return (values.length ? values : ['silent', 'question', 'feedback', 'all']).map((value) => ({
    value,
    label: {
      silent: 'Silent',
      question: 'Question only',
      feedback: 'Feedback only',
      all: 'Question and feedback'
    }[value] || value
  }));
}

export const LEARNER_TDF_FIELD_DEFINITIONS: readonly LearnerTdfFieldDefinition[] = [
  {
    id: 'setspec.audioPromptMode',
    scope: 'setspec',
    family: 'ui',
    label: 'Spoken audio mode',
    tdfPath: 'setspec.audioPromptMode',
    control: 'select',
    defaultValue: getSchemaDefault(getSetSpecSchemaProperty('audioPromptMode'), 'silent'),
    options: getAudioPromptOptions()
  },
  {
    id: 'setspec.audioInputSensitivity',
    scope: 'setspec',
    family: 'ui',
    label: 'Microphone sensitivity',
    tdfPath: 'setspec.audioInputSensitivity',
    control: 'slider',
    defaultValue: getSchemaDefault(getSetSpecSchemaProperty('audioInputSensitivity'), 60),
    min: 20,
    max: 80,
    step: 1,
    unit: 'dB'
  },
  ...UI_SETTINGS_SUPPORTED_KEYS.map((key) => uiFieldDefinition('setspec', key)),
  ...UI_SETTINGS_SUPPORTED_KEYS.map((key) => uiFieldDefinition('unit', key)),
  ...DELIVERY_PARAM_SUPPORTED_KEYS
    .map((key) => deliveryFieldDefinition('setspec', key))
    .filter((field): field is LearnerTdfFieldDefinition => Boolean(field)),
  ...DELIVERY_PARAM_SUPPORTED_KEYS
    .map((key) => deliveryFieldDefinition('unit', key))
    .filter((field): field is LearnerTdfFieldDefinition => Boolean(field))
];

const AUDIO_PROMPT_MODES = new Set(['silent', 'question', 'feedback', 'all']);

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function getTutorRoot(tdf: unknown): JsonRecord {
  const record = asRecord(tdf);
  const nestedTutor = asRecord(asRecord(asRecord(record.tdfs).tutor));
  if (Object.keys(nestedTutor).length > 0) {
    return nestedTutor;
  }
  return record;
}

function getUnitArray(tdf: unknown): JsonRecord[] {
  const units = getTutorRoot(tdf).unit;
  return Array.isArray(units) ? units.filter(isRecord) : [];
}

function getTdfUpdatedAt(tdf: unknown): string | undefined {
  const record = asRecord(tdf);
  const candidates = [
    record.updatedAt,
    record.lastUpdated,
    asRecord(record.content).updatedAt,
    asRecord(record.content).lastUpdated
  ];

  for (const candidate of candidates) {
    if (candidate instanceof Date) {
      return candidate.toISOString();
    }
    if (typeof candidate === 'string' && candidate.trim()) {
      const date = new Date(candidate);
      return Number.isNaN(date.getTime()) ? candidate : date.toISOString();
    }
  }

  return undefined;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function unitSignatureEntry(unit: JsonRecord): string {
  const deliveryparams = asRecord(unit.deliveryparams);
  const allowedDeliveryparams: Record<string, unknown> = {};
  for (const key of DELIVERY_PARAM_SUPPORTED_KEYS) {
    if (deliveryparams[key] !== undefined) {
      allowedDeliveryparams[key] = deliveryparams[key];
    }
  }

  return stableStringify({
    unitname: unit.unitname ?? unit.name ?? '',
    deliveryparams: allowedDeliveryparams
  });
}

function sourceMatches(current: LearnerTdfSourceMetadata, saved: LearnerTdfSourceMetadata | undefined): boolean {
  if (!saved) {
    return true;
  }
  if (saved.tdfUpdatedAt && current.tdfUpdatedAt && saved.tdfUpdatedAt !== current.tdfUpdatedAt) {
    return false;
  }
  if (saved.unitCount !== current.unitCount) {
    return false;
  }
  return stableStringify(saved.unitSignature) === stableStringify(current.unitSignature);
}

function normalizeUiSettingValue(path: string, value: unknown, errors: string[]): unknown {
  const fieldName = path.split('.').pop() || '';
  const result = coerceAndValidateUiSetting(fieldName, value);
  if (!result.valid) {
    errors.push(`${path} is not a valid UI setting value`);
    return undefined;
  }
  return result.value;
}

function normalizeAudioPromptMode(value: unknown, path: string, errors: string[]): string | undefined {
  if (typeof value !== 'string' || !AUDIO_PROMPT_MODES.has(value)) {
    errors.push(`${path} must be one of silent, question, feedback, all`);
    return undefined;
  }
  return value;
}

function getBaseSetSpecValue(tdf: unknown, key: string): unknown {
  const setspec = asRecord(getTutorRoot(tdf).setspec);
  if (key === 'setspec.audioPromptMode') {
    return typeof setspec.audioPromptMode === 'string' ? setspec.audioPromptMode : 'silent';
  }
  if (key === 'setspec.audioInputSensitivity') {
    const value = Number(setspec.audioInputSensitivity);
    return Number.isFinite(value) ? value : 60;
  }
  if (key.startsWith('setspec.uiSettings.')) {
    const fieldName = key.split('.').pop() || '';
    const uiSettings = asRecord(setspec.uiSettings);
    const result = coerceAndValidateUiSetting(fieldName, uiSettings[fieldName]);
    return result.valid ? result.value : result.defaultValue;
  }
  return undefined;
}

function getBaseDeliveryValue(tdf: unknown, key: string): unknown {
  const value = asRecord(getTutorRoot(tdf).deliveryparams)[key];
  return value !== undefined ? normalizeDeliveryParamValue(key, value) : DELIVERY_PARAM_DEFAULTS[key];
}

function getBaseUnitDeliveryValue(tdf: unknown, unitIndex: string, key: string): unknown {
  const index = Number(unitIndex);
  const unit = getUnitArray(tdf)[index];
  const value = asRecord(unit?.deliveryparams)[key];
  return value !== undefined ? normalizeDeliveryParamValue(key, value) : DELIVERY_PARAM_DEFAULTS[key];
}

function getBaseUnitUiValue(tdf: unknown, unitIndex: string, key: string): unknown {
  const index = Number(unitIndex);
  const unit = getUnitArray(tdf)[index];
  const uiSettings = asRecord(unit?.uiSettings);
  const value = coerceAndValidateUiSetting(key, uiSettings[key]);
  return value.valid ? value.value : value.defaultValue;
}

function pruneRecordByBase(
  values: Record<string, unknown> | undefined,
  getBaseValue: (key: string) => unknown
): Record<string, unknown> | undefined {
  if (!values) return undefined;
  const pruned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== getBaseValue(key)) {
      pruned[key] = value;
    }
  }
  return Object.keys(pruned).length ? pruned : undefined;
}

function setSpecOverridesEqualBase(tdf: unknown, overrides: Required<LearnerTdfOverrides>['setspec']): LearnerTdfOverrides['setspec'] {
  const pruned: LearnerTdfOverrides['setspec'] = {};

  if (overrides.audioPromptMode !== undefined && overrides.audioPromptMode !== getBaseSetSpecValue(tdf, 'setspec.audioPromptMode')) {
    pruned.audioPromptMode = overrides.audioPromptMode;
  }
  if (overrides.audioInputSensitivity !== undefined && overrides.audioInputSensitivity !== getBaseSetSpecValue(tdf, 'setspec.audioInputSensitivity')) {
    pruned.audioInputSensitivity = overrides.audioInputSensitivity;
  }
  const uiSettings = pruneRecordByBase(
    overrides.uiSettings,
    (key) => getBaseSetSpecValue(tdf, `setspec.uiSettings.${key}`)
  );
  if (uiSettings) {
    pruned.uiSettings = uiSettings;
  }

  return Object.keys(pruned).length || pruned.uiSettings ? pruned : undefined;
}

function pruneDeliveryOverrides(tdf: unknown, deliveryparams: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return pruneRecordByBase(deliveryparams, (key) => getBaseDeliveryValue(tdf, key));
}

function pruneUnitOverrides(tdf: unknown, unitOverrides: NonNullable<LearnerTdfOverrides['unit']>): LearnerTdfOverrides['unit'] | undefined {
  const prunedUnits: NonNullable<LearnerTdfOverrides['unit']> = {};

  for (const [unitIndex, unitConfig] of Object.entries(unitOverrides)) {
    const prunedDeliveryparams = pruneRecordByBase(
      unitConfig.deliveryparams,
      (key) => getBaseUnitDeliveryValue(tdf, unitIndex, key)
    );
    if (prunedDeliveryparams) {
      prunedUnits[unitIndex] = { deliveryparams: prunedDeliveryparams };
    }
    const prunedUiSettings = pruneRecordByBase(
      unitConfig.uiSettings,
      (key) => getBaseUnitUiValue(tdf, unitIndex, key)
    );
    if (prunedUiSettings) {
      prunedUnits[unitIndex] = {
        ...(prunedUnits[unitIndex] || {}),
        uiSettings: prunedUiSettings
      };
    }
  }

  return Object.keys(prunedUnits).length ? prunedUnits : undefined;
}

function cloneWithTutor<T>(tdf: T, mutateTutor: (tutor: JsonRecord) => void): T {
  const root = asRecord(tdf);
  if (isRecord(root.tdfs) && isRecord(root.tdfs.tutor)) {
    const clonedTutor = { ...root.tdfs.tutor };
    const clonedTdfs = { ...root.tdfs, tutor: clonedTutor };
    const clonedRoot = { ...root, tdfs: clonedTdfs };
    mutateTutor(clonedTutor);
    return clonedRoot as T;
  }

  const clonedRoot = { ...root };
  mutateTutor(clonedRoot);
  return clonedRoot as T;
}

function applySetSpecOverrides(tutor: JsonRecord, overrides: NonNullable<LearnerTdfOverrides['setspec']>): void {
  const setspec = { ...asRecord(tutor.setspec) };
  if (overrides.audioPromptMode !== undefined) {
    setspec.audioPromptMode = overrides.audioPromptMode;
  }
  if (overrides.audioInputSensitivity !== undefined) {
    setspec.audioInputSensitivity = overrides.audioInputSensitivity;
  }
  if (overrides.uiSettings && Object.keys(overrides.uiSettings).length) {
    setspec.uiSettings = {
      ...asRecord(setspec.uiSettings),
      ...overrides.uiSettings
    };
  }
  tutor.setspec = setspec;
}

function applyDeliveryOverrides(tutor: JsonRecord, overrides: Record<string, unknown>): void {
  tutor.deliveryparams = {
    ...asRecord(tutor.deliveryparams),
    ...overrides
  };
}

function applyUnitOverrides(tutor: JsonRecord, overrides: NonNullable<LearnerTdfOverrides['unit']>): void {
  const units = Array.isArray(tutor.unit) ? [...tutor.unit] : [];
  for (const [unitIndex, unitConfig] of Object.entries(overrides)) {
    const index = Number(unitIndex);
    const unit = asRecord(units[index]);
    const deliveryparams = unitConfig.deliveryparams;
    const uiSettings = unitConfig.uiSettings;
    units[index] = {
      ...unit,
      ...(deliveryparams && Object.keys(deliveryparams).length
        ? { deliveryparams: { ...asRecord(unit.deliveryparams), ...deliveryparams } }
        : {}),
      ...(uiSettings && Object.keys(uiSettings).length
        ? { uiSettings: { ...asRecord(unit.uiSettings), ...uiSettings } }
        : {})
    };
  }
  tutor.unit = units;
}

export function buildLearnerTdfSourceMetadata(tdf: unknown, tdfId?: string): LearnerTdfSourceMetadata {
  const units = getUnitArray(tdf);
  const updatedAt = getTdfUpdatedAt(tdf);
  const metadata: LearnerTdfSourceMetadata = {
    unitCount: units.length,
    unitSignature: units.map(unitSignatureEntry)
  };
  if (tdfId) {
    metadata.tdfId = tdfId;
  }
  if (updatedAt) {
    metadata.tdfUpdatedAt = updatedAt;
  }
  return metadata;
}

export function normalizeLearnerTdfOverrides(tdf: unknown, overrides: unknown): LearnerTdfOverrides {
  const errors: string[] = [];
  const normalized = normalizeLearnerTdfOverridesWithErrors(tdf, overrides, errors);
  if (errors.length) {
    throw new Error(errors.join('; '));
  }
  return normalized;
}

function normalizeLearnerTdfOverridesWithErrors(tdf: unknown, overrides: unknown, errors: string[]): LearnerTdfOverrides {
  const input = asRecord(overrides);
  const normalized: LearnerTdfOverrides = {};
  const allowedTopLevel = new Set(['setspec', 'deliveryparams', 'unit']);
  for (const key of Object.keys(input)) {
    if (!allowedTopLevel.has(key)) {
      errors.push(`${key} is not a configurable learner TDF scope`);
    }
  }

  if (input.setspec !== undefined) {
    const setspec = asRecord(input.setspec);
    const allowedSetSpec = new Set(['audioPromptMode', 'audioInputSensitivity', 'uiSettings']);
    for (const key of Object.keys(setspec)) {
      if (!allowedSetSpec.has(key)) {
        errors.push(`setspec.${key} is not learner configurable`);
      }
    }

    const normalizedSetSpec: NonNullable<LearnerTdfOverrides['setspec']> = {};
    if (setspec.audioPromptMode !== undefined) {
      const audioPromptMode = normalizeAudioPromptMode(setspec.audioPromptMode, 'setspec.audioPromptMode', errors);
      if (audioPromptMode !== undefined) {
        normalizedSetSpec.audioPromptMode = audioPromptMode;
      }
    }
    if (setspec.audioInputSensitivity !== undefined) {
      const audioInputSensitivity = Number(setspec.audioInputSensitivity);
      if (!Number.isFinite(audioInputSensitivity) || audioInputSensitivity < 20 || audioInputSensitivity > 80) {
        errors.push('setspec.audioInputSensitivity must be a number between 20 and 80');
      } else {
        normalizedSetSpec.audioInputSensitivity = audioInputSensitivity;
      }
    }
    if (setspec.uiSettings !== undefined) {
      const uiSettings = asRecord(setspec.uiSettings);
      const normalizedUiSettings: Record<string, unknown> = {};
      for (const key of Object.keys(uiSettings)) {
        if (!UI_SETTINGS_SUPPORTED_KEYS.includes(key)) {
          errors.push(`setspec.uiSettings.${key} is not learner configurable`);
          continue;
        }
        const value = normalizeUiSettingValue(`setspec.uiSettings.${key}`, uiSettings[key], errors);
        if (value !== undefined) {
          normalizedUiSettings[key] = value;
        }
      }
      if (Object.keys(normalizedUiSettings).length) {
        normalizedSetSpec.uiSettings = normalizedUiSettings;
      }
    }

    const prunedSetSpec = setSpecOverridesEqualBase(tdf, normalizedSetSpec);
    if (prunedSetSpec) {
      normalized.setspec = prunedSetSpec;
    }
  }

  if (input.deliveryparams !== undefined) {
    const deliveryparams = asRecord(input.deliveryparams);
    const normalizedDeliveryparams: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(deliveryparams)) {
      if (!DELIVERY_PARAM_SUPPORTED_KEYS.includes(key)) {
        errors.push(`deliveryparams.${key} is not learner configurable`);
        continue;
      }
      normalizedDeliveryparams[key] = normalizeDeliveryParamValue(key, value);
    }
    const prunedDeliveryparams = pruneDeliveryOverrides(tdf, normalizedDeliveryparams);
    if (prunedDeliveryparams) {
      normalized.deliveryparams = prunedDeliveryparams;
    }
  }

  if (input.unit !== undefined) {
    const units = getUnitArray(tdf);
    const unitInput = asRecord(input.unit);
    const normalizedUnit: NonNullable<LearnerTdfOverrides['unit']> = {};
    for (const [unitIndex, unitConfigValue] of Object.entries(unitInput)) {
      const index = Number(unitIndex);
      if (!Number.isInteger(index) || index < 0 || index >= units.length || String(index) !== unitIndex) {
        errors.push(`unit.${unitIndex} is not a valid TDF unit index`);
        continue;
      }

      const unitConfig = asRecord(unitConfigValue);
      for (const key of Object.keys(unitConfig)) {
        if (key !== 'deliveryparams' && key !== 'uiSettings') {
          errors.push(`unit.${unitIndex}.${key} is not learner configurable`);
        }
      }

      const deliveryparams = asRecord(unitConfig.deliveryparams);
      const normalizedDeliveryparams: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(deliveryparams)) {
        if (!DELIVERY_PARAM_SUPPORTED_KEYS.includes(key)) {
          errors.push(`unit.${unitIndex}.deliveryparams.${key} is not learner configurable`);
          continue;
        }
        normalizedDeliveryparams[key] = normalizeDeliveryParamValue(key, value);
      }

      if (Object.keys(normalizedDeliveryparams).length) {
        normalizedUnit[unitIndex] = { deliveryparams: normalizedDeliveryparams };
      }

      if (unitConfig.uiSettings !== undefined) {
        const uiSettings = asRecord(unitConfig.uiSettings);
        const normalizedUiSettings: Record<string, unknown> = {};
        for (const key of Object.keys(uiSettings)) {
          if (!UI_SETTINGS_SUPPORTED_KEYS.includes(key)) {
            errors.push(`unit.${unitIndex}.uiSettings.${key} is not learner configurable`);
            continue;
          }
          const value = normalizeUiSettingValue(`unit.${unitIndex}.uiSettings.${key}`, uiSettings[key], errors);
          if (value !== undefined) {
            normalizedUiSettings[key] = value;
          }
        }
        if (Object.keys(normalizedUiSettings).length) {
          normalizedUnit[unitIndex] = {
            ...(normalizedUnit[unitIndex] || {}),
            uiSettings: normalizedUiSettings
          };
        }
      }
    }

    const prunedUnits = pruneUnitOverrides(tdf, normalizedUnit);
    if (prunedUnits) {
      normalized.unit = prunedUnits;
    }
  }

  return normalized;
}

export function buildLearnerTdfConfig(tdf: unknown, tdfId: string, overrides: unknown): LearnerTdfConfig {
  return {
    source: buildLearnerTdfSourceMetadata(tdf, tdfId),
    overrides: normalizeLearnerTdfOverrides(tdf, overrides)
  };
}

export function validateLearnerTdfConfig(tdf: unknown, config: LearnerTdfConfig | undefined): LearnerTdfValidationResult {
  const errors: string[] = [];
  const overrides = config?.overrides ?? {};
  normalizeLearnerTdfOverridesWithErrors(tdf, overrides, errors);
  const staleUnitOverrides = Boolean(overrides.unit && !sourceMatches(buildLearnerTdfSourceMetadata(tdf, config?.source?.tdfId), config?.source));
  if (staleUnitOverrides) {
    errors.push('Unit-specific learner settings are stale for this TDF and need review');
  }

  return {
    valid: errors.length === 0,
    errors,
    staleUnitOverrides
  };
}

export function applyLearnerTdfConfig<T>(tdf: T, config: LearnerTdfConfig | undefined): LearnerTdfApplyResult<T> {
  const overrides = config?.overrides;
  if (!overrides || (!overrides.setspec && !overrides.deliveryparams && !overrides.unit)) {
    return { tdf, applied: false, warnings: [] };
  }

  const errors: string[] = [];
  const normalized = normalizeLearnerTdfOverridesWithErrors(tdf, overrides, errors);
  if (errors.length) {
    throw new Error(errors.join('; '));
  }

  const currentSource = buildLearnerTdfSourceMetadata(tdf, config?.source?.tdfId);
  const staleUnitOverrides = Boolean(normalized.unit && !sourceMatches(currentSource, config?.source));
  const applicableUnitOverrides = staleUnitOverrides ? undefined : normalized.unit;
  const warnings = staleUnitOverrides
    ? ['Unit-specific learner settings are stale for this TDF and were not applied']
    : [];

  if (!normalized.setspec && !normalized.deliveryparams && !applicableUnitOverrides) {
    return { tdf, applied: false, warnings };
  }

  const configured = cloneWithTutor(tdf, (tutor) => {
    if (normalized.setspec) {
      applySetSpecOverrides(tutor, normalized.setspec);
    }
    if (normalized.deliveryparams) {
      applyDeliveryOverrides(tutor, normalized.deliveryparams);
    }
    if (applicableUnitOverrides) {
      applyUnitOverrides(tutor, applicableUnitOverrides);
    }
  });

  return { tdf: configured, applied: true, warnings };
}
