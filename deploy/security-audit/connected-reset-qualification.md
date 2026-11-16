# Connected staging2 reset qualification

Status: source prepared and tested; actual mail/account execution has not started.
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

Run the worker only in the explicitly qualified tool image, UID/GID 2000, with
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

Implementation and live qualification remain pending. No verification request,
message read or passing authentication observation is claimed by this note.
