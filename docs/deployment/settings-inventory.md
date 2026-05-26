# Self-Hosted Settings Inventory

This inventory classifies the self-hosted configuration surface used by application code, startup validation, deployment scripts, and operator examples. The operator-facing reference remains `settings-reference.md`; this file is the release-readiness audit view.

## Meteor Settings

| Setting | Classification | Required When | Consumers |
| --- | --- | --- | --- |
| `ROOT_URL` | required, private-server, deployment-specific | self-hosted production | startup validation, readiness, SAML URL derivation, password reset links |
| `owner` | required, private-server, deployment-specific | self-hosted production | startup validation, first-admin readiness, server utilities |
| `initRoles.admins` | required, private-server, deployment-specific | self-hosted production | startup validation, first-admin role assignment |
| `initRoles.teachers` | optional, private-server, deployment-specific | when pre-seeding teacher roles | role bootstrap flow |
| `encryptionKey` | required, private-server, secret | always for self-hosted production | API/key encryption helpers |
| `prod` | optional, private-server | production behavior flag | email default behavior and startup mode |
| `enableEmail` | optional, private-server | required to send mail deliberately | startup validation and server email helpers |
| `MAIL_URL` | production-only, private-server, secret | when `enableEmail` or `prod` enables mail | Meteor mail transport |
| `mturkSandbox` | optional integration, private-server | MTurk workflows | auth/support and MTurk workflow methods |
| `auth.allowPublicSignup` | required, private-server/public behavior | self-hosted production | signup method guard |
| `auth.requireEmailVerification` | required, private-server/public behavior | self-hosted production | auth state and verification flow |
| `auth.argon2Enabled` | required, private-server | self-hosted production | password hash runtime |
| `auth.enableBreachedPasswordScreening` | optional, private-server | when screening is enabled | auth settings template; not required by open-core validation |
| `google.clientId`, `google.secret` | optional integration, private-server, secret | when Google OAuth is enabled | OAuth settings validation |
| `microsoft.clientId`, `microsoft.secret` | optional integration, private-server, secret | when Microsoft OAuth is enabled | OAuth settings validation |
| `saml.memphis.*` | optional integration, private-server, secret-capable | when Memphis SAML is enabled | SAML metadata/config helpers |
| `openCore.requireRedis` | required, private-server | completed self-hosted runtime | Redis validation and Redis boundary creation |
| `openCore.redisUrl` | optional, private-server, secret-capable | only if not using `REDIS_URL` | Redis boundary creation |
| `storage.backend` | optional, private-server | defaults to `local`; `s3` enables object storage | storage boundary, readiness, package/H5P/media paths |
| `storage.local.*Path` | optional, private-server | local storage backend | storage boundary, readiness |
| `storage.s3.*` | optional integration, private-server, secret-capable | S3-compatible storage backend | storage boundary and readiness |
| `public.systemName` | public-client | optional branding | client title/branding |
| `public.forceSSL` | public-client | public HTTPS deployments | client SSL redirect behavior |
| `public.sourceUrl` | public-client | public source traceability | footer License / Source link |
| `public.socialPreview.*` | public-client | optional preview metadata | social preview/http metadata |
| `debug` | development-only/private-server | local debugging | settings template only |

## Environment Variables

| Variable | Classification | Required When | Consumers |
| --- | --- | --- | --- |
| `METEOR_SETTINGS_WORKAROUND` | required, private-server | container startup | settings loader, startup validation, readiness |
| `METEOR_SETTINGS_HOST_PATH` | required, deployment file | Compose host mount | Compose and backup script |
| `ROOT_URL` | required, deployment-specific | self-hosted production | Meteor runtime and settings validation |
| `PORT` | required, deployment file | app container | Compose/app runtime |
| `MOFACTS_HTTP_BIND` | optional, deployment file | direct app port binding | Compose port binding |
| `MONGO_URL` | required, private-server, secret | app runtime | Meteor MongoDB connection, readiness, validation |
| `EXPECTED_MONGO_DB_NAME` | required, private-server | self-hosted production | settings validation and readiness |
| `MOFACTS_SELF_HOSTED` | required, private-server | self-hosted production | settings validation and readiness |
| `MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD` | required, deployment secret | MongoDB bootstrap | Compose MongoDB init |
| `MOFACTS_MONGO_APP_DATABASE`, `MOFACTS_MONGO_APP_USERNAME`, `MOFACTS_MONGO_APP_PASSWORD` | required, deployment secret | MongoDB app user bootstrap | Mongo init script and Compose |
| `REDIS_URL` | required, private-server, secret-capable | when Redis is required | Redis boundary and readiness |
| `MOFACTS_REQUIRE_REDIS` | optional, private-server | env override for Redis requirement | settings validation and Redis boundary |
| `HOME` | optional runtime path input | local storage defaults | dynamic assets and H5P default paths |
| `MOFACTS_DEFAULT_THEME_DIR`, `MOFACTS_THEME_DIR` | optional, private-server | theme customization | theme registry |
| `MOFACTS_INSERT_HISTORY_TIMING`, `MOFACTS_INSERT_HISTORY_PAYLOAD_DEBUG` | development-only/private-server | server diagnostics | analytics method debug logging |
| `RUN_CONVERT_SCRIPT` | development-only | direct conversion script runs | conversion helper |
| `DOCKER_REGISTRY`, `IMAGE_NAME`, `IMAGE_TAG` | deployment file | image build/pull paths | Compose image naming |
| `READINESS_COMMAND`, `REQUIRE_READINESS` | release/deploy validation | deployment validation helper | `server-deploy-validate.sh` |
| `MOFACTS_PROD_SSH_KEY`, `MOFACTS_PROD_SSH_HOST`, `MOFACTS_PROD_BASE_URL` | private operator values | production sidecar helper | MCP sidecar production script |

## Deployment Files

- `deploy/settings.self-hosted.example.json`: sanitized self-hosted Meteor settings template. Operators copy it to an ignored private file.
- `deploy/.env.self-hosted.example`: sanitized self-hosted Compose environment template. Operators copy it to an ignored private file.
- `deploy/settings.local.example.json` and `deploy/.env.local.example`: local/dev examples only.
- `deploy/docker-compose.yml`: canonical self-hosted Compose runtime with authenticated MongoDB and Redis.
- `deploy/docker-compose.local.yml`, `deploy/docker-compose.hotfix-*`: local developer/hotfix loops, not public production defaults.

## Hygiene Status

- Public templates intentionally contain example domains and replacement markers.
- The release readiness scan checks for common committed secrets, required source artifacts, and private local paths.
- Runtime startup validation rejects missing required settings and placeholder values for self-hosted production.
