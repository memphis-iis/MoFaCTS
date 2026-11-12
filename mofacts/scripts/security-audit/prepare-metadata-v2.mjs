import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAuditImageContextV2, writeAuditMetadataV2 } from './core/metadataV2.mjs';
import { writeAuditFileV2 } from './core/producerFilesV2.mjs';
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, releaseReceiptPath, outputPath, ...extra] = process.argv.slice(2);
    if (!['image', 'report'].includes(action) || !releaseReceiptPath || !outputPath || extra.length) throw new Error();
    if (action === 'image') await writeAuditFileV2(outputPath, await readAuditImageContextV2(releaseReceiptPath));
    else await writeAuditMetadataV2({ releaseReceiptPath, metadataPath: outputPath });
    process.stdout.write('V2 metadata written; unavailable identity stays explicit.\n');
  } catch { process.stderr.write('V2 metadata preparation failed.\n'); process.exitCode = 1; }
}
