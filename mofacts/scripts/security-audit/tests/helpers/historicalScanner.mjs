// Test-only immutable V1 characterization. Never imported by an active scanner.
// Keep historical defects reproducible without retaining current V1 producers.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const revision = '09f0c32fc2af6d220c699dd805133df3c0507c2e';
const repository = fileURLToPath(new URL('../../../../../', import.meta.url));
const sources = new Set(['audit-lib.mjs', 'authentication-probes.mjs', 'internal-audit-contract.mjs', 'composite-exposure.mjs',
  'assemble-report.mjs', 'external-audit.mjs', 'production-auth-audit.mjs', 'repository-audit.mjs']);
const executable = ['audit-lib.mjs', 'authentication-probes.mjs', 'internal-audit-contract.mjs', 'composite-exposure.mjs', 'assemble-report.mjs'];
let directory;
export function historicalScannerSource(name) {
  if (!sources.has(name)) throw new Error('Unknown historical scanner fixture');
  return execFileSync('git', ['-C', repository, 'show', `${revision}:mofacts/scripts/security-audit/${name}`],
    { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024, windowsHide: true });
}
export function historicalScannerPath(name) {
  if (!executable.includes(name)) throw new Error('Historical fixture is source-only');
  if (!directory) {
    directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'mofacts-historical-scanner-'));
    fs.chmodSync(directory, 0o700);
    for (const member of executable) fs.writeFileSync(path.join(directory, member), historicalScannerSource(member), { flag: 'wx', mode: 0o600 });
    process.once('exit', () => {
      if (fs.realpathSync(directory) !== directory || path.dirname(directory) !== fs.realpathSync(os.tmpdir())
        || !path.basename(directory).startsWith('mofacts-historical-scanner-')) throw new Error('Historical fixture cleanup rejected');
      for (const member of executable) fs.unlinkSync(path.join(directory, member));
      fs.rmdirSync(directory);
    });
  }
  return path.join(directory, name);
}
export async function historicalScannerModule(name) {
  if (name === 'assemble-report.mjs') throw new Error('Historical assembler requires its explicit synthetic CLI');
  return import(pathToFileURL(historicalScannerPath(name)).href);
}
