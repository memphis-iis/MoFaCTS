import { RESET_MAILBOX_LIMITS_V2, resetMailboxMessageMatchesV2, readResetMailboxMessageV2 } from './mailboxV2.mjs';

const invalid = () => { throw new Error('Connected Gmail reset evidence is invalid'); };
function headerValues(message, name) {
  const headers = message?.payload?.headers;
  if (!Array.isArray(headers) || headers.length > 100 || headers.some(row => typeof row?.name !== 'string'
      || typeof row.value !== 'string' || row.name.length > 128 || row.value.length > 16384)) invalid();
  return headers.filter(row => row.name.toLowerCase() === name).map(row => row.value);
}

// Exact connected-tool representation, not an independent Gmail authorization.
// Gmail's X-Received ingestion timestamp is the selected provider receipt clock.
// internal_date in the observed connector response has only whole-second
// precision and can precede a same-second request; do not guess/floor the
// request time or silently switch clocks when X-Received is missing.
export function connectedGmailMetadataV2(binding, message) {
  if (typeof message?.id !== 'string' || !/^[a-f0-9]{1,128}$/.test(message.id)) invalid();
  const to = headerValues(message, 'to'), delivered = headerValues(message, 'delivered-to');
  if (to.length !== 1 || delivered.length !== 1 || to[0] !== delivered[0]
      || headerValues(message, 'cc').some(Boolean) || headerValues(message, 'bcc').some(Boolean)) invalid();
  const received = headerValues(message, 'x-received');
  if (received.length !== 1) invalid();
  const match = /^by [0-9a-f:]+ with SMTP id [A-Za-z0-9.-]+\.(\d{13});\s+[^\r\n]+$/.exec(received[0]);
  if (!match) invalid();
  const metadata = { messageId: message.id, recipients: to, receivedAtMs: Number(match[1]) };
  if (!resetMailboxMessageMatchesV2(binding, metadata)) invalid();
  return metadata;
}

// Revalidate the full response's identity/receipt metadata before exposing its
// decoded body to the existing capability validator. No raw/HTML/attachment path.
export function connectedGmailResetMessageV2(binding, metadata, message) {
  const checked = connectedGmailMetadataV2(binding, message);
  if (JSON.stringify(checked) !== JSON.stringify(metadata)) invalid();
  const part = message.payload;
  if (part.mime_type !== 'text/plain' || part.filename || part.parts?.length
      || part.body?.attachment_id || typeof part.body?.content !== 'string'
      || !Number.isSafeInteger(part.body.size) || part.body.size < 0
      || part.body.size > RESET_MAILBOX_LIMITS_V2.bodyBytes
      || Buffer.byteLength(part.body.content) > RESET_MAILBOX_LIMITS_V2.bodyBytes) invalid();
  const result = readResetMailboxMessageV2(binding, checked, part.body.content);
  return { metadata: checked, plainText: part.body.content, receipt: result.receipt };
}
