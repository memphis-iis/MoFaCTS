// Shared standalone wire contract, also executed by the protected host reader using
// the running application's Node. Keep it free of repo-relative imports.
const keys = ['schema', 'recordDigestSha256', 'deployedAtUtc', 'baseCommit',
  'includedUncommittedLocalChanges', 'image', 'tag', 'digest', 'imageId'];
export const RECEIPT_MAX_BYTES = 8192;
const invalid = () => { throw new Error('Invalid release receipt'); };

/** @typedef {{configDigest:string,platform:string} & ({kind:'manifest',digest:string}|{kind:'index',digest:string,platformManifestDigest:string})} PublishedImage */
/** @typedef {{schema:'MoFaCTSReleaseReceiptV1',recordDigestSha256:string,deployedAtUtc:string,baseCommit:string,includedUncommittedLocalChanges:boolean,image:string,tag:string,digest:string,imageId:string}} ReleaseReceiptV1 */

/** @param {unknown} value @returns {PublishedImage} */
export function parsePublishedImage(value) {
  const index = value && typeof value === 'object' && value.kind === 'index';
  const expected = index ? ['kind', 'digest', 'platformManifestDigest', 'configDigest', 'platform']
    : ['kind', 'digest', 'configDigest', 'platform'];
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))
    || !['manifest', 'index'].includes(value.kind)) invalid();
  for (const name of ['digest', 'configDigest', ...(index ? ['platformManifestDigest'] : [])]) {
    if (typeof value[name] !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value[name])) invalid();
  }
  if (typeof value.platform !== 'string' || value.platform.length > 40
    || !/^[a-z0-9]+\/[a-z0-9]+(?:\/v[0-9]+)?$/.test(value.platform)) invalid();
  const base = { digest: value.digest, configDigest: value.configDigest, platform: value.platform };
  return index ? { ...base, kind: 'index', platformManifestDigest: value.platformManifestDigest }
    : { ...base, kind: 'manifest' };
}

export function parseReleaseReceiptV2(value) {
  const names = [...keys, 'publishedImage'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema !== 'MoFaCTSReleaseReceiptV2'
    || Object.keys(value).length !== names.length || names.some(key => !Object.hasOwn(value, key))) invalid();
  const base = parseReleaseReceipt(Object.fromEntries(keys.map(key => [key, key === 'schema' ? 'MoFaCTSReleaseReceiptV1' : value[key]])));
  const publishedImage = parsePublishedImage(value.publishedImage);
  if (publishedImage.digest !== base.digest || publishedImage.configDigest !== base.imageId) invalid();
  return { ...base, schema: 'MoFaCTSReleaseReceiptV2', publishedImage };
}

export function receiptPlatformImage(value) {
  const receipt = parseReleaseReceiptV2(value);
  const published = receipt.publishedImage;
  const digest = published.kind === 'index' ? published.platformManifestDigest : published.digest;
  return receipt.image.slice(0, -(receipt.tag.length + 1)) + '@' + digest;
}

export function compareReleaseReceiptV2(value, imageId, revision, platform) {
  const receipt = parseReleaseReceiptV2(value);
  const legacy = compareReleaseReceipt({ ...Object.fromEntries(keys.map(key => [key, receipt[key]])), schema: 'MoFaCTSReleaseReceiptV1' }, imageId, revision);
  if (legacy.state !== 'observed') return legacy;
  return { state: 'observed', receipt, result: legacy.result === 'MATCH' && receipt.publishedImage.platform === platform ? 'MATCH' : 'MISMATCH' };
}

/** @param {unknown} value @returns {ReleaseReceiptV1} */
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
  return runCli(argv, false);
}

export async function runReceiptV2Cli(argv) {
  return runCli(argv, true);
}

async function runCli(argv, v2) {
  let result;
  try {
    if (argv.length !== (v2 ? 3 : 2)) invalid();
    const chunks = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > RECEIPT_MAX_BYTES) invalid();
      chunks.push(chunk);
    }
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    result = v2 ? compareReleaseReceiptV2(JSON.parse(raw), ...argv) : compareReleaseReceipt(JSON.parse(raw), ...argv);
  } catch { result = { state: 'unavailable', reason: 'invalid-receipt' }; }
  process.stdout.write(JSON.stringify(result) + '\n');
}
