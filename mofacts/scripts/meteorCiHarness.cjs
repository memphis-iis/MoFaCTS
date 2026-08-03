const { existsSync } = require('node:fs');
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
};
