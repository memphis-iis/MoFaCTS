import { spawn } from 'node:child_process';
import path from 'node:path';

const allowedEnvironment = new Set(['PATH', 'HOME', 'TMPDIR', 'XDG_CACHE_HOME', 'HTTP_PROXY', 'HTTPS_PROXY',
  'NO_PROXY', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_OPTIONS', 'CI']);
const invalid = () => { throw new Error('Invalid repository command configuration'); };

export function repositoryToolEnvironmentV2(environment) {
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)
    || !Object.hasOwn(environment, 'PATH') || environment.NODE_OPTIONS !== ''
    || Object.entries(environment).some(([key, value]) => !allowedEnvironment.has(key) || typeof value !== 'string' || value.includes('\0'))) invalid();
  return Object.freeze({ ...environment });
}

// The V1 text-returning command helper and CI's success-only collector cannot
// preserve binary tool protocols, expected finding exits and owned process-tree
// termination together. Keep this boundary inert and specific to V2 acquisition.
// Callers provide a narrow tool environment; complete auth fixtures never enter it.
export function runRepositoryCommandV2({ command, args, cwd, environment, input,
  timeoutMs = 15 * 60 * 1000, maximum = 8 * 1024 * 1024 }) {
  const env = repositoryToolEnvironmentV2(environment);
  if (process.platform !== 'linux' || typeof command !== 'string' || !command.length || command.includes('\0')
    || !Array.isArray(args) || args.some(value => typeof value !== 'string' || value.includes('\0'))
    || typeof cwd !== 'string' || !path.isAbsolute(cwd)
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30 * 60 * 1000
    || !Number.isSafeInteger(maximum) || maximum < 1 || maximum > 8 * 1024 * 1024
    || (input !== undefined && (!(input instanceof Uint8Array) || input.length > 64 * 1024))) invalid();
  // Copy coordinates before asynchronous work; no mutable caller configuration
  // may change which invocation the returned observation claims to describe.
  const recordedArgs = [...args], stdin = input === undefined ? undefined : Buffer.from(input);
  return new Promise(resolve => {
    const child = spawn(command, recordedArgs, { cwd, env, shell: false, windowsHide: true,
      detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdoutBytes = 0, stderrBytes = 0, failure, settled = false, terminationGrace;
    const chunks = [];
    function killGroup() {
      if (!child.pid) return;
      try { process.kill(-child.pid, 'SIGKILL'); }
      catch (error) { if (error.code !== 'ESRCH') failure = 'cleanup-incomplete'; }
    }
    function stop(reason) {
      if (settled) return;
      failure ||= reason; chunks.length = 0; killGroup();
      terminationGrace ||= setTimeout(() => {
        failure = 'cleanup-incomplete';
        child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); child.unref(); finish(-1);
      }, 5000);
    }
    const timer = setTimeout(() => stop('timeout'), timeoutMs);
    function finish(exitCode) {
      if (settled) return; clearTimeout(timer);
      // A surviving descendant cannot outlive the invocation's observation.
      if (child.pid) {
        try { process.kill(-child.pid, 0); stop('cleanup-incomplete'); }
        catch (error) { if (error.code !== 'ESRCH') stop('cleanup-incomplete'); }
      }
      clearTimeout(terminationGrace);
      settled = true;
      resolve({ exitCode: failure || !Number.isInteger(exitCode) ? -1 : exitCode,
        stdout: failure ? Buffer.alloc(0) : Buffer.concat(chunks), args: recordedArgs,
        NODE_OPTIONS: env.NODE_OPTIONS, ...(failure ? { failure } : {}) });
    }
    child.stdout.on('data', chunk => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maximum) stop('output-limit');
      else if (!failure) chunks.push(chunk);
    });
    // Drain, count and discard: raw diagnostic lines may contain credentials.
    child.stderr.on('data', chunk => { stderrBytes += chunk.length; if (stderrBytes > 65536) stop('output-limit'); });
    child.stdin.on('error', () => stop('input-incomplete'));
    child.stdout.on('error', () => stop('output-incomplete'));
    child.stderr.on('error', () => stop('output-incomplete'));
    child.once('error', () => { failure ||= 'command-unavailable'; });
    child.once('close', finish);
    child.stdin.end(stdin);
  });
}
