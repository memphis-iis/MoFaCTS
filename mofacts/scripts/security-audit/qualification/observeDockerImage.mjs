import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { evidenceCommand } from './collectCiEvidence.mjs';
import { parseCiEvidenceJson } from './ciEvidence.mjs';
import { parseDockerImageInspection, readDockerArchiveIdentity } from './imageArchiveIdentity.mjs';

// Older Engine APIs omit Descriptor entirely. Keyed lookup emits explicit null
// without a template error; classic identity still requires hashing config bytes.
const format = '{"nativeId":{{json .Id}},"platform":"{{.Os}}/{{.Architecture}}","descriptor":{{json (index . "Descriptor")}}}';
const invalid = () => { throw new Error('Docker image identity is unavailable'); };

export async function streamDockerImageIdentity(inspection, environment = process.env, spawnProcess = spawn) {
  const child = spawnProcess('docker', ['--context', 'default', 'image', 'save', inspection.nativeId], {
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: environment,
  });
  let stderrBytes = 0;
  let killed = false;
  const stop = () => { killed = true; child.kill(); child.stdout.destroy(); child.stderr.destroy(); };
  const timer = setTimeout(stop, 120000);
  child.stderr.on('data', chunk => { stderrBytes += chunk.length; if (stderrBytes > 65536) stop(); });
  const closed = new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error('Docker image identity is unavailable')));
    child.once('close', code => { if (code === 0 && !killed) resolve(); else reject(new Error('Docker image identity is unavailable')); });
  });
  try {
    const [result] = await Promise.all([readDockerArchiveIdentity(child.stdout, inspection), closed]);
    return result;
  } catch { stop(); await closed.catch(() => {}); invalid(); }
  finally { clearTimeout(timer); }
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
