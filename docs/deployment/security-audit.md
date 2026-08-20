# Periodic Confidentiality and Account-Compromise Audit

MoFaCTS has an observation-only security audit for `https://mofacts.optimallearning.org`. It records evidence about confidentiality, authentication, public and internal exposure, and source security. A red report does not stop services, block traffic, alter a firewall or proxy, deploy code, or change real accounts.

This assessment intentionally excludes backup, restore, uptime, disk health, capacity, and disaster recovery. The scanners remain independent of application deployment, but the application now receives their sanitized reports through one authenticated endpoint so administrators can review them at `/admin/security-audits`.

## Schedule and result semantics

`.github/workflows/production-security-audit.yml` runs:

- Daily at 06:00 UTC: external and host exposure controls.
- Monday at 06:00 UTC: all four sections, adding production authentication and repository/image controls.
- Manually with an `exposure` or `full` scope.

The workflow uses the protected `production-security-audit` GitHub environment, has only `contents:read`, and serializes runs without cancelling an active audit. Every run assembles a bounded, sanitized JSON report, sends it to the application, and encrypts it before uploading it as a 90-day recovery artifact. Plaintext reports and raw scanner output remain ephemeral and are removed from the runner.

An audit with security findings still completes successfully. Missing tools, malformed scanner output, unavailable fixtures, or incomplete controls are recorded as `ERROR`; the report is stored and the encrypted artifact is uploaded before the workflow fails to signal that authoritative evidence was incomplete. Failure to store the report also fails the workflow. Public workflow output contains only generic execution messages and encrypted-artifact metadata.

## Protected GitHub environment

Create a protected environment named `production-security-audit`. Restrict its administrators and add these environment secrets:

| Secret | Purpose |
| --- | --- |
| `AUDIT_SSH_HOST` | Production host name or address. |
| `AUDIT_SSH_USER` | Dedicated account whose key is forced to the audit command. |
| `AUDIT_SSH_PRIVATE_KEY` | Restricted key; it must not be accepted for a shell. |
| `AUDIT_SSH_KNOWN_HOSTS` | Pinned host-key line, created and reviewed out of band. |
| `AUDIT_AUTH_FIXTURES_JSON` | Dedicated synthetic tenant/account IDs and deterministic authorization probes. |
| `AUDIT_IMAPS_PASSWORD` | Password for the dedicated reset-test mailbox only. |
| `AUDIT_REPORT_INGEST_SECRET` | HMAC key shared only with the production application. |

Add `AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY` as a protected environment variable. It is an RSA public key, not a secret. The matching private key must remain solely with authorized operators and must never be placed in GitHub, the production server, the application settings, or source control.

Generate the encryption key pair on an operator-controlled machine:

```powershell
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out mofacts-security-audit-private.pem
openssl pkey -in mofacts-security-audit-private.pem -pubout -out mofacts-security-audit-public.pem
```

Copy the complete public PEM into `AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY`. Protect the private key with the same care as an administrative credential. Report encryption uses RSA-OAEP-SHA256 to wrap a random AES-256-GCM content key; the private key is never available to the runner.

Do not put real administrator, teacher, or learner credentials in the protected environment. The browser runner may use only the audit tenant and synthetic identities. The Sidecar is not invoked by the workflow.

Generate the ingestion key on an operator-controlled machine and place the same value in the protected GitHub environment as `AUDIT_REPORT_INGEST_SECRET` and in the production app environment as `MOFACTS_SECURITY_AUDIT_INGEST_SECRET`:

```powershell
openssl rand -base64 48
```

Do not put the value in source control, workflow logs, application settings JSON, or shell history. The endpoint accepts only `application/json`, limits requests to 2 MiB, requires an HMAC-SHA256 signature over the timestamp, nonce, and body digest, rejects timestamps outside five minutes, and rejects reused nonces, report IDs, and report digests.

`AUDIT_AUTH_FIXTURES_JSON` must describe two learners, two teachers, a synthetic audit administrator, reset, expiry, and lockout identities; an existing incomplete passwordless-study participant; IMAPS host/user/mailbox; method, publication, route, and download authorization probes; canary values; at least 12 unique connection-throttle identifiers; and at least 21 unique IP-throttle identifiers. The reset identity has two audit-only passwords and alternates between them across runs.

## Restricted host command

Install the tracked script as a root-owned executable and its configuration as root-only data:

```bash
sudo install -o root -g root -m 0755 deploy/security-audit/host-exposure-audit.sh /usr/local/sbin/mofacts-host-exposure-audit
sudo install -d -o root -g root -m 0700 /etc/mofacts
sudo install -o root -g root -m 0600 deploy/security-audit/security-audit.conf.example /etc/mofacts/security-audit.conf
sudoedit /etc/mofacts/security-audit.conf
```

Replace every example value. Configure exact management CIDRs, current container names, the expected MongoDB replica set and database, scoped app/Sidecar MongoDB users, a MongoDB audit credential, the Redis audit password, and the active enabled Apache HTTPS site. Missing settings or tools produce audit errors.

Restrict the dedicated SSH public key to the forced command:

```text
restrict,no-pty,no-agent-forwarding,no-port-forwarding,no-X11-forwarding,command="sudo -n /usr/local/sbin/mofacts-host-exposure-audit" ssh-ed25519 PUBLIC_KEY audit
```

Test that the key cannot open a shell, request a PTY, forward a port, or run another command. The host script reads only whitelisted socket, Docker port/network, active Apache HTTPS virtual-host routing, UFW, MongoDB, Redis, running-image, and connectivity information. It does not print container environments or credentials and does not change state.

The host must provide `bash`, `jq`, `ss`, Docker, UFW, Apache (`apache2ctl` and its systemd unit), and the active enabled HTTPS site configured by `APACHE_HTTPS_SITE_FILE`. MongoDB and Redis probes execute their clients inside the configured containers. Sidecar ports must be absent or exactly `127.0.0.1:8931` and `127.0.0.1:8932`.

## Synthetic production fixtures

Create a dedicated audit tenant with no real learner data. Provision two learners, two teachers, one synthetic audit administrator, reset/session, expiry, and lockout users plus one existing incomplete passwordless-study participant. Assign only the minimum courses, histories, dashboard state, settings, routes, and exports needed by the configured probes. Seed recognizable non-secret canaries in these synthetic records so the runner can detect cross-user payload and logging leakage without retaining raw responses.

The authorization probe matrix must cover anonymous, self, other learner, teacher, and admin-only behavior across methods, publications, routes, downloads, courses, histories, dashboards, experiment state, settings, and admin surfaces. Brute-force probes run last and may affect only the lockout canary and unique synthetic throttle identifiers.

The IMAPS mailbox must be dedicated to the reset identity. It retains the previous run's reset message long enough to test token expiry, while the current message proves one-time use and replay rejection. Never reuse a personal or production-support mailbox.

## Source and scanner contracts

`npm run security:surfaces` compares every discovered Meteor method, publication, HTTP handler, export, and management route with `mofacts/security-surface-contract.json`. New or removed server surfaces fail until their access classification is reviewed. `npm run security:test:source` tests canonical hashing, redaction, scanner parsers, encryption integrity, malformed/missing evidence handling, and canary detection.

UDP results are fail-closed without overstating uncertainty: an exact `open` state is a finding, every selected port must be reported `closed` to pass, and `open|filtered`, another inconclusive state, duplicate evidence, or missing results produce `ERROR`. TLS cipher review parses only enumerated cipher entries and their grades; a normal `compressors: NULL` line is not a weak cipher. Failed reset-token and throttle subprobes use fixed non-secret IDs. Failed authorization probes use deterministic category-and-position IDs, retain at most 12 sanitized observations, and record how many additional failures were omitted.

The regular Security workflow performs a redacted full-history Gitleaks scan, both npm lockfile audits, and the source contract tests. The Monday audit additionally scans an image built from the audited checkout with pinned Trivy. The running production image digest is recorded as informational evidence when the restricted host command can observe it; it does not alter or gate the production deployment.

The report's `sourceRevision` identifies the audit workflow checkout, not a claim that a clean Git tree was deployed to production.

## Review and download reports

Administrators review summaries at `/admin/security-audits`. The page shows the latest exposure and full reports, freshness warnings after 36 hours and eight days respectively, section status, severity counts, target, source revision, production image identity, and the recent 90-day history. The collection is never published; full findings are not sent to the page.

JSON and standalone escaped HTML downloads use five-minute, single-use tokens. Every response uses `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and exact-body SHA-256 headers. The JSON contains the canonical report and its report digest.

The encrypted Actions artifact remains a recovery copy. To inspect that copy, download it from the completed Actions run and decrypt it locally from `mofacts/` into a new file:

```powershell
node scripts/security-audit/decrypt-report.mjs C:\path\report.encrypted.json C:\path\report.json C:\secure\mofacts-security-audit-private.pem
```

The decryptor refuses to overwrite an existing output file, authenticates the AES-GCM ciphertext, and verifies the canonical report SHA-256 before writing the plaintext with restrictive permissions where the operating system supports them. Delete decrypted copies when the review is complete.

## First run and interpretation

Do not start the first manual full run until the restricted SSH command, explicit UFW management CIDRs, encryption public key, dedicated mailbox, and complete synthetic fixtures exist.

The first strict report may be red. Passwordless experiment sessions are expected to receive anonymous resume tokens; the control tests that those sessions remain contained to the sealed experiment target and cannot reach ordinary-account, cross-user, or administrative surfaces. Other initial findings may include unauthenticated Redis or missing CSP. These are evidence for separately approved remediation; the audit does not change those behaviors.

Treat an `ERROR` as missing authoritative evidence, never as a passing control. The application report history is the primary administrator view; the encrypted artifact is the independent recovery copy. Codex or an operator may interpret findings, but neither path remediates production automatically.
