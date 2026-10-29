const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');

function validateMeteorTestModules(packageJson, appRoot, fileExists = existsSync) {
  for (const side of ['client', 'server']) {
    const entry = packageJson.meteor?.testModule?.[side];
    if (typeof entry !== 'string' || !entry.trim()) {
      throw new Error(`meteor.testModule.${side} must identify an explicit entrypoint`);
    }
    if (!fileExists(path.resolve(appRoot, entry))) {
      throw new Error(`meteor.testModule.${side} does not identify an existing file`);
    }
  }
}

// Qualify the supported upstream runtime rather than a copied package snapshot.
// Local packages shadow Atmosphere resolutions even when the versions file looks
// correct, so check both manifests and the package discovery boundary.
function validateMeteorRuntimeContract(appRoot, readText = file => readFileSync(file, 'utf8'), fileExists = existsSync) {
  if (readText(path.join(appRoot, '.meteor/release')).trim() !== 'METEOR@3.5.4') {
    throw new Error('Meteor qualification requires the supported METEOR@3.5.4 release');
  }
  const lines = filename => new Set(readText(path.join(appRoot, filename)).split(/\r?\n/)
    .map(line => line.replace(/#.*/, '').trim()).filter(Boolean));
  const direct = lines('.meteor/packages');
  const resolved = lines('.meteor/versions');
  for (const [name, version] of [['ddp-server', '3.5.0'], ['rspack', '1.3.1']]) {
    if (!direct.has(`${name}@${version}`) || !resolved.has(`${name}@${version}`)) {
      throw new Error(`Meteor qualification requires official ${name}@${version} in both package manifests`);
    }
    if (fileExists(path.join(appRoot, 'packages', name, 'package.js'))) {
      throw new Error(`Local ${name} package shadows the supported official package`);
    }
  }
}

function clientPassingCount(reporterOutput) {
  const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');
  const normalizedOutput = reporterOutput.replace(ansiPattern, '');
  const clientSectionStart = normalizedOutput.lastIndexOf('----- RUNNING CLIENT TESTS -----');
  if (clientSectionStart === -1) return null;
  const match = normalizedOutput.slice(clientSectionStart).match(/\b(\d+) passing\b/);
  return match ? Number(match[1]) : null;
}

module.exports = {
  clientPassingCount,
  validateMeteorTestModules,
  validateMeteorRuntimeContract,
};
