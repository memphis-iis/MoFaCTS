import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = process.getuid?.() === 0;
const hostedRoot = process.env.GITHUB_ACTIONS === 'true' && spawnSync('sudo', ['-n', 'true']).status === 0;
const linuxFixtures = process.platform === 'linux' && (root || hostedRoot) && spawnSync('jq', ['--version']).status === 0;
test('protected host auditor enforces explicit helper absence and exact Mongo observations', {
  skip: linuxFixtures ? false : 'Requires root Linux with existing jq; no dependency is installed by tests.',
}, () => {
  const harness = fileURLToPath(new URL('./helpers/hostExposureHarness.py', import.meta.url));
  const result = spawnSync(root ? 'python3' : 'sudo', root ? [harness] : ['-n', 'python3', harness], {
    encoding: 'utf8', timeout: 90000, maxBuffer: 16 * 1024,
  });
  assert.equal(result.status, 0, 'Protected host exposure fixtures failed: ' + result.stderr);
  assert.match(result.stdout.trim(), /^Protected host exposure fixtures passed \(\d+ cases\)\.$/);
});
