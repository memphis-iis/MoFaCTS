const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { discoverTestModules, evidenceCollector, validateRun, MARKER, MAX_BYTES } = require('./meteorTestEvidence.cjs');

const expected = { server: ['server/auth.test.ts'], client: ['client/theme.test.ts'] };
function environment(side, tests = [{ id: 'a'.repeat(64), outcome: 'passed' }]) {
  return { schema: 'MeteorEnvironmentEvidenceV1', side, modules: expected[side], tests, hookFailures: 0 };
}
const frame = report => `${MARKER}${JSON.stringify(report)}\n`;
function collect(server = environment('server'), client = environment('client'), status = 0) {
  const collector = evidenceCollector(expected);
  collector.push(frame(server));
  collector.push(frame(client));
  return collector.finish(status);
}

test('validates chunked, logger-prefixed frames independently of human summaries', () => {
  const collector = evidenceCollector(expected);
  const text = `irrelevant spec output\nI20261102 stdout: ${frame(environment('server'))}${frame(environment('client'))}`;
  for (const char of text) collector.push(char);
  assert.deepEqual(collector.finish(0), collect());
});

test('rejects missing, duplicate, malformed and oversized environment reports', () => {
  for (const text of [frame(environment('server')), frame(environment('server')).repeat(2),
    `${MARKER}{\n`, 'x'.repeat(MAX_BYTES + 1)]) {
    const collector = evidenceCollector(expected);
    collector.push(text);
    assert.throws(() => collector.finish(0), /incomplete Meteor/);
  }
});

test('rejects absent or unexpected modules, duplicate IDs and result payloads', () => {
  const variants = [
    { modules: [] }, { modules: ['server/other.test.ts'] },
    { modules: [...expected.server, ...expected.server] },
    { tests: [] }, { tests: [environment('server').tests[0], environment('server').tests[0]] },
    { tests: [{ id: 'raw title', outcome: 'passed' }] },
    { tests: [{ id: 'b'.repeat(64), outcome: 'unfinished' }] },
    { assertionMessage: 'sensitive fixture' }, { hookFailures: -1 },
  ];
  for (const changes of variants) {
    assert.throws(() => collect({ ...environment('server'), ...changes }), /incomplete Meteor/);
  }
});

test('records pending distinctly; rejects a successful exit with failed tests or hooks', () => {
  const tests = [...environment('server').tests, { id: 'b'.repeat(64), outcome: 'pending' }];
  assert.equal(collect(environment('server', tests)).environments[0].counts.pending, 1);
  assert.throws(() => collect(environment('server', [{ id: 'a'.repeat(64), outcome: 'failed' }])), /incomplete/);
  assert.throws(() => collect({ ...environment('server'), hookFailures: 1 }), /incomplete/);
  assert.throws(() => validateRun(collect(undefined, undefined, 1), expected), /incomplete/);
  const modified = collect();
  modified.environments[0].counts.passed++;
  assert.throws(() => validateRun(modified, expected), /incomplete/);
});

test('source inventory independently follows the reviewed Meteor discovery scopes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mofacts-test-discovery-'));
  try {
    for (const name of ['server/nested/auth.test.ts', 'common/contract.spec.js', 'tests/top.test.js',
      'tests/nested/excluded.test.js', 'client/theme.test.ts', 'client/helper.js']) {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      fs.writeFileSync(path.join(root, name), '');
    }
    assert.deepEqual(discoverTestModules(root), {
      server: ['common/contract.spec.js', 'server/nested/auth.test.ts', 'tests/top.test.js'],
      client: ['client/theme.test.ts'],
    });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

async function reporterFixture({ count = 2, total = count, moduleError = false } = {}) {
  const { createMeteorTestLoader, EVIDENCE_REPORTER } = await import('../tests/meteorEvidenceReporter.mjs');
  const Mocha = { reporters: { Spec: class {} } };
  const instance = { options: {}, forbidOnly() { this.onlyForbidden = true; } };
  let emitted;
  const load = createMeteorTestLoader(Mocha, instance, 'server', value => { emitted = value; }, EVIDENCE_REPORTER);
  assert.equal(instance.onlyForbidden, true);
  const context = () => moduleError ? Promise.reject(new Error('private value')) : Promise.resolve();
  context.keys = () => ['./auth.test.ts'];
  load('server', context);
  await Promise.resolve();
  const tests = Array.from({ length: count }, () => ({ type: 'test', titlePath: () => ['auth', 'same private title'] }));
  const runner = new EventEmitter();
  runner.suite = { eachTest: visit => tests.forEach(visit) };
  runner.total = total;
  const reporter = new Mocha.reporters[EVIDENCE_REPORTER](runner);
  return { tests, runner, complete: () => new Promise(resolve => reporter.done(0, status => resolve({ status, emitted }))) };
}

test('reporter hashes stable distinct IDs and emits only bounded result fields', async () => {
  const { runner, tests, complete } = await reporterFixture();
  runner.emit('pass', tests[0]);
  runner.emit('pending', tests[1]);
  const { status, emitted } = await complete();
  assert.equal(status, 0);
  assert.deepEqual(emitted.modules, expected.server);
  assert.deepEqual(emitted.tests.map(item => item.outcome), ['passed', 'pending']);
  assert.notEqual(emitted.tests[0].id, emitted.tests[1].id);
  const id = createHash('sha256').update(JSON.stringify(['server', JSON.stringify(['auth', 'same private title']), 0])).digest('hex');
  assert.equal(emitted.tests[0].id, id);
  assert.doesNotMatch(JSON.stringify(emitted), /private|auth",/);
});

test('interactive reporters retain ordinary loading and their focus, delayed and dry-run policy', async () => {
  const { createMeteorTestLoader } = await import('../tests/meteorEvidenceReporter.mjs');
  for (const selected of [undefined, 'spec', 'html']) {
    let loaded = 0;
    const instance = { options: { dryRun: true, delay: true }, forbidOnly() { assert.fail('interactive policy changed'); } };
    const load = createMeteorTestLoader({}, instance, 'client', () => assert.fail('unexpected evidence'), selected);
    const context = () => { loaded++; };
    context.keys = () => ['./interactive.test.ts'];
    load('client', context);
    assert.equal(loaded, 1);
  }
});

test('reporter rejects incomplete, filtered, unregistered and duplicate outcomes and load failures', async () => {
  for (const mode of ['missing', 'filtered', 'extra', 'duplicate', 'load']) {
    const { runner, tests, complete } = await reporterFixture({ total: mode === 'filtered' ? 1 : 2, moduleError: mode === 'load' });
    runner.emit('pass', tests[0]);
    if (mode !== 'missing') runner.emit('pass', tests[1]);
    if (mode === 'extra') runner.emit('pass', { type: 'test' });
    if (mode === 'duplicate') runner.emit('pass', tests[0]);
    const result = await complete();
    assert.equal(result.status, 1, mode);
    assert.equal(result.emitted, undefined, mode);
  }
});

test('reporter preserves original registrations across Mocha retry clones', async () => {
  const { runner, tests, complete } = await reporterFixture({ count: 1 });
  runner.emit('pass', { type: 'test', retriedTest: () => tests[0] });
  assert.equal((await complete()).status, 0);
});

test('source binding rejects different commits, dirty provenance and incomplete outcomes', async () => {
  const { bindMeteorEvidence } = await import('./recordMeteorTestEvidence.mjs');
  const observation = { state: 'test-inputs-verified-unqualified', identity: {
    schema: 'BuildIdentityV1', baseCommit: 'c'.repeat(40), includedUncommittedLocalChanges: false,
    sourceSnapshotDigestSha256: 'd'.repeat(64),
  }, testInputContractDigestSha256: 'e'.repeat(64), supplementalDigestSha256: 'f'.repeat(64) };
  const ci = { repository: 'memphis-iis/MoFaCTS', commit: 'c'.repeat(40), runId: '123', runAttempt: '1' };
  const run = collect(environment('server', [...environment('server').tests, { id: 'b'.repeat(64), outcome: 'pending' }]));
  const bytes = Buffer.from(JSON.stringify(run));
  const bound = bindMeteorEvidence(bytes, observation, expected, ci);
  assert.equal(bound.state, 'completed-with-pending');
  assert.equal(bound.qualification, 'unqualified');
  assert.equal(bound.runEvidenceDigestSha256, createHash('sha256').update(bytes).digest('hex'));
  assert.throws(() => bindMeteorEvidence(bytes, observation, expected, { ...ci, commit: '0'.repeat(40) }), /matching/);
  assert.throws(() => bindMeteorEvidence(bytes, { ...observation, identity: {
    ...observation.identity, includedUncommittedLocalChanges: true,
  } }, expected, ci), /matching/);
  assert.throws(() => bindMeteorEvidence(bytes, { ...observation, state: 'unavailable' }, expected, ci), /verification/);
  assert.throws(() => bindMeteorEvidence(Buffer.from('{}'), observation, expected, ci), /incomplete/);
});

test('browser parent fails promptly on premature worker exit and accepts a completed worker', { timeout: 10000 }, async () => {
  const { default: startPlaywright } = await import('../packages/browser-tests/browser/playwright.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mofacts-browser-worker-'));
  const previousAssets = globalThis.Assets;
  try {
    for (const premature of [true, false]) {
      const worker = path.join(root, premature ? 'premature.mjs' : 'complete.mjs');
      fs.writeFileSync(worker, premature ? "process.on('message', () => process.exit(2));"
        : "process.on('message', () => process.send({kind:'testsDone',data:{testFailures:0}}, () => process.disconnect()));");
      globalThis.Assets = { absoluteFilePath: () => worker };
      const failures = await new Promise(resolve => startPlaywright({ done: resolve }));
      assert.equal(failures, premature ? 1 : 0);
    }
  } finally {
    if (previousAssets === undefined) delete globalThis.Assets;
    else globalThis.Assets = previousAssets;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('wrapper records complete child output, rejects missing evidence and cleans transient versions', {
  skip: process.platform !== 'linux', timeout: 15000,
}, () => {
  // Synthetic executable only: this test never invokes Meteor or starts an app.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mofacts-evidence-wrapper-'));
  const app = path.join(root, 'repo', 'mofacts');
  const bin = path.join(root, 'bin');
  try {
    for (const name of ['scripts', '.meteor', 'client', 'server', 'common', 'tests']) {
      fs.mkdirSync(path.join(app, name), { recursive: true });
    }
    fs.mkdirSync(bin);
    for (const name of ['runMeteorCiTest.cjs', 'meteorCiHarness.cjs', 'meteorTestEvidence.cjs', 'meteorTestVersionArtifacts.cjs']) {
      fs.copyFileSync(path.join(__dirname, name), path.join(app, 'scripts', name));
    }
    fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ meteor: {
      testModule: { client: 'client-test-entry.js', server: 'server-test-entry.js' },
    } }));
    for (const name of ['client-test-entry.js', 'server-test-entry.js', ...expected.server, ...expected.client]) {
      fs.writeFileSync(path.join(app, name), '');
    }
    fs.writeFileSync(path.join(app, '.meteor/release'), 'METEOR@3.5.4\n');
    const versions = 'ddp-server@3.5.0\nrspack@1.3.1\n';
    fs.writeFileSync(path.join(app, '.meteor/packages'), versions);
    fs.writeFileSync(path.join(app, '.meteor/versions'), versions);
    fs.writeFileSync(path.join(root, 'settings.ci.json'), '{}');
    for (const complete of [true, false]) {
      const output = path.join(root, complete ? 'complete.json' : 'missing.json');
      const text = frame(environment('server')) + (complete ? frame(environment('client')) : '1237 passing\n');
      fs.writeFileSync(path.join(bin, 'meteor'), `#!/usr/bin/env node
const fs = require('node:fs');
if (process.env.TEST_CLIENT !== '1' || process.env.TEST_SERVER !== '1'
  || process.env.MOCHA_REPORTER !== 'mofacts-evidence') process.exit(9);
fs.appendFileSync('.meteor/versions', 'meteortesting:mocha@3.4.0\\n');
process.stdout.write(${JSON.stringify(text)}, () => process.exit(0));
`, { mode: 0o700 });
      const result = spawnSync(process.execPath, ['scripts/runMeteorCiTest.cjs'], {
        cwd: app, encoding: 'utf8', timeout: 5000,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CI: '1', TEST_CLIENT: '0',
          TEST_WATCH: '', TEST_PARALLEL: '', MOCHA_GREP: '', MOCHA_INVERT: '',
          TEST_SETTINGS_FILE: path.join(root, 'settings.ci.json'), MOFACTS_TEST_EVIDENCE_FILE: output },
      });
      assert.equal(result.status, complete ? 0 : 1, result.stderr);
      assert.equal(fs.existsSync(output), complete);
      if (complete) assert.deepEqual(validateRun(JSON.parse(fs.readFileSync(output)), expected), collect());
      assert.equal(fs.readFileSync(path.join(app, '.meteor/versions'), 'utf8'), versions);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
