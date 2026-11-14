require('./registerHistoryTypescript.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdtemp, writeFile, access, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const { parsePackageZip, disposeParsedPackage } = require('../server/lib/packageParser.ts');
const { validatePackagedSimulations, resolvePackagedSimulations } = require('../server/lib/packageSimulations.ts');
const { requirePackagedSimulation } = require('../common/simulationPackage.ts');
global.Npm = { require };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mofacts-package-fixture-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const html = Buffer.from('<!doctype html><title>Shared monitored simulation</title>');
  const catalog = Buffer.from(JSON.stringify({ version: 1, buildId: 'test-build', artifactSha256: hash(html), protocolVersion: 3,
    addresses: [{ path: 'model.mass', coverage: 'observed' }] }));
  const simulation = { buildId: 'test-build', asset: { url: 'sim.html?accessibility', sha256: hash(html), catalog: { url: 'sim.catalog.json', sha256: hash(catalog) } },
    bindings: [{ name: 'mass', address: { path: 'model.mass' }, projection: 'value' }] };
  const stimulus = { setspec: { clusters: [], sparcPages: [{ pageId: 'page', display: { nodes: [{ id: 'simulation', atomType: 'simulation', simulation }] } }] } };
  const entry = (name, contents, type) => ({ name, contents, type, path: name, extension: name.split('.').at(-1), packageFile: 'lesson.zip' });
  const files = [entry('lesson_stims.json', stimulus, 'stim'), entry('sim.html', html, 'media'), entry('sim.catalog.json', catalog, 'media')];
  for (const file of files.filter(file => file.type === 'media')) {
    const staged = path.join(directory, file.name); await writeFile(staged, file.contents);
    file.source = { path: staged, size: file.contents.length, sha256: hash(file.contents) };
  }
  return { simulation, stimulus, files };
}
test('ordinary ZIP parsing retains nested HTML and JSON catalogs as package assets', async t => {
  const f = await fixture(t), zip = new JSZip(), directory = await mkdtemp(path.join(os.tmpdir(), 'mofacts-simulation-package-'));
  try {
    zip.file('lesson_TDF.json', JSON.stringify({ tutor: { setspec: { stimulusfile: 'lesson_stims.json' } } }));
    zip.file('lesson_stims.json', JSON.stringify(f.stimulus));
    for (const file of f.files.filter(file => file.type === 'media')) zip.file('stimulus-assets/' + file.name, file.contents);
    const filename = path.join(directory, 'lesson.zip');
    await writeFile(filename, await zip.generateAsync({ type: 'nodebuffer' }));
    const parsed = await parsePackageZip(filename, 'lesson.zip', () => {});
    assert.deepEqual(parsed.map(file => file.type), ['tdf', 'stim', 'media', 'media']);
    await validatePackagedSimulations(parsed);
    assert.ok(parsed.filter(file => file.type === 'media').every(file => file.contents === undefined));
    const stagedPath = parsed.find(file => file.type === 'media').source.path;
    await disposeParsedPackage(parsed);
    await assert.rejects(access(stagedPath));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('uploaded simulation resolves only this package assets and retains portable launch parameters', async t => {
  const f = await fixture(t);
  await validatePackagedSimulations(f.files);
  resolvePackagedSimulations(f.stimulus, new Map([['sim.html', '/cdn/storage/Assets/html123/original/sim.html'], ['sim.catalog.json', '/cdn/storage/Assets/catalog123/original/sim.catalog.json']]));
  assert.equal(f.simulation.asset.url, '/dynamic-assets/html123/sim.html?accessibility');
  assert.equal(f.simulation.asset.catalog.url, '/dynamic-assets/catalog123/sim.catalog.json');
  const lesson = { rawStimuliFile: f.stimulus }, scope = { pageKey: 'page', nodeId: 'simulation', buildId: 'test-build' };
  assert.equal(requirePackagedSimulation(lesson, scope).buildId, 'test-build');
  for (const change of [{ pageKey: 'other' }, { nodeId: 'other' }, { buildId: 'other' }]) assert.throws(() => requirePackagedSimulation(lesson, { ...scope, ...change }));
});
test('missing, duplicate, tampered, foreign and unsupported simulation assets fail before persistence', async t => {
  const f = await fixture(t);
  await assert.rejects(() => validatePackagedSimulations(f.files.slice(0, 2)), /Missing/);
  await assert.rejects(() => validatePackagedSimulations([...f.files, f.files[2]]), /ambiguous/);
  await assert.rejects(() => validatePackagedSimulations([...f.files, { ...f.files[2], name: 'SIM.CATALOG.JSON' }]), /ambiguous/);
  const changed = await fixture(t); changed.files[1].source.sha256 = hash(Buffer.from('changed'));
  await assert.rejects(() => validatePackagedSimulations(changed.files), /hash mismatch/);
  for (const url of ['https://foreign.example/sim.html', '../sim.html', '/dynamic-assets/existing', 'sim.html#fragment']) {
    const foreign = await fixture(t); foreign.simulation.asset.url = url;
    await assert.rejects(() => validatePackagedSimulations(foreign.files));
  }
  const unsupported = await fixture(t); unsupported.simulation.bindings[0].address.path = 'model.silent';
  await assert.rejects(() => validatePackagedSimulations(unsupported.files), /Binding absent/);
  assert.throws(() => resolvePackagedSimulations(f.stimulus, new Map()), /not stored/);
});
