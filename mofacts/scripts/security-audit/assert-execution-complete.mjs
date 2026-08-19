import fs from 'node:fs/promises';

const report = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
if (!Array.isArray(report.executionErrors)) throw new Error('report execution error field is missing');
if (report.executionErrors.length > 0) {
  throw new Error(`security audit report was stored with ${report.executionErrors.length} execution errors`);
}
process.stdout.write('Security audit execution completed without scanner errors.\n');
