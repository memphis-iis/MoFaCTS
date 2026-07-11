export interface LearnerResponseNormalizationOptions {
  caseSensitive?: boolean;
  accentSensitive?: boolean;
}

export function normalizeLearnerResponseText(
  value: string,
  options: LearnerResponseNormalizationOptions = {},
): string {
  const trimmed = String(value || '').trim();
  const accentNormalized = options.accentSensitive === true
    ? trimmed.normalize('NFC')
    : trimmed.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
  return options.caseSensitive === true ? accentNormalized : accentNormalized.toLocaleLowerCase();
}
