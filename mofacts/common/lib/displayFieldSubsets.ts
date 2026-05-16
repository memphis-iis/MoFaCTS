const SUPPORTED_DISPLAY_FIELDS = Object.freeze([
  'text',
  'clozeText',
  'clozeStimulus',
  'imgSrc',
  'audioSrc',
  'videoSrc',
  'attribution',
]);

const SUPPORTED_DISPLAY_FIELD_SET = new Set<string>(SUPPORTED_DISPLAY_FIELDS);

type DisplaySubsetParams = Record<string, unknown> | null | undefined;

function parseDisplayFields(value: unknown, paramName: string): string[] | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const fields = Array.isArray(value)
    ? value.map((field) => String(field).trim()).filter(Boolean)
    : String(value).split(',').map((field) => field.trim()).filter(Boolean);

  if (!fields.length) {
    return null;
  }

  const invalid = fields.filter((field) => !SUPPORTED_DISPLAY_FIELD_SET.has(field));
  if (invalid.length) {
    throw new Error(
      `${paramName} contains unsupported display field(s): ${invalid.join(', ')}. ` +
      `Supported fields: ${SUPPORTED_DISPLAY_FIELDS.join(', ')}`
    );
  }

  return fields;
}

function getSubsetFieldsForTrial(
  deliverySettings: DisplaySubsetParams,
  testType: unknown
): string[] | null {
  const normalizedTestType = String(testType || '').trim().toLowerCase();
  if (normalizedTestType === 's') {
    return parseDisplayFields(deliverySettings?.studyOnlyFields, 'studyOnlyFields');
  }
  return parseDisplayFields(deliverySettings?.drillFields, 'drillFields');
}

export function applyDisplayFieldSubset<T extends Record<string, unknown>>(
  display: T,
  deliverySettings: DisplaySubsetParams,
  testType: unknown
): Partial<T> {
  const fields = getSubsetFieldsForTrial(deliverySettings, testType);
  if (!fields) {
    return { ...display };
  }

  const filtered: Partial<T> = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(display, field)) {
      filtered[field as keyof T] = display[field] as T[keyof T];
    }
  }

  const keepsVisualMedia = fields.includes('imgSrc') || fields.includes('videoSrc');
  if (!keepsVisualMedia && Object.prototype.hasOwnProperty.call(filtered, 'attribution')) {
    delete filtered.attribution;
  }

  return filtered;
}

export function validateDisplayFieldSubset(value: unknown, paramName: string): void {
  parseDisplayFields(value, paramName);
}
