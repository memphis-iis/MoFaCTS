export function containsH5PContent(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsH5PContent);
  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, 'h5p')) return true;
  return Object.values(record).some(containsH5PContent);
}

export class UnsupportedH5PContentError extends Error {
  readonly code = 'unsupported-h5p-content';

  constructor() {
    super('H5P content is no longer supported. Remove H5P display configuration before saving or uploading.');
    this.name = 'UnsupportedH5PContentError';
  }
}

export function assertNoH5PContent(value: unknown): void {
  if (containsH5PContent(value)) {
    throw new UnsupportedH5PContentError();
  }
}
