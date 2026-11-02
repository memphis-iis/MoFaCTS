import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseBuildIdentity } from '../common/securityAudit/buildIdentity.ts';
import { contentDigest } from '../common/securityAudit/proofFields.ts';
import { discoverTestModules, validateRun, MAX_BYTES } from './meteorTestEvidence.cjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function readBounded(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES * 2) {
    throw new Error('Invalid Meteor evidence input');
  }
  const bytes = fs.readFileSync(file);
  if (bytes.length > MAX_BYTES * 2) throw new Error('Oversized Meteor evidence input');
  return bytes;
}

export function bindMeteorEvidence(runBytes, observation, expectedModules, ci) {
  if (observation?.state !== 'test-inputs-verified-unqualified') throw new Error('Source verification required');
  const source = parseBuildIdentity(observation.identity);
  if (source.includedUncommittedLocalChanges || source.baseCommit !== ci.commit
    || typeof ci.repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(ci.repository)
    || typeof ci.runId !== 'string' || !/^[1-9]\d{0,19}$/.test(ci.runId)
    || typeof ci.runAttempt !== 'string' || !/^[1-9]\d{0,5}$/.test(ci.runAttempt)) {
    throw new Error('Meteor evidence requires matching clean source and CI coordinates');
  }
  const run = validateRun(JSON.parse(runBytes.toString('utf8')), expectedModules);
  return {
    schema: 'SourceMeteorTestEvidenceV1',
    state: run.environments.some(item => item.counts.pending) ? 'completed-with-pending' : 'completed',
    qualification: 'unqualified',
    source,
    testInputContractDigestSha256: contentDigest(observation.testInputContractDigestSha256),
    supplementalDigestSha256: contentDigest(observation.supplementalDigestSha256),
    runEvidenceDigestSha256: digest(runBytes),
    ci: { repository: ci.repository, commit: ci.commit, runId: ci.runId, runAttempt: ci.runAttempt },
    run,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [runFile, sourceFile, outputFile, testedApp] = process.argv.slice(2);
  if (!runFile || !sourceFile || !outputFile || !testedApp || process.argv.length !== 6) {
    throw new Error('Usage: recordMeteorTestEvidence.mjs RUN SOURCE OUTPUT TESTED_APP');
  }
  const result = bindMeteorEvidence(readBounded(runFile), JSON.parse(readBounded(sourceFile)),
    discoverTestModules(testedApp), {
      repository: process.env.GITHUB_REPOSITORY, commit: process.env.GITHUB_SHA,
      runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    });
  fs.writeFileSync(outputFile, `${JSON.stringify(result)}\n`, { flag: 'wx', mode: 0o600 });
}
