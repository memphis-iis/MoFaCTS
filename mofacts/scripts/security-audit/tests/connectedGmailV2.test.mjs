import assert from 'node:assert/strict';
import test from 'node:test';
import { connectedGmailMetadataV2 as metadata, connectedGmailResetMessageV2 as read } from '../authentication/connectedGmailV2.mjs';
const namespace = 'mofacts_audit_fixture_0123456789ab';
const binding = { namespace, recipient: `imrryr+${namespace}-reset@gmail.com`, target: 'https://staging2.optimallearning.org', requestedAtMs: 1794575020232, deadlineMs: 1794575140232 };
function message() {
  const content = `${binding.target}/auth/reset-password?email=${encodeURIComponent(binding.recipient)}&token=${'a'.repeat(64)}`;
  return { id: '1a123', internal_date: '1794575020000', payload: { mime_type: 'text/plain', filename: null, parts: null,
    headers: [{ name: 'To', value: binding.recipient }, { name: 'Delivered-To', value: binding.recipient },
      { name: 'X-Received', value: 'by 2002:a17:903:1c6:b0:2ed:2e3a:1faf with SMTP id d9443-2ee0.47.1794575021854; Fri, 13 Nov 2026 05:03:41 -0800 (PST)' }],
    body: { content, size: Buffer.byteLength(content), attachment_id: null } } };
}
test('connected Gmail uses exact recipients and one explicit provider receipt clock before body acquisition', () => {
  const value = message(), meta = metadata(binding, value);
  assert.equal(meta.receivedAtMs, 1794575021854);
  assert.equal(read(binding, meta, value).receipt.exactRecipientMatched, true);
  assert.deepEqual(Object.keys(meta).sort(), ['messageId', 'receivedAtMs', 'recipients']);
});
test('missing, duplicate, malformed or stale ingestion headers never substitute internal_date or request time', () => {
  for (const mutate of [value => value.payload.headers.pop(), value => value.payload.headers.push(value.payload.headers[2]),
    value => { value.payload.headers[2].value = 'unrecognized'; },
    value => { value.payload.headers[2].value = value.payload.headers[2].value.replace('1794575021854', '1794575020000'); },
    value => value.payload.headers.push({ name: 'Cc', value: 'other@gmail.com' }),
    value => { value.payload.headers[0].value = 'other@gmail.com'; }]) {
    const value = message(); mutate(value); assert.throws(() => metadata(binding, value));
  }
});
test('body identity changes, attachments, unsupported MIME and oversized decoded text are rejected', () => {
  const meta = metadata(binding, message());
  for (const mutate of [value => { value.id = 'different'; }, value => { value.payload.mime_type = 'text/html'; },
    value => { value.payload.body.attachment_id = 'attachment'; }, value => { value.payload.filename = 'file.txt'; },
    value => { value.payload.body.content = 'x'.repeat(16385); }, value => { value.payload.body.size = 16385; },
    value => { value.payload.parts = [{}]; }]) {
    const value = message(); mutate(value); assert.throws(() => read(binding, meta, value));
  }
});
