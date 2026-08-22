# Self-Hosted Settings Reference

Runtime settings are mounted at `/run/mofacts/settings.json`. `METEOR_SETTINGS_FILE` identifies that file, and the container entrypoint loads it into Meteor's standard `METEOR_SETTINGS` environment variable before Node starts. Self-hosted production must not rely on baked settings.

Required settings:

- `ROOT_URL`: public URL of the app. Must match the `ROOT_URL` environment variable.
- `owner`: first owner/admin email.
- `initRoles.admins`: non-empty admin email list. Include `owner`.
- `encryptionKey`: at least 32 random characters. Keep stable across restores.
- `auth.allowPublicSignup`: boolean. Normally `true` for first-run self-hosting.
- `auth.requireEmailVerification`: boolean.
- `auth.argon2Enabled`: boolean.
- `public.packages.accounts.clientStorage`: must be `session` so login
  credentials remain scoped to the current browser tab.
- `MAIL_URL`: required when `enableEmail` or `prod` is true.
- `emailFrom`: required when `enableEmail` or `prod` is true. Use a sender identity authenticated by the SMTP provider, for example `MoFaCTS <no-reply@example.org>`.
- `emailReplyTo`: optional reply-to address for system mail.
- `openCore.requireRedis`: `true` for the completed self-hosted runtime.
- `openCore.backups.enabled`: enables the admin backup control plane.
- `openCore.backups.localBackupPath`: container path for local backup archives. In self-hosted Compose this is `/backups`.
- `public.sourceUrl`: exact public source tag or archive URL exposed by the app footer License / Source link.

Required environment:

- `METEOR_SETTINGS_HOST_PATH`: private host settings path.
- `MONGO_URL`: app-user MongoDB URL with credentials, `authSource`, and the configured `replicaSet` name.
- `EXPECTED_MONGO_DB_NAME`: normally `MoFACT-meteor3`.
- `MOFACTS_MONGO_REPLICA_SET_NAME`: immutable replica-set identity expected by MongoDB and application readiness; defaults to `mofacts-rs` in Compose.
- `MOFACTS_MONGO_REPLICA_SET_MEMBER`: DNS name and port advertised by the initial member; defaults to `mongodb:27017`. Later members may be added without changing the logical database contract.
- `MONGO_REPLICA_SET_KEYFILE_HOST_PATH`: private host file containing the shared replica-set member-authentication key. Every future member must receive the same key securely.
- `MOFACTS_SELF_HOSTED`: set to `true` for the self-hosted production Compose path.
- `METEOR_REACTIVITY_ORDER`: must be `changeStreams`. MoFaCTS rejects polling
  and all alternate reactive observer drivers. Incompatible reactive cursors
  must be redesigned or made explicitly non-reactive.
- `DDP_TRANSPORT`: must be `sockjs` for the contained Meteor 3.5 base.
- `MOFACTS_REDIS_PASSWORD`: URL-safe random Redis credential of at least 32
  characters. Compose uses it to require Redis authentication and construct the
  private application `REDIS_URL`; do not maintain a second password in the URL.
- `MONGO_INITDB_ROOT_USERNAME` and `MONGO_INITDB_ROOT_PASSWORD`: Mongo root bootstrap credentials.
- `MOFACTS_MONGO_APP_USERNAME` and `MOFACTS_MONGO_APP_PASSWORD`: app database user credentials.
- `MOFACTS_BACKUP_HOST_PATH`: host directory mounted into the app container as `/backups`. Defaults to `/backups/mofacts`.
- `MOFACTS_ENV_FILE_HOST_PATH`: host path to the private `.env.self-hosted` file mounted read-only for backup inclusion. Defaults to `./.env.self-hosted` from the deploy directory.

Optional integrations:

- `google.clientId` and `google.secret`: required only when Google OAuth is enabled.
- `microsoft.clientId` and `microsoft.secret`: required only when Microsoft OAuth is enabled.
- `saml.memphis`: required only when `saml.memphis.enabled` is true.
- `storage.backend`: `local` by default; `s3` enables the S3-compatible object storage adapter and must not silently fall back to local storage.

Local storage settings:

- `storage.local.dynamicAssetsPath`: app-served dynamic assets path. Set this explicitly to the durable host-mounted directory in each environment.

S3-compatible storage settings:

- `storage.s3.endpoint`: object store endpoint URL, for example `https://s3.example.org`.
- `storage.s3.bucket`: bucket name.
- `storage.s3.region`: S3 region string.
- `storage.s3.accessKeyId` and `storage.s3.secretAccessKey`: object store credentials.
- `storage.s3.prefix`: optional object key prefix for this MoFaCTS instance.
- `storage.s3.forcePathStyle`: optional boolean. Defaults to `true`, which is normally required for MinIO and many S3-compatible services.

When `storage.backend` is `s3`, deployment readiness writes, heads, reads, and deletes a temporary `readiness/...txt` object. Missing bucket, invalid endpoint, invalid credentials, and insufficient object permissions fail readiness and do not switch to local storage. Dynamic assets and package export zips are read from S3 metadata in S3 mode. Existing local-only asset records need migration metadata before switching an existing install to S3.

Backup settings:

- `openCore.backups.backend`: `local` for Open Core backup archives. The schema keeps a backend field so S3-compatible archive destinations can be added without changing the admin UI or registry model.
- `openCore.backups.includeSettings`: include `/run/mofacts/settings.json`.
- `openCore.backups.includeEnvironmentFile`: include `/run/mofacts/env.self-hosted`.
- `openCore.backups.includeKeyMaterial`: include mounted key/certificate material from `/mofactsAssets_override`.
- `openCore.backups.maxRetainedBackups`: retained-backup policy limit for future cleanup automation.
- `openCore.backups.requirePreRestoreBackup`: restore safety policy. App-level restore must create a pre-restore backup before destructive restore unless an explicit future admin option disables it.

Local backups are written inside the app container at `/backups`, backed by the host directory `MOFACTS_BACKUP_HOST_PATH` or `/backups/mofacts`. Same-server backups do not protect against server or disk loss; copy completed archives off-server and test restore on a separate instance.

For production deliverability, `emailFrom` should use a domain that has SPF, DKIM, and DMARC configured for the `MAIL_URL` provider. Do not use a personal Gmail address as the sender for SMTP mail sent through another provider.

Placeholder values such as `example`, `your-domain`, `changeme`, and `replace-me` are rejected by startup validation.
