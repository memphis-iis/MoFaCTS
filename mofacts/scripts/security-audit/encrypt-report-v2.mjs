import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encryptAuditReportFileV2 } from './core/reportFilesV2.mjs';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [reportPath, encryptedPath, ...extra] = process.argv.slice(2);
  const action = reportPath && encryptedPath && !extra.length
    ? encryptAuditReportFileV2({ reportPath, encryptedPath }) : Promise.reject();
  action.then(() => process.stdout.write('V2 audit report encrypted for retention.\n'), () => {
    process.stderr.write('V2 audit report encryption failed; no retained-artifact acceptance is claimed.\n');
    process.exitCode = 1;
  });
}
