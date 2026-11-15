import { RESET_MAILBOX_LIMITS_V2, resetMailboxMessageMatchesV2, readResetMailboxMessageV2, parseResetMailboxBindingV2, acquireResetMailboxMessageV2 } from './mailboxV2.mjs';

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

// One bounded connector-owned acquisition, callable by an unattended owner only
// when that owner already has authorized tool access and a private scanner handoff.
// This adds no HTTP client, OAuth/IMAP access, scheduler, production binding or
// credential storage. The existing mailbox owner retains matching and token rules.
export async function acquireConnectedGmailResetMessageV2({ binding, listMessages, readMessage, now = Date.now }) {
  try {
    const scope = parseResetMailboxBindingV2(binding);
    if (typeof listMessages !== 'function' || typeof readMessage !== 'function' || typeof now !== 'function') invalid();
    const withinWindow = () => {
      const time = now();
      if (!Number.isSafeInteger(time) || time < scope.requestedAtMs || time > scope.deadlineMs) invalid();
    };
    const selected = new Map();
    let evidence;
    withinWindow();
    const result = await acquireResetMailboxMessageV2({
      binding: scope,
      listMetadata: async () => {
        // The callback must use exact recipient + reset subject and request no
        // more than the existing ten-message bound; never fetch a whole inbox.
        const messages = await listMessages({ ...scope });
        withinWindow();
        if (!Array.isArray(messages) || messages.length > RESET_MAILBOX_LIMITS_V2.messageCount) invalid();
        return messages.map(message => {
          const metadata = connectedGmailMetadataV2(scope, message);
          if (selected.has(metadata.messageId)) invalid();
          selected.set(metadata.messageId, metadata);
          return metadata;
        });
      },
      readPlainText: async messageId => {
        withinWindow();
        const metadata = selected.get(messageId);
        if (!metadata) invalid();
        const message = await readMessage(messageId);
        withinWindow();
        evidence = connectedGmailResetMessageV2(scope, metadata, message);
        return evidence.plainText;
      },
    });
    withinWindow();
    // Match captureCurrentResetV2's existing private-mail contract. It validates
    // the evidence again against its own request before any password mutation.
    return evidence ?? result;
  } catch {
    // Connector exceptions can contain email bodies or capabilities. Do not
    // retain them as causes, logs, receipts or user-visible diagnostics.
    throw new Error('Connected Gmail reset acquisition is unavailable');
  }
}
