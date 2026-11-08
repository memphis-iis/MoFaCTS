import fs from 'node:fs/promises';
import path from 'node:path';
import { ACTIVE_AUDIT_CATALOG, readAuditCatalog } from '../../../common/securityAudit/catalogRegistry.ts';
import { auditTargetOrigin } from '../../../common/securityAudit/reportV2.ts';
import { parseUdpExternalMeasurements } from '../../../common/securityAudit/evidenceContracts.ts';
import { writeAuditFileV2, writeAuditProducerFileV2 } from '../core/producerFilesV2.mjs';
import { acquireExternalObservationsV2, EXTERNAL_PROBE_IO_V2 } from './acquireV2.mjs';
import { evaluateExternalObservationsV2 } from './observationsV2.mjs';

async function requireAbsent(file) {
  try { await fs.lstat(file); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error('External V2 output already exists');
}

// The UDP file carries raw counts for the independent composite owner. An
// unavailable inventory leaves it absent, so missing acquisition stays ERROR.
export async function writeExternalProducerFilesV2({ profile, artifactDirectory, udpObservationPath,
  env = process.env, now = new Date(), io = EXTERNAL_PROBE_IO_V2 }) {
  auditTargetOrigin(env.AUDIT_TARGET);
  const catalog = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
  if (!['full', 'exposure'].includes(profile)) throw new Error('Invalid external V2 profile');
  const directory = path.resolve(artifactDirectory), udpFile = path.resolve(udpObservationPath);
  const stat = await fs.lstat(directory), relativeUdp = path.relative(directory, udpFile);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(directory) !== directory
    || (!relativeUdp.startsWith('..' + path.sep) && !path.isAbsolute(relativeUdp))) {
    throw new Error('External V2 output layout is invalid');
  }
  const file = path.join(directory, 'external.json');
  await requireAbsent(file); await requireAbsent(udpFile);
  const acquired = await acquireExternalObservationsV2({ env, now, io });
  const artifact = evaluateExternalObservationsV2(catalog, profile, acquired.observations);
  await writeAuditProducerFileV2({ file, artifact, catalog, profile, producerId: 'external' });
  if (acquired.udp.state === 'observed') {
    await writeAuditFileV2(udpFile, parseUdpExternalMeasurements(acquired.udp.value));
  }
  return { udpObservationWritten: acquired.udp.state === 'observed' };
}
