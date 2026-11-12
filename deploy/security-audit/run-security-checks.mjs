import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const relativeSelf = 'deploy/security-audit/run-security-checks.mjs';
const self = fileURLToPath(import.meta.url);
const repository = path.resolve(path.dirname(self), '../..');
const image = 'ghcr.io/gitleaks/gitleaks:v8.30.1';

// Each job owns its failure. Audit exit 1 is advisory data; other exits are
// execution errors. The existing policy checker decides whether advisories block.
export function runSecurityLanes(source, evidence, execute) {
  const app = path.join(source, 'mofacts');
  const results = [];
  function lane(name, body) {
    let status = 'FAIL';
    try { body(); status = 'PASS'; } catch { /* Keep other jobs observable. */ }
    results.push({ name, status });
  }
  function command(name, executable, args, cwd, allowed = [0], output) {
    const code = execute({ name, executable, args, cwd, output });
    if (!allowed.includes(code)) throw new Error('Security command failed');
  }
  lane('gitleaks', () => command('gitleaks', 'docker', [
    'run', '--rm', '--pull=never', '--network=none', '--memory=1g', '--cpus=1',
    '-v', `${source}:/repo:ro`, image, 'git', '--redact', '--config', '/repo/.gitleaks.toml', '/repo',
  ], source));
  lane('source-contracts', () => {
    command('source-install', 'npm', ['ci', '--ignore-scripts'], app);
    command('source-surfaces', process.execPath, ['scripts/security-audit/check-security-surfaces.mjs'], app);
    command('source-tests', process.execPath, ['--test', 'scripts/security-audit/source-security.test.mjs',
      'scripts/security-audit/source-security-v2.test.mjs'], app);
  });
  for (const [name, directory] of [
    ['application', app], ['sidecar-mongo', path.join(source, 'mofacts-mcp-sidecar/services/mongo-mcp')],
  ]) {
    lane(name, () => {
      const all = path.join(evidence, `${name}-all.json`);
      const runtime = path.join(evidence, `${name}-runtime.json`);
      command(`${name}-all`, 'npm', ['audit', '--json', '--package-lock-only'], directory, [0, 1], all);
      command(`${name}-runtime`, 'npm', ['audit', '--json', '--package-lock-only', '--omit=dev'], directory, [0, 1], runtime);
      command(`${name}-policy`, process.execPath, [
        path.join(app, 'scripts/security-audit/check-ci-dependencies.mjs'), name, all, runtime,
      ], directory);
    });
  }
  return results;
}

function small(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0 || result.error) throw new Error(`Required ${command} preflight failed`);
  return result.stdout.trim();
}

export function runCommittedSecurityChecks(commit, output) {
  if (process.platform !== 'linux' || !/^[a-f0-9]{40}$/.test(commit ?? '')
      || !output || !path.isAbsolute(output)) throw new Error('Requires Linux, exact commit and new absolute evidence directory');
  const evidence = path.resolve(output);
  if (evidence === repository || evidence.startsWith(`${repository}${path.sep}`)) {
    throw new Error('Evidence must be outside the operator checkout');
  }
  if (small('git', ['rev-parse', `${commit}^{commit}`], repository) !== commit) throw new Error('Unknown source commit');
  const pins = JSON.parse(small('git', ['show', `${commit}:mofacts/package.json`], repository)).engines;
  if (process.versions.node !== pins.node || small('npm', ['--version'], repository) !== pins.npm) {
    throw new Error('Use the repository-pinned Node and npm runtime');
  }
  const committedSelf = spawnSync('git', ['show', `${commit}:${relativeSelf}`], { cwd: repository, maxBuffer: 1024 * 1024 });
  if (committedSelf.status !== 0 || !fs.readFileSync(self).equals(committedSelf.stdout)) {
    throw new Error('Runner must match the selected committed source');
  }
  const previousMask = process.umask(0o077);
  let scratch;
  try {
    fs.mkdirSync(evidence, { recursive: false, mode: 0o700 });
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mofacts-security-'));
    const source = path.join(scratch, 'source');
    small('git', ['clone', '--quiet', '--no-hardlinks', '--no-checkout', repository, source], scratch);
    small('git', ['checkout', '--quiet', '--detach', commit], source);
    const startedAt = new Date().toISOString();
    const commands = [];
    const results = runSecurityLanes(source, evidence, (spec) => {
      const log = path.join(evidence, `${spec.name}.log`);
      const stdout = fs.openSync(spec.output ?? log, 'wx', 0o600);
      const stderr = spec.output ? fs.openSync(log, 'wx', 0o600) : stdout;
      let result;
      try {
        result = spawnSync(spec.executable, spec.args, {
          cwd: spec.cwd, stdio: ['ignore', stdout, stderr], timeout: 20 * 60 * 1000,
        });
      } finally {
        fs.closeSync(stdout);
        if (stderr !== stdout) fs.closeSync(stderr);
      }
      const exitCode = result.error ? null : result.status;
      commands.push({ name: spec.name, exitCode, executionError: Boolean(result.error || result.signal) });
      return exitCode;
    });
    const artifacts = fs.readdirSync(evidence).sort().map(name => ({
      name, sha256: createHash('sha256').update(fs.readFileSync(path.join(evidence, name))).digest('hex'),
    }));
    const summary = {
      kind: 'operator-security-checks-v1', commit, node: process.versions.node, npm: pins.npm,
      executor: 'operator-linux', gitleaksImage: image, startedAt, finishedAt: new Date().toISOString(),
      results, commands, artifacts, status: results.every(row => row.status === 'PASS') ? 'PASS' : 'FAIL',
      qualification: 'unqualified',
    };
    fs.writeFileSync(path.join(evidence, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return summary;
  } finally {
    // Only the freshly created, owned scratch directory is removed.
    if (scratch) fs.rmSync(scratch, { recursive: true, force: false });
    process.umask(previousMask);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 4) throw new Error('Expected exact commit and new absolute evidence directory');
    const result = runCommittedSecurityChecks(process.argv[2], process.argv[3]);
    for (const row of result.results) console.log(`${row.name}: ${row.status}`);
    process.exitCode = result.status === 'PASS' ? 0 : 1;
  } catch (error) {
    console.error(`Security execution stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
