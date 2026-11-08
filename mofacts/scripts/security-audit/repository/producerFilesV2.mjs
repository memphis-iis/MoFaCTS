import fs from 'node:fs/promises';
import path from 'node:path';
import { ACTIVE_AUDIT_CATALOG, readAuditCatalog, profileControls } from '../../../common/securityAudit/catalogRegistry.ts';
import { expectedAuditProducers } from '../../../common/securityAudit/producerArtifact.ts';
import { parseAuditIdentity } from '../../../common/securityAudit/reportIdentity.ts';
import { proofRecord } from '../../../common/securityAudit/proofFields.ts';
import { parseCiEvidenceJson } from '../qualification/ciEvidence.mjs';
import { readCiFile, realDirectory } from '../qualification/collectCiEvidence.mjs';
import { writeAuditProducerFileV2 } from '../core/producerFilesV2.mjs';
import { repositoryToolEnvironmentV2 } from './commandV2.mjs';
import { parseClientBundleCanariesV2 } from './clientBundleCanariesV2.mjs';
import { repositoryFindingGroups } from './findingTiers.mjs';
import { repositoryImageAvailabilityV2, evaluateRepositoryObservationsV2 } from './observationsV2.mjs';
import { acquireRepositoryToolObservationsV2 } from './acquireV2.mjs';
import { acquireRepositorySourceObservationsV2, REPOSITORY_SOURCE_CONTROLS_V2 } from './sourceV2.mjs';
import { observeImageCanariesV2 } from './imageCanariesV2.mjs';

const invalid = () => { throw new Error('Repository V2 artifact emission did not complete'); };
const unavailable = reason => ({ state: 'unavailable', reason });
const canaryControl = 'repository.client-bundle-canaries';

function capturedImageContext(context) {
  const fields = ['deployedApplicationRevision', 'deployedImageDigest', 'AUDIT_RUNTIME_IMAGE'];
  if (context !== undefined && (!context || typeof context !== 'object' || Array.isArray(context)
    || Object.keys(context).some(name => !fields.includes(name)))) invalid();
  const captured = { AUDIT_RUNTIME_IMAGE: typeof context?.AUDIT_RUNTIME_IMAGE === 'string' ? context.AUDIT_RUNTIME_IMAGE : undefined };
  for (const [field, kind] of [['deployedApplicationRevision', 'revision'], ['deployedImageDigest', 'platform-image']]) {
    try { captured[field] = Object.freeze(parseAuditIdentity(context?.[field], kind)); }
    catch { captured[field] = undefined; }
  }
  return Object.freeze(captured);
}

async function requireAbsent(file) {
  try { await fs.lstat(file); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error('Repository V2 output already exists');
}

// Explicit, unscheduled orchestration. Actual invocation performs the selected
// repository tools/source suite and (only with usable identity/canaries) Docker.
// It never loads complete auth fixtures, signs/uploads reports or qualifies a
// release. Image-context provenance remains independently owned by its caller.
export async function writeRepositoryProducerFileV2({ profile, artifactDirectory, repositoryDirectory,
  environment, imageContext, canaries }, dependencies = {
  tools: acquireRepositoryToolObservationsV2, source: acquireRepositorySourceObservationsV2, image: observeImageCanariesV2,
}) {
  proofRecord(dependencies, ['tools', 'source', 'image']);
  if (Object.values(dependencies).some(value => typeof value !== 'function')) invalid();
  const env = repositoryToolEnvironmentV2(environment), context = capturedImageContext(imageContext);
  let selectedCanaries;
  try { selectedCanaries = parseClientBundleCanariesV2(canaries); }
  catch { /* The single canary control owns missing/invalid subset configuration. */ }
  const catalog = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
  if (!expectedAuditProducers(catalog, profile).includes('repository')) invalid();
  const root = await realDirectory(repositoryDirectory), directory = await realDirectory(artifactDirectory);
  const before = await fs.lstat(directory, { bigint: true }), file = path.join(directory, 'repository.json');
  await requireAbsent(file);
  const imageError = repositoryImageAvailabilityV2(context), runtimeImage = imageError ? undefined : context.AUDIT_RUNTIME_IMAGE;
  let policy;
  try {
    policy = parseCiEvidenceJson(await readCiFile(path.join(root, 'mofacts', 'scripts', 'security-audit',
      'development-dependency-exposure.json'), 65536), 65536);
  } catch { /* Existing development controls explicitly report configuration ERROR. */ }
  const groups = repositoryFindingGroups(catalog, profile), tiers = new Set(groups.flatMap(group => group.controls));
  const sourceSlots = Object.values(REPOSITORY_SOURCE_CONTROLS_V2);
  const toolSlots = [...groups.map(group => group.group), ...profileControls(catalog, profile)
    .filter(control => control.producerId === 'repository' && !tiers.has(control.controlId)
      && !sourceSlots.includes(control.controlId) && control.controlId !== canaryControl).map(control => control.controlId)];
  // Do not let a component overwrite another component's observations, even
  // when a buggy component emits a globally valid repository control name.
  const tools = proofRecord(await dependencies.tools({ repositoryDirectory: root, environment: env, runtimeImage,
    developmentExposurePolicy: policy }), toolSlots);
  const source = proofRecord(await dependencies.source({ repositoryDirectory: root, environment: env }), sourceSlots);
  const image = imageError ? unavailable(imageError) : !selectedCanaries ? unavailable('configuration')
    : await dependencies.image({ runtimeImage, canaries: selectedCanaries, environment: env });
  // Cleanup-incomplete exceptions intentionally propagate from acquisition before
  // any artifact exists. The caller must stop and retain their recovery metadata.
  const artifact = evaluateRepositoryObservationsV2(catalog, profile, { ...tools, ...source, [canaryControl]: image }, context);
  const after = await fs.lstat(directory, { bigint: true });
  if (before.ino !== after.ino || before.dev !== after.dev || before.mode !== after.mode
    || !after.isDirectory() || after.isSymbolicLink() || await fs.realpath(directory) !== directory) invalid();
  await writeAuditProducerFileV2({ file, artifact, catalog, profile, producerId: 'repository' });
  return artifact;
}
