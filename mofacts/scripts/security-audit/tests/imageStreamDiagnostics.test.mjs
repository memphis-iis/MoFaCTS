import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { imageStreamOptions, streamDockerImageIdentity } from '../qualification/observeDockerImage.mjs';
import { IMAGE_ARCHIVE_LIMITS } from '../qualification/imageArchiveIdentity.mjs';
import { dockerImageFixture } from './helpers/dockerImageArchiveFixture.mjs';

function processFixture(run) {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => { queueMicrotask(() => child.emit('close', null)); return true; };
  return () => { queueMicrotask(() => run?.(child)); return child; };
}

test('stream counters preserve default and explicit budgets without changing graph/size ownership', async () => {
  for (const timeoutMs of [undefined, 600000]) {
    const fixture = dockerImageFixture('index'), diagnostics = [], bytes = fixture.archive();
    const spawn = processFixture(child => { child.stdout.end(bytes); child.stderr.end(); child.emit('close', 0); });
    const result = await streamDockerImageIdentity(fixture.inspection, {}, spawn,
      { ...(timeoutMs ? { timeoutMs } : {}), onDiagnostic: row => diagnostics.push(row) });
    assert.deepEqual(result, { configDigest: fixture.configDigest, platform: 'linux/amd64' });
    assert.equal(diagnostics.length, 1); assert.equal(diagnostics[0].category, 'complete');
    assert.equal(diagnostics[0].timeoutMs, timeoutMs ?? 120000);
    assert.equal(diagnostics[0].bytesRead, bytes.length); assert.equal(diagnostics[0].terminationConfirmed, true);
  }
  assert.equal(IMAGE_ARCHIVE_LIMITS.bytes, 2 * 1024 ** 3);
  assert.equal(IMAGE_ARCHIVE_LIMITS.retainedBytes, 32 * 1024 ** 2);
  assert.equal(IMAGE_ARCHIVE_LIMITS.entries, 4096);
});

test('stream deadline kills the owned process and retains counters without raw diagnostics', async () => {
  const diagnostics = [], fixture = dockerImageFixture('classic');
  const spawn = processFixture(child => {
    child.stderr.write('PRIVATE synthetic diagnostic');
    child.kill = () => { queueMicrotask(() => {
      child.stdout.emit('error', new Error('PRIVATE termination pipe error')); child.emit('close', null);
    }); return true; };
  });
  await assert.rejects(streamDockerImageIdentity(fixture.inspection, {}, spawn,
    { timeoutMs: 15, onDiagnostic: row => diagnostics.push(row) }), error => {
    assert.equal(error.code, 'DOCKER_IMAGE_STREAM_FAILED'); assert.equal(error.diagnostic.category, 'timeout');
    return true;
  });
  assert.equal(diagnostics.length, 1); assert.equal(diagnostics[0].bytesRead, 0);
  assert.equal(diagnostics[0].terminationConfirmed, true);
  assert.equal(JSON.stringify(diagnostics).includes('PRIVATE'), false);
});

test('archive rejection, process failure and excessive stderr retain distinct safe categories', async () => {
  for (const expected of ['archive-rejected', 'process-failed', 'stderr-limit']) {
    const fixture = dockerImageFixture('classic'), diagnostics = [];
    const spawn = processFixture(child => {
      if (expected === 'stderr-limit') { child.stderr.write(Buffer.alloc(65537, 88)); return; }
      child.stdout.end(Buffer.from('PRIVATE malformed archive'));
      child.stderr.end('PRIVATE stderr'); child.emit('close', expected === 'process-failed' ? 2 : 0);
    });
    await assert.rejects(streamDockerImageIdentity(fixture.inspection, {}, spawn,
      { onDiagnostic: row => diagnostics.push(row) }), error => error.diagnostic.category === expected);
    assert.equal(diagnostics.length, 1); assert.equal(JSON.stringify(diagnostics).includes('PRIVATE'), false);
  }
});

test('invalid stream budgets and diagnostic sinks fail before launching a process', async () => {
  for (const options of [{ timeoutMs: 0 }, { timeoutMs: 600001 }, { timeoutMs: 1.5 }, { onDiagnostic: 'bad' }, { unknown: true }]) {
    assert.throws(() => imageStreamOptions(options));
    let launched = false;
    await assert.rejects(streamDockerImageIdentity({}, {}, () => { launched = true; }, options));
    assert.equal(launched, false);
  }
});
