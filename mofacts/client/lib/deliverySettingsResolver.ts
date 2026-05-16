import { Session } from 'meteor/session';
import { MODEL_UNIT } from '../../common/Definitions';
import {
  DELIVERY_DISPLAY_SETTINGS_RUNTIME_KEYS,
  DELIVERY_SETTINGS_DEFAULTS,
  normalizeDeliverySettingsSource,
  normalizeDeliverySettingValue,
} from '../../common/fieldRegistry.ts';
import { sanitizeDeliverySettings } from './deliverySettingsValidator';

type DeliverySettingsRecord = Record<string, unknown>;
type DeliverySettingValue = string | number | boolean | undefined;

type TdfUnitWithDeliverySettings = {
  deliverySettings?: unknown;
};

type TdfTutorWithDeliverySettings = {
  title?: unknown;
  deliverySettings?: unknown;
  unit?: TdfUnitWithDeliverySettings[];
  setspec?: Record<string, unknown> | null;
};

type TdfFileWithDeliverySettings = {
  fileName?: unknown;
  name?: unknown;
  tdfs?: {
    tutor?: TdfTutorWithDeliverySettings;
  };
};

type DeliverySettingsResolution = {
  settings: DeliverySettingsRecord;
  hasTutorSettings: boolean;
  hasUnitSettings: boolean;
};

function isDeliverySettingValue(value: unknown): value is DeliverySettingValue {
  return value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean';
}

function selectDeliverySettingsSource(source: unknown, experimentXCond: unknown): unknown {
  if (!Array.isArray(source)) {
    return source;
  }
  if (!source.length) {
    return undefined;
  }
  let xcondIndex = Number.parseInt(String(experimentXCond ?? ''), 10);
  if (!Number.isFinite(xcondIndex) || xcondIndex < 0 || xcondIndex >= source.length) {
    xcondIndex = 0;
  }
  return source[xcondIndex];
}

function pickTimingRuntimeSettings(source: unknown, experimentXCond: unknown): DeliverySettingsRecord {
  const selectedSource = selectDeliverySettingsSource(source, experimentXCond);
  const normalizedSource = normalizeDeliverySettingsSource(
    selectedSource as Record<string, unknown> | null | undefined
  );
  const result: DeliverySettingsRecord = {};
  for (const key of Object.keys(DELIVERY_SETTINGS_DEFAULTS)) {
    const value = normalizedSource[key];
    if (isDeliverySettingValue(value)) {
      result[key] = normalizeDeliverySettingValue(key, value);
    }
  }
  return result;
}

function pickDisplayRuntimeSettings(source: unknown, experimentXCond: unknown): DeliverySettingsRecord {
  const selectedSource = selectDeliverySettingsSource(source, experimentXCond);
  if (!selectedSource || typeof selectedSource !== 'object' || Array.isArray(selectedSource)) {
    return {};
  }

  const result: DeliverySettingsRecord = {};
  const record = selectedSource as DeliverySettingsRecord;
  for (const key of DELIVERY_DISPLAY_SETTINGS_RUNTIME_KEYS) {
    if (record[key] !== undefined) {
      result[key] = record[key];
    }
  }
  return result;
}

function resolveTdfName(
  tdfFile: TdfFileWithDeliverySettings | null | undefined,
  tutor: TdfTutorWithDeliverySettings | null | undefined
): string {
  const lessonName = tutor?.setspec?.lessonname;
  const title = tutor?.title;
  const fileName = tdfFile?.fileName;
  const name = tdfFile?.name;
  for (const value of [lessonName, title, fileName, name]) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return '';
}

function resolveLearningSessionFlag(unitType: unknown, isLearningSession: unknown): boolean {
  if (typeof isLearningSession === 'boolean') {
    return isLearningSession;
  }
  return unitType === MODEL_UNIT;
}

export function resolveCurrentDeliverySettings(params: {
  tdfFile?: TdfFileWithDeliverySettings | null | undefined;
  tutor?: TdfTutorWithDeliverySettings | null | undefined;
  unit?: TdfUnitWithDeliverySettings | null | undefined;
  unitIndex?: number | null | undefined;
  experimentXCond?: unknown;
  unitType?: unknown;
  isLearningSession?: boolean | undefined;
  tdfName?: string | undefined;
  silent?: boolean | undefined;
} = {}): DeliverySettingsResolution {
  const tdfFile = params.tdfFile || (Session.get('currentTdfFile') as TdfFileWithDeliverySettings | null | undefined) || null;
  const tutor = params.tutor || tdfFile?.tdfs?.tutor || null;
  const unitIndex = Number.isFinite(Number(params.unitIndex)) ? Number(params.unitIndex) : Number(Session.get('currentUnitNumber') || 0);
  const unit = params.unit || (Session.get('currentTdfUnit') as TdfUnitWithDeliverySettings | null | undefined) || tutor?.unit?.[unitIndex] || null;
  const experimentXCond = params.experimentXCond ?? Session.get('experimentXCond');

  const tutorTimingSettings = pickTimingRuntimeSettings(tutor?.deliverySettings, experimentXCond);
  const unitTimingSettings = pickTimingRuntimeSettings(unit?.deliverySettings, experimentXCond);
  const tutorDisplaySettings = pickDisplayRuntimeSettings(tutor?.deliverySettings, experimentXCond);
  const unitDisplaySettings = pickDisplayRuntimeSettings(unit?.deliverySettings, experimentXCond);

  const timingSettings = {
    ...(DELIVERY_SETTINGS_DEFAULTS as DeliverySettingsRecord),
    ...tutorTimingSettings,
    ...unitTimingSettings,
  };
  const rawDisplaySettings = {
    ...tutorDisplaySettings,
    ...unitDisplaySettings,
  };
  const tdfName = params.tdfName ?? resolveTdfName(tdfFile, tutor);
  const sanitizeOptions = params.silent === undefined
    ? { tdfName }
    : { tdfName, silent: params.silent };
  const displaySettings = sanitizeDeliverySettings(rawDisplaySettings, sanitizeOptions);
  const unitType = params.unitType ?? Session.get('unitType');

  return {
    settings: {
      ...timingSettings,
      ...displaySettings,
      scoringEnabled: resolveLearningSessionFlag(unitType, params.isLearningSession),
    },
    hasTutorSettings: Object.keys(tutorTimingSettings).length > 0 || Object.keys(tutorDisplaySettings).length > 0,
    hasUnitSettings: Object.keys(unitTimingSettings).length > 0 || Object.keys(unitDisplaySettings).length > 0,
  };
}
