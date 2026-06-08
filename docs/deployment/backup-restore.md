# Backup and Restore

Backups must include MongoDB, configuration, dynamic assets, H5P content, H5P libraries, and any configured OAuth/SAML key material.

Admins can create and inspect Open Core backup jobs from **Admin > Backups**. The app stores backup job metadata and manifest summaries in MongoDB. Archive files are stored outside MongoDB in the configured backup destination. In the first Open Core implementation this destination is local filesystem storage mounted into the app container as `/backups`, backed by `MOFACTS_BACKUP_HOST_PATH` on the host and defaulting to `/backups/mofacts`.

Same-server backups do not protect against server loss, disk loss, hosting-account loss, or accidental deletion of the backup directory. Copy completed archives off-server and periodically test restore on a separate instance.

## Admin Backup and Restore

Use **Admin > Backups** to:

1. Create a backup archive.
2. Inspect the archive manifest and included/excluded components.
3. Verify checksums before restore.
4. Download the archive through a short-lived admin-only download link.
5. Restore a selected backup by typing `RESTORE`.
6. Delete a selected local archive by typing `DELETE`.

App-level restore verifies the archive first, creates a pre-restore backup when `openCore.backups.requirePreRestoreBackup` is enabled, restores Mongo application collections, and restores local dynamic assets, H5P content, and H5P libraries. The restore control plane preserves `backup_jobs` and `auditLog` so the restore job and audit trail remain visible after the operation.

The archive may include settings, the self-hosted environment file, and key material for rebuild evidence. The running app does not overwrite those operator-owned files during app-level restore. Reapply config or certificate material manually from the archive when rebuilding a host or moving to a new server.

Redis is not included. Current Redis state is treated as reconstructable runtime coordination state.

Download links are one-use, short-lived, and require the requesting user to still have the admin role when the archive is streamed. Delete removes the local archive from the configured backup destination, marks the source backup job `deleted`, creates a completed delete job, and writes an audit event. Backup history and audit records remain.

Backup, verify, restore, and delete operations are mutually exclusive inside the app process, but there is not yet a full learner/content maintenance-mode gate. Run restores during a maintenance window.

## Manual Smoke Test

1. Start the self-hosted Open Core deployment.
2. Log in as an admin.
3. Open **Admin > Backups**.
4. Create a backup.
5. Confirm the job transitions to complete.
6. View the manifest.
7. Verify the backup.
8. Download the archive and store it off-server.
9. Create a small content change.
10. Restore the prior backup.
11. Run `/admin/tests` readiness checks.
12. Confirm restored content and assets are present.
13. Confirm audit records for backup and restore actions.
14. Delete a disposable backup archive and confirm the registry marks it deleted.
15. Confirm a non-admin user cannot access `/admin/backups` or call backup methods.

## Legacy Shell Runbook

The legacy shell backup remains available for operator runbooks:

```bash
cd deploy
ENV_FILE=.env.self-hosted ./backup-self-hosted.sh ./backups/mofacts-$(date -u +%Y%m%d-%H%M%S)
```

Shell restore is destructive and requires an explicit confirmation flag:

```bash
cd deploy
CONFIRM_DESTRUCTIVE_RESTORE=restore-overwrite ENV_FILE=.env.self-hosted ./restore-self-hosted.sh ./backups/mofacts-YYYYMMDD-HHMMSS
```

After any restore:

1. Start the Compose stack.
2. Run `/admin/tests` readiness.
3. Sign in as an admin.
4. Confirm content listing, dynamic asset serving, and H5P serving where applicable.
5. Launch one learner flow.

Take a backup immediately before upgrades. Keep the matching `.env`, settings file, source tag, image tag, and release notes with the backup.
