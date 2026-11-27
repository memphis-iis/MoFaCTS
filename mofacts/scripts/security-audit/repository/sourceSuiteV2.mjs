import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { proofRecord, sourceCommit } from '../../../common/securityAudit/proofFields.ts';
import { auditToolEnvironmentV2 } from '../core/childEnvironmentV2.mjs';
import { parseCiEvidenceJson } from '../qualification/ciEvidence.mjs';
import { readCiFile, realDirectory, writeNew } from '../qualification/collectCiEvidence.mjs';

const maxTranscriptBytes = 8 * 1024 * 1024;
const maxSupplementBytes = 128 * 1024;
const testFlags = ['--test', '--test-reporter=tap'];
export const WINDOWS_SOURCE_TEST_CASES_V2 = Object.freeze([
  'standard recorder resolves the exact running pinned Node executable and rejects relative paths',
  'standard runtime preflight rejects an installed executable reporting the wrong version',
  'standard recording cannot invoke the runtime or SSH before explicit participant acceptance',
  'Windows SSH can expand local configuration in the observer restricted environment without network access',
]);
const windowsFiles = [
  'mofacts/scripts/security-audit/tests/standardRecordingRuntime.test.mjs',
  'mofacts/scripts/security-audit/tests/observeDeploymentImage.test.mjs',
];
const invalid = () => { throw new Error('Invalid source-security test evidence'); };
const unavailable = reason => ({ state: 'unavailable', reason });
const execute = promisify(execFile);

export function windowsSourceTestArgsV2() {
  const names = WINDOWS_SOURCE_TEST_CASES_V2.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return [...testFlags, '--test-name-pattern', '^(?:' + names.join('|') + ')$', ...windowsFiles];
}

function matchesArgs(result, expected) {
  return result?.NODE_OPTIONS === '' && Array.isArray(result.args) && result.args.length === expected.length
    && result.args.every((argument, index) => argument === expected[index]);
}

function parseFlatTap(result, files) {
  if (![0, 1].includes(result.exitCode)) invalid();
  const bytes = typeof result.stdout === 'string' ? Buffer.from(result.stdout) : result.stdout;
  if (!(bytes instanceof Uint8Array) || bytes.length > maxTranscriptBytes) invalid();
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replaceAll('\r\n', '\n');
  if ((text.match(/^TAP version 13$/gm) || []).length !== 1) invalid();
  const one = expression => {
    const matches = [...text.matchAll(expression)];
    if (matches.length !== 1) invalid();
    return Number(matches[0][1]);
  };
  const planned = one(/^1\.\.(\d+)$/gm);
  const counts = Object.fromEntries(['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']
    .map(name => [name, one(new RegExp('^# ' + name + ' (\\d+)$', 'gm'))]));
  const rows = [...text.matchAll(/^(not ok|ok) (\d+) - ([^\n]*)$/gm)];
  if (planned < 1 || planned > 10000 || planned !== counts.tests || counts.suites !== 0
    || rows.length !== planned || rows.some((row, index) => Number(row[2]) !== index + 1)
    || counts.pass + counts.fail + counts.cancelled + counts.skipped + counts.todo !== planned) invalid();
  if (counts.cancelled || counts.todo) return undefined;
  const cases = rows.map((row, index) => {
    const label = row[3].trim();
    if (/ # TODO(?:\s.*)?$/.test(label)) return undefined;
    const skip = / # SKIP(?:\s.*)?$/.exec(label);
    const name = skip ? label.slice(0, skip.index) : label;
    if (!name || files.some(file => path.normalize(name) === path.normalize(file))) return undefined;
    if (row[1] === 'not ok') {
      const diagnostic = text.slice(row.index, rows[index + 1]?.index ?? text.length);
      if (skip || !/^\s+code: ['"]ERR_ASSERTION['"]\s*$/m.test(diagnostic)) return undefined;
      return { name, outcome: 'failed' };
    }
    return { name, outcome: skip ? 'skipped' : 'passed' };
  });
  if (cases.some(row => row === undefined)) return undefined;
  for (const [outcome, counter] of [['passed', 'pass'], ['failed', 'fail'], ['skipped', 'skipped']]) {
    if (cases.filter(row => row.outcome === outcome).length !== counts[counter]) invalid();
  }
  if ((result.exitCode === 0) !== (counts.fail === 0)) invalid();
  return { cases, counts };
}

function matchesWindowsCases(names) {
  return names.length === WINDOWS_SOURCE_TEST_CASES_V2.length && new Set(names).size === names.length
    && WINDOWS_SOURCE_TEST_CASES_V2.every(name => names.includes(name));
}

function parseWindowsSupplement(value) {
  const evidence = proofRecord(value, ['schema', 'sourceRevision', 'nodeVersion', 'args', 'NODE_OPTIONS', 'exitCode', 'stdout']);
  if (evidence.schema !== 'WindowsSourceSecuritySupplementV2' || typeof evidence.nodeVersion !== 'string'
    || !/^\d+\.\d+\.\d+$/.test(evidence.nodeVersion)
    || !matchesArgs(evidence, windowsSourceTestArgsV2()) || evidence.exitCode !== 0
    || typeof evidence.stdout !== 'string' || Buffer.byteLength(evidence.stdout) > maxSupplementBytes) invalid();
  sourceCommit(evidence.sourceRevision);
  const run = parseFlatTap(evidence, windowsFiles);
  if (!run || run.counts.fail || run.counts.skipped || !matchesWindowsCases(run.cases.map(row => row.name))) invalid();
  return evidence;
}

export async function readWindowsSourceTestEvidenceV2(file) {
  const directory = await realDirectory(path.dirname(file));
  const bytes = await readCiFile(path.join(directory, path.basename(file)), maxSupplementBytes);
  return parseWindowsSupplement(parseCiEvidenceJson(bytes, maxSupplementBytes));
}

function complete(linux, pair) {
  if (!pair || linux.counts.fail || !linux.counts.pass) return false;
  const skipped = linux.cases.filter(row => row.outcome === 'skipped').map(row => row.name);
  if (!matchesWindowsCases(skipped) || !matchesWindowsCases(linux.cases.filter(row => WINDOWS_SOURCE_TEST_CASES_V2.includes(row.name)).map(row => row.name))) {
    return false;
  }
  const windows = parseWindowsSupplement(pair.windowsEvidence);
  return sourceCommit(pair.sourceRevision) === windows.sourceRevision && pair.nodeVersion === windows.nodeVersion;
}

export function parseNodeSourceTestObservationV2(result, sourceFile, pair) {
  try {
    if (typeof sourceFile !== 'string' || !path.isAbsolute(sourceFile)
      || !matchesArgs(result, [...testFlags, sourceFile])) return unavailable('configuration');
    const linux = parseFlatTap(result, [sourceFile]);
    if (!linux || (linux.counts.skipped && !complete(linux, pair))) return unavailable('evidence-incomplete');
    return { state: 'observed', value: { expectedCaseCount: linux.counts.tests, completedCaseCount: linux.counts.tests,
      matchedCaseCount: linux.counts.pass + linux.counts.skipped, domainRejectionCount: 0, transportErrorCount: 0, inconclusiveCaseCount: 0 } };
  } catch { return unavailable('producer-malformed'); }
}

export async function captureWindowsSourceTestEvidenceV2(repositoryDirectory, outputFile) {
  if (process.platform !== 'win32' || process.env.NODE_OPTIONS) invalid();
  const root = await realDirectory(repositoryDirectory);
  const directory = await realDirectory(path.dirname(outputFile));
  const relative = path.relative(root, directory);
  if (!relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep))) invalid();
  const packageFile = parseCiEvidenceJson(await readCiFile(path.join(root, 'mofacts/package.json'), 128 * 1024), 128 * 1024);
  if (packageFile.engines?.node !== process.versions.node) invalid();
  const inherited = ['PATH', 'PATHEXT', 'SystemRoot', 'WINDIR', 'ProgramData', 'USERPROFILE', 'LOCALAPPDATA', 'TEMP', 'TMP'];
  const env = auditToolEnvironmentV2({ ...Object.fromEntries(inherited.filter(key => process.env[key] !== undefined)
    .map(key => [key, process.env[key]])), NODE_OPTIONS: '' }, 'windows-browser');
  const options = { cwd: root, env, windowsHide: true, timeout: 60000, maxBuffer: maxSupplementBytes };
  const cleanRevision = async () => {
    const gitOptions = { ...options, env: { ...env, GIT_CONFIG_GLOBAL: 'NUL', GIT_CONFIG_NOSYSTEM: '1' }, timeout: 10000 };
    const revision = sourceCommit((await execute('git', ['rev-parse', '--verify', 'HEAD'], gitOptions)).stdout.trim());
    if ((await execute('git', ['status', '--porcelain', '--untracked-files=normal'], gitOptions)).stdout) invalid();
    return revision;
  };
  const sourceRevision = await cleanRevision(), args = windowsSourceTestArgsV2();
  const { stdout } = await execute(process.execPath, args, options);
  if (await cleanRevision() !== sourceRevision) invalid();
  const evidence = parseWindowsSupplement({ schema: 'WindowsSourceSecuritySupplementV2', sourceRevision,
    nodeVersion: process.versions.node, args, NODE_OPTIONS: '', exitCode: 0, stdout });
  const bytes = Buffer.from(canonicalAuditJson(evidence) + '\n');
  if (bytes.length > maxSupplementBytes) invalid();
  await writeNew(path.join(directory, path.basename(outputFile)), bytes);
  return { sourceRevision, passed: WINDOWS_SOURCE_TEST_CASES_V2.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) invalid();
    const result = await captureWindowsSourceTestEvidenceV2(path.resolve(process.argv[2]), path.resolve(process.argv[3]));
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch {
    process.stderr.write('Windows source-security evidence could not be captured.\n');
    process.exitCode = 1;
  }
}
