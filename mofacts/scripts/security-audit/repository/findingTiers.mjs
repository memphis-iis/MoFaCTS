import { profileControls } from '../../../common/securityAudit/catalogRegistry.ts';
import { parseAuditProducerArtifact } from '../../../common/securityAudit/producerArtifact.ts';

const GROUPS = new Map([
  ['application-runtime', 'repository.dependencies-application-runtime'],
  ['application-development', 'repository.dependencies-application-development'],
  ['sidecar-mongo-runtime', 'repository.dependencies-sidecar-mongo-runtime'],
  ['sidecar-mongo-development', 'repository.dependencies-sidecar-mongo-development'],
  ['runtime-image', 'repository.runtime-image-vulnerabilities'],
]);
const SEVERITIES = { info: 'INFO', low: 'LOW', moderate: 'MEDIUM', high: 'HIGH', critical: 'CRITICAL' };

// Acquisition supplies reviewed build exposures only for development groups;
// unconfirmed development advisories remain maintenance data, never FAIL inputs.
export function evaluateFindingTiers(catalog, profile, group, findings) {
  const prefix = GROUPS.get(group);
  if (!prefix || !Array.isArray(findings) || findings.length > 10000
    || findings.some(row => !row || Object.keys(row).length !== 1 || !Object.hasOwn(SEVERITIES, row.severity))) {
    throw new Error('Invalid repository finding observations');
  }
  const definitions = profileControls(catalog, profile).filter(row => row.producerId === 'repository'
    && row.controlId.startsWith(`${prefix}.`));
  if (!definitions.length) throw new Error('Repository finding group is not scheduled');
  const impacts = findings.map(row => {
    // Preserve V1's explicit runtime dependency branch: INFO advisories were
    // included in its LOW bucket. Development exposures retain the INFO bucket.
    const impact = SEVERITIES[row.severity];
    return group.endsWith('-runtime') && impact === 'INFO' ? 'LOW' : impact;
  });
  if (impacts.some(impact => !definitions.some(row => row.failureSeverity === impact))) {
    throw new Error('Finding impact is outside the scheduled catalog group');
  }
  return definitions.map(definition => {
    const findingCount = impacts.filter(impact => impact === definition.failureSeverity).length;
    return { controlId: definition.controlId, status: findingCount ? 'FAIL' : 'PASS',
      evidence: { summary: 'The inspected finding inventory was classified into its fixed impact tier.',
        metrics: { evaluatedCount: findings.length, findingCount } } };
  });
}

export function repositoryFindingArtifact(catalog, profile, controls) {
  return parseAuditProducerArtifact({ artifactSchema: 'MoFaCTSSecurityAuditProducerArtifactV1',
    producerId: 'repository', sectionId: 'repository', controls }, catalog, profile, 'repository');
}
