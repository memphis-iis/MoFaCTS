import { ACTIVE_AUDIT_CATALOG, AUDIT_SECTION_IDS, readAuditCatalog } from '../../../common/securityAudit/catalogRegistry.ts';
import { expectedAuditProducers, parseAuditProducerArtifact } from '../../../common/securityAudit/producerArtifact.ts';
import { auditSectionStatus, finalizeAuditReport, parseSecurityAuditReportV2 } from '../../../common/securityAudit/reportV2.ts';

// Named recovery boundary: a missing/invalid slot invalidates that producer's
// entire catalog-owned subset. It cannot repair an already assembled report.
export async function assembleAuditReportV2({ artifacts, ...envelope }) {
  const catalog = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
  const producers = expectedAuditProducers(catalog, envelope.reportType);
  if (!Array.isArray(artifacts) || artifacts.length > producers.length * 2
    || artifacts.some(slot => !slot || Object.keys(slot).length !== 2
      || !Object.hasOwn(slot, 'producerId') || !Object.hasOwn(slot, 'artifact')
      || !producers.includes(slot.producerId))) throw new Error('Invalid V2 assembly inputs');
  const executionErrors = new Set();
  const results = [];
  for (const producerId of producers) {
    const slots = artifacts.filter(slot => slot.producerId === producerId);
    let parsed;
    const category = slots.length === 0 ? 'producer-missing' : 'producer-malformed';
    if (slots.length === 1) {
      try { parsed = parseAuditProducerArtifact(slots[0].artifact, catalog, envelope.reportType, producerId); }
      catch { /* Raw output is discarded; no untrusted diagnostic is retained. */ }
    }
    if (parsed) {
      results.push(...parsed.controls);
      for (const row of parsed.controls) if (row.status === 'ERROR') executionErrors.add(row.evidence.category);
    } else {
      executionErrors.add(category);
      for (const definition of catalog.controls.filter(row => row.producerId === producerId
        && catalog.profiles[envelope.reportType][row.sectionId].includes(row.controlId))) {
        results.push({ controlId: definition.controlId, status: 'ERROR',
          evidence: { category, summary: 'Producer output did not satisfy its complete catalog contract.' } });
      }
    }
  }
  const byId = new Map(results.map(row => [row.controlId, row]));
  const definitions = new Map(catalog.controls.map(row => [row.controlId, row]));
  const sections = Object.fromEntries(AUDIT_SECTION_IDS.map(sectionId => {
    const controls = catalog.profiles[envelope.reportType][sectionId].map(id => ({
      ...byId.get(id), title: definitions.get(id).title, failureSeverity: definitions.get(id).failureSeverity,
    }));
    return [sectionId, { sectionId, status: auditSectionStatus(controls), controls }];
  }));
  const report = await finalizeAuditReport({ ...envelope, schema: 'SecurityAuditReportV2', ...ACTIVE_AUDIT_CATALOG,
    sections, executionErrors: [...executionErrors] });
  // Use the same strict parser as the receiver. Invalid identity/envelope data
  // is rejected here; assembly never guesses identities or control policy.
  return parseSecurityAuditReportV2(report, { purpose: 'retained' });
}
