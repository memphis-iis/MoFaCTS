# Open Core Baseline Deployment Inventory

This inventory records the current self-hosted deployment surface before the open-core deployment hardening work begins.

It is intentionally descriptive. Target changes and staged implementation decisions live in `open-core-architecture-vetting.md`.

The full task plan for finishing Open Core lives in `open-core-implementation-plan.md`.

## Canonical Runtime Files

- `deploy/docker-compose.yml`: production-shaped Compose file for the app and MongoDB.
- `deploy/docker-compose.local.yml`: local override for production-shaped local checks.
- `deploy/docker-compose.hotfix-native.yml`: MongoDB publication for the native hotfix dev server.
- `deploy/docker-compose.hotfix-local.yml`: local bundle runner for production-shaped hotfix verification.
- `Dockerfile`: application image build and runtime image definition.
- `deploy/docker/entrypoint.sh`: app container startup entrypoint.
- `deploy/docker/validate-mongo-url.sh`: startup check that requires `MONGO_URL` to target the expected MongoDB database.
- `deploy/docker/connect-to-mongo.sh`: startup wait loop for MongoDB connectivity.

## Compose Services

### `mofacts`

Current role:

- Runs the bundled Meteor application.
- Exposes app port `3000` from the container.
- Depends on the `mongodb` service.
- Receives runtime configuration through environment variables and a Meteor settings file path.

Current image behavior:

- The image is built from the repository root with `Dockerfile`.
- The Dockerfile builds the Meteor app, installs bundle dependencies, and copies tracked deployment settings into `/app/settings.json` and `/app/settingsstaging.json`.

Current environment variables:

- `ROOT_URL`
- `MONGO_URL`
- `EXPECTED_MONGO_DB_NAME`
- `PORT`
- `WAIT_HOSTS`
- `METEOR_SETTINGS_WORKAROUND`

Current mounted state:

- `/mofactsAssets_override`
- `/root/dynamic-assets`
- `/root/h5p-content`
- `/root/h5p-libraries`

### `mongodb`

Current role:

- Runs MongoDB `8.0`.
- Uses the `wiredTiger` storage engine.
- Stores database files in the Compose volume named `data`.
- Is attached only to the internal `mofacts` Compose network.

Current expected database:

- `MoFACT-meteor3`

The app container validates that `MONGO_URL` targets this expected database before startup.

## Current Persistent State

The following state must be considered part of a complete self-hosted backup:

- MongoDB data volume `data`.
- Dynamic uploaded assets under `/root/dynamic-assets` in the app container.
- H5P content under `/root/h5p-content`.
- H5P libraries under `/root/h5p-libraries`.
- Deploy-time override assets under `/mofactsAssets_override`, including identity-provider certificates or keys.
- Private Meteor settings files used by `METEOR_SETTINGS_WORKAROUND`.
- Environment files used by Docker Compose.

Open question:

- Whether theme assets, generated previews, logs, or other local runtime state need explicit backup coverage.

## Current Storage Model

Dynamic uploaded assets are filesystem-backed.

Current facts:

- `DynamicAssets` uses `process.env.HOME + '/dynamic-assets'` as its storage path.
- The app registers HTTP routes for dynamic asset delivery.
- The route resolves stored file paths against the dynamic asset storage root and streams files from local disk.
- Compose mounts the dynamic asset directory into `/root/dynamic-assets`.

H5P content and libraries are also represented as mounted local directories.

Current gap:

- S3-compatible object storage is not currently a coherent runtime boundary.

## Current Redis Status

Redis is not currently part of the canonical open-core Compose runtime.

Current facts:

- `deploy/docker-compose.yml` defines `mofacts` and `mongodb`; it does not define Redis.
- Background/scheduled work currently appears to be handled in-process with MongoDB-backed coordination where needed.

Target direction:

- Redis remains in the open-core plan as a first-class coordination/cache/job boundary.
- Redis should be added with a named subsystem and explicit startup invariants, not as decorative or silently optional infrastructure.

## Current Reverse Proxy and HTTPS Status

Current facts:

- The app container directly exposes port `3000`.
- `deploy/Caddyfile.local` provides a local HTTPS helper that reverse proxies `https://localhost:3000` to `127.0.0.1:3100`.
- Production HTTPS termination is currently described as deployment-owner responsibility.

Current gap:

- Open-core operator docs do not yet include a production-oriented reverse proxy example with WebSocket and `ROOT_URL` guidance.

## Current Health and Validation Status

Current facts:

- The app exposes `/health`.
- `/health` reports process-level app status, environment, uptime, and timestamp.
- Server deployment validation currently verifies Docker availability, Compose config, container running state, current image, and recent logs.
- Mongo database targeting is validated before app startup.

Current gap:

- There is no readiness check that validates Mongo connectivity, settings completeness, storage availability, reverse proxy expectations, or application URL consistency.

## Current Settings Status

Current facts:

- `METEOR_SETTINGS_WORKAROUND` points the app at a settings file path.
- Startup rejects an empty settings workaround, inline JSON, or a missing settings file.
- The Docker image currently bakes tracked settings files into `/app/settings.json` and `/app/settingsstaging.json`.
- Local Compose overrides can mount `settings.local.json`.

Current gap:

- Tracked settings are not yet clean open-core examples.
- Required settings are not yet documented as a fresh-install checklist.
- Runtime validation of required settings is incomplete.

## Current Admin and Content Authoring Status

Current facts:

- The app supports admin and teacher roles through settings such as `owner` and `initRoles`.
- Content upload, dynamic assets, and H5P workflows depend on authenticated users and ownership checks.

Current gap:

- The self-hosted deployment docs do not yet provide a clean first-admin bootstrap and first-content-upload path.

## Immediate Implications

The first implementation work should preserve these invariants:

- MongoDB remains the required source of truth.
- Local filesystem assets remain the only currently implemented storage backend.
- Redis remains planned, but should not be documented as required until a named subsystem uses it.
- Settings must become explicit and private before this is presented as a clean open-core distribution.
- Readiness and backup/restore documentation should treat MongoDB and asset directories as one operational unit.
