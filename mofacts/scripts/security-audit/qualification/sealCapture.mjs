import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readControl, requireWorkspace } from './captureBuildSource.mjs';

const execute = promisify(execFile);
const schema = 'MoFaCTSCaptureSealV1';
const stages = new Set(['runner-contract', 'unseal-cwd', 'locate-inputs', 'read-mount-table',
  'existing-mounts', 'write-seal-receipt', 'bind-checkout', 'protect-checkout',
  'bind-capture', 'protect-capture', 'bind-test-derivative', 'enable-test-writes',
  'mount-topology', 'read-seal-receipt', 'probe-capture-receipt', 'probe-recipe', 'probe-compose']);
const topologyReasons = new Set(['unexpected-mount', ...['checkout', 'capture', 'test-derivative']
  .flatMap(role => ['missing-', 'duplicate-', 'incorrect-mode-'].map(prefix => prefix + role))]);
const invalid = stage => {
  const error = new Error('Capture seal validation failed');
  if (stage) error.sealStage = stage;
  throw error;
};
const inside = (parent, child) => child === parent || child.startsWith(parent + path.sep);

async function atStage(stage, operation) {
  try { return await operation(); }
  catch (error) { if (!error.sealStage) error.sealStage = stage; throw error; }
}

export function sealFailureSummary(error) {
  const stage = stages.has(error?.sealStage) ? error.sealStage : 'validation';
  const code = ['EPERM', 'EACCES', 'EROFS', 'ENOENT', 'EEXIST', 'EBUSY', 'EINVAL', 'ETIMEDOUT'].includes(error?.code)
    ? error.code : Number.isSafeInteger(error?.code) && error.code >= 0 && error.code <= 255
      ? 'native-exit-' + error.code : 'unclassified';
  // Classify known native messages, never copy stderr, arguments or paths.
  const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
  const reason = topologyReasons.has(error?.sealReason) ? error.sealReason
    : /operation not permitted/i.test(stderr) ? 'operation-not-permitted'
    : /permission denied/i.test(stderr) ? 'permission-denied'
      : /not a directory|mount point.*does not exist/i.test(stderr) ? 'invalid-mountpoint'
        : /target is busy|device or resource busy|mount point is busy/i.test(stderr) ? 'mountpoint-busy' : 'unspecified';
  const detail = ['same-kernel-id', 'different-kernel-id'].includes(error?.sealDetail) ? `, detail=${error.sealDetail}` : '';
  return `Capture seal operation failed (stage=${stage}, code=${code}, reason=${reason}${detail}); no qualification was issued.\n`;
}

// The kernel owns mount state; the receipt alone never establishes protection.
export function parseMounts(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 1024 * 1024) invalid();
  return text.trim().split('\n').filter(Boolean).map(line => {
    const fields = line.split(' ');
    if (fields.length < 10 || !fields.includes('-')) invalid();
    const target = fields[4].replace(/\\(040|011|012|134)/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
    if (!path.isAbsolute(target)) invalid();
    if (!/^[1-9][0-9]*$/.test(fields[0])) invalid();
    return { mountId: fields[0], target, options: fields[5].split(',') };
  });
}

async function mounts() { return parseMounts(await fs.readFile('/proc/self/mountinfo', 'utf8')); }
async function command(args) {
  // Fixed binaries/options and validated absolute paths; never execute a shell.
  await execute('sudo', ['-n', ...args], { timeout: 10000, maxBuffer: 64 * 1024, windowsHide: true });
}

async function locations(workspace, repository) {
  const root = await requireWorkspace(workspace);
  const repo = await fs.realpath(repository);
  if (path.resolve(repository) !== repo || inside(root, repo) || inside(repo, root)) invalid();
  const derivative = path.join(root, 'test-context');
  for (const target of [repo, path.join(root, 'context'), derivative]) {
    const stat = await fs.lstat(target);
    if (!stat.isDirectory() || stat.isSymbolicLink()) invalid();
  }
  for (const name of ['capture.json', 'compose.capture.json', 'test-inputs.json']) {
    await readControl(path.join(root, name));
  }
  return { root, repo, derivative, receipt: path.join(root, 'seal.json') };
}

function relevant(entries, locations) {
  return entries.filter(entry => inside(locations.root, entry.target) || inside(locations.repo, entry.target));
}

function checkMounts(entries, locations, complete) {
  const expected = new Map([[locations.repo, 'ro'], [locations.root, 'ro'], [locations.derivative, 'rw']]);
  const role = target => target === locations.repo ? 'checkout' : target === locations.root ? 'capture' : 'test-derivative';
  const reject = (reason, detail) => {
    const error = new Error('Capture seal validation failed');
    error.sealReason = reason;
    if (detail) error.sealDetail = detail;
    throw error;
  };
  const seen = new Set();
  const mountIds = new Map();
  for (const entry of relevant(entries, locations)) {
    const mode = expected.get(entry.target);
    if (!mode) reject('unexpected-mount');
    if (seen.has(entry.target)) reject('duplicate-' + role(entry.target), entry.mountId && mountIds.has(entry.target)
      ? mountIds.get(entry.target) === entry.mountId ? 'same-kernel-id' : 'different-kernel-id' : undefined);
    if (complete && !entry.options.includes(mode)) reject('incorrect-mode-' + role(entry.target));
    seen.add(entry.target);
    if (entry.mountId) mountIds.set(entry.target, entry.mountId);
  }
  if (complete) for (const target of expected.keys()) if (!seen.has(target)) reject('missing-' + role(target));
  return seen;
}

async function readReceipt(locations) {
  const receipt = JSON.parse(await readControl(locations.receipt));
  const marker = JSON.parse(await readControl(path.join(locations.root, 'owner.json')));
  if (receipt.schema !== schema || receipt.workspace !== locations.root || receipt.repository !== locations.repo
    || receipt.ownerId !== marker.id || Object.keys(receipt).length !== 4) invalid();
}

// Does not change bytes or modes. Opening for write and chmod must both fail.
async function requireReadOnly(target) {
  const mode = (await fs.stat(target)).mode & 0o777;
  for (const operation of [async () => { const handle = await fs.open(target, 'r+'); await handle.close(); },
    () => fs.chmod(target, mode)]) {
    let denied = false;
    try { await operation(); }
    catch (error) { if (!['EROFS', 'EACCES', 'EPERM'].includes(error.code)) throw error; denied = true; }
    if (!denied) invalid();
  }
}

export async function assertCaptureSealed(workspace, repository, dependencies = {}) {
  const loc = await atStage('locate-inputs', () => locations(workspace, repository));
  await atStage('read-seal-receipt', () => readReceipt(loc));
  const observed = await atStage('read-mount-table', () => (dependencies.mounts ?? mounts)());
  await atStage('mount-topology', () => checkMounts(observed, loc, true));
  await atStage('probe-capture-receipt', () => requireReadOnly(path.join(loc.root, 'capture.json')));
  await atStage('probe-recipe', () => requireReadOnly(path.join(loc.root, 'context', 'Dockerfile')));
  await atStage('probe-compose', () => requireReadOnly(path.join(loc.repo, 'deploy', 'docker-compose.yml')));
  return { state: 'capture-sealed-unqualified' };
}

export async function sealCapture(workspace, repository, dependencies = {}) {
  const loc = await atStage('locate-inputs', () => locations(workspace, repository));
  const observe = dependencies.mounts ?? mounts;
  const invoke = dependencies.command ?? command;
  if (relevant(await atStage('read-mount-table', observe), loc).length) invalid('existing-mounts');
  const marker = JSON.parse(await readControl(path.join(loc.root, 'owner.json')));
  await atStage('write-seal-receipt', () => fs.writeFile(loc.receipt, JSON.stringify({ schema,
    workspace: loc.root, repository: loc.repo, ownerId: marker.id }), { flag: 'wx', mode: 0o600 }));
  const mounted = [];
  try {
    for (const [target, mode, bindStage, protectStage] of [
      [loc.repo, 'ro', 'bind-checkout', 'protect-checkout'],
      [loc.root, 'ro', 'bind-capture', 'protect-capture'],
      [loc.derivative, 'rw', 'bind-test-derivative', 'enable-test-writes'],
    ]) {
      await atStage(bindStage, () => invoke(['mount', '--bind', target, target]));
      mounted.push(target);
      // Supply both operands: target-only remounts consult ambient mount tables
      // and differ across util-linux releases. This is one owned self-bind.
      await atStage(protectStage, () => invoke(['mount', '-o', `remount,bind,${mode}`, target, target]));
    }
    await atStage('mount-topology', async () => checkMounts(await observe(), loc, true));
    // Native probes remain mandatory in production code. Mock orchestration tests
    // verify commands; a separate Linux CI test exercises real kernel rejection.
    await (dependencies.assertSealed ?? assertCaptureSealed)(workspace, repository);
    return { state: 'capture-sealed-unqualified' };
  } catch (error) {
    // Unmount only mounts successfully allocated above, in reverse order. Keep
    // the receipt on teardown failure so the always-run unseal can finish it.
    for (const target of mounted.reverse()) await invoke(['umount', target]);
    await fs.unlink(loc.receipt);
    throw error;
  }
}

export async function unsealCapture(workspace, repository, dependencies = {}) {
  const loc = await locations(workspace, repository);
  const observe = dependencies.mounts ?? mounts;
  const invoke = dependencies.command ?? command;
  try { await readReceipt(loc); }
  catch (error) {
    if (error.code !== 'ENOENT' || relevant(await observe(), loc).length) throw error;
    return { state: 'capture-seal-absent' };
  }
  // A failed partial seal may have rw mounts. Refuse all unknown/nested mounts.
  const present = checkMounts(await observe(), loc, false);
  for (const target of [loc.derivative, loc.root, loc.repo]) {
    if (present.has(target)) await invoke(['umount', target]);
  }
  if (relevant(await observe(), loc).length) invalid();
  await fs.unlink(loc.receipt);
  return { state: 'capture-seal-released' };
}

export async function main(argv) {
  if (process.platform !== 'linux' || process.env.CI !== 'true') invalid('runner-contract');
  const [action, workspace, repository, ...extra] = argv;
  if (extra.length || !workspace || !repository
    || path.resolve(repository) !== process.env.GITHUB_WORKSPACE) invalid('runner-contract');
  const run = { seal: sealCapture, assert: assertCaptureSealed, unseal: unsealCapture }[action];
  if (!run) invalid();
  // An unsealing process must not hold its own cwd on a mount it will remove.
  if (action === 'unseal' && (inside(path.resolve(workspace), process.cwd())
    || inside(path.resolve(repository), process.cwd()))) invalid('unseal-cwd');
  return run(workspace, repository);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(result => process.stdout.write(`${JSON.stringify(result)}\n`), error => {
    process.stderr.write(sealFailureSummary(error));
    process.exitCode = 1;
  });
}
