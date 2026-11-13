// Trusted existing entrypoint owns URI materialization. Only its required DB
// coordinates reach the fixed-source fixture child; no provider/signing keys.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditToolEnvironmentV2 } from '../../mofacts/scripts/security-audit/core/childEnvironmentV2.mjs';
import { STAGING_FIXTURE_STORAGE_ACTIONS_V2 } from './staging2-fixture-runtime.mjs';

export function fixtureStorageEnvironmentV2(environment) {
  return auditToolEnvironmentV2({ ...Object.fromEntries(['PATH', 'MONGO_URL', 'ROOT_URL', 'EXPECTED_MONGO_DB_NAME']
    .filter(key => environment[key] !== undefined).map(key => [key, environment[key]])), NODE_OPTIONS: '' }, 'staging2-storage');
}
export function launchFixtureStorageV2(action, environment, spawnProcess = spawn) {
  if (!STAGING_FIXTURE_STORAGE_ACTIONS_V2.includes(action)) throw new Error('Invalid fixture action');
  const env = fixtureStorageEnvironmentV2(environment);
  return spawnProcess(process.execPath, [fileURLToPath(new URL('./staging2-fixture-runtime.mjs', import.meta.url)), action],
    { env, shell: false, windowsHide: true, stdio: 'inherit' });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Invalid invocation');
    const child = launchFixtureStorageV2(process.argv[2], process.env);
    child.once('error', () => { process.stderr.write('Fixture child failed to start\n'); process.exitCode = 1; });
    child.once('exit', code => { process.exitCode = Number.isInteger(code) ? code : 1; });
  } catch { process.stderr.write('Fixture child configuration rejected\n'); process.exitCode = 1; }
}
