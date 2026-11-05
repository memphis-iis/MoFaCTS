import { profileControls, type AuditCatalog, type AuditReportType, type AuditSectionId } from './catalogRegistry.ts';
import { parseAuditEvidence, type AuditControlStatus, type AuditEvidence } from './evidenceContracts.ts';
import { proofRecord } from './proofFields.ts';

export type AuditProducerControl = { controlId: string; status: AuditControlStatus; evidence: AuditEvidence };
export type AuditProducerArtifact = {
  artifactSchema: 'MoFaCTSSecurityAuditProducerArtifactV1';
  producerId: string; sectionId: AuditSectionId; controls: AuditProducerControl[];
};

export function expectedAuditProducers(catalog: AuditCatalog, profile: AuditReportType): readonly string[] {
  return [...new Set(profileControls(catalog, profile).map(control => control.producerId))];
}

export function parseAuditProducerArtifact(value: unknown, catalog: AuditCatalog,
  profile: AuditReportType, producerId: string): AuditProducerArtifact {
  const expected = profileControls(catalog, profile).filter(control => control.producerId === producerId);
  const record = proofRecord(value, ['artifactSchema', 'producerId', 'sectionId', 'controls']);
  if (!expected.length || record.artifactSchema !== 'MoFaCTSSecurityAuditProducerArtifactV1'
    || record.producerId !== producerId || record.sectionId !== expected[0]!.sectionId
    || !Array.isArray(record.controls) || record.controls.length !== expected.length) {
    throw new Error('Invalid audit producer artifact');
  }
  // Validate the array before mapping IDs. A duplicate cannot replace a prior
  // failure, and an unexpected result cannot silently disappear in a join.
  const seen = new Set<string>();
  const controls = record.controls.map(value => {
    const row = proofRecord(value, ['controlId', 'status', 'evidence']);
    const definition = expected.find(control => control.controlId === row.controlId);
    if (!definition || seen.has(definition.controlId)
      || !['PASS', 'FAIL', 'ERROR'].includes(String(row.status))) throw new Error('Invalid audit producer control');
    seen.add(definition.controlId);
    const status = row.status as AuditControlStatus;
    return { controlId: definition.controlId, status,
      evidence: parseAuditEvidence(definition.evidenceContract, status, row.evidence) };
  });
  return { artifactSchema: 'MoFaCTSSecurityAuditProducerArtifactV1', producerId,
    sectionId: expected[0]!.sectionId, controls };
}
