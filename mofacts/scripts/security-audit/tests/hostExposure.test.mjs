import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('protected host auditor enforces explicit helper absence and exact Mongo observations', {
  skip: process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true'
    ? 'Root Linux Bash/jq fixtures run in the supported CI environment.' : false,
}, () => {
  const harness = fileURLToPath(new URL('./helpers/hostExposureHarness.py', import.meta.url));
  const result = spawnSync('sudo', ['-n', 'python3', harness], {
    encoding: 'utf8', timeout: 90000, maxBuffer: 16 * 1024,
  });
  assert.equal(result.status, 0, 'Protected host exposure fixtures failed: ' + result.stderr);
  assert.match(result.stdout.trim(), /^Protected host exposure fixtures passed \(\d+ cases\)\.$/);
});
