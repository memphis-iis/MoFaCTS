const fs = require('node:fs');
const path = require('node:path');

const EXPECTED_METEOR_NODE_STUBS_VERSION = '1.2.29';
const EXPECTED_QS_VERSION = '6.16.0';

function readPackage(packageDirectory) {
  const packagePath = path.join(packageDirectory, 'package.json');
  return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
}

function hardenMeteorNodeStubs(packageRoot = path.resolve(__dirname, '..')) {
  const sourceDirectory = path.join(packageRoot, 'node_modules', 'qs');
  const meteorNodeStubsDirectory = path.join(packageRoot, 'node_modules', 'meteor-node-stubs');
  const targetDirectory = path.join(
    meteorNodeStubsDirectory,
    'node_modules',
    'qs',
  );
  const sourcePackage = readPackage(sourceDirectory);
  const meteorNodeStubsPackage = readPackage(meteorNodeStubsDirectory);
  const targetPackage = readPackage(targetDirectory);

  if (meteorNodeStubsPackage.name !== 'meteor-node-stubs'
    || meteorNodeStubsPackage.version !== EXPECTED_METEOR_NODE_STUBS_VERSION) {
    throw new Error(
      `Expected meteor-node-stubs at version ${EXPECTED_METEOR_NODE_STUBS_VERSION}`,
    );
  }
  if (sourcePackage.name !== 'qs' || sourcePackage.version !== EXPECTED_QS_VERSION) {
    throw new Error(`Expected the reviewed qs dependency at version ${EXPECTED_QS_VERSION}`);
  }
  if (targetPackage.name !== 'qs') {
    throw new Error('Meteor node stubs did not contain the expected bundled qs dependency');
  }
  if (targetPackage.version === EXPECTED_QS_VERSION) return false;

  fs.rmSync(targetDirectory, { recursive: true, force: true });
  fs.cpSync(sourceDirectory, targetDirectory, { recursive: true, errorOnExist: true });

  const installedPackage = readPackage(targetDirectory);
  if (installedPackage.name !== 'qs' || installedPackage.version !== EXPECTED_QS_VERSION) {
    throw new Error('Failed to harden the bundled Meteor qs dependency');
  }
  return true;
}

if (require.main === module) {
  hardenMeteorNodeStubs();
}

module.exports = {
  EXPECTED_METEOR_NODE_STUBS_VERSION,
  EXPECTED_QS_VERSION,
  hardenMeteorNodeStubs,
};
