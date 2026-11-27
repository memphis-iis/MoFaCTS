# Connected staging2 reset qualification

Status: operator-assisted normal verification/current-reset qualification passed
on 2026-11-16. Complete protocol/scanner and scheduled-mail qualification remain open.
The existing remote tool image passed UID-2000 Node 24.22.1 / Playwright 1.60.0
checks and an actual anonymous browser preflight on 2026-11-16. That preflight
reported public signup enabled and email verification required.

## Ownership

The trusted fixture owner keeps the existing administrator credential out of
the ordinary scanner worker. It owns the fresh namespace, durable private
manifest, collision checks, insert-only account creation, exact owned deletion
and independent verification that the account and reset state are absent.
No existing account is reset or repurposed and no teacher/admin role is granted.

`connected-reset-worker.mjs` receives only the temporary ordinary account after
the cloud reader is ready. It composes the existing environment lease and
private scanner channel, the existing current-reset evaluator, and the maintained
`currentResetBrowserV2.mjs` transport. The browser transport owns two independent
baseline sessions, current/reset/replay logins and both prior-session probes.
It closes its contexts and reports fixed diagnostics on cleanup failure.

Run the worker with Docker `-i` so its private control stream remains open, only
in the explicitly qualified tool image, UID/GID 2000, with
read-only public source, private writable lease mount, private scanner socket,
bounded memory/CPU/PIDs, writable temporary browser storage and no published
port. Supply no Docker socket, application/database settings, admin credential,
provider credential, signing secret or private encryption key. The fixture
owner must prepare and verify cancellation/recovery before starting a real job.
The initial qualification is operator-assisted; it does not establish continuing
unattended fixture-administration custody.

## Private control protocol

Control uses bounded newline-delimited JSON over private process streams.
Passwords never occur in arguments, public output, log files or chat prose.

1. The worker acquires the source-owned lease and waits for cloud readiness.
2. It emits `fixture-needed` with its namespace. The owner creates and verifies
   only the named fixture, then replies with that operation, the private ordinary
   actor binding, its new password and `verification` mailbox binding. Record that
   binding's original request time before account creation sends the email. The
   worker makes no creation/admin call.
3. The existing scanner channel carries verification metadata/body requests.
   Existing Gmail access may answer only its exact requested synthetic message.
   The worker validates the capability, calls native Accounts verification, checks
   the exact owned identity and verified email, then logs out. It emits only a
   content-free `fixture-verified` receipt. Only then does it open a fresh reset
   readiness window under the same lease and run the existing reset scenario.
4. After scenario/browser termination, the worker emits `cleanup-required`.
   The owner removes only its fixture and independently verifies absence before
   replying with the same namespace and `verified: true`. A mere delete return
   value or closed browser is not the complete verification.
5. Only verified cleanup releases the lease and permits the service to clear
   its marker. `finished` carries sanitized results; it does not mean the results
   passed. Missing/ERROR results keep CLI execution nonzero. Security FAIL remains
   a finding and cannot be relabeled PASS.

EOF, wrong frames, missed deadlines, interrupted owner or failed cleanup retain
the owned recovery obligation. Prove the exact prior worker stopped, independently
verify its fixture/reset-state cleanup, and use the existing explicit lease and
connection recovery owners. Elapsed time cannot steal or clear a lease.

## Email-verification prerequisite: normal flow authorized

Normal verification of the disposable staging2 fixture is covered by standing
authorization. The operator confirmed on 2026-11-16 that this routine prerequisite
needs no additional approval. Preserve the app's verified-email requirement and
progress-backed passwordless access.

Use the existing Gmail connection for the exact disposable fixture. Extend the
broker, parser and skill with an explicit verification purpose, source-owned
message/link validation, the same target/namespace/recipient bounds, one selected
message and private capability carriage. Keep the existing three tool names and
separate reset validation. No new mail credential or general inbox read is needed.

Use the native `Accounts.verifyEmail` flow and the app's existing
`/auth/verify-email?token=...` link. Verification and reset have sequential,
explicit mail windows under the same held fixture lease; each keeps its own
original delivery deadline. Open the reset window only after native verification
and an independent check of the owned account. Never seed email verification,
disable it globally or change real accounts to obtain passing evidence.

## Accepted live evidence (2026-11-16)

Committed worker/observer source `86ba0c6001973c7d3f945f681f02d21628979ec0`
ran against staging2 with the existing qualified tool image `14819297...` and
optional connection image `d6eb31b8...` built from `e855b669`. The same private
plugin is version 0.1.3; its original app binding, grant and audience are preserved.
The registered tools became directly available in the operator conversation.

One exact-recipient verification message and one reset message each passed native
Gmail metadata selection, original ingestion-time bounds and private full-message
submission. Native verification, exact verified-account observation, reset,
replay denial, new-password login, old-password denial and both independent
old-session method/resume denials passed. Fresh session lifetime was within the
approved bounds. No mail body or capability was written to a handoff file.

Independent root-only observation confirmed the owned account and all reset
records for its exact ID/address absent after canonical admin deletion. Operator
sessions closed; the worker and lease are absent; direct connection status is
idle with `auditExecutionComplete: false`. Existing containers, HTTPS configuration
and app health remain unchanged. Private receipts are under
`phase1-20261105/connected-verification-20261116-21977f4a08a5`.

Retain the failed operator preparations separately: entrypoint startup messages
preceded the JSON result; a restricted Windows environment omitted `PATHEXT` and
`ProgramData`; and a Docker launch omitted `-i`. The failures created no account.
The stdin-failed worker retained its recovery marker/lease; the existing explicit
recovery owner cleared them only after worker termination and independent empty
fixture verification. The corrected complete path passed. Windows operator
subprocess allowlists must retain these two ordinary OS variables without
inheriting unrelated credentials.

This proves operator-assisted connected mail and the current reset/session
branch. Unused genuinely aged-token expiry, the catalog-complete authentication
artifact, scheduled mail and alert acceptance remain separate unfinished gates.

## Fresh reset first-use evidence

The explicit `first-use` worker scope opens one verified disposable account and
uses its fresh reset once. It confirms that the new password works and requires
verified cleanup before releasing the lease. Its receipt records the live
mail, first-use and ordinary login baseline. The complete single-use and
session controls retain their existing evidence requirements.

## Reset expiry evidence

The `expiry` worker scope collects only the expired-reset control. It uses the
same two owned accounts, mail windows, cleanup and real one-hour age check.
For the current-token baseline it submits the fresh reset once and verifies
ordinary sign-in with the new password. The other fixture makes one first-use
submission after its unused link has expired and confirms that its original
password remains valid. The worker reports expiry separately and leaves the
single-use and replay controls as `ERROR`. Keep both accounts disposable and
retain independent cleanup and exact deployment identity with the result.

## Complete reset protocol preparation

The worker's explicit `protocol` scope adds the separate `-expiry` actor required
by the source catalog. It preserves the accepted `current` scope. Both actors
use normal verification and distinct private mail windows under one held lease.
The bridge permits only the derived second recipient and at most two actor pairs.

The root fixture runtime's `reset-token-age` operation projects only creation and
expiry timestamps plus the used flag from exactly one record belonging to the
verified owned ID/address. It never reads its hash or capability. The collector
keeps the selected mail capability in memory, waits for the real one-hour
lifetime, rechecks lease/channel ownership at bounded intervals and rejects a
used, missing, ambiguous or inconsistent record. It never backdates a record or
changes a clock. A private lease confirmation keeps the socket active without
extending either the job deadline or a mail delivery window.

Use a deadline with room for that hour plus setup/cleanup, within the existing
two-hour lease bound. Independent cleanup must cover both accounts and their
reset records. The shared Windows child-environment profile admits `PATHEXT` and
`ProgramData`; use that existing owner rather than inheriting the operator's
complete environment. Preparation/tests do not claim the live aged-token gate.
