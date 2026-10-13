const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const packageDirectory = 'packages/rspack/.npm/devPackage';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const packageName = /^(?:@[a-z0-9._-]+\/)?[a-zA-Z0-9._-]+$/;

/** Meteor 3.5's flat v4 shrinkwrap is the source of every installed version. */
function npmInstallInputs(shrinkwrap) {
  if (!object(shrinkwrap) || shrinkwrap.lockfileVersion !== 4 || !object(shrinkwrap.dependencies)
    || Object.keys(shrinkwrap).some(key => !['lockfileVersion', 'dependencies'].includes(key))) {
    throw new Error('Expected the pinned Meteor 3.5 flat package shrinkwrap');
  }
  const dependencies = {};
  const packages = {};
  for (const [name, entry] of Object.entries(shrinkwrap.dependencies)) {
    if (!packageName.test(name) || ['__proto__', 'constructor', 'prototype'].includes(name)
      || !object(entry) || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(entry.version ?? '')
      || typeof entry.resolved !== 'string' || !entry.resolved.startsWith('https://registry.npmjs.org/')
      || !/^sha512-[A-Za-z0-9+/]+=*$/.test(entry.integrity ?? '')
      || Object.keys(entry).some(key => !['version', 'resolved', 'integrity'].includes(key))) {
      throw new Error(`Unsupported locked Rspack dependency: ${name}`);
    }
    // All entries in Meteor's flat lock are installed at their captured locations.
    // Their exact versions and integrity values populate npm's native v3 format.
    dependencies[name] = entry.version;
    packages[`node_modules/${name}`] = { ...entry };
  }
  if (!Object.keys(dependencies).length) throw new Error('Rspack package shrinkwrap is empty');
  const manifest = { name: 'mofacts-rspack-locked-install', version: '1.0.0', private: true, dependencies };
  return { manifest, lock: { name: manifest.name, version: manifest.version, lockfileVersion: 3,
    requires: true, packages: { '': manifest, ...packages } } };
}

function runMeteorNpm(args, cwd) {
  const result = spawnSync('meteor', ['npm', ...args], { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Pinned Meteor npm exited with status ${result.status}`);
}

async function installRspackPackageDependencies(appRoot, run = runMeteorNpm) {
  const engines = JSON.parse(await fs.readFile(path.join(appRoot, 'package.json'), 'utf8')).engines;
  if (process.version !== `v${engines?.node}`) throw new Error('Use the pinned application Node version for the locked package install');
  const canonicalRoot = await fs.realpath(appRoot);
  const directory = await fs.realpath(path.join(canonicalRoot, packageDirectory));
  if (directory !== path.join(canonicalRoot, packageDirectory)) throw new Error('Rspack install directory must remain inside the application source tree');
  const shrinkwrapPath = path.join(directory, 'npm-shrinkwrap.json');
  const original = await fs.readFile(shrinkwrapPath);
  const { manifest, lock } = npmInstallInputs(JSON.parse(original));
  // npm gives npm-shrinkwrap.json priority over package-lock.json. Install in a
  // fresh owned directory so Meteor's internal lock never enters npm's parser.
  const temporary = await fs.mkdtemp(path.join(directory, 'locked-install-'));
  try {
    await fs.writeFile(path.join(temporary, 'package.json'), JSON.stringify(manifest));
    await fs.writeFile(path.join(temporary, 'package-lock.json'), JSON.stringify(lock));
    await run(['ci', '--no-audit', '--no-fund'], temporary);
    if (!(await fs.readFile(shrinkwrapPath)).equals(original)) throw new Error('Locked installation changed the source shrinkwrap');
    const installedPath = path.join(temporary, 'node_modules');
    const installed = JSON.parse(await fs.readFile(path.join(installedPath, '.package-lock.json'), 'utf8'));
    for (const [name, expected] of Object.entries(lock.packages)) {
      if (name === '') continue;
      const actual = installed.packages?.[name];
      if (!actual || ['version', 'resolved', 'integrity'].some(key => actual[key] !== expected[key])) {
        throw new Error(`Installed Rspack dependency differs from its pin: ${name}`);
      }
    }
    if (Object.keys(installed.packages).some(name => name !== '' && !Object.hasOwn(lock.packages, name))) {
      throw new Error('Locked Rspack installation added an uncaptured dependency');
    }
    // These are the same installed-tree markers written by Meteor 3.5 itself.
    await fs.writeFile(path.join(installedPath, '.npm-shrinkwrap.json'), original);
    await fs.writeFile(path.join(installedPath, '.node_version'), process.version.replace(/\.\d+$/, '.*') + '\n');
    // Replace only this package's generated installation after complete validation.
    const destination = path.join(directory, 'node_modules');
    await fs.rm(destination, { recursive: true, force: true });
    await fs.rename(installedPath, destination);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

module.exports = { npmInstallInputs, installRspackPackageDependencies };
if (require.main === module) {
  installRspackPackageDependencies(path.resolve(process.argv[2] || path.join(__dirname, '..')))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
