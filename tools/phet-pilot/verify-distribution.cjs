// Qualify the generated ordinary upload artifacts using the application's parser.
require('../../mofacts/scripts/registerHistoryTypescript.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const appRequire = createRequire(path.join(root, 'mofacts/package.json'));
global.Npm = { require: appRequire };
const JSZip = appRequire('jszip');
const { parsePackageZip, disposeParsedPackage } = require('../../mofacts/server/lib/packageParser.ts');
const { validatePackagedSimulations } = require('../../mofacts/server/lib/packageSimulations.ts');
const { simulationNodes } = require('../../packages/phet-monitor/assets.ts');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
(async () => {
  const directory = process.argv[2];
  if (!directory || !path.isAbsolute(directory)) throw new Error('Specify the absolute canonical package directory');
  const results = [];
  for (const simulation of ['density', 'pendulum-lab', 'circuit-construction-kit-dc']) {
    const filename = `SPARC PhET ${simulation}.zip`;
    const files = await parsePackageZip(path.join(directory, filename), filename, () => {});
    try {
    await validatePackagedSimulations(files);
    const config = simulationNodes(files.find(file => file.type === 'stim').contents)[0].simulation;
    const sourceReference = config.asset.attachments.find(reference => reference.url.endsWith('-source.zip'));
    const source = await JSZip.loadAsync(await fs.readFile(files.find(file => file.name === sourceReference.url).source.path));
    assert.ok((await source.file('MoFaCTS/LICENSE').async('string')).includes('GNU AFFERO GENERAL PUBLIC LICENSE'));
    const build = JSON.parse(await source.file('build-result.json').async('string'));
    assert.equal(build.identity, config.buildId);
    assert.equal(build.artifactHash, config.asset.sha256);
    for (const change of build.changes) {
      const content = (await source.file(`source/${change.path}`).async('string')).replace(/\r\n/g, '\n');
      assert.equal(hash(content), change.modified, `Corresponding source mismatch: ${change.path}`);
    }
    for (const [name, expected] of [['research-collector.js', build.collectorHash], ['research-bridge.js', build.bridgeHash], ['research-bootstrap.js', build.bootstrapHash]]) {
      assert.equal(hash(await source.file(`source/chipper/js/${name}`).async('nodebuffer')), expected);
    }
    results.push({ filename, buildId: config.buildId, bytes: (await fs.stat(path.join(directory, filename))).size,
      assetHashesVerified: true, correspondingSourceVerified: true, noticesAndLicensesIncluded: true, collectorHash: build.collectorHash, bridgeHash: build.bridgeHash, registrationContractHash: build.registrationContractHash });
    console.log(`${simulation}: ordinary ZIP, hashes, corresponding source and licenses verified`);
    } finally { await disposeParsedPackage(files); }
  }
  for (const key of ['collectorHash', 'bridgeHash', 'registrationContractHash']) assert.equal(new Set(results.map(result => result[key])).size, 1);
  const combined = await parsePackageZip(path.join(directory, 'SPARC PhET Pilot.zip'), 'SPARC PhET Pilot.zip', () => {});
  try {
  await validatePackagedSimulations(combined);
  assert.equal(combined.filter(file => file.type === 'tdf').length, 3);
  } finally { await disposeParsedPackage(combined); }
  await fs.writeFile(path.join(root, 'tmp/phet-pilot/distribution-acceptance.json'), JSON.stringify({ results, combinedPackageVerified: true }, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
