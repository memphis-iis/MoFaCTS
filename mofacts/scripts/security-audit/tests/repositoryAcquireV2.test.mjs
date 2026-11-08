import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { acquireRepositoryToolObservationsV2 } from '../repository/acquireV2.mjs';
import { evaluateRepositoryObservationsV2 } from '../repository/observationsV2.mjs';
import { ACTIVE_AUDIT_CATALOG, readAuditCatalog } from '../../../common/securityAudit/catalogRegistry.ts';
import { platformImage, revision } from './fixtures/v2Fixtures.mjs';

const policy = { schema: 'DevelopmentDependencyExposurePolicyV1', confirmedBuildExposures: [] };
const environment = { PATH: process.env.PATH, NODE_OPTIONS: '' };
const npm = { vulnerabilities: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } } };
async function fixture(t) {
  const repositoryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-repository-acquire-'));
  t.after(() => fs.rm(repositoryDirectory, { recursive: true, force: true }));
  for (const name of ['mofacts', 'mofacts-mcp-sidecar/services/mongo-mcp']) await fs.mkdir(path.join(repositoryDirectory, name), { recursive: true });
  const calls = [], reports = [];
  const run = async spec => {
    calls.push(spec);
    const json = spec.command === 'gitleaks' ? [] : spec.command === 'trivy'
      ? { ArtifactName: platformImage.value, Results: [{ Target: 'synthetic-image', Class: 'os-pkgs', Vulnerabilities: [] }] } : npm;
    const fileArgument = spec.command === 'gitleaks' ? '--report-path' : spec.command === 'trivy' ? '--output' : undefined;
    if (fileArgument) {
      const file = spec.args[spec.args.indexOf(fileArgument) + 1]; reports.push(file);
      assert.equal(Number((await fs.stat(path.dirname(file))).mode) & 0o777, 0o700);
      await fs.writeFile(file, JSON.stringify(json));
      return { exitCode: 0, stdout: Buffer.from('PRIVATE tool progress is not report JSON') };
    }
    return { exitCode: 0, stdout: Buffer.from(JSON.stringify(json)) };
  };
  const options = { repositoryDirectory, environment, runtimeImage: platformImage.value, developmentExposurePolicy: policy };
  return { calls, reports, options, run, acquire: alternate => acquireRepositoryToolObservationsV2(options, { run: alternate || run }) };
}

test('V2 repository acquisition wires actual tool protocols, both lockfiles and exact immutable Trivy target sequentially', async t => {
  const { calls, reports, acquire } = await fixture(t), observations = await acquire();
  assert.equal(calls.length, 6); assert.deepEqual(calls.map(row => row.command), ['gitleaks', 'npm', 'npm', 'npm', 'npm', 'trivy']);
  assert.ok(calls.every(row => Object.isFrozen(row.environment)));
  for (const row of calls) assert.deepEqual(row.environment, environment);
  assert.equal(calls.filter(row => row.command === 'npm' && row.args.includes('--omit=dev')).length, 2);
  assert.ok(calls.find(row => row.command === 'gitleaks').args.includes('--redact'));
  const trivy = calls.at(-1); assert.equal(trivy.args.at(-1), platformImage.value);
  assert.deepEqual(trivy.args.slice(2, 4), ['--scanners', 'vuln']);
  assert.equal(Object.values(observations).filter(row => row.state === 'observed').length, 6);
  assert.equal(JSON.stringify(observations).includes('PRIVATE'), false);
  for (const report of reports) await assert.rejects(fs.stat(report), { code: 'ENOENT' });
  const catalog = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
  const artifact = evaluateRepositoryObservationsV2(catalog, 'full', observations,
    { AUDIT_RUNTIME_IMAGE: platformImage.value, deployedApplicationRevision: revision, deployedImageDigest: platformImage });
  assert.equal(artifact.controls.filter(row => row.status === 'PASS').length, 21);
  assert.equal(artifact.controls.filter(row => row.status === 'ERROR').length, 4); // static/source/canary and other missing observations stay explicit
});

test('V2 repository acquisition preserves independent runtime output and classifies timeout/missing tools without raw error text', async t => {
  const { acquire, run, options } = await fixture(t);
  const observations = await acquire(async spec => {
    if (spec.command === 'gitleaks') throw Error('PRIVATE transport detail');
    if (spec.command === 'trivy') return { exitCode: -1, failure: 'timeout', stdout: Buffer.from('PRIVATE partial') };
    if (spec.command === 'npm' && !spec.args.includes('--omit=dev')) return { exitCode: -1, failure: 'timeout' };
    return run(spec);
  });
  assert.equal(observations['repository.git-history-secrets'].reason, 'tool-unavailable');
  assert.equal(observations['application-runtime'].state, 'observed');
  assert.equal(observations['application-development'].reason, 'timeout');
  assert.equal(observations['runtime-image'].reason, 'timeout');
  assert.equal(JSON.stringify(observations).includes('PRIVATE'), false);
  const noImage = await acquireRepositoryToolObservationsV2({ ...options, runtimeImage: 'mutable:tag' }, { run });
  assert.equal(noImage['runtime-image'].reason, 'identity-unavailable');
});

test('V2 repository acquisition rejects missing, linked or malformed reports and removes owned temporary files', async t => {
  const { acquire, run, reports } = await fixture(t);
  const observations = await acquire(async spec => {
    const result = await run(spec);
    if (spec.command === 'gitleaks') { await fs.unlink(reports.at(-1)); return result; }
    if (spec.command === 'trivy') {
      const file = reports.at(-1); await fs.unlink(file); await fs.symlink('/dev/null', file);
    }
    return result;
  });
  assert.equal(observations['repository.git-history-secrets'].reason, 'producer-malformed');
  assert.equal(observations['runtime-image'].reason, 'producer-malformed');
  for (const report of reports) await assert.rejects(fs.lstat(report), { code: 'ENOENT' });
});

test('V2 repository acquisition never substitutes another lockfile directory when an expected one is missing', async t => {
  const { options, run, calls } = await fixture(t);
  await fs.rm(path.join(options.repositoryDirectory, 'mofacts-mcp-sidecar'), { recursive: true });
  const observations = await acquireRepositoryToolObservationsV2(options, { run });
  assert.equal(observations['sidecar-mongo-runtime'].reason, 'configuration');
  assert.equal(observations['sidecar-mongo-development'].reason, 'configuration');
  assert.equal(calls.filter(row => row.command === 'npm').length, 2);
});

test('V2 repository acquisition rejects secret-bearing or filtering environments before reaching a tool boundary', async t => {
  const { options, run, calls } = await fixture(t);
  for (const environment of [{ ...options.environment, AUDIT_AUTH_FIXTURES_JSON: 'PRIVATE' },
    { ...options.environment, NODE_OPTIONS: '--test-name-pattern=one' }]) {
    await assert.rejects(acquireRepositoryToolObservationsV2({ ...options, environment }, { run }), /Invalid repository command configuration/);
  }
  assert.equal(calls.length, 0);
});
