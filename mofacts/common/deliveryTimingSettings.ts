import { DELIVERY_SETTINGS_DEFAULTS, normalizeDeliverySettingsSource, normalizeDeliverySettingValue } from './fieldRegistry';
type DeliverySettingsRecord = Record<string, unknown>;
function isDeliverySettingValue(value: unknown): value is string | number | boolean | undefined {
  return value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}
export function selectDeliverySettingsSource(source: unknown, experimentXCond: unknown): unknown {
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

export function pickTimingRuntimeSettings(source: unknown, experimentXCond: unknown): DeliverySettingsRecord {
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
