import path from 'node:path';
import { ACTIVE_AUDIT_CATALOG, readAuditCatalog, profileControls } from '../../../common/securityAudit/catalogRegistry.ts';
import { canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { evaluateAuthorizationVerifications } from '../../../common/securityAudit/authorizationVerification.ts';
import { parseAuditProducerArtifact } from '../../../common/securityAudit/producerArtifact.ts';
import { proofRecord } from '../../../common/securityAudit/proofFields.ts';
import { parseAuditFileV2, readAuditFileV2, writeAuditProducerFileV2 } from '../core/producerFilesV2.mjs';

// P1-D8 moves only the selected authorization cases into Phase 1. Other
// protocol scenarios remain explicitly unacquired until their Phase 2 owners
// supply typed evidence. A complete artifact is not an all-green qualification.
export function evaluateSelectedAuthenticationV2(catalog, observation) {
  let selected;
  try {
    const row = proofRecord(observation, ['status', 'metrics', 'results']);
    if (!Array.isArray(row.results)) throw new Error();
    selected = evaluateAuthorizationVerifications(row.results.map(result => {
      const item = proofRecord(result, ['verificationId', 'outcome', 'status']);
      return { verificationId: item.verificationId, outcome: item.outcome };
    }));
    if (canonicalAuditJson(selected) !== canonicalAuditJson(row)) throw new Error();
  } catch { selected = undefined; }
  const controls = profileControls(catalog, 'full').filter(row => row.producerId === 'authentication').map(definition => {
    if (definition.controlId !== 'authentication.authorization') return { controlId: definition.controlId, status: 'ERROR',
      evidence: { category: 'evidence-incomplete', summary: 'This protocol scenario remains in Phase 2 and was not acquired by the selected Phase 1 qualification.' } };
    if (!selected || selected.status === 'ERROR') return { controlId: definition.controlId, status: 'ERROR',
      evidence: { category: selected || observation === undefined ? 'evidence-incomplete' : 'producer-malformed', summary: 'Selected authorization cases did not establish complete typed execution with successful required baselines.' } };
    return { controlId: definition.controlId, status: selected.status, evidence: {
      summary: selected.status === 'PASS' ? 'Every selected authorization case matched its source-owned policy and required successful baseline.'
        : 'Complete typed execution proved a selected authorization policy violation.', metrics: selected.metrics } };
  });
  return parseAuditProducerArtifact({ artifactSchema: 'MoFaCTSSecurityAuditProducerArtifactV1', producerId: 'authentication', sectionId: 'authentication', controls }, catalog, 'full', 'authentication');
}

export async function writeSelectedAuthenticationProducerFileV2({ observationPath, artifactDirectory }) {
  const catalog = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
  let observation;
  try { observation = parseAuditFileV2(await readAuditFileV2(observationPath)); }
  catch (error) { observation = error.code === 'ENOENT' ? undefined : null; }
  const artifact = evaluateSelectedAuthenticationV2(catalog, observation);
  await writeAuditProducerFileV2({ file: path.join(artifactDirectory, 'authentication.json'), artifact, catalog, profile: 'full', producerId: 'authentication' });
  return artifact;
}
