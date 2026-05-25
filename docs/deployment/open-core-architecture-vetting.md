# Open Core Deployment Architecture Vetting

This note tracks the gap between the current `deploy/` tree and the target open-core deployment architecture.

Current-state inventory: `open-core-baseline-inventory.md`.

Full implementation plan: `open-core-implementation-plan.md`.

## Goal

MoFaCTS Open Core should be the complete self-hostable learning platform: one application image, clear runtime dependencies, durable state, operator-friendly setup, and no silent fallback behavior.

Enterprise or hosted deployments should add managed infrastructure, scale, observability, integrations, and operations around the same core application boundary instead of becoming a separate product fork.

## Current Open Core Shape

The current canonical Compose deployment provides:

- MoFaCTS application container.
- MongoDB container.
- Local filesystem bind mounts for dynamic assets, H5P content, H5P libraries, and deploy-time override assets.
- Basic app liveness endpoint at `/health`.
- Local HTTPS helper for LAN testing.
- Fail-fast Mongo database-name validation before app startup.

This is a workable foundation, but it is closer to "app plus Mongo on one host" than to a polished self-hosted open-core distribution.

## Target Open Core Shape

The open-core target should provide:

- Browser/PWA learner and instructor access.
- Optional reverse proxy / HTTPS guidance.
- Docker Compose host running:
  - MoFaCTS app.
  - MongoDB.
  - Redis, if selected as a first-class coordination/cache/job dependency.
  - Local filesystem storage or an explicitly supported S3-compatible storage adapter.
- Admin/content authoring bootstrap path.
- Clear backup, restore, upgrade, and validation docs.

## Redis Assessment

Redis should not be dismissed as an enterprise-only dependency. It may be a deep open-core improvement because it gives MoFaCTS a clean boundary for runtime coordination that MongoDB and in-process timers are not ideal for.

Potential open-core uses:

- Background jobs: content imports, package validation, media processing, analytics refreshes, notifications, and scheduled research operations.
- Queue-backed durability and retry semantics for work that should not be tied to a single web request.
- Pub/sub or event fanout for app instances when the web tier eventually scales beyond one process.
- Shared cache for expensive derived data where MongoDB remains the source of truth.
- Session-adjacent coordination, rate limits, throttles, and distributed locks when multiple app containers are introduced.

Why the diagram likely included Redis:

- It anticipates the enterprise shape, where autoscaled web containers and worker services need a shared coordination layer.
- It recognizes that self-hosted deployments also benefit from durable queues and explicit job boundaries.
- It creates a migration path from one Compose host to managed Redis/ElastiCache without changing application behavior.

The key invariant is that Redis must be honest. If a feature requires Redis, the application should fail clearly when Redis is not configured. If Redis is not configured, Redis-dependent features should be disabled by explicit configuration, not silently degraded.

Recommended stance:

- Keep Redis in the open-core target architecture.
- Add it to Compose only when at least one named subsystem uses it through an explicit boundary.
- Avoid sprinkling Redis calls through app code; introduce a small runtime service boundary for queue/cache/lock semantics.
- Document which features require Redis and which remain Mongo/filesystem-only.

## Gaps

1. Redis is not currently a first-class service in `deploy/docker-compose.yml`.
2. Object storage is local filesystem-backed today; S3-compatible storage is not a coherent app boundary yet.
3. Runtime settings and secrets need an open-core-safe template and validation path.
4. Reverse proxy/HTTPS docs need production-oriented examples, especially WebSocket behavior and `ROOT_URL`.
5. Backup and restore docs are missing for MongoDB, dynamic assets, H5P content, settings, and identity-provider certificates.
6. `/health` is liveness only; deployment readiness should also validate Mongo, settings, storage, and configured URL expectations.
7. First-admin and content-authoring bootstrap needs clearer operator documentation.

## First Milestones

1. Create open-core deployment docs that cover first-run, configuration, admin bootstrap, validation, backup, restore, and upgrade.
2. Replace tracked real deployment settings with example settings and fail-fast runtime validation.
3. Add a readiness validation command or endpoint distinct from simple `/health`.
4. Decide the first storage boundary: local filesystem only for the first open-core milestone, or local plus S3-compatible adapter.
5. Decide the first Redis-backed subsystem. Good candidates are background jobs for content processing or dashboard/analytics refresh.
6. Add Redis to Compose only with explicit feature ownership and startup invariants.

## Development Stages

### Stage 0: Baseline Map

Goal: make the current open-core deployment surface explicit before changing behavior.

Work:

- Inventory current Compose services, volumes, settings, ports, and startup scripts.
- Document current stateful data: MongoDB, dynamic assets, H5P content, H5P libraries, settings, certificates, and generated content.
- Identify every deployment setting that is required for a fresh self-hosted installation.
- Identify environment-specific values currently committed as tracked settings.

Exit criteria:

- A self-hosted operator can see what exists today and what data must be protected.
- No runtime behavior changes yet.

### Stage 1: Configuration and Secrets Hardening

Goal: make open-core configuration safe, explicit, and reproducible.

Work:

- Replace tracked real deployment settings with example settings files.
- Add a documented private settings path for self-hosted deployments.
- Add startup validation for required settings such as `ROOT_URL`, `owner`, `encryptionKey`, auth settings, and email behavior.
- Ensure missing required settings fail at startup with direct errors.
- Keep local development settings separate from production-shaped self-hosted examples.

Exit criteria:

- The app image no longer needs real institution-specific settings baked into it.
- A fresh operator can copy an example settings file, fill required values, and get deterministic startup errors until the config is complete.

### Stage 2: Open-Core Compose Runtime

Goal: make Docker Compose match the intended open-core deployment shape.

Work:

- Keep the app and MongoDB as required services.
- Add named volumes or documented host paths for app assets and H5P content.
- Add health checks for MongoDB and the app where practical.
- Add an optional reverse-proxy example, likely Caddy first because the repo already has Caddy local HTTPS helpers.
- Decide whether Redis enters Compose in this stage as an available service or waits for Stage 4 when the first Redis-backed feature lands.

Exit criteria:

- `docker compose` is a credible self-hosted runtime, not just a maintainer deploy scaffold.
- Operators know which services are required and which are optional.

### Stage 3: Readiness, Backup, Restore, and Upgrade

Goal: make open-core operation boring and inspectable.

Work:

- Add a readiness validation path separate from `/health`.
- Validate Mongo connectivity, settings, asset storage availability, app URL assumptions, and writable/readable state directories.
- Document backup and restore for MongoDB and asset directories.
- Document upgrade order: stop app, backup, pull/build image, migrate/start, verify.
- Extend deployment validation scripts so they test application readiness, not only container running state.

Exit criteria:

- Operators can answer: "Is this instance ready?", "Can I restore it?", and "Did the upgrade work?"

### Stage 4: Redis Boundary

Goal: introduce Redis as a real open-core subsystem boundary, not decorative infrastructure.

Work:

- Choose the first Redis-backed subsystem.
- Define a small runtime abstraction for queue/cache/lock behavior.
- Add Redis to Compose with explicit environment variables.
- Add startup validation for Redis when Redis-backed features are enabled.
- Add docs for Redis persistence expectations and backup implications.
- Add tests around the selected subsystem's invariant behavior.

Likely first candidates:

- Background job queue for package/content import and validation.
- Dashboard or analytics refresh queue.
- Scheduled notification/message dispatch queue.
- Distributed lock/coordinator for cron jobs if multiple app instances become supported.

Exit criteria:

- At least one production-relevant feature uses Redis through a named boundary.
- If that feature is enabled and Redis is missing, startup or feature initialization fails clearly.
- If that feature is disabled, Redis absence is explicit configuration, not a silent fallback.

### Stage 5: Storage Boundary

Goal: make local filesystem storage coherent now and S3-compatible storage possible later.

Work:

- Define a storage adapter boundary for dynamic assets and H5P content.
- Keep local filesystem as the first supported open-core implementation unless S3 is needed immediately.
- Move path assumptions behind the storage boundary.
- Add validation for configured storage roots or object-storage credentials.
- Decide whether S3-compatible storage is open-core supported in the first pass or documented as a later target.

Exit criteria:

- App code no longer spreads local path assumptions across unrelated modules.
- Enterprise S3 adoption becomes infrastructure substitution plus adapter configuration, not a rewrite.

### Stage 6: Worker Separation

Goal: prepare the same core app for enterprise-scale deployment without forking behavior.

Work:

- Split queued background work from web request handling where the Redis boundary supports it.
- Add a worker service to Compose only when there is actual work for it.
- Make worker startup validate its dependencies.
- Keep web containers stateless except for explicitly mounted local storage in self-hosted mode.

Exit criteria:

- Open Core can still run simply on one host.
- Hosted deployments can scale web and worker services independently using the same application code.

### Stage 7: Enterprise Deployment Mapping

Goal: map open-core dependencies to managed enterprise services.

Work:

- Document substitutions:
  - MongoDB container to managed MongoDB or MongoDB Atlas.
  - Redis container to managed Redis or ElastiCache.
  - Local storage adapter to S3-compatible object storage.
  - Single app container to autoscaled web tier.
  - Compose worker service to managed worker service.
- Keep this as documentation or separate infrastructure code, not a second app runtime.

Exit criteria:

- Enterprise architecture is an operational layer around Open Core.
- The core application contract remains the same.

## Remaining Questions and Blocking Issues

1. Which Redis-backed subsystem should land first?
2. Should Redis be present in the default open-core Compose file before any feature requires it, or should it be introduced only with the first Redis-backed subsystem?
3. Is local filesystem storage sufficient for the first open-core milestone, or must S3-compatible storage be supported immediately?
4. What is the intended first-admin bootstrap flow for a new self-hosted instance?
5. Which auth modes are open-core baseline: password only, OAuth, SAML, or all with explicit configuration?
6. Should email be required, optional, or disabled by default for self-hosted installs?
7. Which data must be included in a complete backup: MongoDB, dynamic assets, H5P directories, settings, SAML certs, theme assets, generated previews, or other local state?
8. What is the supported reverse proxy target: Caddy only for docs, or Caddy plus nginx/Traefik examples?
9. Will self-hosted Open Core support multiple app containers in the near term, or is single-app-container deployment the first supported invariant?
10. Should Redis use append-only persistence in self-hosted mode if it backs durable jobs, or should Mongo remain the durable record while Redis coordinates work?

## Enterprise Bridge

If Redis and storage boundaries are introduced cleanly in Open Core, enterprise deployment becomes mostly infrastructure substitution:

- MongoDB container -> MongoDB Atlas or managed MongoDB.
- Local Redis container -> ElastiCache or managed Redis.
- Local asset storage -> S3-compatible object storage or S3.
- Single app container -> autoscaled web tier.
- In-process or queued work -> separate worker service.

That is the main reason to include Redis thoughtfully in Open Core: it makes the self-hosted system more reliable now and gives enterprise deployments a coherent scaling path later.
