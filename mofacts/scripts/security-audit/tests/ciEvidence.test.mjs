import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { bindMeteorEvidence } from '../../recordMeteorTestEvidence.mjs';
import { composeCiEvidence, parseCiEvidenceJson, CI_EVIDENCE_FILES, CI_EVIDENCE_LIMITS } from '../qualification/ciEvidence.mjs';
import { ciEvidenceFixture } from './helpers/ciEvidenceFixture.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = value => Buffer.from(JSON.stringify(value));
function rejectMutation(change) {
  const input = ciEvidenceFixture();
  change(input);
  assert.throws(() => composeCiEvidence(input), { message: 'CI evidence acquisition validation failed' });
}

test('exact source, workflows, successful jobs and artifact produce only bounded unqualified references', () => {
  const result = composeCiEvidence(ciEvidenceFixture());
  assert.equal(result.state, 'acquired-unqualified');
  assert.equal(result.qualification, 'unqualified');
  assert.equal(result.meteor.state, 'completed-with-pending');
  assert.deepEqual(result.meteor.environments.map(environment => environment.pending), [1, 1]);
  assert.equal(result.artifact.files.length, 3);
  assert.equal(result.security.jobs.length, 4);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < CI_EVIDENCE_LIMITS.recordBytes);
  assert.doesNotMatch(JSON.stringify(result), /sensitive|ignored_|token|password/);
});

test('source identity cannot be dirty or substituted by another commit or digest', () => {
  for (const change of [
    input => { input.expectedObservation.identity.includedUncommittedLocalChanges = true; },
    input => { input.expectedObservation.identity.baseCommit = 'f'.repeat(40); },
    input => { input.expectedObservation.identity.sourceSnapshotDigestSha256 = '0'.repeat(64); },
    input => { input.expectedObservation.identity.rawPrivateValue = 'sensitive'; },
    input => { input.expectedObservation.testInputContractDigestSha256 = '0'.repeat(64); },
    input => { input.expectedObservation.supplementalDigestSha256 = '0'.repeat(64); },
    input => { input.expectedObservation.state = 'unavailable'; },
    input => { input.expectedObservation.actorSecret = 'sensitive'; },
    input => { input.expectedModules.server = ['server/other.test.ts']; },
  ]) rejectMutation(change);
});

test('workflow and run provenance rejects forks, wrong workflows, PRs and unfinished/failed runs', () => {
  const changes = [
    input => { input.ciWorkflow.id++; },
    input => { input.ciWorkflow.state = 'disabled_manually'; },
    input => { input.ciWorkflow.path = '.github/workflows/other.yml'; },
    input => { input.ciRun.path = '.github/workflows/other.yml'; },
    input => { input.ciRun.event = 'pull_request'; },
    input => { input.ciRun.head_branch = 'another'; },
    input => { input.ciRun.head_repository.id++; },
    input => { input.ciRun.repository.full_name = 'untrusted/repo'; },
    input => { input.ciRun.head_repository.full_name = 'untrusted/repo'; },
    input => { input.ciRun.status = 'in_progress'; },
    input => { input.ciRun.conclusion = 'failure'; },
    input => { input.securityRun.head_sha = '0'.repeat(40); },
    input => { input.securityRun.repository.id++; input.securityRun.head_repository.id++; },
    input => { input.securityRun.conclusion = 'cancelled'; },
    input => { input.securityWorkflow.id = input.ciWorkflow.id; input.securityRun.workflow_id = input.ciWorkflow.id; },
    input => { input.ciRun.id = Number.MAX_SAFE_INTEGER + 1; },
  ];
  changes.forEach(rejectMutation);
});

test('jobs require complete unique membership and exact successful run attempts', () => {
  for (const change of [
    input => { input.ciJobs.jobs = []; input.ciJobs.total_count = 0; },
    input => { input.securityJobs.total_count++; },
    input => { input.securityJobs.jobs.pop(); input.securityJobs.total_count--; },
    input => { input.securityJobs.jobs[0].name = input.securityJobs.jobs[1].name; },
    input => { input.securityJobs.jobs[0].id = input.securityJobs.jobs[1].id; },
    input => { input.securityJobs.jobs[0].status = 'queued'; },
    input => { input.securityJobs.jobs[0].conclusion = 'skipped'; },
    input => { input.securityJobs.jobs[0].run_attempt++; },
    input => { input.securityJobs.jobs[0].run_id++; },
    input => { input.securityJobs.jobs[0].head_sha = '0'.repeat(40); },
  ]) rejectMutation(change);
});

test('artifact must match run, attempt, same repository, actual digest and bounded ZIP length', () => {
  for (const change of [
    input => { input.artifact.expired = true; },
    input => { input.artifact.name = 'source-observation-101-2'; },
    input => { input.artifact.workflow_run.id++; },
    input => { input.artifact.workflow_run.head_sha = '0'.repeat(40); },
    input => { input.artifact.workflow_run.head_branch = 'another'; },
    input => { input.artifact.workflow_run.repository_id++; },
    input => { input.artifact.workflow_run.head_repository_id++; },
    input => { input.artifact.digest = 'sha256:' + '0'.repeat(64); },
    input => { input.archiveDigestSha256 = input.archiveDigestSha256.toUpperCase(); },
    input => { input.archiveSizeBytes++; },
    input => { input.archiveSizeBytes = 0; input.artifact.size_in_bytes = 0; },
    input => { input.archiveSizeBytes = CI_EVIDENCE_LIMITS.archiveBytes + 1; input.artifact.size_in_bytes = input.archiveSizeBytes; },
  ]) rejectMutation(change);
});

test('the exact three bounded UTF-8 JSON files are required', () => {
  for (const change of [
    input => { delete input.files[CI_EVIDENCE_FILES[0]]; },
    input => { input.files['unexpected.json'] = bytes({ secret: 'sensitive' }); },
    input => { input.files[CI_EVIDENCE_FILES[0]] = 'not bytes'; },
    input => { input.files[CI_EVIDENCE_FILES[0]] = Buffer.from([0xff]); },
    input => { input.files[CI_EVIDENCE_FILES[0]] = Buffer.from('{ private value'); },
    input => { input.files[CI_EVIDENCE_FILES[1]] = Buffer.alloc(CI_EVIDENCE_LIMITS.jsonBytes + 1); },
    input => { const value = JSON.parse(input.files[CI_EVIDENCE_FILES[0]]); value.actorSecret = 'sensitive'; input.files[CI_EVIDENCE_FILES[0]] = bytes(value); },
    input => { const value = JSON.parse(input.files[CI_EVIDENCE_FILES[1]]); value.actorSecret = 'sensitive'; input.files[CI_EVIDENCE_FILES[1]] = bytes(value); },
    input => { const value = JSON.parse(input.files[CI_EVIDENCE_FILES[2]]); value.actorSecret = 'sensitive'; input.files[CI_EVIDENCE_FILES[2]] = bytes(value); },
  ]) rejectMutation(change);
});

test('joined evidence must reproduce every raw outcome and both input digests', () => {
  for (const change of [
    input => { const value = JSON.parse(input.files[CI_EVIDENCE_FILES[2]]); value.qualification = 'qualified'; input.files[CI_EVIDENCE_FILES[2]] = bytes(value); },
    input => { const value = JSON.parse(input.files[CI_EVIDENCE_FILES[2]]); value.ci.runAttempt = '2'; input.files[CI_EVIDENCE_FILES[2]] = bytes(value); },
    input => { const value = JSON.parse(input.files[CI_EVIDENCE_FILES[2]]); value.supplementalDigestSha256 = '0'.repeat(64); input.files[CI_EVIDENCE_FILES[2]] = bytes(value); },
    input => { const value = JSON.parse(input.files[CI_EVIDENCE_FILES[1]]); value.environments[0].tests[0].outcome = 'failed'; input.files[CI_EVIDENCE_FILES[1]] = bytes(value); },
    input => { const value = JSON.parse(input.files[CI_EVIDENCE_FILES[0]]); value.testInputContractDigestSha256 = '0'.repeat(64); input.files[CI_EVIDENCE_FILES[0]] = bytes(value); },
  ]) rejectMutation(change);
});

test('valid Uint8Array bytes are accepted without retaining raw payloads', () => {
  const input = ciEvidenceFixture();
  input.files = Object.fromEntries(Object.entries(input.files).map(([name, value]) => [name, new Uint8Array(value)]));
  const result = composeCiEvidence(input);
  assert.equal(result.artifact.files[1].digestSha256, digest(input.files[CI_EVIDENCE_FILES[1]]));
  assert.equal(Object.hasOwn(result, 'files'), false);
});

test('an explicitly expected producer contract is not silently substituted by the reader version', () => {
  const input = ciEvidenceFixture();
  const observation = JSON.parse(input.files[CI_EVIDENCE_FILES[0]]);
  observation.testInputContractDigestSha256 = '1'.repeat(64);
  observation.supplementalDigestSha256 = '2'.repeat(64);
  input.expectedObservation = structuredClone(observation);
  input.files[CI_EVIDENCE_FILES[0]] = bytes(observation);
  const joined = bindMeteorEvidence(input.files[CI_EVIDENCE_FILES[1]], observation, input.expectedModules,
    { repository: 'memphis-iis/MoFaCTS', commit: observation.identity.baseCommit, runId: '101', runAttempt: '1' });
  input.files[CI_EVIDENCE_FILES[2]] = bytes(joined);
  assert.equal(composeCiEvidence(input).testInputContractDigestSha256, '1'.repeat(64));
});

test('duplicate-key checks include nested, escaped and overwritten private values without disclosing them', () => {
  for (const source of [
    '{"status":"private canary","status":"safe"}',
    '{"outer":{"id":"private canary","id":"safe"}}',
    '{"outer":{"id":"private canary","\\u0069d":"safe"}}',
    '{"items":[{"status":"private canary","status":"safe"}]}',
  ]) {
    assert.throws(() => parseCiEvidenceJson(Buffer.from(source)),
      { message: 'CI evidence acquisition validation failed' });
  }
  rejectMutation(input => {
    const source = input.files[CI_EVIDENCE_FILES[0]].toString('utf8');
    input.files[CI_EVIDENCE_FILES[0]] = Buffer.from(source.replace('{', '{"state":"private canary",'));
  });
});

test('valid JSON whitespace and negative scalar values are preserved semantically', () => {
  assert.deepEqual(parseCiEvidenceJson(Buffer.from(' \n {"items": [ -2, null, true, {"a": "text"} ]}\n ')),
    { items: [-2, null, true, { a: 'text' }] });
});

test('JSON input bounds include bytes, syntax depth and node count', () => {
  for (const [source, limit] of [
    ['{"value":1}', 2],
    ['['.repeat(CI_EVIDENCE_LIMITS.jsonDepth + 2) + '0' + ']'.repeat(CI_EVIDENCE_LIMITS.jsonDepth + 2)],
    ['[' + '0,'.repeat(CI_EVIDENCE_LIMITS.jsonNodes) + '0]'],
  ]) assert.throws(() => parseCiEvidenceJson(Buffer.from(source), limit),
    { message: 'CI evidence acquisition validation failed' });
});
