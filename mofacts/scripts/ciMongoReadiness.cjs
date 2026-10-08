const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const MAX_ATTEMPTS = 60;
const DIAGNOSTIC_FORMAT = 'status={{.State.Status}} exitCode={{.State.ExitCode}} oomKilled={{.State.OOMKilled}} error={{json .State.Error}} image={{.Config.Image}} imageId={{.Image}}';

function validateContainerName(containerName) {
  if (typeof containerName !== 'string' || !/^mofacts-ci-[a-z0-9-]+$/.test(containerName)) {
    throw new Error('Only explicitly named mofacts-ci containers may be inspected.');
  }
}

async function runDocker(args) {
  try {
    const result = await execFileAsync('docker', args, {
      timeout: 15000,
      maxBuffer: 256 * 1024,
      windowsHide: true,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      exitCode: Number.isInteger(error.code) ? error.code : -1,
      stdout: String(error.stdout || ''),
      stderr: String(error.stderr || ''),
    };
  }
}

function readinessProbe(phase, replicaSetName) {
  if (phase === 'ping') return 'quit(db.adminCommand({ping:1}).ok === 1 ? 0 : 1)';
  if (phase !== 'primary' || typeof replicaSetName !== 'string' || !/^[A-Za-z0-9_-]+$/.test(replicaSetName)) {
    throw new Error('Primary readiness requires the explicitly configured replica-set name.');
  }
  return `const hello = db.hello(); quit(hello.ok === 1 && hello.setName === ${JSON.stringify(replicaSetName)} && hello.isWritablePrimary === true ? 0 : 1)`;
}

async function waitForCiMongo(containerName, phase, replicaSetName, dependencies = {}) {
  validateContainerName(containerName);
  const probe = readinessProbe(phase, replicaSetName);
  const invoke = dependencies.runDocker || runDocker;
  const sleep = dependencies.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const state = await invoke(['inspect', '--format', '{{.State.Status}}', containerName]);
    if (state.exitCode !== 0) throw new Error(`CI MongoDB state inspection failed before ${phase} readiness.`);
    if (state.stdout.trim() !== 'running') {
      throw new Error(`CI MongoDB container stopped before ${phase} readiness.`);
    }
    const result = await invoke(['exec', containerName, 'mongosh', '--quiet', '--eval', probe]);
    if (result.exitCode === 0) return;
    if (result.exitCode === -1) throw new Error(`CI MongoDB ${phase} probe could not complete.`);
    if (attempt < MAX_ATTEMPTS) await sleep(1000);
  }
  throw new Error(`CI MongoDB did not reach ${phase} readiness after ${MAX_ATTEMPTS} attempts.`);
}

async function reportCiContainerDiagnostics(containerName, dependencies = {}) {
  validateContainerName(containerName);
  const invoke = dependencies.runDocker || runDocker;
  const log = dependencies.log || console.error;
  log(`CI container diagnostics: ${containerName}`);
  const state = await invoke(['inspect', '--format', DIAGNOSTIC_FORMAT, containerName]);
  log(state.exitCode === 0 ? state.stdout.trim() : 'Container state is unavailable.');
  const logs = await invoke(['logs', '--tail', '120', '--timestamps', containerName]);
  if (logs.exitCode === 0) {
    if (logs.stdout.trim()) log(logs.stdout.trim());
    if (logs.stderr.trim()) log(logs.stderr.trim());
  } else {
    log('Container logs are unavailable.');
  }
}

async function main(args) {
  const [action, containerName, phase, replicaSetName] = args;
  if (action === 'diagnostics' && args.length >= 2) {
    // Validate the whole list before reading any container.
    args.slice(1).forEach(validateContainerName);
    for (const name of args.slice(1)) await reportCiContainerDiagnostics(name);
    return;
  }
  if (action !== 'wait' || (phase === 'ping' ? args.length !== 3 : args.length !== 4)) {
    throw new Error('Use wait <CI container> ping, wait <CI container> primary <set name>, or diagnostics <CI containers>.');
  }
  try {
    await waitForCiMongo(containerName, phase, replicaSetName);
  } catch (error) {
    await reportCiContainerDiagnostics(containerName);
    throw error;
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { MAX_ATTEMPTS, waitForCiMongo, reportCiContainerDiagnostics };
