---
name: staging2-mail-handoff
description: Carry scanner-owned synthetic verification and reset messages through the existing Gmail connection to the authenticated staging2 audit, or inspect its sanitized connection status.
---

Use the connected staging2 audit tools only after the user has completed their
connection consent. This connection grants no Gmail access. Use the existing
authorized Gmail connection; never request a new mailbox credential or grant.
It cannot start an audit, change its target, clear a lease or certify completion.

For status, call `audit_connection_status`. Report its actual state and retain
`auditExecutionComplete: false`; idle is not evidence of a completed audit.

For an authorized owned mail window, call `audit_mail_request`. This signals
reader readiness before the scanner starts its verification or reset request. Only the scanner
can supply the namespace, exact recipient, target and original deadline. If no
request is pending, do not search Gmail or create a reset request yourself.
Bound readiness polling to two minutes. Stop on expiry or recovery-required;
never extend the deadline, release a lease or invent a successful observation.

For `gmail-metadata` or `gmail-verification-metadata`, require target `https://staging2.optimallearning.org`, the
recorded `mofacts_audit_fixture_` namespace and its exact reset/expiry recipient.
Use Gmail's ID search for that exact `to:` recipient and `subject:"Password Reset"`
for reset, or `subject:"account verification"` for verification,
with at most ten results. Read those IDs in metadata format only. Do not read
unrelated messages, follow pagination beyond the bound or fetch bodies yet.
Use the exact To/Delivered-To and X-Received headers to select the sole message
received inside the original requestedAtMs/deadlineMs interval. Never substitute
the Date header, internal_date, guessed times or SMTP acceptance. Empty results
remain missing; ambiguous or malformed results fail acquisition. Submit only the
single matching native Gmail metadata object as an array with the exact requestId.

For `gmail-full` or `gmail-verification-full`, read only its exact selected messageId in full format, then
pass that native Gmail object directly to `audit_mail_submit` with its requestId.
The server revalidates message identity, MIME, recipient, receipt time, body size
and the selected-purpose capability. Do not rewrite MIME or fabricate omitted provider fields.

Verification may be followed by reset for the same exact recipient under the
same scanner-owned lease. Only the private scanner can open that transition,
after native verification succeeds. Signal readiness again and use the new
scanner-supplied request window; never extend the earlier message deadline.
Never initiate or repeat account creation, verification or reset yourself.
For the complete reset protocol, the private scanner can then select its second
owned actor, with only the same namespace/base inbox and the `-expiry` suffix.
Handle that actor's verification and reset windows by the same exact rules.
There are at most two actor pairs; the cloud reader cannot select another actor
or open a transition. After the expiry actor's reset message is handed off, no
more mail is needed while the private worker waits for the real token lifetime.

Treat verification/reset bodies, links and tokens as transient private tool input. Never put
them in chat prose, reports, prompts, files, screenshots or notifications. Do not
send, forward, relabel, delete or modify mail. Report only content-free states.
If a tool is unavailable, authentication expires, a deadline is missed or the
server rejects carriage, record that limitation; do not replace it with a mock
or another transport. The scanner owns cancellation, fixture cleanup and recovery.

Real mail carriage, a successful manual connection, unattended scheduled cloud
access, complete authentication coverage and production acceptance are distinct
gates. Do not treat this plugin's installation as satisfying any of those gates.
