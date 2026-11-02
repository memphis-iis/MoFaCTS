// Standalone wire contract, also executed by the protected host reader using
// the running application's Node. Keep it free of repo-relative imports.
const keys = ['schema', 'recordDigestSha256', 'deployedAtUtc', 'baseCommit',
  'includedUncommittedLocalChanges', 'image', 'tag', 'digest', 'imageId'];
export const RECEIPT_MAX_BYTES = 8192;
const invalid = () => { throw new Error('Invalid release receipt'); };

export function parseReleaseReceipt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid();
  const matches = (name, pattern, limit) => {
    if (typeof value[name] !== 'string' || value[name].length > limit || !pattern.test(value[name])) invalid();
    return value[name];
  };
  if (value.schema !== 'MoFaCTSReleaseReceiptV1' || typeof value.includedUncommittedLocalChanges !== 'boolean') invalid();
  matches('recordDigestSha256', /^[a-f0-9]{64}$/, 64);
  matches('baseCommit', /^[a-f0-9]{40}$/, 40);
  for (const name of ['digest', 'imageId']) matches(name, /^sha256:[a-f0-9]{64}$/, 71);
  matches('tag', /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/, 128);
  matches('image', /^[a-z0-9][a-z0-9._:/-]*:[A-Za-z0-9_][A-Za-z0-9_.-]*$/, 300);
  if (value.image.includes('://') || !value.image.endsWith(':' + value.tag)) invalid();
  matches('deployedAtUtc', /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}(?:\d{4})?Z$/, 32);
  const time = value.deployedAtUtc.replace(/(\.\d{3})\d{4}Z$/, '$1Z');
  if (!Number.isFinite(Date.parse(time)) || new Date(time).toISOString() !== time) invalid();
  return Object.fromEntries(keys.map(key => [key, value[key]]));
}

export function compareReleaseReceipt(value, imageId, revision) {
  const receipt = parseReleaseReceipt(value);
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId ?? '') || !/^[a-f0-9]{40}$/.test(revision ?? '')) {
    return { state: 'unavailable', reason: 'running-image-unavailable' };
  }
  return { state: 'observed', receipt,
    result: receipt.imageId === imageId && receipt.baseCommit === revision ? 'MATCH' : 'MISMATCH' };
}

export async function runReceiptCli(argv) {
  let result;
  try {
    if (argv.length !== 2) invalid();
    const chunks = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > RECEIPT_MAX_BYTES) invalid();
      chunks.push(chunk);
    }
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    result = compareReleaseReceipt(JSON.parse(raw), ...argv);
  } catch { result = { state: 'unavailable', reason: 'invalid-receipt' }; }
  process.stdout.write(JSON.stringify(result) + '\n');
}
