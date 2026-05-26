export const AUTO_TUTOR_SCORING_TEMPERATURE = 0.2;
export const AUTO_TUTOR_DEFAULT_UTTERANCE_TEMPERATURE = 0.45;

export function parseAutoTutorTemperature(
  value: unknown,
  fieldName: string,
  defaultValue: number,
): number {
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 2) {
    throw new Error(`AutoTutor runtime requires ${fieldName} to be between 0 and 2`);
  }
  return value;
}
