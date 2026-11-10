import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAuditExecutionCompleteFileV2 } from './core/reportFilesV2.mjs';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [reportPath, ...extra] = process.argv.slice(2);
  const action = reportPath && !extra.length ? assertAuditExecutionCompleteFileV2({ reportPath }) : Promise.reject();
  action.then(() => process.stdout.write('V2 audit execution completed without scanner errors.\n'), () => {
    process.stderr.write('V2 audit execution is incomplete or invalid.\n');
    process.exitCode = 1;
  });
}
