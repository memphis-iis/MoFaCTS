# Production V2 host installation: action-time approval scope

**Not authorized: superseded by Phil's instruction that an incomplete fix is not
authorized (2026-11-15).** Retain this as an offline inventory/rollback analysis,
not an executable approval. Do not install, restart or change production from
this document. A complete qualified daily/weekly replacement must precede a
new coordinated production action-time review.

Prepared 2026-11-15. Nothing in this document has been installed or dispatched.
Approval covers host/receipt reconciliation only, not a claim that daily/weekly
audits are scheduled or that full authentication coverage is qualified.

## Exact target and retained application

- Existing production tailnet host, existing operator SSH identity and pinned
  host trust; no SSH/sudo/Tailscale/access-policy modification.
- Compose project `mofacts`, working directory `/var/www/mofacts`.
- Existing files, in order: `docker-compose.yaml`,
  `docker-compose.change-streams.yaml`; environment `/var/www/mofacts/.env`.
- Healthy app container observed: `0b9c3eb0cbae67f1518c6c6b9163eea987a054f794dfae5e62e1b7c234e9d97b`.
- Retain `ppavlikmemphis/mofacts-mini:prod-206488737f8f`, source
  `206488737f8fe3e9ad6c98d02c14bce38ac5f67a`. Observed engine index digest is
  `sha256:f3bd7f7470166a32c2c2ee56f91f825dc587127bd3f33421dd6c0070de7e4542`;
  saved verified config digest is
  `sha256:585d96374c1dc6cfd2e0a453420826717f1c29f2302ae4b2ccf877cf0e686f7d`.
  These are different graph identities, not a mismatch.

## Exact permitted filesystem/configuration changes

Use the reviewed public-source packet from source `206488737f8f`, manifest
SHA-256 `53fc61e43e984ba499e787a5e2cbcbefef8e1a670316ed01c789df704685476f`.
The 13 files are root-owned, mode 0755 for the three shell entry points and
0644 for the remaining policy/parser files:

1. `/usr/local/sbin/mofacts-host-exposure-audit` <- `host-audit-v2.sh`.
2. `/usr/local/libexec/mofacts-security-audit/host-observations.sh`.
3. `/usr/local/libexec/mofacts-security-audit/release-receipt.sh`.
4. Same library: `host-listener-policy.awk`.
5. Same library: `host-firewall-policy.awk`.
6. Same library: `host-apache-policy.awk`.
7. Same library: `host-sidecar-policy.jq`.
8. Same library: `host-mongo-roles.js`.
9. Same library: `host-mongo-connectivity.js`.
10. Same library: `read-default-concern-role.json`.
11. Same library: `host-measurements.v1.json`.
12. Same library: `releaseReceipt.mjs`.
13. Same library: `imageArchiveIdentity.mjs`.

In existing root:root 0600 `/etc/mofacts/security-audit.conf`, add only:

```sh
MOFACTS_PUBLIC_HOSTNAME=mofacts.optimallearning.org
MOFACTS_SIDECAR_EXPECTED_STATE=configured
```

Preserve every existing secret and other value; retain the configuration inode
used by receipt locking. Both fields are currently absent. Configured Sidecar
matches the existing service/account observations; no account or role change.

Create root:root 0700 `/etc/mofacts/release`; install the **existing** verified
receipt as root:root 0600 `release-receipt.json`. Exact file SHA-256:
`547ca56edb108ad8236942b66a20373be395b4b405a70c262cb5a4b511601c77`.
Its authoritative-record digest is
`5f227292e613e6283a89d755c705bb6be06504f6466f5249b75cac19f3561f52`.
The existing November 14 record, publication, running-image observation and
receipt were checked with the source-owned projector and match. Do not rewrite
release authority, forge acceptance, or create another release record.

Copy the existing reviewed `deploy/security-audit/receiver-release.compose.yml`
to `/var/www/mofacts/docker-compose.security-audit-receipt.yaml`, root:root 0644.
It adds only `/etc/mofacts/release` -> `/run/mofacts/release`, read-only, with
automatic host-path creation disabled. Do not mount the secret-bearing parent.

Update the **production** Compose command lines in canonical
`C:\dev\mofacts_config\deploy production.txt` to include this third overlay after
the existing two files for validation/start/restart/status. Preserve staging and
Sidecar commands. This keeps the mount across later normal deployments; it does
not execute those commands, build/push images or change credentials.

## App-only action and impact

After private backup and baseline/digest checks, validate the complete Compose
configuration without printing resolved secrets. Require the current image,
service settings and mount inventory to be unchanged except the one new mount.
Abort before recreation if source, app identity, protected inputs or sibling
container identities have drifted from the reviewed baseline.

From `/var/www/mofacts`, the sole service mutation is:

```sh
sudo docker compose --project-name mofacts --env-file .env \
  -f docker-compose.yaml -f docker-compose.change-streams.yaml \
  -f docker-compose.security-audit-receipt.yaml \
  up -d --no-deps --no-build --pull never mofacts
```

This recreates the app container with the same retained image. Current HTTP/DDP
connections disconnect and in-flight requests can fail; clients reconnect when
healthy. Plan a **10-minute maintenance window**, allowing up to five minutes
for acceptance and five for rollback. This is an operational budget, not a
measured downtime guarantee. A failure of Docker/host recovery could extend it.
MongoDB, Redis and both existing MCP Sidecars must retain their container IDs,
images and start times. Do not run Compose `down`, rebuild, pull, migrate, prune,
restart dependencies or alter learner records.

Acceptance: same app image/source; healthy app/HTTPS; readonly receipt mount;
fresh restricted V2 host acquisition; verified receipt MATCH; host policy
outcomes reported honestly; no arbitrary command/PTY/forwarding allowed. A full
authentication audit and recurring scheduler remain separate acceptance gates.

## Backup, rollback and cost boundary

Before writes, save only the touched originals and their exact owner/mode/hash,
presence/absence, original Compose invocation, old app image and sibling IDs to
a new root-private owned job directory. Keep secret config backups on the host;
do not download them. Verify the saved public cohort and original config hashes.
Retain the original `host-exposure-audit` bytes (observed SHA-256
`d6578ce200e70bba69b8c45cc8a451e666c0203776b23b045db820c9ebc4be3e`).

On failed acceptance, restore the touched original files/configuration, then
recreate only `mofacts` with the original **two-file** Compose invocation and
the retained image, again `--no-deps --no-build --pull never`. Confirm original
mounts/health and unchanged siblings. Remove only newly created owned files after
the restored app no longer references them; restore the command-sheet edit.
Never remove a path whose ownership/hash changed unexpectedly. Retain failed
attempt and rollback evidence. If rollback verification fails, stop and report
the exact recovery boundary; no broad remediation is preauthorized.

No new paid service, GitHub minutes, cloud resource, subscription, dependency,
account, permission or credential is requested. Work uses existing host/worker
CPU, storage and networking. This is not a guarantee about existing provider
usage charges. GitHub triggers remain unchanged until a real replacement passes.

## Concise approval wording

Approve one production V2 host/receipt reconciliation window, with the 13-file
packet and existing verified receipt above, the two explicit audit settings,
the one read-only mount and matching production command-sheet update; recreate
only the current app image, allow up to 10 minutes planned interruption, and
restore the saved baseline automatically if acceptance fails. No database,
firewall, access, credential, billing, dependency or GitHub-trigger changes.

Approval is required because this changes protected production files and
recreates the live app; AGENTS.md's production-action boundary and Phil's
explicit action-time-confirmation restriction apply. No approval is claimed.
