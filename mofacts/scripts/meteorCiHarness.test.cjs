const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  clientPassingCount,
  validateMeteorTestModules,
  validateMeteorRuntimeContract,
} = require('./meteorCiHarness.cjs');
const {
  CLIENT_LIBRARY_NAME,
  rspackClientOutputContract,
} = require('./rspackClientOutputContract.cjs');
const {
  findMeteorTestVersionArtifacts,
  removeMeteorTestVersionArtifacts,
} = require('./meteorTestVersionArtifacts.cjs');

const completePackage = {
  meteor: {
    testModule: {
      client: 'client-test-entry.js',
      server: 'server-test-entry.js',
    },
  },
};

test('accepts explicit existing client and server test modules', () => {
  assert.doesNotThrow(() => validateMeteorTestModules(completePackage, '/app', () => true));
});

test('rejects a missing configured test module', () => {
  assert.throws(
    () => validateMeteorTestModules(completePackage, '/app', (file) => !file.endsWith('client-test-entry.js')),
    /meteor\.testModule\.client does not identify an existing file/,
  );
});

test('rejects an absent client reporter section', () => {
  assert.equal(clientPassingCount('564 passing\nAll tests finished!'), null);
});

test('recognizes an ANSI-formatted zero-test client result', () => {
  const output = '----- RUNNING CLIENT TESTS -----\n\u001b[92m \u001b[0m\u001b[32m 0 passing\u001b[0m';
  assert.equal(clientPassingCount(output), 0);
});

test('returns a nonzero client passing count', () => {
  const output = '----- RUNNING CLIENT TESTS -----\n127 passing\nAll tests finished!';
  assert.equal(clientPassingCount(output), 127);
});

test('removes only Meteor test-driver resolutions from the application version manifest', () => {
  const versions = [
    'meteor@2.3.1',
    'meteortesting:browser-tests@1.8.0_1',
    'meteortesting:mocha@3.4.0',
    'meteortesting:mocha-core@8.2.0',
    'minimongo@2.2.0',
    '',
  ].join('\n');

  assert.deepEqual(findMeteorTestVersionArtifacts(versions), [
    'meteortesting:browser-tests@1.8.0_1',
    'meteortesting:mocha@3.4.0',
    'meteortesting:mocha-core@8.2.0',
  ]);
  assert.equal(
    removeMeteorTestVersionArtifacts(versions),
    ['meteor@2.3.1', 'minimongo@2.2.0', ''].join('\n'),
  );
});

test('preserves unrelated Meteor version changes while cleaning test artifacts', () => {
  const versions = [
    'custom:test-support@1.0.0\r\n',
    'meteortesting:mocha@3.4.0\r\n',
    'new-runtime-package@2.0.0\r\n',
  ].join('');

  assert.equal(
    removeMeteorTestVersionArtifacts(versions),
    'custom:test-support@1.0.0\r\nnew-runtime-package@2.0.0\r\n',
  );
});

test('qualifies the official security release without local package shadowing', () => {
  validateMeteorRuntimeContract(path.resolve(__dirname, '..'));
});

function runtimeFixture(changes = {}, localPackage = null) {
  const inputs = {
    release: 'METEOR@3.5.4\n',
    packages: 'ddp-server@3.5.0\nrspack@1.3.1\n',
    versions: 'ddp-server@3.5.0\nrspack@1.3.1\n',
    ...changes,
  };
  return () => validateMeteorRuntimeContract('/app', file => inputs[path.basename(file)],
    file => localPackage !== null && file === path.join('/app', 'packages', localPackage, 'package.js'));
}

test('accepts official packages and rejects an older release or resolution', () => {
  assert.doesNotThrow(runtimeFixture());
  assert.throws(runtimeFixture({ release: 'METEOR@3.5\n' }), /supported METEOR@3\.5\.4/);
  for (const name of ['packages', 'versions']) {
    assert.throws(runtimeFixture({ [name]: 'ddp-server@3.3.0\nrspack@1.3.1\n' }), /official ddp-server@3\.5\.0/);
    assert.throws(runtimeFixture({ [name]: 'ddp-server@3.5.0\nrspack@1.1.1\n' }), /official rspack@1\.3\.1/);
  }
});

test('rejects local package overrides even when official manifests are pinned', () => {
  for (const name of ['ddp-server', 'rspack']) {
    assert.throws(runtimeFixture({}, name), /shadows the supported official package/);
  }
});

test('pins the source-owned cross-platform Playwright worker', () => {
  const appRoot = path.resolve(__dirname, '..');
  const packageRoot = path.join(appRoot, 'packages/browser-tests');
  const packageManifest = fs.readFileSync(path.join(packageRoot, 'package.js'), 'utf8');
  const server = fs.readFileSync(path.join(packageRoot, 'server.js'), 'utf8');
  const worker = fs.readFileSync(
    path.join(packageRoot, 'browser/playwright_worker.mjs'),
    'utf8',
  );
  const runner = fs.readFileSync(path.join(appRoot, 'scripts/runMeteorCiTest.cjs'), 'utf8');
  const provenance = fs.readFileSync(path.join(packageRoot, 'MOFACTS-OVERRIDE.md'), 'utf8');

  assert.match(packageManifest, /name: 'meteortesting:browser-tests'/);
  assert.match(packageManifest, /version: '1\.8\.0_1'/);
  assert.match(server, /driver !== 'playwright'/);
  assert.match(worker, /pathToFileURL/);
  assert.match(worker, /node_modules', 'playwright', 'index\.mjs'/);
  assert.doesNotMatch(worker, /`\$\{process\.cwd\(\)\}\/node_modules/);
  assert.doesNotMatch(runner, /Refusing to run the Meteor Playwright client suite on Windows/);
  assert.match(runner, /meteorTestEnv\.EXPECTED_MONGO_DB_NAME = 'meteor'/);
  assert.match(runner, /meteorTestEnv\.METEOR_REACTIVITY_ORDER = 'changeStreams'/);
  assert.match(runner, /meteorTestEnv\.DDP_TRANSPORT = 'sockjs'/);
  assert.match(runner, /meteorTestEnv\.MOFACTS_SELF_HOSTED = 'false'/);
  assert.match(runner, /meteorTestEnv\.MOFACTS_REQUIRE_REDIS = 'false'/);
  assert.match(runner, /meteorTestEnv\.TEST_BROWSER_DRIVER = 'playwright'/);
  assert.match(runner, /meteorTestEnv\.PLAYWRIGHT_BROWSER = 'chromium'/);
  assert.match(provenance, /b88bfb72822ce3d67aa2726c7c14f27a8f37fcb4/);
});

test('emits injected client bundles with a browser-owned library target', () => {
  const expectedOutput = {
    externalsType: 'commonjs2',
    output: {
      library: CLIENT_LIBRARY_NAME,
      libraryTarget: 'window',
    },
  };

  assert.deepEqual(
    rspackClientOutputContract({ isClient: true, isTest: true }),
    expectedOutput,
  );
  assert.deepEqual(
    rspackClientOutputContract({ isClient: true, isProduction: true }),
    expectedOutput,
  );
  assert.deepEqual(
    rspackClientOutputContract({ isClient: true, isDevelopment: true }),
    expectedOutput,
  );
});

test('does not change server or native client output ownership', () => {
  assert.deepEqual(
    rspackClientOutputContract({ isServer: true, isTest: true }),
    {},
  );
  assert.deepEqual(
    rspackClientOutputContract({ isClient: true, isNative: true }),
    {},
  );
});

test('keeps explicitly imported standalone test files in the Docker context', () => {
  const dockerignore = fs.readFileSync(path.resolve(__dirname, '../../.dockerignore'), 'utf8');
  const entries = new Set(
    dockerignore
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
  assert.equal(entries.has('mofacts/tests/*'), true);
  assert.equal(entries.has('!mofacts/tests/changeStreamsQualificationContract.ts'), true);
  assert.equal(entries.has('!mofacts/tests/logComparison.test.js'), true);
});

test('requires explicit acknowledgments for both coordinated recovery actions', () => {
  const appRoot = path.resolve(__dirname, '..');
  const clientFixture = fs.readFileSync(
    path.join(appRoot, 'client/lib/changeStreamsQualification.test.ts'),
    'utf8',
  );
  const serverFixture = fs.readFileSync(
    path.join(appRoot, 'server/lib/changeStreamsQualificationFixture.test.ts'),
    'utf8',
  );
  const workflow = fs.readFileSync(
    path.resolve(appRoot, '../.github/workflows/meteor-35-change-streams-qualification.yml'),
    'utf8',
  );

  assert.doesNotMatch(clientFixture, /setTimeout\(resolve, 3_000\)/);
  assert.match(serverFixture, /await access\(markerPath\)/);
  assert.match(serverFixture, /qualification-action-timeout/);
  assert.match(workflow, /rm -f "\$history_marker"/);
  assert.match(workflow, /rm -f "\$restart_marker"/);
  assert.match(workflow, /idleCursors:true/);
  assert.match(workflow, /operation\.cursor\?\.originatingCommand/);
  assert.doesNotMatch(workflow, /MOFACTS_CHANGE_STREAMS_ENABLED/);
  assert.doesNotMatch(serverFixture, /MOFACTS_CHANGE_STREAMS_ENABLED/);
  assert.match(workflow, /METEOR_REACTIVITY_ORDER: changeStreams/);
});

test('qualifies production-shaped projections and the real non-reactive paged publication', () => {
  const appRoot = path.resolve(__dirname, '..');
  const contract = fs.readFileSync(
    path.join(appRoot, 'tests/changeStreamsQualificationContract.ts'),
    'utf8',
  );
  const clientFixture = fs.readFileSync(
    path.join(appRoot, 'client/lib/changeStreamsQualification.test.ts'),
    'utf8',
  );
  const serverFixture = fs.readFileSync(
    path.join(appRoot, 'server/lib/changeStreamsQualificationFixture.test.ts'),
    'utf8',
  );
  const publications = fs.readFileSync(
    path.join(appRoot, 'server/publications.ts'),
    'utf8',
  );

  assert.match(serverFixture, /fields: \{ 'nested\.visible': 1 \}/);
  assert.doesNotMatch(serverFixture, /nested: \{ visible: 1 \}/);
  assert.doesNotMatch(contract, /orderedPage|nestedObjectProjection/);
  assert.doesNotMatch(clientFixture, /ordered limited page|orderedPage/);
  assert.match(serverFixture, /publish_handlers\.filteredUsers/);
  assert.match(serverFixture, /non-reactive snapshot/);
  assert.match(serverFixture, /createRoleAsync\('admin', \{ unlessExists: true \}\)/);
  assert.match(publications, /await \(Meteor\.users\.find\(query/);
  assert.doesNotMatch(publications, /pagedUsersCursor\.observeChanges/);
});

test('enforces one Linux Docker source watcher on localhost', () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
  const manager = read('deploy/hotfix-local.ps1');
  const compose = read('deploy/docker-compose.local.yml');
  const watcher = read('deploy/hotfix/watch-linux.sh');
  const rspack = read('mofacts/rspack.config.js');
  assert.match(compose, /mofacts: !override/);
  assert.match(compose, /127\.0\.0\.1:3200:3200/);
  assert.match(compose, /127\.0\.0\.1:8082:8082/);
  assert.match(compose, /target: \/workspace\/mofacts\/node_modules\s+volume:\s+nocopy: true/);
  assert.match(compose, /target: \/workspace\/mofacts\/\.meteor\/local\s+volume:\s+nocopy: true/);
  assert.match(compose, /METEOR_REACTIVITY_ORDER: changeStreams/);
  assert.match(compose, /METEOR_WATCH_FORCE_POLLING: 'true'/);
  assert.match(compose, /read_only: true/);
  assert.doesNotMatch(compose, /^\s+build:|MOFACTS_NATIVE_MONGO_URL/m);
  assert.match(manager, /\$composeArgs = .*docker-compose\.local\.yml/);
  assert.match(manager, /"--no-build", "mofacts"/);
  assert.match(manager, /\$RequiredStableChecks = 4/);
  assert.match(manager, /assert-change-streams\.sh/);
  assert.match(manager, /Get-HotfixDevClientBundleState/);
  assert.doesNotMatch(manager, /JobObject|__supervise|mt-os\.windows|MOFACTS_NATIVE_MONGO_URL|Start-Process/);
  assert.match(watcher, /test "\$\(meteor --version\)" = 'Meteor 3\.5\.4'/);
  assert.match(watcher, /meteor npm ci/);
  assert.match(watcher, /sha256sum package-lock\.json/);
  assert.match(watcher, /exec meteor run --port 3200/);
  assert.match(rspack, /host: "0\.0\.0\.0"/);
  assert.match(rspack, /watchOptions: \{ poll: 1000 \}/);
  assert.match(read('AGENTS.md'), /There is exactly one localhost application server/);
});
