import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { ACTIVE_AUDIT_CATALOG, readAuditCatalog } from '../../../common/securityAudit/catalogRegistry.ts';
import { parseAuditProducerArtifact } from '../../../common/securityAudit/producerArtifact.ts';
import { parseSecurityAuditReportV2 } from '../../../common/securityAudit/reportV2.ts';
import { repositoryFindingGroups } from '../repository/findingTiers.mjs';
import { evaluateRepositoryObservationsV2, parseNpmRepositoryObservationsV2, parseTrivyRepositoryObservationV2,
  parseGitleaksRepositoryObservationV2, parseNodeSourceTestObservationV2 } from '../repository/observationsV2.mjs';
import { assembleAuditReportV2 } from '../core/assembleV2.mjs';
import { envelope, errorArtifacts, ingestionContext, revision, platformImage } from './fixtures/v2Fixtures.mjs';

const catalog = () => readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
const observed = value => ({ state: 'observed', value });
const imageContext = { deployedApplicationRevision: revision, deployedImageDigest: platformImage, AUDIT_RUNTIME_IMAGE: platformImage.value };
const policy = { schema: 'DevelopmentDependencyExposurePolicyV1', confirmedBuildExposures: [] };
function npm(findings = {}, changes = {}) {
  const severities = ['info', 'low', 'moderate', 'high', 'critical'];
  const counts = Object.fromEntries(severities.map(severity => [severity, Object.values(findings).filter(row => row.severity === severity).length]));
  const raw = { auditReportVersion: 2, vulnerabilities: findings,
    metadata: { vulnerabilities: { ...counts, total: Object.keys(findings).length } } };
  return { exitCode: Object.keys(findings).length ? 1 : 0, stdout: Buffer.from(JSON.stringify(raw)), ...changes };
}
function npmFinding(severity, source = 123) { return { severity, via: [{ source }], isDirect: true }; }
async function observations() {
  const c = await catalog(), groups = repositoryFindingGroups(c, 'full');
  const inputs = Object.fromEntries(groups.map(({ group }) => [group, observed({ findings: [],
    ...(group.endsWith('-development') ? { maintenanceAdvisoryPackageCount: 0 } : {}) })]));
  const tierIds = new Set(groups.flatMap(group => group.controls));
  for (const row of c.controls.filter(row => row.producerId === 'repository' && !tierIds.has(row.controlId))) {
    inputs[row.controlId] = observed(row.evidenceContract === 'verification-observations-v1'
      ? { expectedCaseCount: 2, completedCaseCount: 2, matchedCaseCount: 2, domainRejectionCount: 0, transportErrorCount: 0, inconclusiveCaseCount: 0 }
      : { evaluatedCount: 0, findingCount: 0 });
  }
  return { c, inputs };
}

test('V2 repository ownership comes from the existing tier binding owner and produces exactly 25 controls', async () => {
  const { c, inputs } = await observations(), groups = repositoryFindingGroups(c, 'full');
  assert.equal(groups.length, 5); assert.equal(new Set(groups.flatMap(group => group.controls)).size, 20);
  const artifact = evaluateRepositoryObservationsV2(c, 'full', inputs, imageContext);
  assert.equal(artifact.controls.length, 25); assert.ok(artifact.controls.every(row => row.status === 'PASS'));
  assert.deepEqual(parseAuditProducerArtifact(artifact, c, 'full', 'repository'), artifact);
  assert.throws(() => evaluateRepositoryObservationsV2(c, 'exposure', inputs, imageContext));
  assert.throws(() => evaluateRepositoryObservationsV2(c, 'full', { ...inputs, foreign: {} }, imageContext));
});

test('V2 npm observations preserve runtime tiers while unconfirmed development advisories stay maintenance evidence', async () => {
  const parsed = parseNpmRepositoryObservationsV2({ lockfile: 'application', policy,
    runtime: npm({ runtime: npmFinding('high') }), all: npm({ runtime: npmFinding('high'), development: npmFinding('critical') }) });
  assert.deepEqual(parsed['application-runtime'].value.findings, [{ severity: 'high' }]);
  assert.deepEqual(parsed['application-development'].value, { findings: [], maintenanceAdvisoryPackageCount: 1 });
  const { c, inputs } = await observations(); Object.assign(inputs, parsed);
  const rows = evaluateRepositoryObservationsV2(c, 'full', inputs, imageContext).controls;
  assert.equal(rows.find(row => row.controlId === 'repository.dependencies-application-runtime.high').status, 'FAIL');
  const development = rows.filter(row => row.controlId.startsWith('repository.dependencies-application-development.'));
  assert.ok(development.every(row => row.status === 'PASS'));
  assert.ok(development.every(row => row.evidence.observations[0].includes('1 packages')));
});

test('V2 npm development failures require an explicit matching reviewed exposure', async () => {
  const reviewed = { ...policy, confirmedBuildExposures: [{ lockfile: 'application', package: 'development', advisoryId: '123', rationaleId: 'reviewed-build-path' }] };
  const parsed = parseNpmRepositoryObservationsV2({ lockfile: 'application', policy: reviewed,
    runtime: npm(), all: npm({ development: npmFinding('critical') }) });
  const { c, inputs } = await observations(); Object.assign(inputs, parsed);
  assert.equal(evaluateRepositoryObservationsV2(c, 'full', inputs, imageContext).controls
    .find(row => row.controlId === 'repository.dependencies-application-development.critical').status, 'FAIL');
  const unbound = parseNpmRepositoryObservationsV2({ lockfile: 'application', policy: undefined, runtime: npm(), all: npm() });
  assert.equal(unbound['application-runtime'].state, 'observed'); assert.equal(unbound['application-development'].reason, 'configuration');
});

test('V2 npm rejects absent/duplicate/contradictory tool data without dropping valid independent runtime output', () => {
  const raw = JSON.parse(npm({ runtime: npmFinding('high') }).stdout); raw.metadata.vulnerabilities.total = 0;
  const malformed = { exitCode: 1, stdout: Buffer.from(JSON.stringify(raw)) };
  let parsed = parseNpmRepositoryObservationsV2({ lockfile: 'sidecar-mongo', policy, runtime: npm(), all: malformed });
  assert.equal(parsed['sidecar-mongo-runtime'].state, 'observed'); assert.equal(parsed['sidecar-mongo-development'].reason, 'producer-malformed');
  for (const runtime of [malformed, { exitCode: 2, stdout: npm().stdout }, { exitCode: 0, stdout: Buffer.from('{}') },
    { exitCode: 0, stdout: Buffer.from('{"metadata":{},"metadata":{"PRIVATE":true}}') }, npm({ one: npmFinding('high') }, { exitCode: 0 })]) {
    parsed = parseNpmRepositoryObservationsV2({ lockfile: 'application', policy, runtime, all: npm() });
    assert.equal(parsed['application-runtime'].state, 'unavailable'); assert.equal(parsed['application-development'].reason, 'evidence-incomplete');
    assert.equal(JSON.stringify(parsed).includes('PRIVATE'), false);
  }
  for (const findings of [{ ['x'.repeat(90)]: npmFinding('high') }, { 'PRIVATE-package!': npmFinding('high') },
    [npmFinding('high')], { package: { severity: 'high', via: [{ source: 'PRIVATE!source' }] } }]) {
    const parsed = parseNpmRepositoryObservationsV2({ lockfile: 'application', policy, runtime: npm(findings), all: npm() });
    assert.equal(parsed['application-runtime'].state, 'unavailable');
  }
  const scoped = parseNpmRepositoryObservationsV2({ lockfile: 'application', policy,
    runtime: npm({ '@scope/package': npmFinding('high', 'GHSA-example-advisory') }), all: npm({ '@scope/package': npmFinding('high', 'GHSA-example-advisory') }) });
  assert.equal(scoped['application-runtime'].state, 'observed');
});

test('V2 Gitleaks and Trivy adapters retain finding counts/severity only and reject false-empty results', () => {
  const git = parseGitleaksRepositoryObservationV2({ exitCode: 1, stdout: Buffer.from(JSON.stringify([{ RuleID: 'rule', File: 'PRIVATE-path', Secret: 'PRIVATE-data' }])) });
  assert.deepEqual(git, observed({ evaluatedCount: 1, findingCount: 1 }));
  assert.equal(JSON.stringify(git).includes('PRIVATE'), false);
  assert.deepEqual(parseGitleaksRepositoryObservationV2({ exitCode: 0, stdout: Buffer.from('[]') }), observed({ evaluatedCount: 0, findingCount: 0 }));
  assert.equal(parseGitleaksRepositoryObservationV2({ exitCode: 1, stdout: Buffer.from('[]') }).state, 'unavailable');
  const trivy = { ArtifactName: platformImage.value, Results: [{ Target: 'PRIVATE-image-path', Class: 'lang-pkgs', Vulnerabilities: [
    { Severity: 'HIGH', VulnerabilityID: 'vulnerability-one', PkgName: 'package-one' },
    { Severity: 'CRITICAL', VulnerabilityID: 'vulnerability-two', PkgName: 'package-two' }] }] };
  assert.deepEqual(parseTrivyRepositoryObservationV2({ exitCode: 0, stdout: Buffer.from(JSON.stringify(trivy)) }, platformImage.value),
    observed({ findings: [{ severity: 'high' }, { severity: 'critical' }] }));
  for (const raw of [{}, { Results: [] }, { Results: [{ Target: 'x', Class: 'lang-pkgs', Vulnerabilities: 'not-an-array' }] }]) {
    assert.equal(parseTrivyRepositoryObservationV2({ exitCode: 0, stdout: Buffer.from(JSON.stringify(raw)) }, platformImage.value).state, 'unavailable');
  }
  const mismatched = { ...trivy, ArtifactName: 'different-image:tag' };
  assert.equal(parseTrivyRepositoryObservationV2({ exitCode: 0, stdout: Buffer.from(JSON.stringify(mismatched)) }, platformImage.value).reason, 'identity-conflict');
  const unknown = structuredClone(trivy); unknown.Results[0].Vulnerabilities[0].Severity = 'PRIVATE_UNKNOWN';
  assert.equal(parseTrivyRepositoryObservationV2({ exitCode: 0, stdout: Buffer.from(JSON.stringify(unknown)) }, platformImage.value).state, 'unavailable');
});

test('V2 repository image controls require independent usable revision/platform observations and the exact selected scan image', async () => {
  const { c, inputs } = await observations();
  for (const context of [undefined, { ...imageContext, AUDIT_RUNTIME_IMAGE: 'mutable-tag' },
    { ...imageContext, deployedApplicationRevision: { state: 'unavailable', reason: 'not-provided' } }]) {
    const rows = evaluateRepositoryObservationsV2(c, 'full', inputs, context).controls;
    assert.equal(rows.filter(row => row.status === 'ERROR').length, 3);
    assert.ok(rows.filter(row => row.status === 'ERROR').every(row => row.evidence.category === 'identity-unavailable'));
  }
  const mismatch = evaluateRepositoryObservationsV2(c, 'full', inputs, { ...imageContext,
    AUDIT_RUNTIME_IMAGE: 'registry.example/mofacts@sha256:' + 'f'.repeat(64) });
  assert.ok(mismatch.controls.filter(row => row.status === 'ERROR').every(row => row.evidence.category === 'identity-conflict'));
  const conflict = evaluateRepositoryObservationsV2(c, 'full', inputs, {
    deployedApplicationRevision: { state: 'conflicting', reason: 'independent-observations-disagree' } });
  assert.ok(conflict.controls.filter(row => row.status === 'ERROR').every(row => row.evidence.category === 'identity-conflict'));
});

test('V2 repository missing/malformed groups cannot replace another tier or produce partial artifacts', async () => {
  const { c, inputs } = await observations(); delete inputs['application-runtime'];
  inputs['sidecar-mongo-runtime'] = observed({ findings: [{ severity: 'high', PRIVATE: 'raw' }] });
  inputs['repository.source-security-tests'].value.completedCaseCount--;
  const artifact = evaluateRepositoryObservationsV2(c, 'full', inputs, imageContext);
  assert.equal(artifact.controls.length, 25); assert.equal(artifact.controls.filter(row => row.status === 'ERROR').length, 9);
  assert.equal(JSON.stringify(artifact).includes('PRIVATE'), false);
  assert.deepEqual(parseAuditProducerArtifact(artifact, c, 'full', 'repository'), artifact);
});

async function nodeRun(t, body, flags = [], nodeOptions = '') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-source-coverage-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceFile = path.join(root, 'source.test.cjs');
  await fs.writeFile(sourceFile, `const test = require('node:test'), assert = require('node:assert/strict');\n${body}\n`);
  // This fixture owns a fresh CLI runner, not the parent test worker's IPC
  // channel. Inheriting NODE_TEST_CONTEXT changes stdout from TAP to worker data.
  const childEnv = { ...process.env }; delete childEnv.NODE_TEST_CONTEXT; delete childEnv.NODE_OPTIONS;
  if (nodeOptions) childEnv.NODE_OPTIONS = nodeOptions;
  const args = ['--test', '--test-reporter=tap', ...flags, sourceFile];
  let result;
  try {
    const output = await promisify(execFile)(process.execPath, args, { env: childEnv, encoding: 'buffer', timeout: 10_000 });
    result = { exitCode: 0, stdout: output.stdout, args, NODE_OPTIONS: childEnv.NODE_OPTIONS || '' };
  } catch (error) { result = { exitCode: error.code, stdout: error.stdout, args, NODE_OPTIONS: childEnv.NODE_OPTIONS || '' }; }
  assert.match(result.stdout.toString('utf8'), /^TAP version 13/m, 'The owned fixture runner must emit actual TAP');
  return { sourceFile, result };
}

test('V2 source coverage reads actual Node TAP case completion and assertion failure without retaining diagnostics', async t => {
  const good = await nodeRun(t, "test('one', () => assert.equal(1,1)); test('two', () => assert.equal(2,2));");
  assert.deepEqual(parseNodeSourceTestObservationV2(good.result, good.sourceFile), observed({ expectedCaseCount: 2,
    completedCaseCount: 2, matchedCaseCount: 2, domainRejectionCount: 0, transportErrorCount: 0, inconclusiveCaseCount: 0 }));
  const bad = await nodeRun(t, "test('one', () => assert.equal(1,1)); test('two', () => assert.fail('PRIVATE diagnostic'));");
  const parsed = parseNodeSourceTestObservationV2(bad.result, bad.sourceFile);
  assert.equal(parsed.state, 'observed'); assert.equal(parsed.value.matchedCaseCount, 1);
  assert.equal(JSON.stringify(parsed).includes('PRIVATE'), false);
});

test('V2 source coverage rejects skipped/filtered/empty/crashed and incomplete runs instead of counting process success', async t => {
  for (const [index, [body, flags]] of [
    ["test('one', () => {}); test.skip('two', () => {});", []],
    ["test('one', () => {}); test('two', () => {});", ['--test-name-pattern=one']],
    ['', []], ["test('one', () => { throw Error('PRIVATE unrelated failure'); });", []],
    ["throw Error('PRIVATE module failure');", []],
  ].entries()) {
    const run = await nodeRun(t, body, flags), parsed = parseNodeSourceTestObservationV2(run.result, run.sourceFile);
    assert.equal(parsed.state, 'unavailable', `Rejected incomplete runner fixture ${index}`); assert.equal(JSON.stringify(parsed).includes('PRIVATE'), false);
  }
  const filtered = await nodeRun(t, "test('one', () => {}); test('two', () => {});", [], '--test-name-pattern=one');
  assert.equal(filtered.result.exitCode, 0);
  assert.equal(parseNodeSourceTestObservationV2(filtered.result, filtered.sourceFile).reason, 'configuration');
  assert.equal(parseNodeSourceTestObservationV2({ exitCode: 0, stdout: Buffer.from('TAP version 13\n1..2\n') }, '/tmp/source.test.cjs').state, 'unavailable');
});

test('V2 repository artifact assembles and passes the independent signed-report parser with exact profile counts', async () => {
  const { c, inputs } = await observations(), artifact = evaluateRepositoryObservationsV2(c, 'full', inputs, imageContext);
  const slots = await errorArtifacts(); slots.find(slot => slot.producerId === 'repository').artifact = artifact;
  const report = await assembleAuditReportV2({ ...envelope, artifacts: slots,
    deployedApplicationRevision: revision, deployedImageDigest: platformImage });
  assert.equal(report.counts.pass, 25); assert.equal(report.counts.error, 45);
  await parseSecurityAuditReportV2(report, { ...ingestionContext, receiverRevision: revision, receiverImage: platformImage });
});
