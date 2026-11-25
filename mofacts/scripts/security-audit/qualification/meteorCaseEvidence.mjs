import { createHash } from 'node:crypto';
import { AUDIT_VERIFICATIONS } from '../../../common/securityAudit/verificationCatalog.ts';
import { contentDigest } from '../../../common/securityAudit/proofFields.ts';
import { auditDigest } from '../../../common/securityAudit/canonicalReport.ts';
import meteorEvidence from '../../meteorTestEvidence.cjs';

const { MAX_BYTES, validateRun } = meteorEvidence;
const declared = new Map(AUDIT_VERIFICATIONS.filter(entry => entry.kind === 'integrationTest' && entry.lane === 'meteor')
  .map(entry => [entry.verificationId, entry]));

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// This is the MeteorEnvironmentEvidenceV1 identity format emitted by
// meteorEvidenceReporter.mjs. No raw test titles enter the resulting proof.
function caseId(side, suite, name, occurrence) {
  return hash(JSON.stringify([side, JSON.stringify([suite, name]), occurrence]));
}

export async function observeMeteorCaseEvidence(runBytes, expectedModules, receiptDigest, requestedIds) {
  if (!Buffer.isBuffer(runBytes) || runBytes.length < 1 || runBytes.length > MAX_BYTES * 2 ||
      hash(runBytes) !== contentDigest(receiptDigest)) throw Error('Meteor case evidence does not match the retained run digest');
  if (!Array.isArray(requestedIds) || requestedIds.length < 1 || requestedIds.length > declared.size ||
      new Set(requestedIds).size !== requestedIds.length || requestedIds.some(id => !declared.has(id))) {
    throw Error('Unexpected Meteor verification ID selection');
  }
  const run = validateRun(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(runBytes)), expectedModules);
  const outcomes = run.environments.map(({ side, tests }) => ({ side, byId: new Map(tests.map(row => [row.id, row.outcome])) }));
  const executions = [];
  const unresolved = [];
  for (const verificationId of [...requestedIds].sort()) {
    const { suite, cases } = declared.get(verificationId);
    const evidence = [];
    let reason;
    for (const name of cases) {
      const matches = [];
      for (const { side, byId } of outcomes) {
        const id = caseId(side, suite, name, 0);
        if (byId.has(id)) matches.push({ side, id, outcome: byId.get(id) });
        if (byId.has(caseId(side, suite, name, 1))) reason = 'ambiguous-case';
      }
      if (matches.length > 1) reason = 'ambiguous-case';
      if (reason) break;
      if (matches.length === 0) { reason = 'missing-case'; break; }
      if (matches[0].outcome !== 'passed') { reason = 'case-did-not-pass'; break; }
      evidence.push(matches[0]);
    }
    if (reason || !evidence.length) {
      unresolved.push({ verificationId, reason: reason ?? 'missing-case' });
      continue;
    }
    executions.push({
      verificationId, lane: 'isolated-meteor', outcome: 'PASS', runEvidenceSha256: receiptDigest,
      resultEvidenceSha256: await auditDigest(evidence),
    });
  }
  return { executions, unresolved };
}
