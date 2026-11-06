import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import { observeEmbeddedBuildIdentity, type BuildIdentityObservation } from '../../common/securityAudit/buildIdentity.ts';
import type { AuditIdentityObservation } from '../../common/securityAudit/reportIdentity.ts';

// Owned by Dockerfile's source_observation stage, already carried in ordinary
// images. No environment override, GitHub query, Docker socket or host receipt.
const IMAGE_SOURCE_FILE = '/opt/mofacts-source-observation.json';
const MAX_BYTES = 8192;

// The path argument permits isolated filesystem contract tests. Runtime loading
// always uses IMAGE_SOURCE_FILE; it does not accept a request/configuration path.
export async function readEmbeddedSourceBytes(file: string): Promise<Buffer | undefined> {
  let before;
  try { before = await fs.lstat(file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error('Embedded audit identity is unreadable');
  }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1
    || before.size < 1 || before.size > MAX_BYTES) throw new Error('Invalid embedded audit identity file');
  // Nonblocking/no-follow closes the FIFO/symlink race on the Linux runtime.
  // Windows tests still compare the actual opened file and bounded bytes.
  const flags = process.platform === 'linux'
    ? constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK : constants.O_RDONLY;
  const handle = await fs.open(file, flags);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino
      || opened.size !== before.size || opened.mtimeMs !== before.mtimeMs || opened.ctimeMs !== before.ctimeMs) {
      throw new Error('Embedded audit identity changed during acquisition');
    }
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let size = 0;
    while (size < bytes.length) {
      const result = await handle.read(bytes, size, bytes.length - size, null);
      if (!result.bytesRead) break;
      size += result.bytesRead;
    }
    const after = await handle.stat();
    if (size !== before.size || size > MAX_BYTES || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) {
      throw new Error('Embedded audit identity changed during acquisition');
    }
    return bytes.subarray(0, size);
  } finally { await handle.close(); }
}

// Inert until receiver composition uses it. Memoize the observation (including
// failures), rather than repeatedly reading disk per ingestion or retrying an
// unavailable proof. Ordinary application startup never depends on success.
export function createAuditReceiverIdentityLoader(
  readBytes: () => Promise<Buffer | undefined> = () => readEmbeddedSourceBytes(IMAGE_SOURCE_FILE),
): () => Promise<BuildIdentityObservation> {
  let pending: Promise<BuildIdentityObservation> | undefined;
  return async () => {
    pending ??= (async (): Promise<BuildIdentityObservation> => {
      try {
        const bytes = await readBytes();
        if (bytes === undefined) return observeEmbeddedBuildIdentity(undefined);
        if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_BYTES) throw new Error('Invalid identity bytes');
        return observeEmbeddedBuildIdentity(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
      } catch { return { state: 'unavailable', reason: 'malformed' }; }
    })();
    // Callers cannot mutate the cached observation or its source identity.
    return structuredClone(await pending);
  };
}

export function auditReceiverRevision(build: BuildIdentityObservation): AuditIdentityObservation {
  return build.state === 'observed' ? { state: 'observed', value: build.identity.baseCommit }
    : { state: 'unavailable', reason: build.reason };
}
