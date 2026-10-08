type ContentSchema = { format?: unknown; properties?: Record<string, ContentSchema>; items?: ContentSchema };

export function containsH5PContent(value: unknown, schema: ContentSchema = {}): boolean {
  if (schema.format === 'ignored') return false;
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(entry => containsH5PContent(entry, schema.items));
  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, 'h5p')) return true;
  return Object.entries(record).some(([key, entry]) => containsH5PContent(entry, schema.properties?.[key]));
}

export class UnsupportedH5PContentError extends Error {
  readonly code = 'unsupported-h5p-content';

  constructor() {
    super('H5P content is no longer supported. Remove H5P display configuration before saving or uploading.');
    this.name = 'UnsupportedH5PContentError';
  }
}

export function assertNoH5PContent(value: unknown, schema?: ContentSchema): void {
  if (containsH5PContent(value, schema)) {
    throw new UnsupportedH5PContentError();
  }
}
