const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { npmInstallInputs, installRspackPackageDependencies } = require('./installRspackPackageDependencies.cjs');

const locked = { lockfileVersion: 4, dependencies: {
  '@types/node': { version: '26.1.2', resolved: 'https://registry.npmjs.org/@types/node/-/node-26.1.2.tgz', integrity: 'sha512-AAAA==' },
  'follow-redirects': { version: '1.16.0', resolved: 'https://registry.npmjs.org/follow-redirects/-/follow-redirects-1.16.0.tgz', integrity: 'sha512-BBBB==' },
} };

test('converts captured flat pins into an npm-native locked installation without resolving newer ranges', () => {
  const { manifest, lock } = npmInstallInputs(locked);
  assert.equal(manifest.dependencies['@types/node'], '26.1.2');
  assert.equal(manifest.dependencies['follow-redirects'], '1.16.0');
  assert.deepEqual(lock.packages['node_modules/follow-redirects'], locked.dependencies['follow-redirects']);
  assert.equal(lock.lockfileVersion, 3);
});

test('fails closed on unsupported locks, unpinned versions, nested graphs and non-registry sources', () => {
  for (const value of [ {}, { ...locked, lockfileVersion: 3 }, { ...locked, dependencies: {} },
    { ...locked, dependencies: { '../escape': locked.dependencies['follow-redirects'] } },
    { ...locked, dependencies: { a: { ...locked.dependencies['follow-redirects'], version: '^1.16.0' } } },
    { ...locked, dependencies: { a: { ...locked.dependencies['follow-redirects'], resolved: 'https://other.example/a.tgz' } } },
    { ...locked, dependencies: { a: { ...locked.dependencies['follow-redirects'], dependencies: {} } } },
  ]) assert.throws(() => npmInstallInputs(value));
});

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-locked-rspack-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'packages/rspack/.npm/devPackage');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ engines: { node: process.version.slice(1) } }));
  const original = Buffer.from(JSON.stringify(locked, null, 2) + '\n');
  await fs.writeFile(path.join(directory, 'npm-shrinkwrap.json'), original);
  return { root, directory, original };
}

async function simulatedInstall(args, directory, mutate) {
  assert.deepEqual(args, ['ci', '--no-audit', '--no-fund']);
  // The Meteor lock must stay outside npm's working directory.
  await assert.rejects(fs.access(path.join(directory, 'npm-shrinkwrap.json')));
  const lock = JSON.parse(await fs.readFile(path.join(directory, 'package-lock.json'), 'utf8'));
  delete lock.packages[''];
  mutate?.(lock);
  await fs.mkdir(path.join(directory, 'node_modules'));
  await fs.writeFile(path.join(directory, 'node_modules/.package-lock.json'), JSON.stringify(lock));
}

test('preserves source bytes, validates installed pins and creates Meteor-compatible installed-tree markers', async t => {
  const { root, directory, original } = await fixture(t);
  await installRspackPackageDependencies(root, simulatedInstall);
  assert.deepEqual(await fs.readFile(path.join(directory, 'npm-shrinkwrap.json')), original);
  assert.deepEqual(await fs.readFile(path.join(directory, 'node_modules/.npm-shrinkwrap.json')), original);
  assert.equal(await fs.readFile(path.join(directory, 'node_modules/.node_version'), 'utf8'), process.version.replace(/\.\d+$/, '.*') + '\n');
  assert.deepEqual((await fs.readdir(directory)).sort(), ['node_modules', 'npm-shrinkwrap.json']);
});

test('does not replace an existing installation on wrong versions or an uncaptured dependency', async t => {
  for (const mutate of [
    lock => { lock.packages['node_modules/follow-redirects'].version = '1.16.1'; },
    lock => { lock.packages['node_modules/unexpected'] = { version: '1.0.0' }; },
  ]) {
    const { root, directory, original } = await fixture(t);
    await fs.mkdir(path.join(directory, 'node_modules'));
    await fs.writeFile(path.join(directory, 'node_modules/keep'), 'original');
    await assert.rejects(installRspackPackageDependencies(root, (args, temporary) => simulatedInstall(args, temporary, mutate)));
    assert.equal(await fs.readFile(path.join(directory, 'node_modules/keep'), 'utf8'), 'original');
    assert.deepEqual(await fs.readFile(path.join(directory, 'npm-shrinkwrap.json')), original);
    assert.deepEqual((await fs.readdir(directory)).sort(), ['node_modules', 'npm-shrinkwrap.json']);
  }
});

test('retains the source lock and removes only its temporary files when installation fails', async t => {
  const { root, directory, original } = await fixture(t);
  await assert.rejects(installRspackPackageDependencies(root, () => { throw new Error('registry unavailable'); }), /registry unavailable/);
  assert.deepEqual(await fs.readFile(path.join(directory, 'npm-shrinkwrap.json')), original);
  assert.deepEqual(await fs.readdir(directory), ['npm-shrinkwrap.json']);
});

test('CI and Docker install locked dependencies before compiling and retain post-compilation source checks', async () => {
  const root = path.resolve(__dirname, '../..');
  const workflow = await fs.readFile(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  const dockerfile = await fs.readFile(path.join(root, 'Dockerfile'), 'utf8');
  for (const source of [workflow, dockerfile]) {
    assert.ok(source.indexOf('npm ci') < source.indexOf('installRspackPackageDependencies.cjs'));
    assert.ok(source.indexOf('installRspackPackageDependencies.cjs') < source.indexOf('meteor update --npm'));
    assert.ok(source.includes('packages/rspack/.npm/devPackage/npm-shrinkwrap.json'));
  }
  assert.match(workflow, /verify-tests/);
  assert.match(dockerfile, /sha256sum --check \/tmp\/mofacts-toolchain.sha256 \|\| exit 1/);
});
