# Self-Hosted Settings Reference

Runtime settings are mounted at `/run/mofacts/settings.json` and loaded through `METEOR_SETTINGS_WORKAROUND`. Self-hosted production must not rely on baked settings.

Required settings:

- `ROOT_URL`: public URL of the app. Must match the `ROOT_URL` environment variable.
- `owner`: first owner/admin email.
- `initRoles.admins`: non-empty admin email list. Include `owner`.
- `encryptionKey`: at least 32 random characters. Keep stable across restores.
- `auth.allowPublicSignup`: boolean. Normally `true` for first-run self-hosting.
- `auth.requireEmailVerification`: boolean.
- `auth.argon2Enabled`: boolean.
- `MAIL_URL`: required when `enableEmail` or `prod` is true.
- `emailFrom`: required when `enableEmail` or `prod` is true. Use a sender identity authenticated by the SMTP provider, for example `MoFaCTS <no-reply@example.org>`.
- `emailReplyTo`: optional reply-to address for system mail.
- `openCore.requireRedis`: `true` for the completed self-hosted runtime.
- `public.sourceUrl`: exact public source tag or archive URL exposed by the app footer License / Source link.

Required environment:

- `METEOR_SETTINGS_HOST_PATH`: private host settings path.
- `MONGO_URL`: app-user MongoDB URL with credentials and `authSource`.
- `EXPECTED_MONGO_DB_NAME`: normally `MoFACT-meteor3`.
- `MOFACTS_SELF_HOSTED`: set to `true` for the self-hosted production Compose path.
- `REDIS_URL`: Redis connection string when Redis is required.
- `MONGO_INITDB_ROOT_USERNAME` and `MONGO_INITDB_ROOT_PASSWORD`: Mongo root bootstrap credentials.
- `MOFACTS_MONGO_APP_USERNAME` and `MOFACTS_MONGO_APP_PASSWORD`: app database user credentials.

Optional integrations:

- `google.clientId` and `google.secret`: required only when Google OAuth is enabled.
- `microsoft.clientId` and `microsoft.secret`: required only when Microsoft OAuth is enabled.
- `saml.memphis`: required only when `saml.memphis.enabled` is true.
- `storage.backend`: `local` by default; `s3` enables the S3-compatible object storage adapter and must not silently fall back to local storage.

Local storage settings:

- `storage.local.dynamicAssetsPath`: app-served dynamic assets path. Default is `$HOME/dynamic-assets`.
- `storage.local.h5pContentPath`: self-hosted H5P content path. Default is `$HOME/h5p-content`.
- `storage.local.h5pLibrariesPath`: self-hosted H5P library path. Default is `$HOME/h5p-libraries`.

S3-compatible storage settings:

- `storage.s3.endpoint`: object store endpoint URL, for example `https://s3.example.org`.
- `storage.s3.bucket`: bucket name.
- `storage.s3.region`: S3 region string.
- `storage.s3.accessKeyId` and `storage.s3.secretAccessKey`: object store credentials.
- `storage.s3.prefix`: optional object key prefix for this MoFaCTS instance.
- `storage.s3.forcePathStyle`: optional boolean. Defaults to `true`, which is normally required for MinIO and many S3-compatible services.

When `storage.backend` is `s3`, deployment readiness writes, heads, reads, and deletes a temporary `readiness/...txt` object. Missing bucket, invalid endpoint, invalid credentials, and insufficient object permissions fail readiness and do not switch to local storage. Dynamic assets, package export zips, H5P content, and H5P libraries are read from S3 metadata in S3 mode. Existing local-only asset records need migration metadata before switching an existing install to S3.

For production deliverability, `emailFrom` should use a domain that has SPF, DKIM, and DMARC configured for the `MAIL_URL` provider. Do not use a personal Gmail address as the sender for SMTP mail sent through another provider.

Placeholder values such as `example`, `your-domain`, `changeme`, and `replace-me` are rejected by startup validation.
