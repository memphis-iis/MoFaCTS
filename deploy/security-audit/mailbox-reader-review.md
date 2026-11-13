# Standalone mailbox reader: dependency decision

Status: software dependency approved 2026-11-13; implemented and tested in the
[optional package](mailbox-reader/README.md). No mailbox credential or live
provider/recovery access was granted by that approval.

The existing operator Gmail connection demonstrated fresh staging2 reset-mail
delivery without copying a production IMAP password. That connection belongs to
the chat tool; it does not supply a standalone Node/Linux audit process with an
IMAP credential or an unattended Gmail API session. Keep this successful operator
proof separate from implementing the portable mailbox acquisition adapter.

## Existing implementation and remaining work

The superseded scanner used curl to issue `SEARCH TO`, then treated the returned
sequence numbers as UIDs when fetching messages. Those are different IMAP
identifiers. It fetched complete messages before the new exact-recipient/time
selection boundary and did not provide the bounded decoded-part interface now
required by `authentication/mailboxV2.mjs`. Do not restore that retired scanner
or substitute it for the selected-message contract.

The application package/lockfile and existing optional-tool lockfiles contain no
IMAP client. A robust curl implementation would still need IMAP response/MIME
structure parsing, stable UID handling, read-only mailbox semantics and bounded
decoded body streaming. Prefer a maintained protocol client over adding that
parser to the audit's security-sensitive code.

## Recommended bounded change

Approved `imapflow` **2.11.0**, MIT licensed, as one direct dependency with its
locked transitive dependencies in a separate optional audit-tool package under
`deploy/security-audit/`. The official package metadata requires Node >=20;
use this repository's pinned Node 24.22.1/npm 11.19.1. Do not add it to the Meteor
application, application Docker image or startup requirements. Official sources:
[published package](https://registry.npmjs.org/imapflow/2.11.0),
[client API](https://imapflow.com/docs/api/imapflow-client/),
[mailbox management](https://imapflow.com/docs/guides/mailbox-management/).

The optional adapter must:

- Reuse the existing provider-independent value/observation boundary. It cannot
  supply policy, assert a login baseline or alter the report/control catalog.
- Use verified TLS, bounded connection/socket/command timeouts and disabled
  protocol logging. Secrets enter the minimal private child environment/input,
  never command arguments, tracked configuration, evidence or error messages.
- Open only the configured mailbox in read-only `EXAMINE` mode; use stable UID
  identity and verify UID validity. No flag changes, moves, deletes, expunge or
  mailbox `CLOSE` operation. Disconnect with `LOGOUT`/transport close.
- Search the exact owned per-run recipient, bound metadata inventory to ten,
  verify the timestamp window and single-recipient match before body access,
  then stream only the selected bounded plain-text part. Reject ambiguous MIME,
  truncation, unsupported content and incomplete transport rather than guessing.
- Keep capabilities transient. Return only sanitized receipt/status categories
  to evidence owners, and require actual transport logout/cleanup to succeed.
- Test UID/sequence separation, unrelated-body isolation, stale/duplicate mail,
  MIME/stream limits, TLS/auth/timeout failures and cleanup without live mail.

## Approval boundaries

This dependency decision adds software only to the optional tool. It does not
authorize a new mailbox, background access to personal mail, an IMAP credential
copy, production/recovery/provider access, new AWS permissions, spending or an
application deployment. The shared inbox is mixed personal mail: a client-side
read-only filter is not an account-level permission restriction. Inspect any
existing credential source within its permission boundary before using it;
bring genuinely new provider/recovery access back for explicit review.

The software decision is complete. Keep the already accepted connected-inbox delivery
proof. Do not relabel it as a standalone acquisition implementation or claim the
remaining reset/expiry/session suite is complete.
