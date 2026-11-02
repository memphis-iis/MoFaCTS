import { createHash } from 'node:crypto';
import { bindMeteorEvidence } from '../../../recordMeteorTestEvidence.mjs';
import { TEST_INPUTS } from '../../qualification/testInputs.mjs';
import { CI_EVIDENCE_FILES } from '../../qualification/ciEvidence.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = value => Buffer.from(JSON.stringify(value));

// Synthetic only. Independent copies allow each owning-boundary test to mutate
// one observation without changing the trusted expected observation alongside it.
export function ciEvidenceFixture() {
  const expectedIdentity = { schema: 'BuildIdentityV1', baseCommit: 'a'.repeat(40),
    includedUncommittedLocalChanges: false, sourceSnapshotDigestSha256: 'b'.repeat(64) };
  const expectedModules = { server: ['server/auth.test.ts'], client: ['client/theme.test.ts'] };
  const raw = { schema: 'MeteorTestRunEvidenceV1', exitStatus: 0, environments: ['server', 'client'].map(side => ({
    schema: 'MeteorEnvironmentEvidenceV1', side, modules: expectedModules[side],
    tests: [{ id: 'c'.repeat(64), outcome: 'passed' }, { id: 'd'.repeat(64), outcome: 'pending' }],
    hookFailures: 0, counts: { passed: 1, failed: 0, pending: 1 },
  })) };
  const observation = { state: 'test-inputs-verified-unqualified', identity: expectedIdentity,
    testInputContractDigestSha256: digest(JSON.stringify(TEST_INPUTS)), supplementalDigestSha256: 'e'.repeat(64) };
  const runBytes = bytes(raw);
  const joined = bindMeteorEvidence(runBytes, observation, expectedModules,
    { repository: 'memphis-iis/MoFaCTS', commit: expectedIdentity.baseCommit, runId: '101', runAttempt: '1' });
  const repo = { id: 20, full_name: 'memphis-iis/MoFaCTS', ignored_private_field: 'sensitive owner value' };
  const ciWorkflow = { id: 30, path: '.github/workflows/ci.yml', state: 'active' };
  const securityWorkflow = { id: 31, path: '.github/workflows/security.yml', state: 'active' };
  const makeRun = (id, workflow) => ({ id, run_attempt: 1, workflow_id: workflow.id, path: workflow.path,
    status: 'completed', conclusion: 'success', event: 'push', head_branch: 'main',
    head_sha: expectedIdentity.baseCommit, repository: { ...repo }, head_repository: { ...repo } });
  const ciRun = makeRun(101, ciWorkflow);
  const securityRun = makeRun(102, securityWorkflow);
  const jobs = (run, names) => ({ total_count: names.length, jobs: names.map((name, index) => ({
    id: run.id * 10 + index, name, run_id: run.id, run_attempt: run.run_attempt, head_sha: run.head_sha,
    status: 'completed', conclusion: 'success', ignored_secret: 'sensitive job value',
  })) });
  const archiveDigestSha256 = 'f'.repeat(64);
  const artifact = { id: 200, name: 'source-observation-101-1', digest: `sha256:${archiveDigestSha256}`,
    expired: false, size_in_bytes: 500, workflow_run: { id: 101, repository_id: 20,
      head_repository_id: 20, head_branch: 'main', head_sha: expectedIdentity.baseCommit } };
  return { expectedObservation: structuredClone(observation), expectedModules, ciWorkflow, ciRun,
    ciJobs: jobs(ciRun, ['lint-test-and-image']), securityWorkflow, securityRun,
    securityJobs: jobs(securityRun, ['Secret Scan (gitleaks)', 'Security surface and scanner contracts',
      'Dependency audit (application)', 'Dependency audit (Mongo sidecar)']),
    artifact, archiveDigestSha256, archiveSizeBytes: 500,
    files: Object.fromEntries([[CI_EVIDENCE_FILES[0], bytes(observation)], [CI_EVIDENCE_FILES[1], runBytes],
      [CI_EVIDENCE_FILES[2], bytes(joined)]]),
  };
}
