// Standalone, observation-only Docker-save reader. Also used by the protected
// host through the running application's Node; no filesystem extraction/imports.
import { createHash } from 'node:crypto';

export const IMAGE_ARCHIVE_LIMITS = Object.freeze({ bytes: 2 * 1024 ** 3, entries: 4096,
  metadataBytes: 1024 ** 2, retainedBytes: 32 * 1024 ** 2 });
const invalid = () => { throw new Error('Docker image identity is unavailable'); };
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const isDigest = value => typeof value === 'string' && value.length === 71 && /^sha256:[a-f0-9]{64}$/.test(value);
export const IMAGE_MEDIA_TYPES = Object.freeze({
  indices: Object.freeze(['application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json']),
  manifests: Object.freeze(['application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json']),
  configs: Object.freeze(['application/vnd.oci.image.config.v1+json', 'application/vnd.docker.container.image.v1+json']),
});
const { indices, manifests, configs } = IMAGE_MEDIA_TYPES;

function json(bytes) {
  try {
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = JSON.parse(raw);
    // JSON.parse above already rejects invalid escapes/control characters.
    const tokens = [...raw.matchAll(/"(?:[^"\\]|\\.)*"|[{}[\]:,]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)].map(match => match[0]);
    if (tokens.length > 100000) invalid();
    const stack = [];
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (token === '{' || token === '[') {
        stack.push(token === '{' ? new Set() : null);
        if (stack.length > 32) invalid();
      } else if (token === '}' || token === ']') stack.pop();
      else if (token.startsWith('"') && tokens[index + 1] === ':') {
        const keys = stack.at(-1);
        const key = JSON.parse(token);
        if (!(keys instanceof Set) || keys.has(key)) invalid();
        keys.add(key);
      }
    }
    return value;
  } catch { invalid(); }
}

export function parseDockerImageInspection(value) {
  if (!value || Object.keys(value).sort().join(',') !== 'descriptor,nativeId,platform'
    || !isDigest(value.nativeId) || value.platform !== 'linux/amd64') invalid();
  const descriptor = value.descriptor;
  if (descriptor !== null && (!descriptor || !isDigest(descriptor.digest)
    || descriptor.digest !== value.nativeId || ![...indices, ...manifests].includes(descriptor.mediaType)
    || !Number.isSafeInteger(descriptor.size) || descriptor.size <= 0 || descriptor.size > IMAGE_ARCHIVE_LIMITS.metadataBytes)) invalid();
  return { nativeId: value.nativeId, platform: value.platform, descriptor };
}

class Reader {
  constructor(stream, maximum) { this.iterator = stream[Symbol.asyncIterator](); this.pending = Buffer.alloc(0); this.total = 0; this.maximum = maximum; }
  async read(size, eof = false) {
    const chunks = [];
    let remaining = size;
    while (remaining) {
      if (!this.pending.length) {
        const next = await this.iterator.next();
        if (next.done) { if (eof && remaining === size) return null; invalid(); }
        if (!(next.value instanceof Uint8Array)) invalid();
        this.pending = Buffer.from(next.value);
        this.total += this.pending.length;
        if (this.total > this.maximum) invalid();
        if (!this.pending.length) continue;
      }
      const take = Math.min(remaining, this.pending.length);
      chunks.push(this.pending.subarray(0, take));
      this.pending = this.pending.subarray(take);
      remaining -= take;
    }
    return Buffer.concat(chunks, size);
  }
}
function text(bytes) {
  const end = bytes.indexOf(0);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(end < 0 ? bytes : bytes.subarray(0, end)); }
  catch { invalid(); }
}
function octal(bytes) {
  const value = text(bytes).trim();
  if (!/^[0-7]+$/.test(value)) invalid();
  const number = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(number)) invalid();
  return number;
}
function archivePath(name) {
  if (typeof name !== 'string' || name.length > 255 || name !== name.trim() || !/^[A-Za-z0-9_./-]+$/.test(name)
    || name.split('/').some(part => !part || part === '.' || part === '..')) invalid();
  return name;
}

// This is a Docker-save metadata reader, not the source snapshot filesystem
// extractor. Layers are streamed past, never buffered, decompressed or written.
export async function readDockerArchiveIdentity(stream, inspection, limits = IMAGE_ARCHIVE_LIMITS) {
  const observed = parseDockerImageInspection(inspection);
  const reader = new Reader(stream, limits.bytes);
  try {
    const seen = new Set();
    const files = new Map();
    let retained = 0;
    while (true) {
      const header = await reader.read(512);
      if (header.every(byte => byte === 0)) {
        if (!(await reader.read(512)).every(byte => byte === 0)) invalid();
        let tail;
        while ((tail = await reader.read(512, true))) if (!tail.every(byte => byte === 0)) invalid();
        break;
      }
      const sum = header.reduce((total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte), 0);
      if (octal(header.subarray(148, 156)) !== sum || text(header.subarray(257, 263)) !== 'ustar'
        || ![0, 48, 53].includes(header[156]) || text(header.subarray(157, 257))) invalid();
      const prefix = text(header.subarray(345, 500));
      let name = `${prefix ? prefix + '/' : ''}${text(header.subarray(0, 100))}`;
      const directory = header[156] === 53;
      if (directory) name = name.replace(/\/$/, '');
      archivePath(name);
      if (seen.has(name) || seen.size >= limits.entries) invalid();
      seen.add(name);
      const size = octal(header.subarray(124, 136));
      if (size > limits.bytes || (directory && size !== 0)) invalid();
      const keep = !directory && size <= limits.metadataBytes
        && (['manifest.json', 'index.json', 'oci-layout'].includes(name)
          || /^[a-f0-9]{64}\.json$/.test(name) || /^blobs\/sha256\/[a-f0-9]{64}$/.test(name));
      if (keep) {
        retained += size;
        if (retained > limits.retainedBytes) invalid();
        files.set(name, await reader.read(size));
      } else for (let left = size; left > 0;) { const take = Math.min(left, 65536); await reader.read(take); left -= take; }
      if (!(await reader.read((512 - size % 512) % 512)).every(byte => byte === 0)) invalid();
    }
    const read = name => { const bytes = files.get(name); if (!bytes) invalid(); return bytes; };
    const config = (name, expected) => {
      const bytes = read(name);
      if (digest(bytes) !== expected) invalid();
      const value = json(bytes);
      if (value.os !== 'linux' || value.architecture !== 'amd64' || (value.variant && value.variant !== 'v1')) invalid();
      return expected;
    };
    const rows = json(read('manifest.json'));
    if (!Array.isArray(rows) || !rows.length || rows.length > 128 || rows.some(row => !row || typeof row.Config !== 'string'
      || !Array.isArray(row.Layers) || row.Layers.length > 1024
      || row.Layers.some(layer => { archivePath(layer); return !seen.has(layer); }))) invalid();
    if (observed.descriptor === null) {
      const candidates = rows.filter(row => [`${observed.nativeId.slice(7)}.json`, `blobs/sha256/${observed.nativeId.slice(7)}`].includes(row.Config));
      if (candidates.length !== 1) invalid();
      return { configDigest: config(candidates[0].Config, observed.nativeId), platform: observed.platform };
    }
    const layout = json(read('oci-layout'));
    const root = json(read('index.json'));
    if (layout.imageLayoutVersion !== '1.0.0' || root.schemaVersion !== 2 || !Array.isArray(root.manifests)) invalid();
    const roots = root.manifests.filter(item => item.digest === observed.nativeId);
    if (roots.length !== 1 || roots[0].mediaType !== observed.descriptor.mediaType || roots[0].size !== observed.descriptor.size) invalid();
    const visited = new Set();
    const candidates = [];
    const visit = (descriptor, depth) => {
      if (depth > 8 || !descriptor || !isDigest(descriptor.digest) || visited.has(descriptor.digest)
        || !Number.isSafeInteger(descriptor.size) || descriptor.size <= 0 || descriptor.size > limits.metadataBytes) invalid();
      visited.add(descriptor.digest);
      if (visited.size > 128) invalid();
      if (descriptor.platform) {
        const p = descriptor.platform;
        if (typeof p.os !== 'string' || typeof p.architecture !== 'string') invalid();
        if (p.os !== 'linux' || p.architecture !== 'amd64' || (p.variant && p.variant !== 'v1')) return;
      }
      const bytes = read(`blobs/sha256/${descriptor.digest.slice(7)}`);
      if (bytes.length !== descriptor.size || digest(bytes) !== descriptor.digest) invalid();
      const value = json(bytes);
      if (value.schemaVersion !== 2 || (value.mediaType && value.mediaType !== descriptor.mediaType)) invalid();
      if (indices.includes(descriptor.mediaType)) {
        if (!Array.isArray(value.manifests) || !value.manifests.length || value.manifests.length > 128) invalid();
        for (const item of value.manifests) visit(item, depth + 1);
      } else if (manifests.includes(descriptor.mediaType)) {
        if (!value.config || !configs.includes(value.config.mediaType) || !isDigest(value.config.digest)
          || !Number.isSafeInteger(value.config.size) || value.config.size <= 0 || value.config.size > limits.metadataBytes) invalid();
        const name = `blobs/sha256/${value.config.digest.slice(7)}`;
        if (read(name).length !== value.config.size) invalid();
        candidates.push({ name, digest: config(name, value.config.digest) });
      } else invalid();
    };
    visit(roots[0], 0);
    if (candidates.length !== 1 || rows.filter(row => row.Config === candidates[0].name).length !== 1) invalid();
    return { configDigest: candidates[0].digest, platform: observed.platform };
  } finally { await reader.iterator.return?.(); }
}
