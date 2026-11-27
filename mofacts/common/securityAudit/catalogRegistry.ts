import catalogV1 from './catalogs/control-catalog.v1.json' with { type: 'json' };
import catalogV2 from './catalogs/control-catalog.v2.json' with { type: 'json' };
import catalogV3 from './catalogs/control-catalog.v3.json' with { type: 'json' };
import { auditDigest } from './canonicalReport.ts';
import { auditText, hasEvidenceContract } from './evidenceContracts.ts';
import { contentDigest, proofRecord, proofString } from './proofFields.ts';

export const AUDIT_SECTION_IDS = ['external', 'authentication', 'internal', 'repository'] as const;
export const AUDIT_FAILURE_SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type AuditSectionId = typeof AUDIT_SECTION_IDS[number];
export type AuditFailureSeverity = typeof AUDIT_FAILURE_SEVERITIES[number];
export type AuditReportType = 'exposure' | 'full';
export type AuditControlDefinition = Readonly<{
  controlId: string; sectionId: AuditSectionId; title: string;
  failureSeverity: AuditFailureSeverity; producerId: string; evidenceContract: string;
  standardsReferences: readonly string[];
}>;
export type AuditCatalog = Readonly<{
  catalogSchema: 'MoFaCTSSecurityAuditControlCatalogV1'; catalogId: string; catalogVersion: number;
  controls: readonly AuditControlDefinition[];
  profiles: Readonly<Record<AuditReportType, Readonly<Record<AuditSectionId, readonly string[]>>>>;
}>;
export type AuditCatalogCoordinates = Readonly<{
  catalogId: string; catalogVersion: number; catalogDigestSha256: string;
}>;

const identifier = (value: unknown): string => proofString(value, /^[a-z][a-z0-9.-]*(?![\s\S])/, 120);
function reject(): never { throw new Error('Invalid audit control catalog'); }

export function parseAuditCatalog(value: unknown): AuditCatalog {
  const record = proofRecord(value, ['catalogSchema', 'catalogId', 'catalogVersion', 'controls', 'profiles']);
  if (record.catalogSchema !== 'MoFaCTSSecurityAuditControlCatalogV1'
    || !Number.isSafeInteger(record.catalogVersion) || Number(record.catalogVersion) < 1
    || Number(record.catalogVersion) > 10000 || !Array.isArray(record.controls)
    || record.controls.length < 1 || record.controls.length > 512) reject();
  const ids = new Set<string>();
  const producerSections = new Map<string, AuditSectionId>();
  const controls = record.controls.map((value): AuditControlDefinition => {
    const row = proofRecord(value, ['controlId', 'sectionId', 'title', 'failureSeverity', 'producerId', 'evidenceContract', 'standardsReferences']);
    const controlId = identifier(row.controlId);
    const sectionId = row.sectionId as AuditSectionId;
    const failureSeverity = row.failureSeverity as AuditFailureSeverity;
    const producerId = identifier(row.producerId);
    const evidenceContract = identifier(row.evidenceContract);
    if (ids.has(controlId) || !AUDIT_SECTION_IDS.includes(sectionId)
      || !controlId.startsWith(`${sectionId}.`) || !AUDIT_FAILURE_SEVERITIES.includes(failureSeverity)
      || !hasEvidenceContract(evidenceContract) || !Array.isArray(row.standardsReferences)
      || row.standardsReferences.length > 12) reject();
    const previousSection = producerSections.get(producerId);
    if (previousSection && previousSection !== sectionId) reject();
    producerSections.set(producerId, sectionId);
    ids.add(controlId);
    const references = row.standardsReferences.map(entry => auditText(entry, 160));
    if (new Set(references).size !== references.length) reject();
    return Object.freeze({ controlId, sectionId, title: auditText(row.title, 180), failureSeverity,
      producerId, evidenceContract, standardsReferences: Object.freeze(references) });
  });
  const rawProfiles = proofRecord(record.profiles, ['exposure', 'full']);
  const profiles = {} as Record<AuditReportType, Readonly<Record<AuditSectionId, readonly string[]>>>;
  for (const profile of ['exposure', 'full'] as const) {
    const rawSections = proofRecord(rawProfiles[profile], AUDIT_SECTION_IDS);
    const sections = {} as Record<AuditSectionId, readonly string[]>;
    const scheduled = new Set<string>();
    for (const sectionId of AUDIT_SECTION_IDS) {
      const entries = rawSections[sectionId];
      if (!Array.isArray(entries) || entries.length > 512) reject();
      sections[sectionId] = Object.freeze(entries.map((value): string => {
        const id = identifier(value);
        const definition = controls.find(row => row.controlId === id);
        if (!definition || definition.sectionId !== sectionId || scheduled.has(id)) reject();
        scheduled.add(id);
        return id;
      }));
    }
    if (profile === 'full' && scheduled.size !== controls.length) reject();
    profiles[profile] = Object.freeze(sections);
  }
  return Object.freeze({ catalogSchema: 'MoFaCTSSecurityAuditControlCatalogV1',
    catalogId: identifier(record.catalogId), catalogVersion: Number(record.catalogVersion),
    controls: Object.freeze(controls), profiles: Object.freeze(profiles) });
}

// Keep released bytes and validators available for retained reports. Producers
// use ACTIVE_AUDIT_CATALOG. The receiver can select a registered catalog at
// composition time for isolated report storage qualification.
export const AUTHENTICATION_QUALIFICATION_CATALOG = parseAuditCatalog(catalogV2);
export const REPRODUCIBLE_QUALIFICATION_CATALOG = parseAuditCatalog(catalogV3);
const retained = Object.freeze([Object.freeze({
  catalog: parseAuditCatalog(catalogV1),
  digest: '6a9cd0c985bdec14b0d78d2b731975005ed8cd69e76bb7597c8ada2564ba688d',
}), Object.freeze({
  catalog: AUTHENTICATION_QUALIFICATION_CATALOG,
  digest: '00825a1d183e3b1b3d1014273e49c3f1de17c3bd0a8207299e5778d4c44e5ac4',
}), Object.freeze({
  catalog: REPRODUCIBLE_QUALIFICATION_CATALOG,
  digest: '38812fb9bd06a62634db20d69295cd46f82d417e3edc525ded0758bfa77fca12',
})]);
export const AUDIT_CATALOG_V1: AuditCatalogCoordinates = Object.freeze({
  catalogId: 'mofacts-security-audit-controls', catalogVersion: 1,
  catalogDigestSha256: retained[0]!.digest,
});
export const AUDIT_CATALOG_V2: AuditCatalogCoordinates = Object.freeze({
  catalogId: AUTHENTICATION_QUALIFICATION_CATALOG.catalogId,
  catalogVersion: AUTHENTICATION_QUALIFICATION_CATALOG.catalogVersion,
  catalogDigestSha256: retained[1]!.digest,
});
export const AUDIT_CATALOG_V3: AuditCatalogCoordinates = Object.freeze({
  catalogId: REPRODUCIBLE_QUALIFICATION_CATALOG.catalogId,
  catalogVersion: REPRODUCIBLE_QUALIFICATION_CATALOG.catalogVersion,
  catalogDigestSha256: retained[2]!.digest,
});
// The scheduled producer remains on its released catalog until its own
// coordinated cutover. Receiver selection is owned explicitly by the server
// composition, so accepting V3 does not silently reinterpret V1 producers.
export const ACTIVE_AUDIT_CATALOG = AUDIT_CATALOG_V1;

export async function readAuditCatalog(value: unknown, purpose: 'ingestion' | 'retained',
  acceptedCatalog: AuditCatalogCoordinates = ACTIVE_AUDIT_CATALOG): Promise<AuditCatalog> {
  const record = proofRecord(value, ['catalogId', 'catalogVersion', 'catalogDigestSha256']);
  const digest = contentDigest(record.catalogDigestSha256);
  if (purpose !== 'ingestion' && purpose !== 'retained') reject();
  const entry = retained.find(item => item.catalog.catalogId === record.catalogId
    && item.catalog.catalogVersion === record.catalogVersion && item.digest === digest);
  if (!entry || (purpose === 'ingestion' && (record.catalogId !== acceptedCatalog.catalogId
    || record.catalogVersion !== acceptedCatalog.catalogVersion || digest !== acceptedCatalog.catalogDigestSha256))
    || await auditDigest(entry.catalog) !== entry.digest) reject();
  return entry.catalog;
}

export function profileControls(catalog: AuditCatalog, profile: AuditReportType): readonly AuditControlDefinition[] {
  if (profile !== 'exposure' && profile !== 'full') throw new Error('Unsupported audit report profile');
  const definitions = new Map(catalog.controls.map(row => [row.controlId, row]));
  return AUDIT_SECTION_IDS.flatMap(sectionId => catalog.profiles[profile][sectionId].map(id => definitions.get(id)!));
}
