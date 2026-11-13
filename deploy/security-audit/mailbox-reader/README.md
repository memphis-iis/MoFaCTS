# Optional audit IMAP reader

Approved on 2026-11-13 under P2-D1. This operator-only package pins ImapFlow
2.11.0 and its transitive resolution. It is not a Meteor dependency or runtime
service and is excluded from the application Docker context. It neither creates
mailbox access nor changes mail delivery. ImapFlow is MIT licensed; preserve the
dependency's distributed license. The MoFaCTS security-audit maintainers own this
adapter, its lockfile, protocol tests and upgrade review.

## Install and verify

Use repository-pinned Node 24.22.1/npm 11.19.1 in this directory:

```sh
npm ci --ignore-scripts --no-fund
npm test
npm audit --omit=dev
```

The Linux TLS test uses the worker's existing OpenSSL executable, a temporary
generated test certificate, loopback-only TLS and synthetic messages. It tests
the real pinned client's EXAMINE, UID, PEEK, MIME decoding, oversize rejection,
LOGOUT and certificate validation. Its private temporary key/certificate directory
is removed after ownership/path checks. Windows runs the unit cases; the wire
fixture is explicitly skipped there if OpenSSL is absent. No test contacts a
real mailbox or needs provider credentials. Optional-tool JavaScript also needs
explicit root ESLint coverage because application lint does not scan `deploy/`.

## Private API and contract

Import `readResetMailImapsV2` from `reader.mjs`. Supply:

- `binding`: the existing `parseResetMailboxBindingV2` values: fixture namespace,
  exact reset/expiry recipient, staging2 HTTPS origin and original two-minute
  delivery window. Reuse the shared limits and message/link validator.
- `imaps`: exactly `host`, `username` and `mailbox`; these reuse the existing
  protected audit configuration names. No transport overrides or policy flags.
- `password`: the approved mailbox secret through private process input or an
  in-memory call. Do not put it in command arguments, tracked files or evidence.

The API does not read environment variables, write files, print values or expose
a CLI. The caller owns its minimal secret-bearing child/input boundary. It must
not supply application/admin credentials, signer/encryption keys, SSH keys or
unrelated provider secrets to mailbox acquisition. A returned token/recipient
is transient private runner input; retain only `result.receipt`. Missing delivery
returns `state: not-observed`, never an authorization pass. Sanitized failures are
`MailboxReaderError` with a closed category; do not retain raw provider errors.

The client uses port 993, verified TLS (minimum 1.2), disabled protocol logging,
ten-second connection/greeting/inactivity bounds, bounded IMAP response parsing,
a 45-second total acquisition deadline and ten-second cleanup deadline. It opens
the exact mailbox read-only, uses UID SEARCH/FETCH with unchanged UIDVALIDITY,
lists at most ten candidate metadata records, and requires a single exact fresh
recipient match before fetching any body. Metadata is rechecked before download.
Search is limited by the unique recipient, not IMAP's calendar-date `SINCE`;
timezone-dependent day matching cannot discard a valid boundary-time delivery.
The shared validator uses the provider's exact INTERNALDATE timestamp afterward.

Only one inline plain-text part is accepted; HTML may coexist but is not read.
Attachments, ambiguous/deep MIME, unknown transfer encoding/charset, flowed text,
invalid UTF-8 and truncation are rejected. Supported plain text is UTF-8 or MIME's
standard ASCII default, using standard 7bit/8bit/binary/base64/quoted-printable
encodings. Decoded content is capped at 16 KiB, with one extra byte requested to
detect truncation. Never fetch a complete raw message as a recovery path.

No flag updates, moves, deletes, EXPUNGE or mailbox CLOSE are issued. Cleanup uses
LOGOUT/transport close and requires observed connection closure. A deadline closes
the stream/connection and prevents late results from issuing further commands.
`dependencies.createClient` and `dependencies.timers` are test injection points;
no production environment variable or input selects a test transport/CA.

## Access and acceptance boundaries

The operator's mixed Gmail inbox was approved for targeted connected-tool reads.
That does not grant a new background reader credential. A client-side read-only
filter does not restrict the account-level power of an IMAP password. Obtain
explicit approval for genuinely new provider access or production/recovery
credential retrieval before live use. Do not copy the production recovery bundle
or create a new app password merely because the software is installed.

The existing connected-inbox delivery and live logout proofs remain accepted.
Synthetic protocol tests qualify this adapter, not live reset/expiry/replay,
lease/cleanup orchestration, full report coverage or an application image.

For an upgrade, review the package/release and Node compatibility, request any
required dependency approval, update the exact pin and lockfile here, then repeat
unit and real TLS protocol tests, explicit lint, dependency audit and affected
source-security checks. Preserve published evidence; do not rewrite older proofs.
