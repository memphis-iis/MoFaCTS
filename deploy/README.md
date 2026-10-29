# MoFaCTS Deployment Workflow

This folder contains executable deployment examples and scripts for MoFaCTS. Human-facing self-hosted operator docs start at `../docs/deployment/self-hosted-guide.md`.

## Contents

- `docker-compose.yml`: canonical Self-Hosted MoFaCTS app, authenticated MongoDB, and Redis runtime.
- `docker-compose.local.yml`: local supporting-service overrides, including the
  MongoDB host port used by the source watcher.
- `docker-compose.change-streams-qualification.yml`: test-only stable-3.5.4
  Change Streams recovery qualification override; it is not part of the
  production path.
- `.env.self-hosted.example`: shareable self-hosted environment template. Copy it to ignored `.env.self-hosted`.
- `settings.self-hosted.example.json`: shareable self-hosted settings template. Copy it to ignored private settings before use.
- `.env.local.example`: shareable local environment template. Copy it to ignored `.env.local` for machine-specific values.
- `settings.local.example.json`: shareable local settings template. Copy it to
  ignored `settings.local.json`, or point `.env.local` at another private path.
- The canonical localhost watcher reads the private settings path from `.env.local`; self-hosted containers mount their private settings at runtime.
- `docker/`: scripts copied into the app image.
- `hotfix-local.ps1`: the sole localhost source-watcher start, restart, status,
  logs, and stop command.
- `hotfix/`: scripts used by the local Meteor/Rspack watcher.
- `SERVER_IMAGE_DEPLOY_RUNBOOK.md`: server deployment runbook.
- `../docs/deployment/mongodb-replica-set-conversion.md`: maintenance, recovery, and future-expansion runbook for the in-place replica-set conversion.
- `server-deploy-validate.sh`: remote rollout validation helper.
- `security-audit/`: root-owned, read-only forced-command host audit and protected configuration example. See `../docs/deployment/security-audit.md`.
- `start-lan-https.ps1`, `stop-lan-https.ps1`, `Caddyfile.local`: local LAN HTTPS helpers.
- `build-timed.ps1`: optional timing wrapper around Docker Compose builds.

## Build Context

Moving a prepared shared instructional library is a separate, explicit operator
task. The [fresh-library seed guide](../docs/instructional-library-transfer.md)
documents the export, checksummed bundle, dry run, and authorized import. Normal
deployment does not execute it or copy learner records.

Run Docker Compose from this folder.

The current toolchain is Meteor `3.5.4`, Node `24.22.1`, npm `11.19.1` and
built-in Undici `7.30.1`. The Dockerfile keeps the existing digest-pinned
`geoffreybooth/meteor-base:3.5` image only as a CLI bootstrap because that image
does not provide a `3.5.4` tag. In the application directory the official CLI
selects the project's exact `.meteor/release`, and the build asserts all four
versions before compiling. Compiler child processes use that selected Meteor
Node binary. Dependency and runtime stages use the digest-pinned
`node:24.22.1-alpine` image.

The official release owns DDP and Rspack; there are no local copies or separate
Rspack dependency-installation step. Application manifests and Meteor's release,
package and version files remain checksum-protected through compilation and
bundle creation. The upstream accounts-password package now provides bcrypt
`6.0.0` and argon2 `0.44.0`, so the image verifies those dependencies without
replacing them. Meteor also supplies `@mapbox/node-pre-gyp` `2.0.3` directly;
the remaining root bundle overrides are node-gyp `12.2.0` and underscore
`1.13.8`. The remaining email, webapp and CSS dependency replacements are
still explicit in `docker/harden-runtime-npm-dependencies.sh` because the target
Meteor release retains their older upstream versions. A toolchain change still
requires its normal authorized build and runtime verification; source pins alone
do not establish release confidence.

`docker-compose.yml` sets the build context to `../`, which resolves to the repository root that contains the application Dockerfile.

Private settings files under `deploy/` are ignored by Docker build context. Production and self-hosted settings must be copied to the server separately and mounted into the app container at `/run/mofacts/settings.json`.

The Meteor build stage configures Git to fetch the existing public `unetworking/uWebSockets.js` repository through HTTPS, including when npm supplies its SSH-form URL. The repository and dependency ref are unchanged. This build-stage-only setting is not copied into the runtime image and does not alter workstation Git configuration. No SSH package, key, alternate repository or additional retry loop is required; HTTPS failures still fail the build. The transport regression is covered by `npm run security:test:source`.

## Self-Hosted Operator Path

Start with the docs, then use these tracked examples:

```bash
cd deploy
cp .env.self-hosted.example .env.self-hosted
cp settings.self-hosted.example.json settings.self-hosted.json
```

Replace every placeholder before startup. Create the private MongoDB replica-set
keyfile named by `MONGO_REPLICA_SET_KEYFILE_HOST_PATH`; for example, on a Linux
host:

```bash
sudo install -d -m 700 /etc/mofacts
openssl rand -base64 756 | tr -d '\n' | sudo tee /etc/mofacts/mongodb-keyfile >/dev/null
sudo chmod 600 /etc/mofacts/mongodb-keyfile
```

The keyfile is a cluster secret. Keep the same value when adding future members
and never commit or print it. The application `MONGO_URL` must use the configured
replica-set name, for example by including `replicaSet=mofacts-rs` along with the
existing app-user credentials and `authSource`.

The canonical Compose path starts MongoDB with replica-set member
authentication and runs an idempotent initializer. On a fresh volume it creates
the app users and then initializes the set. On an existing standalone volume it
preserves the data and users, starts that volume as the first member, and
initializes the set. That existing-volume conversion is a maintenance action:
stop writers and verify a restorable backup before running it on a live server.
The initial one-member set enables replica-set features but does not provide
host failover. Its explicit set/member configuration supports adding members or
migrating to a parallel replica-set target later.

The app validates settings, MongoDB authentication, the exact replica-set
identity, authenticated Redis configuration, and storage paths and fails clearly
when required values are missing. `MOFACTS_REDIS_PASSWORD` is the single
operator-owned Redis credential: Compose uses it for Redis `requirepass`, its
authenticated healthcheck, and the private application `REDIS_URL`. Generate a
URL-safe random value of at least 32 characters and never commit it.

## Local Settings

Keep private settings and secrets out of commits. Use local environment files and local settings files for deployment-specific values.

Production security-audit report ingestion requires `MOFACTS_SECURITY_AUDIT_INGEST_SECRET` in the private app environment. It must exactly match the protected GitHub environment secret `AUDIT_REPORT_INGEST_SECRET`; never place either value in a tracked file.

For local Docker Compose validation, start from the tracked template:

```bash
cp .env.local.example .env.local
```

Create the ignored local keyfile once from PowerShell:

```powershell
.\New-MongoReplicaSetKeyfile.ps1
```

Replace the MongoDB URL placeholder in `.env.local`. The sole application runs
inside Docker, so its opaque URL uses `mongodb:27017` and
`replicaSet=mofacts-rs` (or the same custom name configured by
`MOFACTS_MONGO_REPLICA_SET_NAME`). There is no native application URI.

Create the ignored private settings file named by `METEOR_SETTINGS_HOST_PATH`:

```powershell
Copy-Item settings.local.example.json settings.local.json
```

Start from `settings.local.example.json`, then replace placeholders. The launcher fails clearly if the settings path is missing or invalid.

The LAN HTTPS helper also requires an explicit Caddy executable path:

```powershell
$env:MOFACTS_CADDY_EXE = 'C:\Path\To\caddy.exe'
.\start-lan-https.ps1
```

The normal local application URL remains `http://localhost:3200`. The LAN
HTTPS helper intentionally reserves `https://localhost:3000` as the only local
port-3000 exception and proxies it to the application on port 3200.

## Typical Local Validation

Validate the canonical definition without printing resolved secrets:

```bash
cd deploy
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml config --quiet
```

For an explicitly isolated Change Streams qualification, append both the
rehearsal and qualification overlays:

```bash
docker compose -p mofacts-cs-qualification --env-file .env.local \
  -f docker-compose.yml -f docker-compose.rehearsal.yml \
  -f docker-compose.change-streams-qualification.yml config
```

The qualification overlay sets the test-only
`MOFACTS_CHANGE_STREAMS_QUALIFICATION=true` flag with the exact driver order
`changeStreams`. The application rejects polling and all alternate observer
drivers, keeps SockJS and disconnect grace zero, and reports the selected
qualification mode at startup. Ordered or otherwise incompatible reactive
observers are defects: they must be redesigned or made explicitly
non-reactive, never routed to polling. Do not add this overlay to a production
Compose command unless the qualification gate passes and the production change
is separately authorized.

The opt-in client/server regression matrix is exercised by the manually
triggered `Meteor 3.5.4 Change Streams qualification` GitHub Actions workflow.
That workflow installs stable Meteor 3.5.4, starts a disposable MongoDB 8
one-member replica set, selects the qualification overlay's exact environment
contract, and runs the existing supported Linux Meteor/Playwright test path.
It is intentionally separate from ordinary CI because its purpose is to
exercise fault/restart qualification. Triggering the
workflow is an explicit test authorization; it does not deploy or modify a
protected database.

Build, push, and deploy commands should be run only by maintainers or release owners with the appropriate environment access.

For committed security-audit candidates, use the existing Linux CI as the single
routine full Meteor integration suite. It also runs the Phase 0 and source-capture
contracts; the separate Security workflow owns source-security, secret and
dependency checks. Match both workflows to the actual tested checkout revision.
Staging2 acceptance verifies the deployed image/configuration and affected browser,
HTTPS and security behavior; it does not routinely repeat the full Meteor suite.
The manual Change Streams fault/recovery workflow above remains a distinct,
explicitly authorized check. Source-to-image proof binding is still unfinished;
passing workflows alone do not close Phase 0. See the
[source-test lane contract](../docs-developer/security-audit-phase0-contracts.md#23-supported-source-test-lane-and-evidence-binding).

CI's source-acquisition implementation now runs its checks in an owned captured
test derivative and verifies build/supplemental source digests afterward. The
new path awaits its authorized Linux trial. Its retained metadata is explicitly
unqualified until stronger sealing, complete outcome evidence and final image
binding pass; see the [capture guide](security-audit/source-capture.md).

## SPARC OpenRouter Prefix Caching

“Improve prompt caching” is an on/off checkbox in User Admin alongside the global OpenRouter API key, model, and reasoning controls. It defaults to off for existing and new settings. Enabling it sends OpenRouter's top-level `session_id` for SPARC requests so related calls stay on one provider route; disabling it omits that field. Provider prompt caching may still occur automatically when this option is off, and enabling it does not guarantee lower total cost because output tokens and completed turns also affect cost. Changes apply to subsequent requests without rebuilding or restarting the server. The ID is generated randomly in the dialogue runtime, is stable only for one TDF/attempt/page scope (or one live-evaluation run), and contains no learner, attempt, TDF, or content-derived identity. It is never written to AI-flow logs.

This setting changes only provider cache locality. It does not change prompt messages, message order, structured-output schemas, model selection, reasoning, sampling, response handling, or provider fallback routing. It does not enable whole-response caching, response replay, explicit cache breakpoints, or provider-specific cache policy.

AI-flow telemetry records request counts indirectly through events plus prompt, cached-prompt, cache-write, completion, and total tokens; cache-read ratio; reported cache discount and cost; provider; model; operation; duration; and whether the session ID was applied. The live-evaluation artifact additionally aggregates these usage values for scoring and utterance separately, reports session-ID application counts and normalized cost per request and dialogue turn, and uses `null` when OpenRouter did not report a cache discount. These summaries exclude prompts, learner text, raw responses, credentials, account identifiers, attempt identifiers, TDF identifiers, and the session ID.

To stop sending the sticky-session routing hint, clear the checkbox in User Admin. No data cleanup, prompt change, rebuild, or server restart is required.

`server-deploy-validate.sh` can make an operator-provided readiness probe mandatory after the container reaches running state:

```bash
READINESS_COMMAND='./run-admin-readiness-check.sh' ./server-deploy-validate.sh --require-readiness --image repo/mofacts:tag
```

The readiness command must call the admin-only deployment readiness path for that environment, such as an authenticated browser/DDP check against `/admin/tests`. The script fails the rollout when `--require-readiness` is set and no command is provided, or when the command exits non-zero.

## Canonical Local Hotfix Server

`hotfix-local.ps1` owns the single Linux Docker Meteor/Rspack source watcher at
http://localhost:3200. Compose runs the watcher, MongoDB and replica-set
initialization. The local overlay completely replaces the production app service;
it does not build a production image or run host Meteor.

Prepare `.env.local`, its private `METEOR_SETTINGS_HOST_PATH` file, and the
MongoDB keyfile. Keep the configured database and existing data intact. Run:

```powershell
.\hotfix-local.ps1 -Action start
.\hotfix-local.ps1 -Action status
.\hotfix-local.ps1 -Action logs
.\hotfix-local.ps1 -Action restart
.\hotfix-local.ps1 -Action stop
```

The manager checks stable MongoDB primary/authentication readiness, app health,
the browser bundle, HMR and active Change Streams. The container validates the
pinned runtime and installs locked dependencies into Linux volumes. Source edits
rebuild and reload automatically. Docker owns bounded logs and process lifetime;
stop preserves data and caches. Credentials stay in ignored
`deploy/local-hotfix/agent-secrets.env`. See `hotfix/README.md` for details.

This workflow is local verification, not production release confidence.

## Security Notes

- Meteor 3.5.4 reads MongoDB's default consistency settings. After primary
  election, the replica-set initializer idempotently grants the configured app
  user the admin-scoped `mofactsReadDefaultConcern` role. Its only privilege is
  `getDefaultRWConcern` on the cluster resource; it has no inherited roles and
  cannot change consistency settings or read additional collections. Existing
  app roles are preserved. A conflicting role definition blocks initialization.
  This runs for both new and existing databases. Upgrading an existing deployment
  requires rerunning its replica-set initializer before starting the upgraded app.
  Rollback, if reverting Meteor, is to revoke only this role from the configured
  app user; leave its existing data roles intact. Do not delete a role still used
  by another account. This procedure does not alter learner data or passwords.
- Do not commit private keys, SAML certificates, database credentials, or production settings.
- Keep MongoDB private to the deployment network.
- Use HTTPS for exposed deployments.
- Review `SECURITY.md` before exposing a deployment to learners, instructors, or research participants.
