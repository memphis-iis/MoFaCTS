import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseAuditIdentity } from '../../../common/securityAudit/reportIdentity.ts';
import { readCiFile, realDirectory } from '../qualification/collectCiEvidence.mjs';
import { runRepositoryCommandV2, repositoryToolEnvironmentV2 } from './commandV2.mjs';
import { parseGitleaksRepositoryObservationV2, parseNpmRepositoryObservationsV2,
  parseTrivyRepositoryObservationV2 } from './observationsV2.mjs';

const unavailable = reason => ({ state: 'unavailable', reason });
const failed = result => result?.failure ? unavailable(result.failure === 'timeout' ? 'timeout'
  : result.failure === 'command-unavailable' ? 'tool-unavailable' : 'evidence-incomplete') : undefined;
const invalid = () => { throw new Error('Repository acquisition did not complete'); };

// Explicit, unscheduled acquisition. Imports perform no tool or network work.
// Source/fixture/image qualification belongs to the coordinator, not this raw
// observation adapter. It neither loads auth fixtures nor grants live-run consent.
export async function acquireRepositoryToolObservationsV2({ repositoryDirectory, environment,
  runtimeImage, developmentExposurePolicy }, dependencies = { run: runRepositoryCommandV2 }) {
  if (!dependencies || Object.keys(dependencies).length !== 1 || typeof dependencies.run !== 'function') invalid();
  const toolEnvironment = repositoryToolEnvironmentV2(environment);
  const root = await realDirectory(repositoryDirectory), observations = {};
  const temporary = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'mofacts-repository-v2-'));
  const identity = await fs.lstat(temporary, { bigint: true });
  const run = async (command, args, cwd, timeoutMs) => {
    try { return await dependencies.run({ command, args, cwd, environment: toolEnvironment, timeoutMs }); }
    catch { return { exitCode: -1, stdout: Buffer.alloc(0), failure: 'command-unavailable' }; }
  };
  // The shared reader checks stable single-link regular files and bounds bytes.
  // Reports live only in our private 0700 directory and are never logged/copied.
  const reportResult = async (result, file) => {
    if (failed(result) || ![0, 1].includes(result?.exitCode)) return result;
    try { return { ...result, stdout: await readCiFile(file, 8 * 1024 * 1024) }; }
    catch { return { exitCode: -1, stdout: Buffer.alloc(0) }; }
  };
  try {
    const gitReport = path.join(temporary, 'gitleaks.json');
    const git = await run('gitleaks', ['git', '--redact', '--config', path.join(root, '.gitleaks.toml'),
      '--report-format', 'json', '--report-path', gitReport, root], root, 20 * 60 * 1000);
    observations['repository.git-history-secrets'] = failed(git)
      || parseGitleaksRepositoryObservationV2(await reportResult(git, gitReport));
    // Sequential commands preserve bounded workstation/CI memory use; the raw
    // parser retains a valid runtime result when the independent all-graph fails.
    for (const [lockfile, directory] of [['application', path.join(root, 'mofacts')],
      ['sidecar-mongo', path.join(root, 'mofacts-mcp-sidecar', 'services', 'mongo-mcp')]]) {
      let cwd;
      try { cwd = await realDirectory(directory); }
      catch {
        observations[`${lockfile}-runtime`] = unavailable('configuration');
        observations[`${lockfile}-development`] = unavailable('configuration'); continue;
      }
      const runtime = await run('npm', ['audit', '--json', '--package-lock-only', '--omit=dev'], cwd, 15 * 60 * 1000);
      const all = await run('npm', ['audit', '--json', '--package-lock-only'], cwd, 15 * 60 * 1000);
      const parsed = parseNpmRepositoryObservationsV2({ runtime, all, policy: developmentExposurePolicy, lockfile });
      if (failed(runtime)) {
        parsed[`${lockfile}-runtime`] = failed(runtime);
        parsed[`${lockfile}-development`] = unavailable('evidence-incomplete');
      } else if (failed(all)) parsed[`${lockfile}-development`] = failed(all);
      Object.assign(observations, parsed);
    }
    try { parseAuditIdentity({ state: 'observed', value: runtimeImage }, 'platform-image'); }
    catch { observations['runtime-image'] = unavailable('identity-unavailable'); return observations; }
    const imageReport = path.join(temporary, 'trivy.json');
    const image = await run('trivy', ['image', '--quiet', '--scanners', 'vuln', '--format', 'json',
      '--output', imageReport, '--severity', 'HIGH,CRITICAL', runtimeImage], root, 30 * 60 * 1000);
    observations['runtime-image'] = failed(image)
      || parseTrivyRepositoryObservationV2(await reportResult(image, imageReport), runtimeImage);
    return observations;
  } finally {
    const current = await fs.lstat(temporary, { bigint: true });
    if (!current.isDirectory() || current.isSymbolicLink() || current.ino !== identity.ino || current.dev !== identity.dev
      || await fs.realpath(temporary) !== temporary) invalid();
    await fs.rm(temporary, { recursive: true });
  }
}
