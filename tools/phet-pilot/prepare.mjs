import { readFile, mkdir, access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { verifyBaselineSource } from './baseline-source.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(await readFile(new URL('./releases.json', import.meta.url), 'utf8'));
const workspaceRoot = path.join(repositoryRoot, 'tmp/phet-pilot');
// These release-manifest entries belong to the separately built PhET-iO product.
// The upstream adapted-from-phet build does not include them.
const excluded = new Set(['phet-io', 'phet-io-sim-specific', 'phet-io-wrappers', 'studio']);

function git(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(`git ${args.join(' ')}: ${output}`)));
  });
}

const jobs = [];
const results = [];
for (const pilot of manifest.pilots) {
  for (const [name, entry] of Object.entries({ ...pilot.dependencies, ...pilot.supplementalDependencies })) {
    if (name === 'comment' || excluded.has(name)) continue;
    if (!/^[a-z]+(?:-[a-z]+)*$/.test(name) || !/^[a-f0-9]{40}$/.test(entry.sha)) throw new Error('Invalid dependency pin');
    jobs.push({ simulation: pilot.simulation, name, sha: entry.sha });
  }
}
await mkdir(workspaceRoot, { recursive: true });
// Old PhET dependencies without their own package.json must not inherit
// MoFaCTS's root "type": "module". This is workspace configuration, not an
// alteration of a pinned upstream checkout.
await writeFile(path.join(workspaceRoot, 'package.json'), '{"private":true,"type":"commonjs"}\n');
async function acquire(job) {
  const directory = path.join(workspaceRoot, job.simulation, 'baseline', job.name);
  let exists = true;
  try { await access(directory); } catch (error) { if (error.code !== 'ENOENT') throw error; exists = false; }
  if (exists) {
    const head = await git(['rev-parse', 'HEAD'], directory);
    if (head !== job.sha) throw new Error(`Existing checkout has wrong revision: ${directory}`);
  } else {
    await mkdir(directory, { recursive: true });
    await git(['init', '--quiet'], directory);
    const upstream = job.name === 'perennial-alias' ? 'perennial' : job.name;
    await git(['remote', 'add', 'origin', `https://github.com/phetsims/${upstream}.git`], directory);
    await git(['fetch', '--quiet', '--depth=1', 'origin', job.sha], directory);
    await git(['checkout', '--quiet', '--detach', 'FETCH_HEAD'], directory);
  }
  const brandingChange = await verifyBaselineSource(directory, job.simulation, job.name, job.sha, true);
  return { ...job, directory, status: 'source-retrieved', brandingChange };
}
async function worker() {
  for (;;) {
    const job = jobs.shift();
    if (!job) return;
    try {
      results.push(await acquire(job));
      console.log(`${job.simulation}: ${job.name} ${job.sha.slice(0, 12)}`);
    } catch (error) {
      results.push({ ...job, status: 'failed', error: error.message });
      console.error(`${job.simulation}: ${job.name} FAILED: ${error.message}`);
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
await writeFile(path.join(workspaceRoot, 'acquisition.json'), `${JSON.stringify({
  schemaVersion: 1, excludedPhETIORepositories: [...excluded], results,
}, null, 2)}\n`);
if (results.some(result => result.status === 'failed')) process.exitCode = 1;
