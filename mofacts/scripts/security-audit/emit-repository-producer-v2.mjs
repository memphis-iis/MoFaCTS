import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeRepositoryProducerFileV2 } from './repository/producerFilesV2.mjs';
import { parseAuditFileV2, readAuditFileV2 } from './core/producerFilesV2.mjs';
import { readStaging2ReleaseRegistryEvidence } from './qualification/bindStaging2ReleaseRegistry.mjs';
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [artifactDirectory, imageContextPath, canariesPath, evidenceDirectory, authorityFile, ...extra] = process.argv.slice(2);
    if (!artifactDirectory || !imageContextPath || !canariesPath || extra.length
      || Boolean(evidenceDirectory) !== Boolean(authorityFile)) throw new Error();
    let imageContext, canaries, registryEvidence;
    try { imageContext = parseAuditFileV2(await readAuditFileV2(imageContextPath)); } catch { /* Its owner emits unavailable identity. */ }
    try { canaries = parseAuditFileV2(await readAuditFileV2(canariesPath)); } catch { /* The canary control retains explicit configuration ERROR. */ }
    if (evidenceDirectory) {
      try { registryEvidence = await readStaging2ReleaseRegistryEvidence(evidenceDirectory, authorityFile); }
      catch { /* A failed read leaves the runtime-coverage control incomplete. */ }
    }
    const environment = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'XDG_CACHE_HOME', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'CI']
      .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
    environment.NODE_OPTIONS = '';
    await writeRepositoryProducerFileV2({ profile: 'full', artifactDirectory, repositoryDirectory: fileURLToPath(new URL('../../../', import.meta.url)),
      environment, imageContext, canaries, registryEvidence, target: process.env.AUDIT_TARGET });
    process.stdout.write('V2 repository artifact written; inspect findings and unavailable tools.\n');
  } catch { process.stderr.write('V2 repository acquisition did not complete; no successful artifact is claimed.\n'); process.exitCode = 1; }
}
