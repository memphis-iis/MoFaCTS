import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireSelectedAuthorizationV2 } from './authentication/browserV2.mjs';
import { parseAuditFileV2, readAuditFileV2, writeAuditFileV2 } from './core/producerFilesV2.mjs';
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [bindingsPath, outputPath, ...extra] = process.argv.slice(2);
    if (!bindingsPath || !outputPath || extra.length) throw new Error();
    const bindings = parseAuditFileV2(await readAuditFileV2(bindingsPath));
    const result = await acquireSelectedAuthorizationV2({ target: process.env.AUDIT_TARGET, bindings });
    await writeAuditFileV2(outputPath, result);
    process.stdout.write('Selected V2 authorization observations written; inspect their outcomes.\n');
  } catch { process.stderr.write('Selected V2 authorization acquisition failed; no successful denial is claimed.\n'); process.exitCode = 1; }
}
