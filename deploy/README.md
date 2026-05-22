# MoFaCTS Deployment Workflow

This folder contains the canonical Docker Compose deployment workflow for the MoFaCTS application.

## Contents

- `docker-compose.yml`: production-shaped app and MongoDB runtime.
- `docker-compose.local.yml`: local override file for development or staging-style checks.
- `docker-compose.hotfix-native.yml`: publishes local MongoDB to `127.0.0.1:27017` for the native hotfix dev server.
- `docker-compose.hotfix-local.yml`: local-only bundle runner for faster code hotfix loops without producing a deploy image.
- `.env.local.example`: shareable local environment template. Copy it to ignored `.env.local` for machine-specific values.
- `settings.json`, `settings.local.json`: application settings sources used by the container runtime.
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

## Real Hotfix Dev Loop

Use this loop when the goal is fast local UI/application iteration with browser/MCP observation.

Start the persistent native Meteor dev server:

```powershell
cd deploy
.\hotfix-dev.ps1 start
```

The dev app is exposed at:

```text
http://localhost:3200
```

Follow Meteor startup and incremental rebuild output:

```powershell
.\hotfix-dev.ps1 logs
```

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
