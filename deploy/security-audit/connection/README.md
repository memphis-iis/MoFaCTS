# Staging2 audit connection

Qualification candidate only. This service is not an audit executor or a
completed weekly audit. It cannot certify audit completion. Production and the
original staging server are outside its compiled target boundary.

## Authorization boundaries

| Surface | Required authority | Permitted effect |
| --- | --- | --- |
| OAuth/resource discovery | Public | Fixed staging2 metadata |
| OAuth registration/authorization | Bounded public protocol | Register a permitted ChatGPT callback; request consent |
| Consent | Bound browser cookie and expiring operator enrollment code | Authorize the selected mail/status scopes |
| Token exchange | Bound client, resource, redirect and S256 PKCE | Issue a short-lived token; rotate refresh tokens |
| Revocation | Client-bound token | Revoke its grant family |
| `audit_connection_status` | `audit:status` | Content-free connection state only |
| `audit_mail_request` | `audit:mail` | Signal reader readiness; obtain the scanner-owned exact request |
| `audit_mail_submit` | `audit:mail` | Validate and deliver only the outstanding metadata/body response |
| Private Unix socket | Private mount and current scanner lease | Open the owned handoff, submit requests, acknowledge verified cleanup |
| Private `recover` socket frame | Private mount, matching interrupted namespace, independently released lease | Clear only the connection's interrupted marker |

This is a separate deployment service, not a Meteor method, publication or
application HTTP route. Its authorization review is this table and its HTTP,
OAuth and private-socket tests. No application surface is reclassified.

The existing sidecar lock supplies SDK/Express/Zod dependencies in an isolated
image. Its analytics entry point and database settings are never loaded. No
mail credential, database credential, signing key, report decryption key or
Docker socket is mounted. Refresh and access tokens persist only as hashes.
Mail bodies and reset tokens remain in bounded process memory and the private
scanner channel; do not log requests or enable proxy body/header logging.

## Ownership and installation contract

Use the existing staging2 operator route and pinned host identity. First record
the five existing containers and the HTTPS configuration hash. Review an exact
source manifest and image identity. Qualify that exact image with its tests,
read-only filesystem, disabled external network, dropped capabilities and the
configured resource limits. A locally built image is not release evidence for
the MoFaCTS application.

The installation owns only `/opt/mofacts-audit-connection`,
`/var/lib/mofacts-audit-connection`, `/run/mofacts-audit-connection`, its one
systemd unit, and the explicitly reviewed Apache include. State is mode 0700,
UID/GID 2000; state files are 0600. The systemd runtime parent remains root-owned;
its `channel` child alone is UID/GID 2000 and is the private socket bind mount.
Systemd reapplies ownership of its managed parent at each execution boundary,
so changing the parent's owner in a pre-start command is insufficient.
The scanner lease directory is a separate
private mode-0700 directory mounted read-only here. Do not change ownership of
an existing directory without checking its current owner and purpose.

The systemd unit holds an exclusive host `flock` across Compose execution.
Every offline enrollment/revocation operation must stop that unit and acquire
the same lock before opening the state. Never run two state writers. The unit
owns removal of its runtime directory only after its old process has stopped.
An existing socket is not automatically deleted by the service.

Supply `AUDIT_CONNECTION_IMAGE` in root-owned `connection.env` using the exact
verified image identity. Compose may not build or pull at startup. Validate
Apache before reload; insert its include before the existing catch-all proxy.
The service publishes only loopback port 8943 through existing HTTPS port 443.
Confirm metadata, unauthenticated denial, container health, systemd ownership,
and unchanged application/JEDM containers before declaring installation passed.
The user must subsequently complete the actual connection consent; mocked
OAuth exchange does not establish cloud interoperability or scheduled access.

## Recovery and revocation

An interrupted mail handoff remains `recovery-required` across process restart.
Neither the public tools nor elapsed time can clear it. The scanner's existing
`recoverAuthenticationLeaseV2` owner must first prove the previous scanner
stopped and verify cleanup of its exact fixture namespace. Only that owner
releases the lease. It can then send the private frame
`{"operation":"recover","namespace":"<recorded namespace>"}`. The connection
requires the same recorded namespace and an existing real lease directory with
no lease file before acknowledging `closed`. A missing directory, another
namespace or a retained lease fails closed. This is connection recovery after
scanner cleanup, not evidence that mocked cleanup verified a real fixture.

For emergency revocation, stop the unit and run `main.mjs revoke` under its
exclusive lock using the exact image/private state mount, then restart. All
grants and pending codes are revoked. Enrollment writes a new one-time code to
an exclusive private file, never stdout; it expires after ten minutes and five
failed attempts. Deliver it privately to the operator only when linking is
ready. Do not include it in chat, URLs, commands, evidence or a plugin package.

Rollback disables/stops this unit, removes only its reviewed Apache include
after configuration validation, and reloads Apache. Preserve private state and
any unresolved scanner lease for owned recovery; do not erase audit evidence.
Recheck original containers and routes. Record exact backup hashes, artifact
identities and outcomes in the sole audit status ledger.

## Remaining acceptance

Actual cloud consent, refresh across restart, scheduled cloud execution without
a desktop, real exact-recipient Gmail carriage, full scanner integration,
failure/missed-run notification and all complete-audit acceptance remain
required. Synthetic connection tests do not satisfy those requirements. See
`../staging2-unattended-design.md` for the coordinated cutover gates.

The Docker engine's immutable image identity can be an OCI index rather than
its image-config checksum. Verify the transferred archive checksum, selected
engine identity, platform, source revision and config separately. Supply the
verified engine identity to Compose; do not silently substitute a tag when an
image-config checksum is not addressable. A successful component-test image is
also insufficient: qualify the actual `serve` process and supervisor readiness.
