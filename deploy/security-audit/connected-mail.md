# Connected Gmail observations for staging2

Approved on 2026-11-13. Use the operator's existing Gmail connection for the
security audit's disposable staging2 reset accounts. No IMAP client, app password,
new provider grant, production credential or recovery-backup read is needed.

## Scope and ownership

The connected inbox is mixed personal mail. Each job owns an unpredictable
`mofacts_audit_fixture_<12 hex>` namespace and exact plus-address recipient.
Create only ordinary synthetic staging2 accounts under the bounded-access
delegation. Record ownership and recovery before creation, verify no collision,
and delete only those accounts and their owned reset state after the checks.
An exclusive environment lease must survive the mail handoff; a browser timeout
or interrupted caller requires recovery of that same job before another starts.

## Acquire only the selected test message

1. Record the exact recipient, staging2 origin and original reset-request time.
   Keep the source-owned two-minute delivery window; later acquisition does not
   move the window forward.
2. Search the existing connection for that exact recipient and password-reset
   subject. Request at most ten metadata records. Do not search or read unrelated
   personal messages. A search substring is not evidence of exact identity.
3. Check the returned To/Cc/Bcc recipients and provider receipt timestamp with
   `resetMailboxMessageMatchesV2`. Require one exact recipient and one matching
   fresh message before reading its body. Zero matches is missing evidence;
   duplicate matches are ambiguous. Neither is a passing control.
4. Read only that message's plain-text part. Use
   `readResetMailboxMessageV2` to enforce the 16-KiB bound, staging2 HTTPS origin,
   reset path, exact email, one 64-hex token and exact query shape. Reject missing,
   malformed, ambiguous or foreign links. Never follow an unchecked email link.
5. Pass the validated capability privately to the same owning reset-test process.
   Use private process input/in-memory handoff, never shell arguments, console
   output, screenshots, tracked files or report evidence. Retain only the
   content-free receipt. Do not copy Gmail authorization into the runner.

No mailbox send, deletion, label or filter change is needed. Application-generated
verification/reset messages may remain in the inbox. Dispose of transient body
and capability values when the owned scenario finishes.

## Acceptance and limits

A fresh current reset, rejected replay, old/new password checks, existing-session
invalidation and unused aged-token expiry are distinct observations. A previous
delivery receipt proves none of the later mutations. Use real wall-clock aging
for the live expiry case; changing stored dates qualifies only a synthetic test.
Retain preconditions, typed outcomes and independent cleanup confirmation.

The connected tool supports operator-assisted acquisition during this audit.
It does not provide a reusable credential or prove unattended acquisition by the
standalone scanner. Keep unattended mailbox qualification visibly pending;
do not introduce another mail transport or credential to bypass that boundary.
Other authorization scenarios and source implementation can continue meanwhile.
