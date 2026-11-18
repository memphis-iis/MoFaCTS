import { expect } from 'chai';
import fixture from './catalogs/control-catalog.v1.json' with { type: 'json' };
import { ACTIVE_AUDIT_CATALOG, AUDIT_CATALOG_V1, AUDIT_SECTION_IDS, profileControls, readAuditCatalog } from './catalogRegistry.ts';
import { auditDigest } from './canonicalReport.ts';
import { parseAuditProducerArtifact } from './producerArtifact.ts';
import { parseAuditEvidence } from './evidenceContracts.ts';
import { auditSectionStatus, finalizeAuditReport, parseSecurityAuditReportV2, type AuditReportSection } from './reportV2.ts';

// Supported Meteor test discovery must exercise the exact Node-imported modules.
// This test does not register a method/route or activate V2 report ingestion.
describe('V2 catalog shared Node/Meteor parity', function() {
  it('preserves confirmed UDP failure without inventing host measurements', async function() {
    const catalog = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
    const evidence = { summary: 'A synthetic public UDP service response was confirmed.',
      metrics: { observedResultCount: 1, expectedResultCount: 7, openSelectedUdpPortCount: 1 } };
    const artifact = parseAuditProducerArtifact({ artifactSchema: 'MoFaCTSSecurityAuditProducerArtifactV1',
      producerId: 'composite-exposure', sectionId: 'external', controls: [{ controlId: 'external.public-udp-ports', status: 'FAIL', evidence }] },
    catalog, 'full', 'composite-exposure');
    expect(artifact.controls[0]!.evidence).to.deep.equal(evidence);
    expect(() => parseAuditEvidence('udp-exposure-v1', 'PASS', evidence)).to.throw();
    expect(() => parseAuditEvidence('udp-exposure-v1', 'FAIL', { ...evidence,
      metrics: { ...evidence.metrics, openSelectedUdpPortCount: 0 } })).to.throw();
  });
  it('loads JSON import attributes and matches the fixed catalog digest', async function() {
    const catalog = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
    expect(await auditDigest(fixture)).to.equal('6a9cd0c985bdec14b0d78d2b731975005ed8cd69e76bb7597c8ada2564ba688d');
    expect(profileControls(catalog, 'full')).to.have.length(70);
    expect(profileControls(catalog, 'exposure')).to.have.length(23);
    expect(catalog.profiles.exposure.authentication).to.deep.equal([]);
  });

  it('uses the same producer contract and rejects missing controls under Meteor', async function() {
    const catalog = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
    const controls = profileControls(catalog, 'full').filter(row => row.producerId === 'composite-exposure').map(row => ({
      controlId: row.controlId, status: 'ERROR',
      evidence: { summary: 'Synthetic contract qualification.', category: 'synthetic-contract-qualification' },
    }));
    const artifact = { artifactSchema: 'MoFaCTSSecurityAuditProducerArtifactV1', producerId: 'composite-exposure', sectionId: 'external', controls };
    expect(parseAuditProducerArtifact(artifact, catalog, 'full', 'composite-exposure').controls).to.have.length(1);
    expect(() => parseAuditProducerArtifact({ ...artifact, controls: [] }, catalog, 'full', 'composite-exposure')).to.throw();
  });

  it('accepts catalog v2 for new reports and keeps catalog v1 readable', async function() {
    expect(ACTIVE_AUDIT_CATALOG.catalogVersion).to.equal(2);
    expect(ACTIVE_AUDIT_CATALOG.catalogDigestSha256).to.equal('00825a1d183e3b1b3d1014273e49c3f1de17c3bd0a8207299e5778d4c44e5ac4');
    const active = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
    expect(active.profiles.full.authentication).to.have.length(22);
    expect(active.profiles.full.authentication).to.include('authentication.passwordless.experiment-eligibility');
    const historical = await readAuditCatalog(AUDIT_CATALOG_V1, 'retained');
    expect(historical.profiles.full.authentication).to.include('authentication.passwordless.experiment-flag');
    const obsoleteIngestionAccepted = await readAuditCatalog(AUDIT_CATALOG_V1, 'ingestion').then(() => true, () => false);
    expect(obsoleteIngestionAccepted).to.equal(false);
  });

  it('records the same complete ERROR report without inventing image identity', async function() {
    const catalog = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
    const sections = {} as Record<typeof AUDIT_SECTION_IDS[number], AuditReportSection>;
    for (const sectionId of AUDIT_SECTION_IDS) {
      const controls = catalog.profiles.full[sectionId].map(id => {
        const definition = catalog.controls.find(row => row.controlId === id)!;
        return { controlId: id, title: definition.title, failureSeverity: definition.failureSeverity,
          status: 'ERROR' as const, evidence: { summary: 'Synthetic contract qualification.', category: 'synthetic-contract-qualification' as const } };
      });
      sections[sectionId] = { sectionId, status: auditSectionStatus(controls), controls };
    }
    const missing = { state: 'unavailable', reason: 'not-provided' } as const;
    const report = await finalizeAuditReport({ schema: 'SecurityAuditReportV2', ...ACTIVE_AUDIT_CATALOG,
      reportId: 'synthetic-meteor-v2-parity', reportType: 'full', target: 'https://audit.example',
      startedAt: '2026-11-05T12:00:00.000Z', completedAt: '2026-11-05T12:01:00.000Z',
      scannerSourceRevision: 'a'.repeat(40), deployedApplicationRevision: missing, deployedImageDigest: missing,
      toolVersions: {}, sections, executionErrors: ['synthetic-contract-qualification'] });
    expect((await parseSecurityAuditReportV2(report, { purpose: 'retained' })).counts.error).to.equal(70);
    expect(report.counts.pass).to.equal(0);
  });
});
