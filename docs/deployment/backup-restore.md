# Backup and Restore

Backups must include MongoDB, configuration, dynamic assets, H5P content, H5P libraries, and any configured OAuth/SAML key material.

Create a backup:

```bash
cd deploy
ENV_FILE=.env.self-hosted ./backup-self-hosted.sh ./backups/mofacts-$(date -u +%Y%m%d-%H%M%S)
```

Restore is destructive and requires an explicit confirmation flag:

```bash
cd deploy
CONFIRM_DESTRUCTIVE_RESTORE=restore-overwrite ENV_FILE=.env.self-hosted ./restore-self-hosted.sh ./backups/mofacts-YYYYMMDD-HHMMSS
```

After restore:

1. Start the Compose stack.
2. Run `/admin/tests` readiness.
3. Sign in as an admin.
4. Confirm content listing, dynamic asset serving, and H5P serving where applicable.
5. Launch one learner flow.

Take a backup immediately before upgrades. Keep the matching `.env`, settings file, source tag, image tag, and release notes with the backup.
