import { parseResetMailboxBindingV2 } from '../../../mofacts/scripts/security-audit/authentication/mailboxV2.mjs';
import { connectedGmailMetadataV2, connectedGmailResetMessageV2, connectedGmailVerificationMessageV2 } from '../../../mofacts/scripts/security-audit/authentication/connectedGmailV2.mjs';

const fail = () => { throw new Error('Audit mail handoff unavailable'); };
const namespacePattern = /^mofacts_audit_fixture_[a-f0-9]{12}$/;

// Only the private scanner channel can open requests. Remote callers can answer
// the outstanding request; they cannot pick a recipient, target or namespace.
// This broker never releases the scanner's authentication lease. An interrupted
// broker requires the scanner owner to verify cleanup before explicit recovery.
export function createMailHandoff({ store, now = Date.now }) {
  let active;
  const status = () => ({ state: active ? active.phase : store.read().handoff ? 'recovery-required' : 'idle',
    auditExecutionComplete: false });
  async function open(namespace, send) {
    if (!namespacePattern.test(namespace) || typeof send !== 'function' || active) fail();
    await store.transaction(state => {
      if (state.handoff) fail();
      state.handoff = { namespace, openedAtMs: now(), state: 'scanner-attached' };
    });
    active = { namespace, send, phase: 'reader-needed', deadline: now() + 120000, request: null, selected: null };
  }
  async function interrupt() {
    active = undefined;
    // Persisted marker survives; it is not an automatically expired lease.
    await store.transaction(state => { if (state.handoff) state.handoff.state = 'recovery-required'; });
  }
  async function acceptScannerRequest(frame) {
    if (active && frame.operation === 'begin-expiry') {
      if (active.phase !== 'mail-handed-off' || active.purpose !== 'reset' || active.expiryStarted
        || active.verificationRecipient !== active.binding.recipient
        || !active.binding.recipient.includes(`+${active.namespace}-reset@`)
        || Object.keys(frame).sort().join(',') !== 'operation,requestId'
        || frame.requestId !== active.request.requestId + 1) fail();
      active.expectedRecipient = active.binding.recipient.replace(`+${active.namespace}-reset@`, `+${active.namespace}-expiry@`);
      active.verificationRecipient = null; active.expiryStarted = true;
      active.phase = 'reader-needed'; active.deadline = now() + 120000;
      active.minimumRequestId = frame.requestId + 1; active.request = null; active.selected = null;
      active.send({ operation: 'expiry-window-ready' }); return;
    }
    if (active && frame.operation === 'begin-reset') {
      if (active.phase !== 'mail-handed-off' || active.purpose !== 'verification'
        || Object.keys(frame).sort().join(',') !== 'operation,requestId'
        || frame.requestId !== active.request.requestId + 1) fail();
      active.verificationRecipient = active.binding.recipient;
      active.phase = 'reader-needed'; active.deadline = now() + 120000;
      active.minimumRequestId = frame.requestId + 1; active.request = null; active.selected = null; active.purpose = 'reset';
      active.send({ operation: 'reset-window-ready' });
      return;
    }
    if (!active || active.phase !== 'reader-ready' && active.phase !== 'waiting-body' || now() >= active.deadline) fail();
    if (!Number.isSafeInteger(frame.requestId) || frame.requestId < 1) fail();
    if (['gmail-metadata', 'gmail-verification-metadata'].includes(frame.operation)) {
      if (active.phase !== 'reader-ready' || Object.keys(frame).sort().join(',') !== 'binding,maximumResults,operation,requestId'
        || frame.maximumResults !== 10) fail();
      const binding = parseResetMailboxBindingV2(frame.binding);
      if (binding.namespace !== active.namespace || binding.requestedAtMs > now() || binding.deadlineMs <= now()) fail();
      if (frame.requestId !== (active.minimumRequestId ?? 1)
        || active.expectedRecipient && (frame.operation !== 'gmail-verification-metadata' || binding.recipient !== active.expectedRecipient)
        || active.verificationRecipient && (frame.operation !== 'gmail-metadata' || binding.recipient !== active.verificationRecipient)) fail();
      active.purpose = frame.operation === 'gmail-verification-metadata' ? 'verification' : 'reset';
      active.expectedRecipient = null;
      active.binding = binding; active.deadline = binding.deadlineMs; active.phase = 'metadata-requested';
    } else if (['gmail-full', 'gmail-verification-full'].includes(frame.operation)) {
      if (active.phase !== 'waiting-body' || Object.keys(frame).sort().join(',') !== 'messageId,operation,requestId'
        || frame.operation !== (active.purpose === 'verification' ? 'gmail-verification-full' : 'gmail-full')
        || frame.messageId !== active.selected?.messageId || frame.requestId !== active.request.requestId + 1) fail();
      active.phase = 'body-requested';
    } else fail();
    active.request = structuredClone(frame);
  }
  function request() {
    if (!active) return status();
    if (now() >= active.deadline) return { state: 'deadline-exceeded', auditExecutionComplete: false };
    if (active.phase === 'reader-needed') {
      active.phase = 'reader-ready';
      active.send({ operation: 'reader-ready' });
      return { state: 'reader-ready', auditExecutionComplete: false };
    }
    if (active.phase === 'metadata-requested') return { state: active.phase, ...active.request };
    if (active.phase === 'body-requested') return { state: active.phase, ...active.request };
    return status();
  }
  function submit({ requestId, response }) {
    if (!active || now() >= active.deadline || requestId !== active.request?.requestId) fail();
    if (active.phase === 'metadata-requested') {
      if (!Array.isArray(response) || response.length !== 1) fail();
      // Validate metadata-only carriage. Bodies are requested separately only
      // after the unique identity passes the original provider/recipient rules.
      if (response[0]?.payload?.body?.content) fail();
      active.selected = connectedGmailMetadataV2(active.binding, response[0]);
      active.phase = 'waiting-body';
    } else if (active.phase === 'body-requested') {
      (active.purpose === 'verification' ? connectedGmailVerificationMessageV2 : connectedGmailResetMessageV2)(active.binding, active.selected, response);
      active.phase = 'mail-handed-off';
    } else fail();
    active.send({ requestId, response });
    return { state: active.phase, auditExecutionComplete: false };
  }
  // Called only by the protected scanner owner after its existing independent
  // cleanup verification. The cloud API intentionally cannot invoke recovery.
  async function closeAfterVerifiedCleanup(namespace, verifyClean) {
    const row = store.read().handoff;
    if (!row || row.namespace !== namespace || typeof verifyClean !== 'function'
      || await verifyClean(namespace) !== true) fail();
    await store.transaction(state => {
      if (state.handoff?.namespace !== namespace) fail();
      state.handoff = null;
    });
    active = undefined;
  }
  return { open, request, submit, status, acceptScannerRequest, interrupt, closeAfterVerifiedCleanup };
}
