# Development Guide

This guide covers the public contributor baseline for MoFaCTS.

## Requirements

- Node.js `22.x`
- npm `10.x`
- Meteor `3.4`
- Docker Desktop for local Compose-backed workflows
- Git

## Setup

```bash
git clone https://github.com/memphis-iis/mofacts.git
cd mofacts/mofacts
npm ci
# Create private local settings before running the app.
```

Adjust local settings for your environment. Do not commit local settings or secrets.

For the Windows native hotfix dev loop, use the deployment notes in `../deploy/README.md`. On a new machine, install/cache the exact Meteor release from `mofacts/.meteor/release` before running `deploy/hotfix-dev.ps1`; for the current app release that is:

```powershell
npm install -g meteor@3.4.1 --foreground-script
```

Docker Desktop must be running because the hotfix loop runs Meteor natively but uses Docker Compose for MongoDB.

## First Local Run

The fastest supported contributor loop on Windows is the native hotfix dev server. It runs Meteor from the checkout, uses Docker only for MongoDB, and serves the app at `http://localhost:3200`.

1. Install dependencies and run the baseline check:

   ```powershell
   cd mofacts
   npm ci
   npm run typecheck
   ```

2. Prepare local deployment inputs:

   ```powershell
   cd ..\deploy
   Copy-Item .env.local.example .env.local
   $OperatorRoot = Join-Path $env:USERPROFILE "OneDrive\Desktop"
   $LocalSettingsPath = Join-Path $OperatorRoot "settings.local.json"
   Copy-Item settings.local.example.json $LocalSettingsPath
   ```

   On this developer setup, `C:\dev\mofacts_config\deploy and build.txt` is the operator cheat sheet for this path and currently sets `$LocalSettingsPath` to `$env:USERPROFILE\OneDrive\Desktop\settings.local.json`. Pass that path explicitly to `hotfix-dev.ps1`; do not use or infer `deploy\settings.local.json`.

   Replace placeholder values in `.env.local` and `$LocalSettingsPath`. The settings JSON must define `owner`; the hotfix launcher uses that address for the local admin bootstrap. Keep these files private.

3. Confirm the local runtime prerequisites:

   ```powershell
   node --version
   npm --version
   docker version
   docker compose version
   ```

4. Start the app:

   ```powershell
   .\hotfix-dev.ps1 start -SettingsPath $LocalSettingsPath
   .\hotfix-dev.ps1 logs
   ```

   Wait for the logs to show that the app started, then open:

   ```text
   http://localhost:3200
   ```

   The hotfix launcher creates or verifies a local admin account for the owner configured in the settings JSON passed with `-SettingsPath`. Read the ignored local credentials with:

   ```powershell
   Get-Content .\local-dev\agent-secrets.env
   ```

   Use `MOFACTS_AGENT_ADMIN_EMAIL` and `MOFACTS_AGENT_ADMIN_PASSWORD` from that file to sign in.

For more details, including status/restart/stop commands and the production-shaped local bundle loop, see `../deploy/README.md`.

## First Admin And Content Pass

After the first local startup:

1. Sign in at `http://localhost:3200` using the local admin credentials from `deploy/local-dev/agent-secrets.env`.
2. Open the content upload or content management area from the app navigation.
3. Use a small local TDF/config package for smoke testing. Public TDF authoring concepts are summarized in [authoring.md](authoring.md); canonical project content lives outside this repository in the MoFaCTS configuration/content repository used by maintainers.
4. Launch the uploaded or available lesson from the home/practice dashboard and complete a few trials.
5. Re-run the checks that match your change:

   ```powershell
   cd ..\mofacts
   npm run typecheck
   npm run lint
   ```

Do not use the native hotfix loop as release confidence. Use the Docker Compose workflow under `deploy/` when validating deployment behavior.

## Common Checks

```bash
npm run lint
npm run typecheck
```

The full TypeScript check is the required TypeScript verification path for app code changes.

## Tests

The repository defines test scripts in `mofacts/package.json`. Some local Meteor workflows may require additional environment setup. For release preparation, record any test limitations explicitly rather than treating a narrowed check as full release confidence.

`npm run test:ci` is CI-only. It runs the Meteor server test suite and compiles the client test bundle in CI; local development should use the targeted checks above and should record Meteor integration or client contract coverage as unavailable locally rather than substituting a narrower check.

## Modify Or Add A Unit Type

Production unit behavior lives in `learning-components/`, not in the scaffold package under `packages/unit-engine-api`.

Start here:

- `../learning-components/README.md`: current component package checklist.
- `architecture.md`: application boundaries.
- `learning-component-contracts.md`: manifest and capability rules.
- `../learning-components/units/createUnitEngine.ts`: unit-engine creation facade.
- `../learning-components/units/*/manifest.ts`: existing unit manifests.
- `../learning-components/defaultLearningComponentCatalog.ts`: default in-repo component catalog.

For a small change to an existing unit, edit the relevant folder under `../learning-components/units/`, update its tests, and keep Meteor routing, publications, collections, authorization, and app shell UI in `mofacts/`.

For a new production unit type:

1. Create `../learning-components/units/<unit-name>/`.
2. Add a manifest that declares the unit type and required runtime capabilities.
3. Add the unit engine/runtime code behind explicit dependencies.
4. Register the manifest in `../learning-components/defaultLearningComponentCatalog.ts` only when it should ship by default.
5. Add focused tests for manifest registration, missing-capability failure, and runtime behavior.
6. Run:

   ```powershell
   cd mofacts
   npm run typecheck
   npm run lint
   ```

If the change alters TDF fields, generated schemas, or authoring expectations, update the authoring docs and run the schema generation workflow described by the changed code path.

## Docker Build and Deployment

The canonical build and deployment workflow lives in `deploy/`. Do not substitute a local Meteor build for release-confidence deployment validation.

Do not run Docker build, push, or deploy commands unless a maintainer explicitly asks for that task.

## Documentation Updates

Update documentation when a change affects:

- setup or runtime requirements,
- TDF structure or authoring expectations,
- user-facing behavior,
- deployment or configuration,
- release process,
- public terminology.

Use "adaptive learning system" for public project descriptions.
