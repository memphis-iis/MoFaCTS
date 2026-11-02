import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('hosted Linux receipt installation/reading enforces permissions, bounds, identity and atomic replacement', {
  skip: process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true',
}, () => {
  const worker = fileURLToPath(new URL('./helpers/releaseReceiptHostHarness.mjs', import.meta.url));
  const result = spawnSync('sudo', ['-n', process.execPath, worker], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 64 * 1024,
  });
  assert.equal(result.status, 0, 'Protected host fixture failed: ' + result.stderr);
  assert.equal(result.stdout.trim(), 'Protected host receipt fixtures passed.');
});
