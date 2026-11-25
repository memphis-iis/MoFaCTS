import fs from 'node:fs/promises';
import path from 'node:path';
import { readCiFile, realDirectory } from '../qualification/collectCiEvidence.mjs';
import { countPotentialSensitiveLogStatements } from '../scanner-parsers.mjs';
import { sourceCommit } from '../../../common/securityAudit/proofFields.ts';
import { bindStaging2ReleaseRegistry, staging2PlatformImage } from '../qualification/bindStaging2ReleaseRegistry.mjs';
import { requiredMeteorVerificationIds } from '../qualification/verificationCatalogProof.mjs';
import { runRepositoryCommandV2 } from './commandV2.mjs';
import { auditToolEnvironmentV2 } from '../core/childEnvironmentV2.mjs';
import { parseNodeSourceTestObservationV2 } from './observationsV2.mjs';

const invalid = () => { throw new Error('Source inspection did not complete'); };
const unavailable = reason => ({ state: 'unavailable', reason });
const observed = value => ({ state: 'observed', value });
export const REPOSITORY_SOURCE_CONTROLS_V2 = Object.freeze({
  surface: 'repository.security-surface-contract', logging: 'repository.sensitive-logging', tests: 'repository.source-security-tests',
});
const processError = result => result?.failure ? unavailable(result.failure === 'timeout' ? 'timeout'
  : result.failure === 'command-unavailable' ? 'tool-unavailable' : 'evidence-incomplete') : undefined;
const unchanged = (before, after) => {
  for (const key of ['ino', 'dev', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']) if (before[key] !== after[key]) invalid();
};

// Count the required Meteor cases tied to the sealed runtime registry. Static
// registration ownership is a separate prerequisite, never runtime evidence.
export function parseSurfaceCoverageObservationV2({ revision, changes, check, binding, imageContext, target }) {
  const error = processError(revision) || processError(changes) || processError(check); if (error) return error;
  try {
    if (!binding || binding.state !== 'matched' || binding.target !== target
      || revision?.exitCode !== 0 || changes?.exitCode !== 0 || check?.exitCode !== 0) return unavailable('evidence-incomplete');
    const text = result => new TextDecoder('utf-8', { fatal: true }).decode(result.stdout);
    const scanner = sourceCommit(text(revision).trim());
    if (text(changes) || text(check) !== 'Application registration owners verified.\n'
      || binding.buildIdentity.includedUncommittedLocalChanges || scanner !== binding.buildIdentity.baseCommit
      || imageContext?.deployedApplicationRevision?.state !== 'observed' || imageContext.deployedApplicationRevision.value !== scanner
      || imageContext?.deployedImageDigest?.state !== 'observed'
      || imageContext.deployedImageDigest.value !== staging2PlatformImage(binding.publishedImage)) return unavailable('evidence-incomplete');
    const expected = requiredMeteorVerificationIds.length;
    return observed({ expectedCaseCount: expected, completedCaseCount: expected, matchedCaseCount: expected,
      domainRejectionCount: 0, transportErrorCount: 0, inconclusiveCaseCount: 0 });
  } catch { return unavailable('producer-malformed'); }
}

// Same source selection and sensitive-statement classifier as V1. Count files
// with findings rather than exposing statements or inventing a statement total.
export async function observeSensitiveLoggingV2(serverDirectory) {
  try {
    const root = await realDirectory(serverDirectory), snapshots = [];
    let entries = 0, bytes = 0, evaluatedCount = 0, findingCount = 0;
    async function walk(directory, depth) {
      if (depth > 64) invalid();
      const before = await fs.lstat(directory, { bigint: true });
      if (!before.isDirectory() || before.isSymbolicLink()) invalid();
      snapshots.push({ file: directory, stat: before });
      const stream = await fs.opendir(directory);
      for await (const entry of stream) {
        if (++entries > 20000) invalid();
        const file = path.join(directory, entry.name), stat = await fs.lstat(file, { bigint: true });
        if (stat.isSymbolicLink()) invalid();
        if (stat.isDirectory()) await walk(file, depth + 1);
        else if (!stat.isFile()) invalid();
        else if (/\.(?:ts|js|mjs|svelte)$/.test(entry.name) && !entry.name.includes('.test.')) {
          if (++evaluatedCount > 10000 || stat.size > BigInt(64 * 1024 * 1024 - bytes)) invalid();
          const content = await readCiFile(file, 8 * 1024 * 1024);
          unchanged(stat, await fs.lstat(file, { bigint: true }));
          bytes += content.length;
          const text = new TextDecoder('utf-8', { fatal: true }).decode(content);
          if (countPotentialSensitiveLogStatements(text) > 0) findingCount++;
          snapshots.push({ file, stat });
        }
      }
      unchanged(before, await fs.lstat(directory, { bigint: true }));
    }
    await walk(root, 1);
    if (!evaluatedCount) invalid();
    for (const { file, stat } of snapshots) unchanged(stat, await fs.lstat(file, { bigint: true }));
    return observed({ evaluatedCount, findingCount });
  } catch { return unavailable('evidence-incomplete'); }
}

// Import-safe, explicit source acquisition; no npm audit/image/network operation.
// The caller supplies its selected source checkout and narrow test environment.
// Running the full source suite can create owned temporary synthetic fixtures;
// it does not invoke Meteor. Source/release authenticity remains independently owned.
export async function acquireRepositorySourceObservationsV2({ repositoryDirectory, environment, imageContext, registryEvidence, target },
  { run: execute = runRepositoryCommandV2, bindRegistry = bindStaging2ReleaseRegistry } = {}) {
  const toolEnvironment = auditToolEnvironmentV2(environment);
  const root = await realDirectory(repositoryDirectory), app = await realDirectory(path.join(root, 'mofacts'));
  const run = async (command, args) => {
    try { return await execute({ command, args, cwd: app, environment: toolEnvironment,
      timeoutMs: 15 * 60 * 1000, maximum: 8 * 1024 * 1024 }); }
    catch { return { exitCode: -1, stdout: Buffer.alloc(0), failure: 'command-unavailable' }; }
  };
  let surface = unavailable('evidence-incomplete');
  if (registryEvidence !== undefined) {
    try {
      const binding = await bindRegistry(registryEvidence);
      const revision = await run('git', ['rev-parse', '--verify', 'HEAD']);
      const changes = await run('git', ['status', '--porcelain', '--untracked-files=normal']);
      const checker = path.join(app, 'scripts', 'security-audit', 'checkRegistrationBypasses.mjs');
      const check = await run(process.execPath, [checker]);
      surface = parseSurfaceCoverageObservationV2({ revision, changes, check, binding, imageContext, target });
    } catch { surface = unavailable('producer-malformed'); }
  }
  const observations = { [REPOSITORY_SOURCE_CONTROLS_V2.surface]: surface,
    [REPOSITORY_SOURCE_CONTROLS_V2.logging]: await observeSensitiveLoggingV2(path.join(app, 'server')) };
  const source = path.join(app, 'scripts', 'security-audit', 'source-security-v2.test.mjs');
  const tests = await run(process.execPath, ['--test', '--test-reporter=tap', source]);
  observations[REPOSITORY_SOURCE_CONTROLS_V2.tests] = processError(tests) || parseNodeSourceTestObservationV2(tests, source);
  return observations;
}
