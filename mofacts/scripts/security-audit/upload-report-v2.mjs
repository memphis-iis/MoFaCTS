import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { uploadAuditReportFileV2 } from './core/uploadV2.mjs';

// Explicit, uninvoked V2 entry point. The active scheduled V1 workflow is intact.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const action = args.length === 1
    ? uploadAuditReportFileV2({ reportPath: args[0] }) : Promise.reject();
  action.then(() => process.stdout.write('V2 security audit report stored by the application.\n'), () => {
    process.stderr.write('V2 audit upload failed; no acceptance was recorded.\n');
    process.exitCode = 1;
  });
}
