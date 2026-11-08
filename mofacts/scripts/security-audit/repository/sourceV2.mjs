import fs from 'node:fs/promises';
import path from 'node:path';
import { parseCiEvidenceJson } from '../qualification/ciEvidence.mjs';
import { readCiFile, realDirectory } from '../qualification/collectCiEvidence.mjs';
import { countPotentialSensitiveLogStatements } from '../scanner-parsers.mjs';
import { proofRecord } from '../../../common/securityAudit/proofFields.ts';
import { runRepositoryCommandV2, repositoryToolEnvironmentV2 } from './commandV2.mjs';
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

// Preserve the existing inference checker as the sole policy owner. Its default
// success message supplies a completed count, cross-checked against its actual
// --discover inventory. A nonzero exit alone proves no specific policy violation.
export function parseSurfaceCoverageObservationV2(discovery, check) {
  const error = processError(discovery) || processError(check); if (error) return error;
  try {
    if (discovery?.exitCode !== 0 || check?.exitCode !== 0) return unavailable('evidence-incomplete');
    const inventory = proofRecord(parseCiEvidenceJson(discovery.stdout, 2 * 1024 * 1024),
      ['methods', 'publications', 'httpRoutes', 'exports', 'managementRoutes']);
    let expected = 0;
    for (const names of Object.values(inventory)) {
      if (!Array.isArray(names) || names.length > 10000 || new Set(names).size !== names.length
        || names.some(name => typeof name !== 'string' || !name.length || name.length > 512
          || [...name].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))) invalid();
      expected += names.length;
    }
    if (!expected || expected > 10000 || !(check.stdout instanceof Uint8Array) || check.stdout.length > 1024) invalid();
    const text = new TextDecoder('utf-8', { fatal: true }).decode(check.stdout);
    const completed = /^Security surface contract covers ([1-9][0-9]*) surfaces\.\n$/.exec(text);
    if (!completed || Number(completed[1]) !== expected) invalid();
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
export async function acquireRepositorySourceObservationsV2({ repositoryDirectory, environment },
  dependencies = { run: runRepositoryCommandV2 }) {
  if (!dependencies || Object.keys(dependencies).length !== 1 || typeof dependencies.run !== 'function') invalid();
  const toolEnvironment = repositoryToolEnvironmentV2(environment);
  const root = await realDirectory(repositoryDirectory), app = await realDirectory(path.join(root, 'mofacts'));
  const run = async args => {
    try { return await dependencies.run({ command: process.execPath, args, cwd: app, environment: toolEnvironment,
      timeoutMs: 15 * 60 * 1000, maximum: 8 * 1024 * 1024 }); }
    catch { return { exitCode: -1, stdout: Buffer.alloc(0), failure: 'command-unavailable' }; }
  };
  const checker = path.join(app, 'scripts', 'security-audit', 'check-security-surfaces.mjs');
  const discovery = await run([checker, '--discover']), check = await run([checker]);
  const observations = { [REPOSITORY_SOURCE_CONTROLS_V2.surface]: parseSurfaceCoverageObservationV2(discovery, check),
    [REPOSITORY_SOURCE_CONTROLS_V2.logging]: await observeSensitiveLoggingV2(path.join(app, 'server')) };
  const source = path.join(app, 'scripts', 'security-audit', 'source-security-v2.test.mjs');
  const tests = await run(['--test', '--test-reporter=tap', source]);
  observations[REPOSITORY_SOURCE_CONTROLS_V2.tests] = processError(tests) || parseNodeSourceTestObservationV2(tests, source);
  return observations;
}
