import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(await readFile(new URL('./releases.json', import.meta.url), 'utf8'));
const results = [];
for (const pilot of manifest.pilots) {
  const url = `https://github.com/phetsims/${pilot.simulation}.git`;
  const { stdout } = await exec('git', ['ls-remote', '--heads', '--tags', url], { windowsHide: true });
  const refs = stdout.trim().split(/\r?\n/).map(line => { const [sha, ref] = line.split(/\s+/); return { sha, ref }; });
  const releases = refs.filter(r => /^refs\/heads\/\d+\.\d+$/.test(r.ref)).sort((a,b) => a.ref.localeCompare(b.ref, 'en', { numeric:true }));
  const newest = releases.at(-1);
  if (newest?.sha !== pilot.manifestCommit) throw new Error(`Public release branch changed for ${pilot.simulation}; review selection before building`);
  results.push({ simulation:pilot.simulation, selectedVersion:pilot.version, manifestCommit:pilot.manifestCommit, newestPublicNumericReleaseBranch:newest, refs });
}
await writeFile(path.join(root, 'tmp/phet-pilot/release-selection.json'), JSON.stringify({ checkedAt:new Date().toISOString(),
  scope:'Latest publicly retained numeric release branch tips; private releases and unlabelled development commits are not claimed.', results }, null, 2)+'\n');
console.log('All three pins match the newest publicly retained numeric release branch tips.');
