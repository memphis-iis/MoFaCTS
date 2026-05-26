# Self-Hosted MoFaCTS Decision Answers

Use this worksheet only for decisions that are not already answered by the codebase, deployment files, or existing public-release docs.

The implementation plan lives in `open-core-implementation-plan.md`. When a decision here is answered, update the implementation plan's decision register or phase tasks if the answer changes scope, sequencing, or acceptance checks.

## Established By Code, Docs, Or Prior Answers

- First milestone: complete open-core public distribution, not only a self-hosted runtime.
- Redis: part of the completed open-core system; do not describe it as deferred.
- Image distribution: support both prebuilt images and local builds from source.
- Versioning: existing public release baseline is `v0.1.0-alpha.1`; `CHANGELOG.md` says the project uses semantic versioning for public release tags. GitHub currently has the `v0.1.0-alpha.1` tag but no GitHub Release entry.
- Runtime source link: required by `docs/license-compliance.md` and `docs/release-process.md`; it must point to the exact source tag or archive for the deployed version.
- Public repo readiness checklist: include secret scanning, institutional data scanning, redistributable sample content audit, dependency license audit, clean-clone build check, and public documentation review.
- MongoDB auth: current Compose uses unauthenticated MongoDB URLs, while `SECURITY.md` says production/institutional deployments should enable MongoDB authentication. Open-core implementation should make authenticated MongoDB the production-shaped baseline.
- Public signup: controlled by required setting `auth.allowPublicSignup`; current examples set it to `true`. The sign-in and signup UI already hide/block signup when the setting is false.
- First-admin account path: matching accounts can be created by public signup or by the admin user-management method. `owner` and `initRoles.admins` grant roles at startup when accounts already exist, and `initRoles` also grants matching roles on login.
- Missing admin account behavior: startup logs warnings and continues when the configured owner/admin account does not exist yet.
- Auth modes: password auth is the baseline local account path; Google, Microsoft, and Memphis SAML are optional integrations.
- Email behavior: `enableEmail ?? prod` controls sending. `MAIL_URL` is required when email is enabled; otherwise emails are logged/skipped.
- Runtime settings: Docker mounts settings at `/run/mofacts/settings.json`, `METEOR_SETTINGS_WORKAROUND` must point to a file path, inline JSON is rejected, missing files fail startup, and `.dockerignore` excludes deploy/private settings from image build context.
- Settings validation: startup already validates required settings such as `owner`, `ROOT_URL`, `encryptionKey`, `initRoles.admins`, auth flags, and email settings. `/health` is lightweight liveness, not readiness.
- Current Compose shape: `deploy/docker-compose.yml` is the production-shaped app + MongoDB runtime; app port is currently `3000:3000`; MongoDB data uses a named volume; dynamic assets and H5P directories use host bind paths.
- Current HTTPS/reverse proxy shape: production HTTPS is deployment-owner responsibility today. The app container directly exposes port `3000`; local production-shaped testing uses app port `3100`; `deploy/Caddyfile.local` is the only in-repo reverse proxy config and proxies `https://localhost:3000` to `127.0.0.1:3100` for local/LAN HTTPS testing. There is no maintained production Caddy, nginx, or Traefik service in Compose yet.
- Current admin tests surface: `/admin/tests` is already an admin-only route named `client.adminTests`, rendering the `testRunner` template. It now hosts the admin-only deployment readiness diagnostics instead of exposing readiness publicly.
- Current admin status surface: `getServerStatus` is already an admin-only Meteor method shown in the Admin Control Panel. It currently reports disk/storage status and can supply readiness inputs, but it is not the main admin tests route.
- Current storage shape: local filesystem only. Dynamic assets use `HOME/dynamic-assets`; H5P content and libraries are app-served from local mounted directories. No S3-compatible storage boundary exists.
- Backup scope inventory: MongoDB data, dynamic assets, H5P content, H5P libraries, private settings, environment files, and identity-provider key material are already identified as required backup scope.
- Migration shape: current migrations are forward/idempotent startup or explicit conversion flows; there is no down-migration contract. Rollback is image rollback plus backup restore where data changed.
- Docs/support: public README, support policy, security policy, issue templates, release process, license docs, and deployment docs already exist. Human deployment docs belong in `docs/deployment/`; executable examples/scripts belong in `deploy/`.
- Self-hosted signup decision: public signup should normally be enabled for self-hosted installs, with `auth.allowPublicSignup` retained as the operator-controlled flag for closed registration.
- Owner/admin decision: self-hosted production settings must include `owner` and at least one configured admin email. First-run docs should explain the matching account creation path; readiness should report when the configured owner/admin account is not usable yet.
- OAuth/SAML decision: OAuth and SAML are optional integrations, but baseline testing should cover disabled-provider behavior and enabled-provider validation where credentials or fixtures are available.
- Asset state decision: keep the production-shaped model visible for backup: MongoDB in a named volume, dynamic assets/H5P content/H5P libraries in explicit host directories. Named asset volumes can be a separate quickstart only if backup scripts still make state scope clear.
- Port exposure decision: current Compose exposes `3000:3000`. Public deployments should use HTTPS through a reverse proxy and bind the app port to localhost when the proxy is on the same host; direct public HTTP is only local/LAN evaluation guidance.
- Storage serving decision: keep app-served dynamic asset and H5P routes as the default. Proxy/object-store serving can be added later only behind the same storage boundary and authorization/provenance rules.

## Answered Decisions From Patrick

### 1. First Redis-backed subsystem

Redis is required for the open-core target, but the code does not yet choose what should use it first. The main candidates are content/package import and validation jobs, dashboard/analytics refresh, scheduled notification dispatch, or distributed cron coordination.

Answer: Start with the user dashboard cache/dashboard analytics refresh path. The code already has `UserDashboardCache`, `initializeDashboardCache`, `updateDashboardCacheForTdf`, and `refreshDashboardCache`, so this is the lowest-friction real Redis boundary.

Notes:

### 2. Worker service

A separate worker is only needed if the first Redis-backed subsystem performs long-running, retryable, or separately scalable work. If the first Redis use is lightweight coordination/cache behavior, the main app process may be enough for the first release.

Answer: Do not require a separate worker service for the first open-core pass unless the dashboard-cache design proves it needs one. Keep the design compatible with a worker later.

Notes:

### 3. Placeholder settings policy

The app validates required settings, but it does not yet appear to reject copied example placeholders such as `YOUR_DOMAIN`, example OAuth secrets, or placeholder SAML paths. Should unchanged placeholders fail startup, or is a warning enough?

Answer: Unchanged placeholder settings should fail startup because they cannot produce a working deployment.

Notes:

### 4. Readiness access model

`/health` is public liveness today. The missing piece is readiness: should deployment readiness be checked by a local command, an admin-only endpoint, or a token-protected endpoint?

Answer: Use the existing admin-only `/admin/tests` route as the readiness/testing UI path, and build deployment readiness tests into it. Keep `/health` public and lightweight. Readiness details should not be public because they can reveal configuration, storage, database, and deployment information.

Notes:

### 5. Reverse proxy support level

The current production stance is "deployment owner manages HTTPS," with a local Caddy helper only. For self-hosted docs, should we provide Caddy config only, Caddy plus nginx/Traefik snippets, or a maintained reverse-proxy Compose override?

Answer: Document the current state and provide a Caddy-first production example. Today MoFaCTS does not run a production reverse proxy in Compose; the only checked-in proxy config is `deploy/Caddyfile.local` for local/LAN HTTPS. A Caddy-first example fits the existing repo better than adding nginx/Traefik examples before anyone has asked to support them.

Notes:

### 6. Backup/restore delivery

The backup scope is known, but the implementation level is not. Should the first milestone ship docs only, or guarded scripts for backup/restore as well?

Answer: Ship guarded backup and restore scripts, not docs only. Restore operations that overwrite existing state must require an explicit destructive confirmation flag.

Notes:

### 7. Restore target and consistency

Do we need to prove restore to a new host or clean-host equivalent, or is same-host restore enough for the first open-core milestone? Also, should the recommended backup be quiesced, live, or both with quiesced preferred?

Answer: Support both same-host restore and clean-host or clean-volume restore. The baseline can require quiesced/offline backup; live backup is not required for the first open-core milestone.

Notes:

### 8. Upgrade path from existing deployments

The public release path starts at `v0.1.0-alpha.1`, but there may be existing private/internal deployments. Should open-core upgrade docs support only public release-to-release upgrades, or also migration from current private deployments?

Answer: Do not support migration from private deployments in the first open-core milestone. Any Mongo collection shape, migration, index, or persistence contract change requires a written migration note and explicit approval before implementation.

Notes:

### 9. Sample content redistribution

A public smoke test is easier if we ship sample TDF/H5P/media content, but only if redistribution rights are clear. Should the public repo include a small redistributable sample lesson/package, or should sample content wait until rights are verified?

Answer: Include one small smoke-test package from the public config repository so beginners have content they can run immediately. Candidate source: the public configuration/content repository.

Notes:
