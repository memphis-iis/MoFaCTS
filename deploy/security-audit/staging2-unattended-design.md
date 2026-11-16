# Desktop-independent audit on staging2

Status: connection installed, authorized and manually invoked, 2026-11-16.
Scheduled cloud execution remains unqualified. Phil selected desktop independence and confirmed staging2 is the
intended infrastructure. Original staging is excluded. The existing production
cutover remains separate and must include the complete solution.

## Observed infrastructure

The existing operator connection reaches staging2 over its Tailscale address.
Strict host verification passed against the already saved public-address host
identity using OpenSSH HostKeyAlias; no key, trust policy or SSH setting changed.
The public SSH connection timed out. These are different connection routes to
the same pinned host, not permission to accept a different host key.

Read-only inventory found systemd 255 running, two CPUs, 3,928,824 KiB total RAM,
2,756,928 KiB available at observation, and 25 GiB available on the root disk.
MoFaCTS, MongoDB and Redis were healthy. Two unrelated JEDM containers were
running and were not touched. No MoFaCTS/audit systemd timer was listed. Host
Node, npm and Nmap are absent; OpenSSL, jq, Git, timeout and flock are present.
Existing application and isolated-integration Docker images are available.
This is capacity inventory, not scanner load or availability qualification.

## Execution ownership

- Staging2 owns the recurring schedule, bounded scanner processes, exclusive
  environment lease, recovery manifest, encrypted report retention and durable
  run outcomes. A workstation is used only for implementation/operator access.
- Preserve daily exposure and Monday 06:00 UTC full-profile intent from the old
  workflow unless explicitly changed. Combine coincident due work without
  overlapping authentication fixtures. Record planned and actual run times.
- Use systemd's persistent calendar scheduling and a separate overdue-run check.
  Record missed deadlines rather than calling a delayed catch-up on-time.
- Separate scanner, signing and mailbox-handoff authority. Do not copy app/root
  credentials or the operator's private report-decryption key into a general
  scanner process. Use a pinned isolated scanner image; do not run package
  installation inside the serving app or reuse JEDM services as worker processes.
- Existing report assembly, encryption and receiver validation remain owners.
  Upload acceptance, exact readback, cleanup and complete execution are distinct
  states. A successfully uploaded ERROR report is not a completed audit.
- Native compilation/integration remains on the approved 6-GiB worker. Staging2's
  four-GiB host is not authorization to rerun the previously failed undersized
  integration profile or stop unrelated services for capacity.

## Connected Gmail boundary

Gmail authorization remains with the existing connector. Installing a timer on
staging2 does not make that connector callable by Node. The earlier hosted probe
established only an empty Gmail search; it did not establish server execution or
private handoff. The later desktop capability test was paused without observed
execution and cannot satisfy desktop independence.

Phil explicitly approved staging2-only connection qualification on 2026-11-15.
Actual user connection consent remains necessary after endpoint qualification.
The candidate in `connection/` exposes narrowly scoped operations
for an existing scheduled audit job: observe a pending mail request, signal that
the cloud reader is ready, submit its one exact selected message, and read a
content-free result. It cannot select another target, run shell commands, query
MongoDB, manage users, access unrelated files or request arbitrary mail.

The scanner must start its reset request only after the authorized cloud reader
is ready. A cloud trigger delayed by several minutes must not consume or extend
the existing two-minute delivery window. The current-reset owner continues to
validate exact synthetic recipient, namespace, origin, provider receipt timestamp,
one message, size and capability shape. Reject late, duplicate, cross-run and
ambiguous submissions. Do not infer delivery from SMTP or database records.

The server owns the original deadline and lease throughout. An agent timeout,
revoked connection, host reboot or expired handoff cannot release the lease or
authorize another job. Recovery must confirm the stopped owner and independently
verify owned cleanup before releasing it. Real unused-token aging remains
required; the current application expires reset tokens after one hour.

The integration needs authenticated HTTPS on staging2's existing 443 listener,
with a separate audit-only service behind it, not an unauthenticated capability
URL or a publicly exposed shell. Its connection authorization is distinct from
Gmail authorization. Official ChatGPT plugin documentation requires OAuth 2.1
for authenticated remote MCP services; it does not accept a custom API key as
an interchangeable connector authentication method. Do not embed bearer secrets
in plugin packages, task prompts, URLs or repository files.

The repository already uses the MCP SDK in the Mongo sidecar. That is reusable
dependency precedent, not permission to expose the analytics service, its Mongo
credential, or its tools. No suitable audit OAuth issuer or remote handoff is
established by that code. Before installation, resolve the exact supported
authorization/consent route, revoke test grants, and prove scheduled cloud access.
No new Gmail grant, IMAP password, paid hosting or production permission is part
of this proposed staging qualification.

## Failure and missed-run visibility

A timer on staging2 cannot report staging2 being powered off. An independent
hosted observer must check the expected run deadline and content-free outcome,
and notify the owner on missing execution, ERROR, cleanup failure, authentication
revocation or unreachable staging2. Merely retaining a local log is insufficient.
The hosted observer must itself have reviewed actual execution and notification
evidence. A schedule object or successful manual run is not this proof.

Keep job outcome separate from security findings. Security FAIL remains a
reported finding; missing evidence, deadline failure and unverified cleanup block
completion. Deduplicate alerts by scheduled occurrence and failure transition;
do not suppress continuing missed-run status because an earlier run passed.

## Qualification before production approval

1. Demonstrate the supported cloud execution and authenticated staging2 handoff
   with content-free data, including an actual scheduled run while no desktop
   worker participates. Do not infer this from the paused local automation.
2. Verify unauthorized callers, wrong audience/scope, expired grants, replay,
   payload bounds and cross-run submissions are denied. Verify revocation.
3. Exercise crash/restart, stalled reader and expired handoff with exact owned
   recovery and no overlapping synthetic identities.
4. Execute all 22 authentication controls and all full-profile producers against
   staging2, including actual fresh reset delivery and unused-token aging.
5. Verify encryption, storage, exact readback, plaintext cleanup and retention.
   Keep the decryption key off the scanner host; determine the authorized owner
   for unattended readback rather than silently relocating the private key.
6. Observe real timer execution, catch-up and injected failure/missed-run alerts,
   including staging2 unavailability as seen by the independent observer.
7. Finish runtime-registry and exact-image/source qualification from the existing
   plan. Prepare the complete production candidate and rollback unit for approval.
8. Only after approval: coordinated production host/app/scanner/receiver activation,
   real exposure/full acceptance, and retirement of obsolete GitHub triggers.

## Sources

- [Existing execution mandate](../../docs-developer/security-audit-durable-redesign-plan.md)
- [Current ledger](../../docs-developer/security-audit-durable-redesign-status.md)
- [Gmail validation and prior evidence](unattended-authentication-review.md)
- [Official plugin authentication](https://developers.openai.com/plugins/build/auth)
- [Hosted and desktop scheduling](https://learn.chatgpt.com/docs/automations?surface=app)

The initial infrastructure observations above are historical. The connection
endpoint, private cloud package, OAuth grant and systemd service were subsequently
installed and qualified for manual status use; see the sole status ledger.
Complete scanner execution, scheduled carriage and failure reporting remain open.
