import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Transform } from 'node:stream';
import { evidenceCommand } from './collectCiEvidence.mjs';
import { parseCiEvidenceJson } from './ciEvidence.mjs';
import { IMAGE_ARCHIVE_LIMITS, parseDockerImageInspection, readDockerArchiveIdentity } from './imageArchiveIdentity.mjs';

// Older Engine APIs omit Descriptor entirely. Keyed lookup emits explicit null
// without a template error; classic identity still requires hashing config bytes.
const format = '{"nativeId":{{json .Id}},"platform":"{{.Os}}/{{.Architecture}}","descriptor":{{json (index . "Descriptor")}}}';
const invalid = () => { throw new Error('Docker image identity is unavailable'); };

export function imageStreamOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
      || Object.keys(options).some(key => !['timeoutMs', 'onDiagnostic'].includes(key))) invalid();
  const timeoutMs = options.timeoutMs ?? 120000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000
      || (options.onDiagnostic !== undefined && typeof options.onDiagnostic !== 'function')) invalid();
  return { timeoutMs, onDiagnostic: options.onDiagnostic };
}

export async function streamDockerImageIdentity(inspection, environment = process.env, spawnProcess = spawn, options = {}) {
  const { timeoutMs, onDiagnostic } = imageStreamOptions(options);
  const started = Date.now();
  let bytesRead = 0, stderrBytes = 0, exitCode = null, closedSettled = false;
  let category = 'archive-rejected', killed = false, terminationTimer;
  const diagnostic = () => Object.freeze({ category, timeoutMs, elapsedMs: Date.now() - started,
    bytesRead, stderrBytes, exitCode, terminationConfirmed: closedSettled });
  const child = spawnProcess('docker', ['--context', 'default', 'image', 'save', inspection.nativeId], {
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: environment,
  });
  const measured = new Transform({ transform(chunk, encoding, done) {
    bytesRead += chunk.length;
    done(null, chunk);
  } });
  const stop = reason => {
    if (killed) return;
    category = reason; killed = true; child.kill(); child.stdout.destroy(); measured.destroy(); child.stderr.destroy();
  };
  const timer = setTimeout(() => stop('timeout'), timeoutMs);
  child.stderr.on('data', chunk => { stderrBytes += chunk.length; if (stderrBytes > 65536) stop('stderr-limit'); });
  child.stdout.on('error', () => { if (!killed) category = 'stream-failed'; measured.destroy(new Error('Image stream failed')); });
  const closed = new Promise((resolve, reject) => {
    child.once('error', () => { if (!killed) category = 'spawn-failed'; reject(new Error('Docker image identity is unavailable')); });
    child.once('close', code => {
      exitCode = code; closedSettled = true;
      if (code === 0 && !killed) resolve();
      else { if (!killed) category = 'process-failed'; reject(new Error('Docker image identity is unavailable')); }
    });
  });
  child.stdout.pipe(measured);
  try {
    const [result] = await Promise.all([readDockerArchiveIdentity(measured, inspection), closed]);
    category = 'complete';
    return result;
  } catch {
    if (bytesRead > IMAGE_ARCHIVE_LIMITS.bytes && !killed) category = 'archive-size-limit';
    stop(category);
    await Promise.race([closed.catch(() => {}), new Promise(resolve => { terminationTimer = setTimeout(resolve, 5000); })]);
    const error = new Error('Docker image identity is unavailable');
    error.code = 'DOCKER_IMAGE_STREAM_FAILED'; error.diagnostic = diagnostic();
    throw error;
  } finally {
    clearTimeout(timer); clearTimeout(terminationTimer);
    onDiagnostic?.(diagnostic());
  }
}

// The requested digest is an immutable engine reference, not necessarily a
// configuration digest. The saved content graph owns configuration resolution.
export async function observeDockerImage(reference, dependencies = {}) {
  let stage = 'input';
  try {
    if (typeof reference !== 'string' || reference.length !== 71 || !/^sha256:[a-f0-9]{64}$/.test(reference)) invalid();
    const command = dependencies.command || evidenceCommand;
    stage = 'inspect';
    const inspected = parseDockerImageInspection(parseCiEvidenceJson(await command('docker', [
      '--context', 'default', 'image', 'inspect', '--format', format, reference,
    ], 16384), 16384));
    if (inspected.nativeId !== reference) invalid();
    stage = 'archive';
    const result = await (dependencies.archive || streamDockerImageIdentity)(inspected);
    stage = 'identity';
    if (!result || Object.keys(result).sort().join(',') !== 'configDigest,platform'
      || typeof result.configDigest !== 'string' || result.configDigest.length !== 71
      || !/^sha256:[a-f0-9]{64}$/.test(result.configDigest) || result.platform !== inspected.platform) invalid();
    return result;
  } catch {
    const error = new Error('Docker image identity is unavailable');
    error.code = 'DOCKER_IMAGE_OBSERVATION_FAILED';
    error.stage = stage;
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) invalid();
    process.stdout.write(JSON.stringify(await observeDockerImage(process.argv[2])) + '\n');
  } catch (error) {
    const stage = error?.code === 'DOCKER_IMAGE_OBSERVATION_FAILED'
      && ['input', 'inspect', 'archive', 'identity'].includes(error.stage) ? ` at ${error.stage}` : '';
    process.stderr.write(`Docker image identity is unavailable${stage}.\n`);
    process.exitCode = 1;
  }
}
