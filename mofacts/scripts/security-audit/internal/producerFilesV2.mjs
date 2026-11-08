import path from 'node:path';
import { ACTIVE_AUDIT_CATALOG, readAuditCatalog } from '../../../common/securityAudit/catalogRegistry.ts';
import { parseHostObservationBytes } from '../../../common/securityAudit/hostObservations.ts';
import { evaluateHostObservations, hostUdpMeasurements } from './evaluateHost.mjs';
import { evaluateUdpExposure } from '../composite/udpExposure.mjs';
import { parseAuditFileV2, readAuditFileV2, writeAuditProducerFileV2 } from '../core/producerFilesV2.mjs';

async function observationBytes(file) {
  try { return await readAuditFileV2(file); }
  catch (error) { return error.code === 'ENOENT' ? undefined : null; }
}

// File carriage for the already-qualified host/composite evaluators. It does not
// SSH, install a collector, translate a V1 status, or infer missing host facts.
export async function writeHostProducerFilesV2({ hostObservationPath, udpObservationPath,
  artifactDirectory, profile, now = new Date() }) {
  const catalog = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
  const hostBytes = await observationBytes(hostObservationPath);
  const internal = await evaluateHostObservations(catalog, profile, hostBytes, now);
  let external, host;
  const udpBytes = await observationBytes(udpObservationPath);
  try { external = udpBytes === undefined ? undefined : parseAuditFileV2(udpBytes); }
  catch { external = null; }
  try { host = await hostUdpMeasurements(await parseHostObservationBytes(hostBytes, now), now); }
  catch { host = hostBytes === undefined ? undefined : null; }
  const composite = evaluateUdpExposure(catalog, profile, external, host);
  for (const artifact of [internal, composite]) {
    await writeAuditProducerFileV2({ file: path.join(artifactDirectory, `${artifact.producerId}.json`),
      artifact, catalog, profile, producerId: artifact.producerId });
  }
}
