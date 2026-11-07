import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('root Linux V1/V2 receipt installation/reading enforces permissions, identity, replacement and rollback', {
  skip: process.platform !== 'linux' || (process.getuid?.() !== 0 && process.env.GITHUB_ACTIONS !== 'true'),
}, () => {
  const worker = fileURLToPath(new URL('./helpers/releaseReceiptHostHarness.mjs', import.meta.url));
  const root = process.getuid?.() === 0;
  const result = spawnSync(root ? process.execPath : 'sudo', root ? [worker] : ['-n', process.execPath, worker], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 64 * 1024,
  });
  assert.equal(result.status, 0, 'Protected host fixture failed: ' + result.stderr);
  assert.equal(result.stdout.trim(), 'Protected V1/V2 host receipt and rollback fixtures passed.');
});
