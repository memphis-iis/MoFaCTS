# Troubleshooting

Startup fails before app boot:

- Check `METEOR_SETTINGS_HOST_PATH` points to a real private settings file.
- Check `METEOR_SETTINGS_WORKAROUND` is `/run/mofacts/settings.json` inside the container.
- Replace placeholders in settings and `.env`.
- Confirm `ROOT_URL` matches in settings and environment.

MongoDB failures:

- Self-hosted production requires authenticated MongoDB.
- `MONGO_URL` must use the MoFaCTS app user and target `MoFACT-meteor3`.
- Existing volumes keep old Mongo init state; recreate only after taking backups.

Redis failures:

- `REDIS_URL` is required when `openCore.requireRedis` is true.
- Dashboard cache refreshes use Redis locks and fail clearly when Redis is unavailable.

Storage failures:

- Dynamic asset, H5P content, and H5P library directories must exist and be readable/writable by the app container.
- S3-compatible storage is explicit. Invalid S3 config must be fixed; the app does not fall back to local storage.
- For `storage.backend: "s3"`, check `storage.s3.endpoint`, `bucket`, `region`, credentials, optional `prefix`, and `forcePathStyle`.
- Deployment readiness writes, heads, reads, and deletes a temporary object under `readiness/`. Failures there mean the app cannot safely use S3 for uploaded assets or H5P package files.
- If S3 mode reports missing asset metadata, the database record still points at local storage. Re-import the package/content or run a deliberate migration before switching that install to S3.

Readiness failures:

- `/health` only proves the process is alive.
- `/admin/tests` deployment readiness reports settings, MongoDB, first-admin account, storage, and Redis checks.

Worker expectations:

- Self-Hosted MoFaCTS does not ship a separate worker process in the first open-core milestone.
- Dashboard cache coordination runs inside the app process and uses Redis locks; MongoDB remains the durable record.
- If a future release adds queued worker jobs, release notes must name the worker service, startup dependencies, replica guidance, readiness signals, log locations, retry behavior, and backup implications.
