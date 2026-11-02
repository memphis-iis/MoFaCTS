import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { parseExpressionAt } from 'acorn';
import { parseBuildIdentity } from '../../../common/securityAudit/buildIdentity.ts';
import { bindMeteorEvidence } from '../../recordMeteorTestEvidence.mjs';

// These are acquisition coordinates and structural checks, not a verification
// catalog or a publisher attestation. Only an authenticated adapter may supply
// remote metadata/ZIP observations; callers still provide the expected source.
export const CI_EVIDENCE_FILES = Object.freeze([
  'mofacts-source-observation.json',
  'mofacts-meteor-test-run.json',
  'mofacts-meteor-test-evidence.json',
]);
export const CI_EVIDENCE_LIMITS = Object.freeze({
  archiveBytes: 8 * 1024 ** 2,
  jsonBytes: 4 * 1024 ** 2,
  filesBytes: 12 * 1024 ** 2,
  metadataBytes: 2 * 1024 ** 2,
  jsonNodes: 500000,
  jsonDepth: 64,
  jobs: 20,
  recordBytes: 16384,
});
const repository = 'memphis-iis/MoFaCTS';
const ciJobNames = Object.freeze(['lint-test-and-image']);
const securityJobNames = Object.freeze([
  'Secret Scan (gitleaks)',
  'Security surface and scanner contracts',
  'Dependency audit (application)',
  'Dependency audit (Mongo sidecar)',
]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const invalid = () => { throw new Error('CI evidence acquisition validation failed'); };
const id = value => {
  if (!Number.isSafeInteger(value) || value < 1) invalid();
  return value;
};
const hex = value => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) invalid();
  return value;
};
function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort())) invalid();
}

function workflowRun(workflow, run, expectedPath, commit, expectedRepositoryId) {
  if (workflow.path !== expectedPath || workflow.state !== 'active'
    || id(workflow.id) !== id(run.workflow_id) || run.path !== expectedPath
    || run.status !== 'completed' || run.conclusion !== 'success'
    || run.event !== 'push' || run.head_branch !== 'main' || run.head_sha !== commit
    || run.repository?.full_name !== repository || run.head_repository?.full_name !== repository
    || id(run.repository.id) !== id(run.head_repository.id)
    || (expectedRepositoryId !== undefined && run.repository.id !== expectedRepositoryId)) invalid();
  return { runId: String(id(run.id)), runAttempt: String(id(run.run_attempt)), workflowId: String(workflow.id) };
}

function jobsForRun(envelope, run, requiredNames) {
  if (!envelope || !Array.isArray(envelope.jobs) || envelope.jobs.length > CI_EVIDENCE_LIMITS.jobs
    || envelope.total_count !== envelope.jobs.length || envelope.jobs.length !== requiredNames.length) invalid();
  const names = new Set();
  const ids = new Set();
  for (const job of envelope.jobs) {
    if (!requiredNames.includes(job.name) || names.has(job.name) || ids.has(id(job.id))
      || job.run_id !== run.id || job.run_attempt !== run.run_attempt || job.head_sha !== run.head_sha
      || job.status !== 'completed' || job.conclusion !== 'success') invalid();
    names.add(job.name);
    ids.add(job.id);
  }
  return requiredNames.map(name => ({ name, jobId: String(envelope.jobs.find(job => job.name === name).id) }));
}

// JSON.parse alone discards duplicate keys. Retaining its original bytes could
// therefore preserve private overwritten values absent from the validated object.
// Reuse the existing parser dependency solely to inspect syntax; never evaluate it.
export function parseCiEvidenceJson(bytes, maxBytes = CI_EVIDENCE_LIMITS.jsonBytes) {
  try {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > CI_EVIDENCE_LIMITS.filesBytes
      || !(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > maxBytes) invalid();
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = JSON.parse(text);
    const expression = parseExpressionAt(`(${text})`, 0, { ecmaVersion: 2022 });
    const pending = [{ expression, depth: 0 }];
    let nodes = 0;
    while (pending.length) {
      const { expression: node, depth } = pending.pop();
      if (++nodes > CI_EVIDENCE_LIMITS.jsonNodes || depth > CI_EVIDENCE_LIMITS.jsonDepth) invalid();
      if (node.type === 'ObjectExpression') {
        const names = new Set();
        nodes += node.properties.length * 2; // Property and key syntax nodes.
        for (const property of node.properties) {
          if (property.type !== 'Property' || property.key.type !== 'Literal'
            || typeof property.key.value !== 'string' || names.has(property.key.value)) invalid();
          names.add(property.key.value);
          pending.push({ expression: property.value, depth: depth + 1 });
        }
      } else if (node.type === 'ArrayExpression') {
        for (const element of node.elements) pending.push({ expression: element, depth: depth + 1 });
      } else if (node.type !== 'Literal' && node.type !== 'UnaryExpression') invalid();
      // JSON grammar validation above permits UnaryExpression only for negatives.
      if (node.type === 'UnaryExpression') pending.push({ expression: node.argument, depth: depth + 1 });
      if (nodes > CI_EVIDENCE_LIMITS.jsonNodes) invalid();
    }
    return value;
  } catch { invalid(); }
}

/** Pure composition: no network, filesystem, credentials, registry or deployment. */
export function composeCiEvidence(input) {
  try {
    exactKeys(input, ['expectedObservation', 'expectedModules', 'ciWorkflow', 'ciRun', 'ciJobs',
      'securityWorkflow', 'securityRun', 'securityJobs', 'artifact', 'archiveDigestSha256',
      'archiveSizeBytes', 'files']);
    const { ciWorkflow, ciRun, ciJobs, securityWorkflow, securityRun, securityJobs, artifact, files } = input;
    exactKeys(input.expectedObservation, ['state', 'identity', 'testInputContractDigestSha256', 'supplementalDigestSha256']);
    if (input.expectedObservation.state !== 'test-inputs-verified-unqualified') invalid();
    const source = parseBuildIdentity(input.expectedObservation.identity);
    if (source.includedUncommittedLocalChanges) invalid();
    exactKeys(input.expectedModules, ['server', 'client']);
    if (Buffer.byteLength(JSON.stringify({ ciWorkflow, ciRun, ciJobs, securityWorkflow, securityRun,
      securityJobs, artifact })) > CI_EVIDENCE_LIMITS.metadataBytes) invalid();
    const ci = workflowRun(ciWorkflow, ciRun, '.github/workflows/ci.yml', source.baseCommit);
    const security = workflowRun(securityWorkflow, securityRun, '.github/workflows/security.yml',
      source.baseCommit, ciRun.repository.id);
    if (ciRun.id === securityRun.id || ciWorkflow.id === securityWorkflow.id) invalid();
    ci.jobs = jobsForRun(ciJobs, ciRun, ciJobNames);
    security.jobs = jobsForRun(securityJobs, securityRun, securityJobNames);
    if (new Set([...ci.jobs, ...security.jobs].map(job => job.jobId)).size !== 5) invalid();

    const archiveDigestSha256 = hex(input.archiveDigestSha256);
    if (!Number.isSafeInteger(input.archiveSizeBytes) || input.archiveSizeBytes < 1
      || input.archiveSizeBytes > CI_EVIDENCE_LIMITS.archiveBytes
      || artifact.size_in_bytes !== input.archiveSizeBytes
      || artifact.digest !== `sha256:${archiveDigestSha256}` || artifact.expired !== false
      || artifact.name !== `source-observation-${ci.runId}-${ci.runAttempt}`
      || artifact.workflow_run?.id !== ciRun.id || artifact.workflow_run.head_sha !== source.baseCommit
      || artifact.workflow_run.head_branch !== 'main'
      || artifact.workflow_run.repository_id !== ciRun.repository.id
      || artifact.workflow_run.head_repository_id !== ciRun.repository.id) invalid();
    id(artifact.id);
    exactKeys(files, CI_EVIDENCE_FILES);
    const observation = parseCiEvidenceJson(files[CI_EVIDENCE_FILES[0]]);
    exactKeys(observation, ['state', 'identity', 'testInputContractDigestSha256', 'supplementalDigestSha256']);
    const run = files[CI_EVIDENCE_FILES[1]];
    parseCiEvidenceJson(run);
    const stored = parseCiEvidenceJson(files[CI_EVIDENCE_FILES[2]]);
    const references = CI_EVIDENCE_FILES.map(name => ({ name, digestSha256: hash(files[name]), bytes: files[name].byteLength }));
    if (references.reduce((total, file) => total + file.bytes, 0) > CI_EVIDENCE_LIMITS.filesBytes) invalid();
    const rebuilt = bindMeteorEvidence(Buffer.from(run), observation, input.expectedModules, {
      repository, commit: source.baseCommit, runId: ci.runId, runAttempt: ci.runAttempt,
    });
    if (!isDeepStrictEqual(observation, input.expectedObservation)
      || !isDeepStrictEqual(rebuilt, stored) || !isDeepStrictEqual(rebuilt.source, source)) invalid();
    const result = {
      schema: 'CiEvidenceAcquisitionV1', state: 'acquired-unqualified', qualification: 'unqualified',
      source, testInputContractDigestSha256: rebuilt.testInputContractDigestSha256,
      supplementalDigestSha256: rebuilt.supplementalDigestSha256,
      ci, security,
      artifact: { id: String(artifact.id), name: artifact.name, archiveDigestSha256,
        sizeInBytes: input.archiveSizeBytes, files: references },
      meteor: { state: rebuilt.state, environments: rebuilt.run.environments.map(environment => ({
        side: environment.side, modules: environment.modules.length, tests: environment.tests.length,
        ...environment.counts, hookFailures: environment.hookFailures,
      })) },
    };
    if (Buffer.byteLength(JSON.stringify(result)) > CI_EVIDENCE_LIMITS.recordBytes) invalid();
    return result;
  } catch {
    // API payloads, JSON parser diagnostics, titles, source and credential values
    // are intentionally absent from the single owning-boundary error.
    invalid();
  }
}
