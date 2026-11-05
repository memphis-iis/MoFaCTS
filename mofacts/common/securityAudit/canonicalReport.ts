// One JSON canonicalization/digest owner for the inert V2 contracts. V1 keeps
// its existing implementation until the coordinated receiver/producer cutover.
export function canonicalAuditJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
      throw new Error('Audit JSON contains a sparse or extended array');
    }
    return `[${value.map(canonicalAuditJson).join(',')}]`;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
    && Object.getOwnPropertySymbols(value).length === 0) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalAuditJson(record[key])}`).join(',')}}`;
  }
  throw new Error('Audit JSON contains an unsupported value');
}

export async function auditDigest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalAuditJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
