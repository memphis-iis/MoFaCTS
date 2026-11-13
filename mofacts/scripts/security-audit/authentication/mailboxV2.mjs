import { auditTargetOrigin } from '../../../common/securityAudit/reportV2.ts';
import { proofRecord } from '../../../common/securityAudit/proofFields.ts';
import { fixtureNamespaceV2 } from './stagingFixturesV2.mjs';

const invalid = () => { throw new Error('Audit reset mailbox evidence is invalid'); };
export const RESET_MAILBOX_LIMITS_V2 = Object.freeze({ deliveryWindowMs: 120000, bodyBytes: 16384, messageCount: 10 });

// Value bindings only. Expected actor permissions and scenario policy stay in
// the source catalog. A run-specific recipient is mandatory even on a shared
// operator inbox; a folder/subject filter is not a mailbox permission boundary.
export function parseResetMailboxBindingV2(value) {
  const row = proofRecord(value, ['namespace', 'recipient', 'target', 'requestedAtMs', 'deadlineMs']);
  fixtureNamespaceV2(row.namespace);
  if (typeof row.recipient !== 'string' || row.recipient.length > 254
      || !/^[a-z0-9._-]+\+[a-z0-9_-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(row.recipient)
      || !['reset', 'expiry'].some(actor => row.recipient.split('@')[0].endsWith(`+${row.namespace}-${actor}`))
      || !Number.isSafeInteger(row.requestedAtMs) || row.requestedAtMs < 0
      || !Number.isSafeInteger(row.deadlineMs) || row.deadlineMs <= row.requestedAtMs
      || row.deadlineMs - row.requestedAtMs > RESET_MAILBOX_LIMITS_V2.deliveryWindowMs) invalid();
  const target = auditTargetOrigin(row.target);
  if (target !== 'https://staging2.optimallearning.org' || target !== row.target) invalid();
  return { ...row, target };
}

// Provider adapters expose this bounded metadata envelope before any body read.
// Existing connected Gmail access owns actual mailbox I/O and MIME decoding.
export function resetMailboxMessageMatchesV2(binding, value) {
  const scope = parseResetMailboxBindingV2(binding);
  const row = proofRecord(value, ['messageId', 'recipients', 'receivedAtMs']);
  if (typeof row.messageId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.messageId)
      || !Array.isArray(row.recipients) || row.recipients.length < 1 || row.recipients.length > 8
      || row.recipients.some(recipient => typeof recipient !== 'string' || recipient.length > 254)
      || !Number.isSafeInteger(row.receivedAtMs) || row.receivedAtMs < 0) invalid();
  return row.recipients.length === 1 && row.recipients[0] === scope.recipient
    && row.receivedAtMs >= scope.requestedAtMs && row.receivedAtMs <= scope.deadlineMs;
}

// Returned capability is transient private runner input, never report evidence.
// The sanitized receipt below carries no address, message ID, body or token.
export function readResetMailboxMessageV2(binding, metadata, plainText) {
  const scope = parseResetMailboxBindingV2(binding);
  if (!resetMailboxMessageMatchesV2(scope, metadata)) invalid();
  if (typeof plainText !== 'string' || Buffer.byteLength(plainText) > RESET_MAILBOX_LIMITS_V2.bodyBytes) invalid();
  const candidates = [...plainText.matchAll(/https?:\/\/[^\s<>"']+/g)].map(match => match[0]);
  const resetLinks = [];
  for (const candidate of candidates) {
    let link;
    try { link = new URL(candidate); } catch { invalid(); }
    if (link.pathname !== '/auth/reset-password') continue;
    if (link.origin !== scope.target || link.username || link.password || link.hash
        || link.searchParams.get('email') !== scope.recipient
        || !/^[a-f0-9]{64}$/.test(link.searchParams.get('token') ?? '')
        || [...link.searchParams.keys()].length !== 2
        || link.searchParams.getAll('email').length !== 1 || link.searchParams.getAll('token').length !== 1) invalid();
    resetLinks.push(link);
  }
  if (resetLinks.length !== 1) invalid();
  return { token: resetLinks[0].searchParams.get('token'), recipient: scope.recipient,
    receipt: { state: 'staging2-reset-mail-delivery-observed', exactRecipientMatched: true,
      receivedWithinRequestWindow: true, targetOriginMatched: true, resetLinkCount: 1 } };
}

export async function acquireResetMailboxMessageV2({ binding, listMetadata, readPlainText }) {
  const scope = parseResetMailboxBindingV2(binding);
  if (typeof listMetadata !== 'function' || typeof readPlainText !== 'function') invalid();
  const messages = await listMetadata(scope);
  if (!Array.isArray(messages) || messages.length > RESET_MAILBOX_LIMITS_V2.messageCount) invalid();
  const matches = messages.filter(message => resetMailboxMessageMatchesV2(scope, message));
  if (new Set(messages.map(message => message.messageId)).size !== messages.length) invalid();
  if (matches.length === 0) return { state: 'not-observed' };
  if (matches.length !== 1) invalid();
  const message = matches[0];
  return readResetMailboxMessageV2(scope, message, await readPlainText(message.messageId, scope));
}
