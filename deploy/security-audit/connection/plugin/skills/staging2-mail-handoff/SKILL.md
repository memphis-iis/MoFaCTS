---
name: staging2-mail-handoff
description: Carry one scanner-owned synthetic reset message through the existing Gmail connection to the authenticated staging2 audit, or inspect its sanitized connection status.
---

Use the connected staging2 audit tools only after the user has completed their
connection consent. This connection grants no Gmail access. Use the existing
authorized Gmail connection; never request a new mailbox credential or grant.
It cannot start an audit, change its target, clear a lease or certify completion.

For status, call `audit_connection_status`. Report its actual state and retain
`auditExecutionComplete: false`; idle is not evidence of a completed audit.

For an authorized owned mail window, call `audit_mail_request`. This signals
reader readiness before the scanner starts its reset request. Only the scanner
can supply the namespace, exact recipient, target and original deadline. If no
request is pending, do not search Gmail or create a reset request yourself.
Bound readiness polling to two minutes. Stop on expiry or recovery-required;
never extend the deadline, release a lease or invent a successful observation.

For `gmail-metadata`, require target `https://staging2.optimallearning.org`, the
recorded `mofacts_audit_fixture_` namespace and its exact reset/expiry recipient.
Use Gmail's ID search for that exact `to:` recipient and `subject:"Password Reset"`,
with at most ten results. Read those IDs in metadata format only. Do not read
unrelated messages, follow pagination beyond the bound or fetch bodies yet.
Use the exact To/Delivered-To and X-Received headers to select the sole message
received inside the original requestedAtMs/deadlineMs interval. Never substitute
the Date header, internal_date, guessed times or SMTP acceptance. Empty results
remain missing; ambiguous or malformed results fail acquisition. Submit only the
single matching native Gmail metadata object as an array with the exact requestId.

For `gmail-full`, read only its exact selected messageId in full format, then
pass that native Gmail object directly to `audit_mail_submit` with its requestId.
The server revalidates message identity, MIME, recipient, receipt time, body size
and reset capability. Do not rewrite MIME or fabricate omitted provider fields.

Treat reset bodies, links and tokens as transient private tool input. Never put
them in chat prose, reports, prompts, files, screenshots or notifications. Do not
send, forward, relabel, delete or modify mail. Report only content-free states.
If a tool is unavailable, authentication expires, a deadline is missed or the
server rejects carriage, record that limitation; do not replace it with a mock
or another transport. The scanner owns cancellation, fixture cleanup and recovery.

Real mail carriage, a successful manual connection, unattended scheduled cloud
access, complete authentication coverage and production acceptance are distinct
gates. Do not treat this plugin's installation as satisfying any of those gates.
