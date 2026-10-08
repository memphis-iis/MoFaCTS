import assert from 'node:assert/strict';
import test from 'node:test';
import { createUploadQueue, isOwnedPendingUpload } from '../../../packages/ostrio-files/upload-policy.js';

test('only a persisted unfinished owner can use the upload protocol', () => {
  const pending = { file: { userId: 'owner' } };
  assert.equal(isOwnedPendingUpload(pending, 'owner'), true);
  for (const caller of [null, undefined, '', 'other', 'admin']) {
    assert.equal(isOwnedPendingUpload(pending, caller), false);
  }
  for (const record of [null, {}, { file: {} }, { file: { userId: '' } },
    { file: { userId: 'owner' }, isFinished: true }]) {
    assert.equal(isOwnedPendingUpload(record, 'owner'), false);
  }
});

test('finish and abort serialize, unrelated uploads progress, rejection does not poison an identifier', async () => {
  const queue = createUploadQueue();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const events = [];
  const first = queue('a', async () => { events.push('write'); await gate; events.push('written'); });
  const finish = queue('a', () => { events.push('finish'); throw new Error('denied'); });
  const rejected = assert.rejects(finish, /denied/);
  const abort = queue('a', () => events.push('abort'));
  await queue('b', () => events.push('independent'));
  assert.deepEqual(events, ['write', 'independent']);
  release();
  await Promise.all([first, rejected, abort]);
  assert.deepEqual(events, ['write', 'independent', 'written', 'finish', 'abort']);
  assert.equal(await queue('a', () => 204), 204);
});
