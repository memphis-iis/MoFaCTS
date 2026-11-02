import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { composeCiEvidence, parseCiEvidenceJson, CI_EVIDENCE_FILES, CI_EVIDENCE_LIMITS } from './ciEvidence.mjs';
import { discoverTestModules } from '../../meteorTestEvidence.cjs';

const repositoryApi = 'repos/memphis-iis/MoFaCTS';
const archiveReader = fileURLToPath(new URL('../../../../deploy/security-audit/read-ci-evidence-archive.ps1', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const invalid = () => { throw new Error('CI evidence acquisition failed; no qualification was issued.'); };
const tokenOverrides = ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN'];
function requireUnexpired(artifact, now) {
  const expiry = typeof artifact.expires_at === 'string' ? Date.parse(artifact.expires_at) : NaN;
  if (artifact.expired !== false || !Number.isFinite(expiry) || expiry <= now) invalid();
}

/** Bounded stdout; stderr is drained but never logged, retained, or returned. */
export function evidenceCommand(command, args, maximum, environment = process.env) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let errorSize = 0;
    let failed = false;
    let terminationGrace;
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: environment, windowsHide: true });
    const stop = () => {
      if (failed) return;
      failed = true;
      child.kill();
      clearTimeout(timeout);
      // Wait for close so Windows releases the archive reader's exclusive file
      // handles before the caller attempts owned-workspace cleanup.
      terminationGrace = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        reject(new Error('CI evidence command termination incomplete'));
      }, 5000);
    };
    const timeout = setTimeout(stop, 120000);
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > maximum) stop();
      else chunks.push(chunk);
    });
    child.stderr.on('data', chunk => { errorSize += chunk.length; if (errorSize > 65536) stop(); });
    child.once('error', () => {
      clearTimeout(timeout);
      clearTimeout(terminationGrace);
      reject(new Error('CI evidence command failed'));
    });
    child.once('close', status => {
      clearTimeout(timeout);
      clearTimeout(terminationGrace);
      if (failed || status !== 0) reject(new Error('CI evidence command failed'));
      else resolve(Buffer.concat(chunks));
    });
  });
}

async function realDirectory(value) {
  const absolute = path.resolve(value);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) invalid();
  }
  const real = await fs.realpath(absolute);
  if ((process.platform === 'win32' ? real.toLowerCase() : real)
    !== (process.platform === 'win32' ? absolute.toLowerCase() : absolute)) invalid();
  return absolute;
}

export async function readCiFile(file, maximum) {
  const target = path.resolve(file);
  await realDirectory(path.dirname(target));
  const before = await fs.lstat(target, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size > BigInt(maximum)) invalid();
  const handle = await fs.open(target, 'r');
  try {
    const opened = await handle.stat({ bigint: true });
    if (before.ino !== opened.ino || before.dev !== opened.dev || before.size !== opened.size) invalid();
    const bytes = Buffer.alloc(maximum + 1);
    let count = 0;
    while (count < bytes.length) {
      const result = await handle.read(bytes, count, bytes.length - count, null);
      if (!result.bytesRead) break;
      count += result.bytesRead;
    }
    const after = await fs.lstat(target, { bigint: true });
    if (count > maximum || BigInt(count) !== before.size) invalid();
    for (const key of ['ino', 'dev', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']) {
      if (before[key] !== after[key]) invalid();
    }
    return bytes.subarray(0, count);
  } finally { await handle.close(); }
}

async function writeNew(file, bytes) {
  const handle = await fs.open(file, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
}

async function syncDirectory(directory) {
  if (process.platform === 'win32') return;
  const handle = await fs.open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

function sameDirectory(a, b) {
  return a.ino === b.ino && a.dev === b.dev && b.isDirectory() && !b.isSymbolicLink();
}

// Only a fresh helper-created directory is eligible for partial-work cleanup.
async function removeOwned(directory, parent, identity) {
  if (path.dirname(directory) !== parent || !sameDirectory(identity, await fs.lstat(directory))) invalid();
  await fs.rm(directory, { recursive: true });
}

/** Explicit GET-only acquisition. Does not run CI, build, deploy, or edit release records. */
export async function collectCiEvidence(options, dependencies = {}) {
  const run = dependencies.command || evidenceCommand;
  const environment = dependencies.environment || process.env;
  const now = dependencies.now || Date.now;
  if (tokenOverrides.some(name => environment[name])) {
    throw new Error('Token environment overrides are not supported; use the approved stored GitHub CLI sign-in.');
  }
  const ciRunId = String(options.ciRunId);
  const securityRunId = String(options.securityRunId);
  if (![ciRunId, securityRunId].every(value => /^[1-9]\d{0,15}$/.test(value)
    && Number.isSafeInteger(Number(value))) || ciRunId === securityRunId) invalid();
  const expectedObservation = parseCiEvidenceJson(await readCiFile(options.expectedSourceFile, 16384), 16384);
  const testApp = await realDirectory(options.testAppRoot);
  const expectedModules = discoverTestModules(testApp);
  const output = await realDirectory(options.outputDirectory);
  const outputOwner = await fs.stat(output);
  if (process.platform !== 'win32'
    && (outputOwner.uid !== process.getuid() || (outputOwner.mode & 0o022))) invalid();
  const relative = path.relative(testApp, output);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) invalid();

  const request = async resource => parseCiEvidenceJson(await run('gh', [
    'api', '--hostname', 'github.com', '-H', 'Accept: application/vnd.github+json',
    '-H', 'X-GitHub-Api-Version: 2022-11-28', `${repositoryApi}/${resource}`,
  ], CI_EVIDENCE_LIMITS.metadataBytes, environment), CI_EVIDENCE_LIMITS.metadataBytes);
  const ciWorkflow = await request('actions/workflows/ci.yml');
  const securityWorkflow = await request('actions/workflows/security.yml');
  const ciRun = await request(`actions/runs/${ciRunId}`);
  const securityRun = await request(`actions/runs/${securityRunId}`);
  if (ciRun.id !== Number(ciRunId) || securityRun.id !== Number(securityRunId)
    || !Number.isSafeInteger(ciRun.run_attempt) || ciRun.run_attempt < 1
    || !Number.isSafeInteger(securityRun.run_attempt) || securityRun.run_attempt < 1) invalid();
  const ciJobs = await request(`actions/runs/${ciRunId}/attempts/${ciRun.run_attempt}/jobs?per_page=100`);
  const securityJobs = await request(`actions/runs/${securityRunId}/attempts/${securityRun.run_attempt}/jobs?per_page=100`);
  const name = `source-observation-${ciRunId}-${ciRun.run_attempt}`;
  const listed = await request(`actions/runs/${ciRunId}/artifacts?name=${name}&per_page=100`);
  if (!Array.isArray(listed.artifacts) || listed.total_count !== listed.artifacts.length || listed.artifacts.length > 20) invalid();
  const matching = listed.artifacts.filter(artifact => artifact.name === name);
  if (matching.length !== 1 || !Number.isSafeInteger(matching[0].id) || matching[0].id < 1) invalid();
  const artifact = matching[0];
  requireUnexpired(artifact, now());
  const archive = await run('gh', ['api', '--hostname', 'github.com',
    `${repositoryApi}/actions/artifacts/${artifact.id}/zip`], CI_EVIDENCE_LIMITS.archiveBytes, environment);

  const temporary = await fs.mkdtemp(path.join(output, '.mofacts-ci-acquire-'));
  const temporaryIdentity = await fs.lstat(temporary);
  let published;
  let publishedIdentity;
  let complete = false;
  try {
    await fs.chmod(temporary, 0o700);
    const archivePath = path.join(temporary, 'artifact.zip');
    await writeNew(archivePath, archive);
    const extracted = path.join(temporary, 'files');
    await fs.mkdir(extracted, { mode: 0o700 });
    const decoded = parseCiEvidenceJson(await run(options.powershell, ['-NoLogo', '-NoProfile',
      '-NonInteractive', '-File', archiveReader, '-ArchivePath', archivePath,
      '-OutputDirectory', extracted], 16384, environment), 16384);
    if (decoded.state !== 'ci-evidence-archive-read' || decoded.files !== 3
      || decoded.archiveDigestSha256 !== hash(archive)) invalid();
    if (!isDeepStrictEqual((await fs.readdir(extracted)).sort(), [...CI_EVIDENCE_FILES].sort())) invalid();
    const files = {};
    for (const file of CI_EVIDENCE_FILES) files[file] = await readCiFile(path.join(extracted, file), CI_EVIDENCE_LIMITS.jsonBytes);
    const input = { expectedObservation, expectedModules, ciWorkflow, ciRun, ciJobs,
      securityWorkflow, securityRun, securityJobs, artifact, files,
      archiveDigestSha256: hash(archive), archiveSizeBytes: archive.length };
    const result = composeCiEvidence(input);
    // Reject rerun, workflow-state, source, expiry or artifact replacement races.
    const finalArtifact = await request(`actions/artifacts/${artifact.id}`);
    requireUnexpired(finalArtifact, now());
    const finalResult = composeCiEvidence({ ...input,
      ciWorkflow: await request('actions/workflows/ci.yml'),
      securityWorkflow: await request('actions/workflows/security.yml'),
      ciRun: await request(`actions/runs/${ciRunId}`), securityRun: await request(`actions/runs/${securityRunId}`),
      artifact: finalArtifact });
    if (!isDeepStrictEqual(result, finalResult)) invalid();
    const recordBytes = Buffer.from(`${JSON.stringify(result)}\n`);
    const digestSha256 = hash(recordBytes);
    published = path.join(output, digestSha256);
    try { await fs.mkdir(published, { mode: 0o700 }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      // Repeated acquisition may reference an identical preserved record, never
      // overwrite it or repair a collision with different/missing bytes.
      await realDirectory(published);
      const preserved = { ...files, 'artifact.zip': archive, 'acquisition.json': recordBytes };
      if (!isDeepStrictEqual((await fs.readdir(published)).sort(), Object.keys(preserved).sort())) invalid();
      for (const [name, bytes] of Object.entries(preserved)) {
        const target = path.join(published, name);
        if ((await fs.stat(target)).mode & 0o222 || !(await readCiFile(target, bytes.length)).equals(bytes)) invalid();
      }
      complete = true;
      return { state: result.state, qualification: result.qualification, directory: published, digestSha256 };
    }
    publishedIdentity = await fs.lstat(published);
    for (const name of CI_EVIDENCE_FILES) await writeNew(path.join(published, name), files[name]);
    await writeNew(path.join(published, 'artifact.zip'), archive);
    await writeNew(path.join(published, '.acquisition.json.tmp'), recordBytes);
    await fs.rename(path.join(published, '.acquisition.json.tmp'), path.join(published, 'acquisition.json'));
    await syncDirectory(published);
    for (const name of [...CI_EVIDENCE_FILES, 'artifact.zip', 'acquisition.json']) await fs.chmod(path.join(published, name), 0o400);
    await fs.chmod(published, 0o500);
    await syncDirectory(output);
    complete = true;
    return { state: result.state, qualification: result.qualification, directory: published, digestSha256 };
  } finally {
    if (publishedIdentity && !complete) {
      // Restore only this failed allocation's modes so partial files can be removed.
      if (!sameDirectory(publishedIdentity, await fs.lstat(published))) invalid();
      await fs.chmod(published, 0o700);
      for (const name of await fs.readdir(published)) {
        const target = path.join(published, name);
        const stat = await fs.lstat(target);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) invalid();
        await fs.chmod(target, 0o600);
      }
      await removeOwned(published, output, publishedIdentity);
    }
    await removeOwned(temporary, output, temporaryIdentity);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packageJson = JSON.parse(await fs.readFile(new URL('../../../package.json', import.meta.url), 'utf8'));
  if (process.versions.node !== packageJson.engines.node) {
    process.stderr.write('CI evidence acquisition requires the repository-pinned Node version.\n');
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const names = ['--ci-run', '--security-run', '--expected-source', '--test-app', '--output', '--powershell'];
  const options = {};
  let valid = args.length === names.length * 2;
  for (let index = 0; index < args.length; index += 2) {
    if (!names.includes(args[index]) || Object.hasOwn(options, args[index]) || !args[index + 1]) valid = false;
    options[args[index]] = args[index + 1];
  }
  const action = valid ? collectCiEvidence({ ciRunId: options['--ci-run'], securityRunId: options['--security-run'],
    expectedSourceFile: options['--expected-source'], testAppRoot: options['--test-app'],
    outputDirectory: options['--output'], powershell: options['--powershell'] }) : Promise.reject();
  action.then(result => process.stdout.write(`${JSON.stringify(result)}\n`), () => {
    process.stderr.write(tokenOverrides.some(name => process.env[name])
      ? 'CI evidence refuses token environment overrides; use the approved stored GitHub CLI sign-in.\n'
      : 'CI evidence acquisition failed; no qualification was issued.\n');
    process.exitCode = 1;
  });
}
