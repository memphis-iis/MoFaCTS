import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const approved = new Set(['density', 'circuit-construction-kit-dc']);
const normalize = text => text.replace(/\r\n/g, '\n');

// User-approved baseline configuration change, 2026-11-09. Only this exact
// source transformation is permitted; all other tracked changes fail closed.
export async function verifyBaselineSource(directory, simulation, name, sha, applyBranding = false) {
  const git = async args => (await exec('git', args, { cwd: directory, windowsHide: true })).stdout.trim();
  if (await git(['rev-parse', 'HEAD']) !== sha) throw new Error(`Wrong source revision: ${directory}`);
  const needsBranding = name === simulation && approved.has(simulation);
  const status = await git(['diff', 'HEAD', '--name-only']);
  if (status && (!needsBranding || status !== 'package.json')) throw new Error(`Unexpected source changes: ${directory}`);
  if (!needsBranding) return null;
  const original = normalize((await exec('git', ['show', 'HEAD:package.json'], { cwd: directory, windowsHide: true })).stdout);
  const before = '"supportedBrands": [\n      "phet",\n      "phet-io"\n    ]';
  const after = '"supportedBrands": [\n      "phet",\n      "phet-io",\n      "adapted-from-phet"\n    ]';
  if (original.split(before).length !== 2) throw new Error(`Unexpected upstream branding metadata: ${directory}`);
  const expected = original.replace(before, after);
  const filename = path.join(directory, 'package.json');
  const actual = normalize(await readFile(filename, 'utf8'));
  if (actual !== expected) {
    if (!applyBranding || actual !== original) throw new Error(`Unapproved baseline metadata: ${directory}`);
    await writeFile(filename, expected);
  }
  return { file: 'package.json', reason: 'Enable documented adapted-from-phet build; explicitly user-approved',
    diff: await git(['diff', 'HEAD', '--', 'package.json']) };
}
