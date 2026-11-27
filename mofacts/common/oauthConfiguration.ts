export function isOAuthCredentialValue(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    && value.toLowerCase() !== 'undefined' && value.toLowerCase() !== 'null';
}
