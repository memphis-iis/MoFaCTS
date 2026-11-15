# Unattended authentication: credential-free connector design review

2026-11-15 status: offline helpers and actual interactive private handoff tested.
A single isolated scheduled capability probe ran in the cloud; its local
execution failed before starting. No production mailbox read, new credential,
production scope extension or recurring production scheduler was created.

## Selected design boundary

Phil confirmed on 2026-11-15 that the production audit must run with his desktop
and app off, and that staging2 is the intended server. The desktop-worker design
below is historical investigation, not the selected production architecture.
See the [staging2 design and measured prerequisites](staging2-unattended-design.md).
Staging2 owns scheduling and scanner execution; a supported authenticated cloud
handoff is still required to use the existing Gmail connection. No such handoff
or cloud authorization has been installed or qualified.

Use the existing connected Gmail tools **inside an authorized scheduled agent
execution**, retaining Gmail authorization in that connector. The same execution
must own the local browser/scanner job and its authentication lease, start the
reset request, acquire exact-recipient metadata, read only one selected message,
and pass the validated capability directly to that job through private process
input/memory. A Windows cron-style script cannot call the connected tool merely
because interactive ChatGPT can. No such scheduled-agent/local-worker binding
has been demonstrated in this task; this is a design candidate, not a running
service or a promise that the platform supplies the necessary bridge.

The existing `connectedGmailV2.mjs` now adds
`acquireConnectedGmailResetMessageV2`, using the existing mailbox owner and
provider-specific parsers. Its injected `listMessages(scope)` callback must use
the exact synthetic recipient and reset subject with at most ten metadata
results. `readMessage(id)` fetches only the unique selected full message.
The helper checks the original deadline before and after every asynchronous
boundary, rejects duplicate/ambiguous/invalid observations before body reads,
revalidates full-message identity, and returns transient validated metadata/plain
text plus the content-free delivery receipt, matching `captureCurrentResetV2`'s
private input. Missing mail stays `not-observed`. Slow or failed
callbacks cannot silently extend the two-minute delivery window. Raw connector
exceptions are replaced with a fixed error without a retained cause.

Callbacks are a transport interface, **not** an installed Gmail client, copied
OAuth token, IMAP reader, local web service, new provider grant or authenticated
remote endpoint. The helper does not log, write a file, export credentials,
poll independently, claim lease ownership or start a scheduler. A process owner
must enforce job cancellation and verified cleanup even if a tool callback hangs.
All existing recipient/token/clock/size/origin validation remains in force.

## Coverage and production constraints

The implementation still rejects production before making any connector call.
Current reset and lease contracts are staging2-only. Boolean-only inspection of
the existing production fixture established that its namespace, reset recipient
and expiry recipient do not match the V2 owned-namespace shapes. Do not simply
change the origin guard or reuse old fixtures as if they satisfy those contracts.

Before an unattended production path can be accepted, all of these require proof:

1. The scheduled execution can actually invoke the existing Gmail connection and
   control the same local worker without user interaction or exported credentials.
2. A private, bounded handoff to the same leased browser process is supported and
   tested; process failure/expired callbacks do not release tokens to another run.
3. Production synthetic-identity/recipient and lease scope is explicitly reviewed
   and authorized, with recovery/cleanup. No real account, new admin privilege or
   prohibited mailbox grant is implied by this review.
4. Live current-reset, single-use/replay, old/new password and independent-session
   invalidation checks pass. An unused token must really age for expiry; database
   timestamp edits or token reads cannot replace delivery/expiry observations.
5. Remaining authentication controls and full-profile producers execute and report
   honest ERROR results for missing evidence. A delivered email is not full audit
   qualification. Weekly job runtime and non-overlap must accommodate real aging.

No recurring manual checkpoint is proposed. If scheduled connected-tool execution
or the private handoff cannot be demonstrated, this design is not deployable under
the present no-new-credential rules. A partial scan must not be named a complete
unattended weekly audit.

## Researched alternatives

Google's [messages.list reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
requires Gmail OAuth authorization. Query filtering does not make it an
unauthenticated mailbox interface; search results contain identifiers and message
details require a separate read. Therefore a direct local Gmail API client does
not remove the credential boundary. This task adds no such client or grant.

Google's [push notification guide](https://developers.google.com/workspace/gmail/api/guides/push)
requires Pub/Sub resources, publish permission and recurring watch renewal.
Notifications can be delayed or dropped and carry mailbox/history identifiers,
not reset-message proof. This would add infrastructure and permissions beyond
the existing connector, so it was not provisioned or treated as a no-cost fix.

Direct database reset-token reads, intercepting outbound SMTP, disabling real
delivery, a new IMAP app password, or reusing production database/root credentials
would violate the selected evidence/access boundaries. None was implemented.

## Offline evidence

All 11 connected-Gmail/mailbox tests passed on pinned Node 24.22.1, including four
new acquisition cases: successful one-body selection with content-free receipt;
empty/ambiguous/duplicate/oversized metadata; expired/production rejection and a
slow body read; changed identity and secret-bearing connector exceptions.
Full `npm run lint` passed, including all 330 classified security surfaces.
No TypeScript app/runtime changed, no Meteor invocation was run, and no live
mailbox or production authentication coverage is claimed by these tests.

## Execution qualification on 2026-11-15

`connectedGmailStdioV2.mjs` connects the same acquisition owner to a bounded
private stdin transport. It emits only metadata/full-message requests, accepts
one matching request ID per response, rejects oversized/malformed/out-of-order
frames, enforces the original deadline even when its peer is silent, and returns
private evidence to the caller rather than printing it. Terminal input echo is
disabled before requesting responses and restored on completion. It accepts LF,
CR and CRLF; the actual Windows/WSL probe discovered the CR requirement. It does
not own or replace the authentication environment lease, browser cleanup or
provider authorization. Caller cancellation must preserve the existing recovery
obligation; never release a fixture lease merely because mail transport ended.

Actual evidence, kept separate from test fixtures:

- The one-time capability task was scheduled for 16:44:39 UTC and recorded a run
  at 16:49:05 UTC. It ran in the cloud. The parent received its result: exact
  nonexistent-recipient Gmail search succeeded with zero results, but the local
  read failed before execution with the Windows sandbox backend error. It did
  not verify the input or write the requested local result file. The task is now
  disabled/completed; no recurring production task exists. API run details were
  null, so the completion counter alone was not used as execution evidence.
- Interactive execution using the existing local Linux worker and existing
  Gmail connector successfully passed a real empty exact-synthetic-recipient
  search through private stdin. No email body or app request was used. The first
  terminal attempt timed out because of newline handling; the corrected rerun
  exited zero. This proves the interactive bridge, not scheduled execution.
- A separate actual terminal test passed generated metadata and a synthetic
  reset-message body through the two-stage protocol. The owning process verified
  receipt; captured terminal output contained neither the synthetic token nor
  reset link. This proves private carriage, not email delivery or authentication.
- All 28 mailbox/connector/private-process/current-reset tests pass on Node
  24.22.1. Nine real subprocess transport tests cover successful private handoff,
  empty results, CR/CRLF, wrong IDs, malformed/oversized input, EOF and timeout.
  A direct connector-to-current-reset regression verifies the unchanged private
  mail contract and reset/replay call order. Full lint and diff checks pass.

The scheduled failure does not establish that Gmail is inherently unsupported.
Desktop scheduling no longer satisfies the user's availability requirement.
The later local capability task was paused without observed execution. Neither
probe qualifies cloud-to-staging2 handoff. No desktop UI, copied connector
credential, new grant, mail service or production change was used.

The current full-profile emitter still calls
`writeSelectedAuthenticationProducerFileV2`: only selected authorization is
acquired, while the other 21 authentication controls explicitly remain ERROR.
The new mail transport does not change that fact. Full protocol acquisition,
catalog-compatible evidence integration, real aging, lease/cleanup recovery,
weekly execution and independent missed-run/failure visibility remain required.
The prior host-only installation proposal is expressly unauthorized; it is not
a substitute for completing those steps.
