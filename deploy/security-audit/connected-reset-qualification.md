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
   actor binding, and its new password. The worker makes no creation/admin call.
3. The existing scanner channel carries the original metadata/body requests.
   Existing Gmail access may answer only its exact requested synthetic message.
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

## Email-verification prerequisite: decision prepared

The current app requires verified email for ordinary password logins. Preserve
that rule and progress-backed passwordless access. The existing mail connection
and validators accept password-reset evidence only; they do not validate an
account-verification capability. No verification request or message read has run.

Recommended: complete normal email verification for the exact disposable fixture
through the existing Gmail connection. Extend the broker/parser/skill narrowly
with an explicit verification purpose, source-owned message/link validation,
same target/namespace/recipient bounds, one selected message, original deadline
and private capability carriage. Keep the existing three tool names and separate
reset validation. No new mail credential, general inbox read or app access change
is needed. Qualify that path before relying on a verified-account precondition.

The new purpose would use the app's existing account-verification subject and
`/auth/verify-email?token=...` path, owned by the native `Accounts.verifyEmail`
flow. Do not apply the reset link's email/64-hex-token shape to this different
capability. Verification and reset would be sequential, explicit mail windows
under the same still-held fixture lease, each with its own original delivery
deadline. The private channel currently permits only one reset acquisition;
that state transition and the cloud skill require reviewed changes for this option.

Alternative: administratively seed only the owned fixture as email-verified
through a reviewed fixture operation. Global email verification stays enabled,
and no delivery/verification coverage is claimed. This avoids the extra mail
scenario but adds privileged fixture-state setup. Never set a passing observation
merely because the fixture record was seeded.

This choice determines the fixture evidence and allowed mail purpose. It is not
permission to disable verification globally, change real accounts, broaden Gmail
access or declare the complete authentication producer qualified.
