import { ACTIVE_AUDIT_CATALOG, readAuditCatalog, profileControls } from '../../../../common/securityAudit/catalogRegistry.ts';
import { expectedAuditProducers } from '../../../../common/securityAudit/producerArtifact.ts';
import { assembleAuditReportV2 } from '../../core/assembleV2.mjs';

export const missingIdentity = { state: 'unavailable', reason: 'not-provided' };
export const revision = { state: 'observed', value: 'a'.repeat(40) };
export const platformImage = { state: 'observed', value: `registry.example/mofacts@sha256:${'b'.repeat(64)}` };
export const envelope = {
  reportId: 'synthetic-v2-report', reportType: 'full', target: 'https://audit.example',
  startedAt: '2026-11-05T12:00:00.000Z', completedAt: '2026-11-05T12:01:00.000Z',
  scannerSourceRevision: 'c'.repeat(40), deployedApplicationRevision: missingIdentity,
  deployedImageDigest: missingIdentity, toolVersions: { node: '24.22.1' },
};
export const ingestionContext = {
  purpose: 'ingestion', targetOrigin: 'https://audit.example',
  authenticatedAt: '2026-11-05T12:02:00.000Z', uploadedAt: '2026-11-05T12:02:00.000Z',
  receiverRevision: missingIdentity, receiverImage: missingIdentity,
};
export async function errorArtifacts(profile = 'full') {
  const catalog = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
  return expectedAuditProducers(catalog, profile).map(producerId => {
    const definitions = profileControls(catalog, profile).filter(row => row.producerId === producerId);
    return { producerId, artifact: { artifactSchema: 'MoFaCTSSecurityAuditProducerArtifactV1',
      producerId, sectionId: definitions[0].sectionId, controls: definitions.map(row => ({
        controlId: row.controlId, status: 'ERROR', evidence: {
          summary: 'Synthetic contract qualification does not establish a security property.',
          category: 'synthetic-contract-qualification',
        },
      })) } };
  });
}
export async function errorReport(profile = 'full') {
  return assembleAuditReportV2({ ...envelope, reportType: profile, artifacts: await errorArtifacts(profile) });
}
