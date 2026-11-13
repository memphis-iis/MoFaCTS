import assert from 'node:assert/strict';
import test from 'node:test';
import { parseResetMailboxBindingV2 as parse, acquireResetMailboxMessageV2 as acquire,
  readResetMailboxMessageV2 as read } from '../authentication/mailboxV2.mjs';

const namespace = 'mofacts_audit_fixture_0123456789ab';
const binding = { namespace, recipient: `operator+${namespace}-reset@example.test`,
  target: 'https://staging2.optimallearning.org', requestedAtMs: 1000, deadlineMs: 121000 };
const metadata = { messageId: 'owned-message', recipients: [binding.recipient], receivedAtMs: 2000 };
const token = 'a'.repeat(64);
const body = (origin = binding.target, email = binding.recipient, suffix = '') =>
  `Open this link:\n${origin}/auth/reset-password?email=${encodeURIComponent(email)}&token=${token}${suffix}\nThis link expires in 1 hour.`;

test('reset mailbox scope requires a fresh owned recipient and the exact staging2 origin', () => {
  assert.deepEqual(parse(binding), binding);
  for (const change of [{ namespace: 'foreign' }, { recipient: 'operator@example.test' },
    { recipient: 'operator+old-run-reset@example.test' }, { deadlineMs: 121001 }, { deadlineMs: 1000 },
    { target: 'https://optimallearning.org' }, { target: `${binding.target}/` }, { password: 'PRIVATE' }]) {
    assert.throws(() => parse({ ...binding, ...change }));
  }
});

test('metadata selection never reads unrelated, stale, future or multi-recipient bodies', async () => {
  const unrelated = [
    { ...metadata, messageId: 'other', recipients: ['other@example.test'] },
    { ...metadata, messageId: 'stale', receivedAtMs: 999 },
    { ...metadata, messageId: 'future', receivedAtMs: 121001 },
    { ...metadata, messageId: 'multiple', recipients: [binding.recipient, 'other@example.test'] },
  ];
  let reads = 0;
  const notObserved = await acquire({ binding, listMetadata: async () => unrelated,
    readPlainText: async () => { throw new Error('Unrelated message body read'); } });
  assert.deepEqual(notObserved, { state: 'not-observed' });
  const result = await acquire({ binding, listMetadata: async () => [...unrelated, metadata],
    readPlainText: async id => { assert.equal(id, metadata.messageId); reads++; return body(); } });
  assert.equal(reads, 1); assert.equal(result.token, token);
  assert.equal(JSON.stringify(result.receipt).includes(token), false);
  assert.equal(JSON.stringify(result.receipt).includes(binding.recipient), false);
});

test('reset mail cannot substitute a production/foreign link, recipient, token or extra query', () => {
  assert.equal(read(binding, metadata, body()).receipt.resetLinkCount, 1);
  for (const value of [body('https://optimallearning.org'), body('http://staging2.optimallearning.org'),
    body(undefined, 'other@example.test'), body(undefined, undefined, '&extra=1'),
    body(undefined, undefined, `&token=${token}`), body(undefined, undefined, '#fragment'),
    body().replace(token, 'bad'), `${body()}\n${body()}`, 'No reset link', 'x'.repeat(16385)]) {
    assert.throws(() => read(binding, metadata, value));
  }
});

test('ambiguous, duplicated and oversized message inventories fail before reading a body', async () => {
  for (const messages of [[metadata, metadata], [metadata, { ...metadata, messageId: 'second' }],
    Array.from({ length: 11 }, (_, i) => ({ ...metadata, messageId: `message${i}` }))]) {
    await assert.rejects(acquire({ binding, listMetadata: async () => messages,
      readPlainText: async () => { throw new Error('Ambiguous body read'); } }));
  }
  await assert.rejects(acquire({ binding, listMetadata: async () => { throw new Error('Transport unavailable'); },
    readPlainText: async () => body() }));
});
