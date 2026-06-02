# MoFaCTS Deployment Workflow

This folder contains executable deployment examples and scripts for MoFaCTS. Human-facing self-hosted operator docs start at `../docs/deployment/self-hosted-guide.md`.

## Contents

- `docker-compose.yml`: canonical Self-Hosted MoFaCTS app, authenticated MongoDB, and Redis runtime.
- `docker-compose.local.yml`: local override file for development or staging-style checks.
- `docker-compose.hotfix-native.yml`: publishes local MongoDB to `127.0.0.1:27017` for the native hotfix dev server.
- `docker-compose.hotfix-local.yml`: local-only bundle runner for faster code hotfix loops without producing a deploy image.
- `.env.self-hosted.example`: shareable self-hosted environment template. Copy it to ignored `.env.self-hosted`.
- `settings.self-hosted.example.json`: shareable self-hosted settings template. Copy it to ignored private settings before use.
- `.env.local.example`: shareable local environment template. Copy it to ignored `.env.local` for machine-specific values.
- `settings.local.example.json`: shareable local settings template.
- Private settings files under `deploy/` are mounted into the container at runtime; they are not copied into the image.
- `docker/`: scripts copied into the app image.
- `hotfix-dev.ps1`: native Windows Meteor hotfix dev server launcher.
- `hotfix/`: scripts used by the local-only bundle runner.
- `SERVER_IMAGE_DEPLOY_RUNBOOK.md`: server deployment runbook.
- `server-deploy-validate.sh`: remote rollout validation helper.
- `start-lan-https.ps1`, `stop-lan-https.ps1`, `Caddyfile.local`: local LAN HTTPS helpers.
- `build-timed.ps1`: optional timing wrapper around Docker Compose builds.

## Build Context

Run Docker Compose from this folder.

`docker-compose.yml` sets the build context to `../`, which resolves to the repository root that contains the application Dockerfile.

Private settings files under `deploy/` are ignored by Docker build context. Production and self-hosted settings must be copied to the server separately and mounted into the app container at `/run/mofacts/settings.json`.

## Self-Hosted Operator Path

Start with the docs, then use these tracked examples:

```bash
cd deploy
cp .env.self-hosted.example .env.self-hosted
cp settings.self-hosted.example.json settings.self-hosted.json
```

Replace every placeholder before startup. The app validates settings, MongoDB authentication, Redis configuration, and storage paths and fails clearly when required values are missing.

## Local Settings

Keep private settings and secrets out of commits. Use local environment files and local settings files for deployment-specific values.

For local Docker Compose validation, start from the tracked template:

```bash
cp .env.local.example .env.local
```

The LAN HTTPS helper also requires an explicit Caddy executable path:

```powershell
$env:MOFACTS_CADDY_EXE = 'C:\Path\To\caddy.exe'
.\start-lan-https.ps1
```

## Typical Local Validation

Only run Docker commands when you intend to validate the container workflow:

```bash
cd deploy
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml config
```

Build, push, and deploy commands should be run only by maintainers or release owners with the appropriate environment access.

`server-deploy-validate.sh` can make an operator-provided readiness probe mandatory after the container reaches running state:

```bash
READINESS_COMMAND='./run-admin-readiness-check.sh' ./server-deploy-validate.sh --require-readiness --image repo/mofacts:tag
```

The readiness command must call the admin-only deployment readiness path for that environment, such as an authenticated browser/DDP check against `/admin/tests`. The script fails the rollout when `--require-readiness` is set and no command is provided, or when the command exits non-zero.

## Real Hotfix Dev Loop

Use this loop when the goal is fast local UI/application iteration with browser/MCP observation.

### First-Time Windows Setup

Before starting the loop on a new Windows machine, confirm the local runtime prerequisites:

```powershell
node --version
npm --version
docker version
docker compose version
```

The supported baseline is Node.js `22.x`, npm `10.x`, Docker Desktop with the Linux engine running, and the Meteor release declared in `../mofacts/.meteor/release`. If `hotfix-dev.ps1` reports that the matching Meteor tool is missing under `$env:LOCALAPPDATA\.meteor\packages\meteor-tool`, install the project release once:

```powershell
npm install -g meteor@3.4.1 --foreground-script
```

Then verify the project tool is available:

```powershell
Test-Path "$env:LOCALAPPDATA\.meteor\packages\meteor-tool\3.4.1\mt-os.windows.x86_64\meteor.bat"
```

That check should return `True`. If `docker version` prints a client version but cannot connect to `dockerDesktopLinuxEngine`, start or restart Docker Desktop before running the hotfix loop.

Start the persistent native Meteor dev server:

```powershell
cd deploy
.\hotfix-dev.ps1 start
```

The dev app is exposed at:

```text
http://localhost:3200
```

The launcher also ensures a local admin account for the owner configured in `settings.local.json`. On a new local database, the default hotfix-dev login is `admin@localhost.test` with password `local-admin-2026`. Credentials are written to ignored local state and preserved there:

```powershell
Get-Content .\local-dev\agent-secrets.env
```

Use `MOFACTS_AGENT_ADMIN_EMAIL` and `MOFACTS_AGENT_ADMIN_PASSWORD` from that file to sign in locally. If the local database already contains that admin account with a different password, the launcher fails clearly instead of resetting it silently; reset the local database or account deliberately before changing the saved password.

Follow Meteor startup and incremental rebuild output:

```powershell
.\hotfix-dev.ps1 logs
```

On first startup after installing Meteor or refreshing local caches, the log may sit at `Started proxy` for a few minutes while Meteor/Rspack finishes the initial build. Wait for `Started your app` and verify `http://localhost:3200` before treating startup as complete.

Check or control the service:

```powershell
.\hotfix-dev.ps1 status
.\hotfix-dev.ps1 restart
.\hotfix-dev.ps1 stop
```

The dev server:

- runs Meteor natively from the Windows checkout so source watching does not cross Docker Desktop's Windows bind-mount filesystem,
- uses Docker only for the local MongoDB service,
- publishes MongoDB on `127.0.0.1:27017` through `docker-compose.hotfix-native.yml`,
- uses the local MongoDB database `MoFACT-meteor3`,
- creates or verifies the local admin account through the running app and stores credentials in ignored `deploy/local-dev/agent-secrets.env`,
- sets `HOME` to `deploy/local-data` so dynamic assets and H5P content resolve to the same local data folders as the container workflows,
- writes logs and a PID file to ignored local state under `deploy/local-dev/`,
- maintains an ignored `.meteor/local/build/package.json` marker so Meteor's generated CommonJS dev bundle is not treated as ESM by the app root package,
- relies on `rspack.config.js` allowing `host.docker.internal` for the Rspack dev client so Playwright MCP can load the native dev app from its container,
- is intended for observe/edit/reload work, not release confidence.

For MCP browser testing against this dev server, start the sidecar with its hotfix-dev override:

```powershell
cd ../mofacts-mcp-sidecar
docker compose -f docker-compose.yml -f docker-compose.hotfix-dev.yml up -d
```

That points Playwright MCP at `http://host.docker.internal:3200` and keeps Mongo MCP on `MoFACT-meteor3`.

For TypeScript-bearing changes, still run the required full app check from `mofacts/` before considering the change complete:

```powershell
cd ../mofacts
npm run typecheck
```

## Local Hotfix Bundle Loop

The local hotfix bundle workflow is for production-shaped local verification. It compiles a Meteor server bundle and runs that bundle in a Node container, but it does not create, tag, push, or validate a deployable Docker image. It is slower than the real hotfix dev loop above.

Use it only from this folder:

```bash
cd deploy
```

After TypeScript-bearing app code changes, verify the app first:

```bash
cd ../mofacts
npm run typecheck
cd ../deploy
```

Build or rebuild the local hotfix bundle:

```bash
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml -f docker-compose.hotfix-local.yml --profile hotfix-build run --rm hotfix-builder
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml -f docker-compose.hotfix-local.yml --profile hotfix-build run --rm hotfix-deps
```

Start or restart the local app from the hotfix bundle:

```bash
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml -f docker-compose.hotfix-local.yml up -d mongodb mofacts
```

The app is exposed at `http://localhost:3100` unless `.env.local` or compose port settings are changed. The generated bundle lives in the Docker volume `deploy_hotfix_bundle` so the app runs from Linux-native storage rather than a Windows bind mount.

On Windows, the same rebuild-and-restart loop can be run with:

```powershell
.\hotfix-local.ps1
```

Use `.\hotfix-local.ps1 -NoStart` to compile and install bundle dependencies without restarting the app container. Use `.\hotfix-local.ps1 -SkipTypecheck` only when the current change did not touch TypeScript-bearing app code or the required typecheck has already run in the same loop.

For UI work, an agent may continue the loop by opening `http://localhost:3100` with the local browser/MCP tooling, observing the interface, making another code change, rebuilding the hotfix bundle, restarting `mofacts`, and testing again. If browser/MCP validation is not requested or not available, the agent should rebuild, report that the app is ready for manual testing, and include any checks it did run.

This workflow is not release confidence. Use the production-shaped Docker Compose image build for release or deployment validation.

## Security Notes

- Do not commit private keys, SAML certificates, database credentials, or production settings.
- Keep MongoDB private to the deployment network.
- Use HTTPS for exposed deployments.
- Review `SECURITY.md` before exposing a deployment to learners, instructors, or research participants.
