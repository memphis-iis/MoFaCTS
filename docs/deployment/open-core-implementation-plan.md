# Self-Hosted MoFaCTS Implementation Plan

This plan defines the work required to finish the Self-Hosted MoFaCTS deployment system before starting hosted or enterprise-layer implementation.

The enterprise goal is preserved as an architectural constraint, but enterprise infrastructure work is out of scope until Self-Hosted MoFaCTS is complete.

Related docs:

- `open-core-baseline-inventory.md`: current deployment inventory.
- `open-core-architecture-vetting.md`: target architecture, Redis assessment, and gap analysis.
- `../license-compliance.md`: AGPL, third-party notices, and source-availability obligations.
- `../release-process.md`: public release and license audit checks.

## Completion Definition

Self-Hosted MoFaCTS is complete when a technically capable operator can:

1. Configure MoFaCTS from tracked examples without editing source code.
2. Start the app with Docker Compose.
3. Reach it through direct HTTP or a documented HTTPS reverse proxy.
4. Bootstrap the first admin.
5. Create or upload learning content.
6. Run learner and instructor workflows.
7. Validate readiness.
8. Back up and restore all required state.
9. Upgrade safely.
10. Understand which features require optional services such as Redis.
11. Verify that the deployed app and distributed artifacts satisfy AGPL/source-availability expectations.
12. Trace a running self-hosted deployment back to the exact source tag, image tag, release notes, settings template, and operator documentation used to create it.

The system must fail clearly when required configuration or dependencies are missing. Silent fallbacks are not allowed.

Each implementation phase must end with a concrete acceptance check. Documentation-only completion is acceptable only for documentation-only work; behavior-changing phases need an executable check, test, smoke run, or explicitly recorded local limitation.

## Pre-Implementation Decision Register

These decisions must be resolved before the phase that depends on them starts. Do not build around temporary compatibility behavior to avoid deciding.

| Decision | Needed by | Current default for planning |
| --- | --- | --- |
| Public name | Phase 0 | Use "Self-Hosted MoFaCTS" in operator docs. |
| Canonical operator docs location | Phase 0 | Human docs in `docs/deployment/`; executable scripts and examples in `deploy/`. |
| Production self-hosted email default | Phase 1 | Disabled unless explicitly configured; email-dependent features fail clearly when enabled without settings. |
| First-admin bootstrap model | Phase 1 | Prefer a deliberate bootstrap command or documented one-time admin assignment over silent role assignment. |
| Baseline auth modes | Phase 1 | Password auth baseline; OAuth/SAML optional integrations with explicit enablement. |
| Canonical runtime settings path | Phase 1 | A mounted private settings file path under `/run/mofacts/`; no production self-hosted default to baked settings. |
| Self-hosted Compose file naming | Phase 2 | Keep `deploy/docker-compose.yml` only if it can become safe public operator defaults; otherwise add a clearly named self-hosted file. |
| Asset state default | Phase 2 | Prefer named volumes for a simple first run, with documented host-directory overrides for operators who need direct filesystem backups. |
| Direct port exposure | Phase 2 | Bind localhost by default when reverse proxy guidance is the production path; document public HTTP only as local/LAN evaluation. |
| Readiness access model | Phase 4 | Prefer local-command or protected endpoint; public readiness must not expose secrets. |
| Backup/restore script policy | Phase 5 | Docs first; scripts only when non-destructive defaults and restore warnings are clear. |
| Storage backend scope | Phase 7 | Local filesystem is required for first Self-Hosted MoFaCTS completion; S3-compatible storage is deferred unless explicitly pulled in. |
| First Redis-backed subsystem | Phase 8 | Content/package import and validation jobs are the preferred first candidate if Redis lands in Self-Hosted MoFaCTS. |
| Redis requirement model | Phase 8 | Redis is optional until a named enabled feature requires it; enabled Redis-backed features fail clearly without Redis. |
| Worker requirement model | Phase 9 | Worker service is added only when actual queued work exists. |
| Versioning and migration policy | Phase 10 | Public release tags and forward-only migration notes until a stronger migration contract exists. |

## Phase 0: Baseline and Scope Lock

Goal: preserve the current deployment truth before changing behavior.

Tasks:

- [x] Create baseline inventory for current Compose services, volumes, settings, health checks, and persistent state.
- [x] Create architecture vetting note for open-core target shape and Redis direction.
- [x] Use "Self-Hosted MoFaCTS" as the public operator-facing deployment name.
- [ ] Decide whether the canonical self-hosted docs live primarily in `docs/deployment/` with operational scripts in `deploy/`.
- [ ] Resolve or explicitly accept the planning defaults in the pre-implementation decision register for Phases 0 through 2.
- [x] Add an index link from `docs/deployment/README.md` to the open-core docs.

Exit criteria:

- Current runtime state and target open-core scope are documented.
- The plan excludes enterprise implementation until open-core completion.
- Phase 1 is not started until settings, auth, email, and first-admin bootstrap decisions have an accepted direction.

## Phase 1: Configuration and Secret Hygiene

Goal: make configuration safe, explicit, reproducible, and suitable for a public open-core distribution.

Tasks:

- [ ] Identify all settings consumed from `Meteor.settings`, `process.env`, and deployment files.
- [ ] Classify settings as required, optional, public-client, private-server, development-only, production-only, or institution-specific.
- [ ] Replace tracked real deployment settings with sanitized example settings.
- [ ] Create a self-hosted production example settings file.
- [ ] Create a local-development example settings file if the current local settings are not sufficient.
- [ ] Move institution-specific examples, credentials, emails, SAML paths, and secrets out of tracked defaults.
- [ ] Ensure Docker image build does not require real private settings baked into the image.
- [ ] Decide whether the image should bake only example settings or no settings at all.
- [ ] Define the canonical runtime settings mount path for self-hosted deployments.
- [ ] Update Compose to mount/use the private runtime settings path deliberately.
- [ ] Remove the self-hosted production runtime fallback that defaults `METEOR_SETTINGS_WORKAROUND` to `/app/settings.json`.
- [ ] Ensure missing runtime settings path, inline settings JSON, unreadable settings files, and example placeholder values fail with actionable errors.
- [ ] Add fail-fast startup validation for required settings.
- [ ] Validate `ROOT_URL` shape and consistency with public deployment docs.
- [ ] Validate `owner` and `initRoles.admins` expectations for first-admin bootstrap.
- [ ] Validate `encryptionKey` presence and minimum strength/format.
- [ ] Validate auth-related settings and email verification constraints.
- [ ] Validate email settings when email is enabled.
- [ ] Validate SAML/OAuth settings only when those providers are enabled.
- [ ] Document every required and optional setting in an operator-facing settings reference.
- [ ] Add tests for settings validation helpers.

Exit criteria:

- Tracked settings are safe examples.
- A fresh self-hosted install either starts with complete settings or fails with actionable configuration errors.
- Operators do not need to inspect source code to know which settings are required.
- The current baked-settings image behavior is either removed from self-hosted production or documented as example-only and never used as a silent runtime default.
- Acceptance check: start once with a missing settings mount and verify startup fails with the documented error; start once with complete example-derived private settings and verify startup proceeds to Mongo readiness.

Blocking questions:

- Should production self-hosted email be required, optional, or disabled by default?
- Should first-admin bootstrap require a preexisting account, automatic role assignment after signup, or a deliberate admin creation command?
- Should OAuth/SAML be part of baseline open core or documented as optional integrations?

## Phase 2: Canonical Open-Core Compose Runtime

Goal: make Docker Compose a credible self-hosted runtime, not only a maintainer deploy scaffold.

Tasks:

- [ ] Decide whether `deploy/docker-compose.yml` remains the canonical production-shaped file or whether a new self-hosted file is clearer.
- [ ] Normalize service names, network names, volume names, and environment variable names for self-hosted use.
- [ ] Convert absolute host bind defaults where appropriate into named volumes or clearly documented host paths.
- [ ] Keep MongoDB as a required service.
- [ ] Add MongoDB health check if practical with the selected Mongo image.
- [ ] Add app container health check against `/health` or a future readiness command.
- [ ] Define app restart policy for self-hosted deployments.
- [ ] Document port exposure and when to bind only to localhost behind a reverse proxy.
- [ ] Add or refine `.env` example for self-hosted Compose.
- [ ] Separate local hotfix/dev Compose docs from self-hosted operator docs.
- [ ] Decide whether Redis appears in Compose before Phase 8.
- [ ] If Redis appears before a Redis-backed feature exists, mark it as disabled/reserved and ensure no app behavior silently depends on it.
- [ ] Validate Compose config in docs and scripts.

Exit criteria:

- A new operator can run the self-hosted Compose stack from documented files.
- Required services and optional services are unambiguous.
- Local developer loops remain intact but are not confused with the open-core operator path.
- Acceptance check: run `docker compose config` against the documented self-hosted files and verify the app, MongoDB, volumes, settings mount, network, and port bindings match the operator guide.

Blocking questions:

- Should local asset state be named Docker volumes or host directories by default?
- Should the direct app port be publicly exposed by default or bound to localhost for reverse-proxy use?

## Phase 3: Reverse Proxy and HTTPS

Goal: provide production-ready guidance for exposing a self-hosted instance.

Tasks:

- [ ] Decide the first supported reverse proxy example: Caddy only, or Caddy plus nginx/Traefik.
- [ ] Add a self-hosted Caddyfile example for a real domain.
- [ ] Document WebSocket behavior required by Meteor.
- [ ] Document `ROOT_URL` and HTTPS consistency requirements.
- [ ] Document local-only HTTP, LAN HTTPS, and public HTTPS as separate cases.
- [ ] Document certificate ownership and renewal expectations.
- [ ] Add troubleshooting notes for mixed content, wrong host, websocket failures, and login redirect mismatch.
- [ ] Optionally add Compose override for reverse proxy if maintaining it in-repo is worthwhile.

Exit criteria:

- Operators can put MoFaCTS behind HTTPS without guessing at headers or app URL settings.
- The direct app port exposure story is explicit.
- Acceptance check: validate the reverse-proxy example renders a complete config with a real-domain placeholder, WebSocket-compatible proxying, and matching `ROOT_URL` documentation.

Blocking questions:

- Do we want to maintain a reverse proxy container as part of open-core Compose or provide config examples only?

## Phase 4: Readiness and Operational Validation

Goal: make deployment correctness inspectable.

Tasks:

- [ ] Keep `/health` as lightweight liveness.
- [ ] Add a distinct readiness check or validation command.
- [ ] Validate MongoDB connectivity.
- [ ] Validate expected Mongo database name.
- [ ] Validate settings file was loaded from the intended path.
- [ ] Validate required settings after parsing.
- [ ] Validate dynamic asset storage root existence and read/write access.
- [ ] Validate H5P content and library directory existence and access.
- [ ] Validate `ROOT_URL` and app-visible public settings.
- [ ] Validate Redis connectivity only when Redis-backed features are enabled.
- [ ] Add a deployment validation script or extend `server-deploy-validate.sh` to call readiness.
- [ ] Document expected pass/fail output.
- [ ] Add automated tests for readiness helper logic where feasible.

Exit criteria:

- Operators can distinguish "process is alive" from "deployment is ready."
- Missing dependencies or misconfiguration fail loudly.
- Acceptance check: run readiness against one valid deployment and at least one intentionally broken dependency or configuration, then document both outputs.

Blocking questions:

- Should readiness be public, admin-only, local-command-only, or protected by a token?

## Phase 5: Backup and Restore

Goal: make self-hosted data durable and recoverable.

Tasks:

- [ ] Define complete backup scope.
- [ ] Include MongoDB data.
- [ ] Include dynamic assets.
- [ ] Include H5P content.
- [ ] Include H5P libraries.
- [ ] Include deployment settings and `.env`.
- [ ] Include SAML/OAuth certificates or key material where configured.
- [ ] Include theme/customization assets if used.
- [ ] Decide whether generated previews, logs, and local dev state are in or out of backup scope.
- [ ] Document backup procedure using Compose.
- [ ] Document restore procedure to a clean host.
- [ ] Document restore verification steps.
- [ ] Document upgrade-safe backup timing.
- [ ] Add scripts only if they can be clear, portable, and non-destructive.
- [ ] Add warnings for destructive restore operations.

Exit criteria:

- A self-hosted operator can back up and restore a complete MoFaCTS instance.
- The backup docs identify every stateful component.
- Acceptance check: perform at least one restore rehearsal to a clean volume or clean host equivalent, then verify login, content listing, dynamic asset serving, and H5P content serving where applicable.

Blocking questions:

- Should the repo ship scripts for backup/restore, or docs first?
- What is the minimum supported restore target: same host, new host, or both?

## Phase 6: First-Run Admin and Content Authoring

Goal: make a fresh self-hosted instance usable without institutional tribal knowledge.

Tasks:

- [ ] Define first-admin bootstrap flow.
- [ ] Ensure the selected bootstrap flow is compatible with Phase 1 settings validation.
- [ ] Document how `owner` and `initRoles.admins` work.
- [ ] Ensure first admin assignment fails clearly when the configured admin account cannot be resolved.
- [ ] Decide whether to add an admin bootstrap command for self-hosted installs.
- [ ] Document public signup settings and email verification implications.
- [ ] Document teacher/admin role assignment path.
- [ ] Document first content upload path.
- [ ] Document dynamic asset and H5P storage implications for content upload.
- [ ] Add a minimal smoke checklist: create admin, sign in, upload content, launch learner flow.
- [ ] Add tests for any new bootstrap helper logic.

Exit criteria:

- A new operator can create the first usable admin and verify content authoring.
- Acceptance check: from a clean database, bootstrap the first admin through the documented flow, sign in as that admin, assign any required instructor/teacher role, upload or create first content, and launch one learner flow.

Blocking questions:

- Should self-hosted installs default to public signup enabled or disabled?
- Is a CLI/server method/admin-only UI path preferred for bootstrapping the first admin?

## Phase 7: Storage Boundary

Goal: make local filesystem storage coherent now and prepare for S3-compatible storage later.

Tasks:

- [ ] Inventory all app code paths that read/write dynamic assets, H5P content, H5P libraries, and generated files.
- [ ] Define storage responsibilities: upload storage, public asset serving, H5P package storage, H5P library storage, generated media/previews.
- [ ] Introduce a storage configuration model.
- [ ] Keep local filesystem as the first required open-core backend unless S3 is selected for this milestone.
- [ ] Move hard-coded path assumptions behind a small storage boundary.
- [ ] Add storage validation for configured local paths.
- [ ] Add tests around path resolution and safety invariants.
- [ ] Decide whether S3-compatible storage is implemented now or deferred after local boundary cleanup.
- [ ] If S3-compatible storage is included, implement one adapter path without local silent fallback.
- [ ] Document migration implications from local storage to object storage.

Exit criteria:

- Local storage remains fully supported.
- Storage behavior is explicit enough that S3-compatible support can be added without scattering conditional code.
- Acceptance check: run storage validation against configured local paths and verify path traversal, missing directory, and read/write failure cases fail clearly.

Blocking questions:

- Is S3-compatible object storage required for "open core complete", or only for enterprise readiness later?
- Which assets must be served by the app versus directly by a proxy/object store?

## Phase 8: Redis Boundary

Goal: introduce Redis as a real open-core subsystem boundary.

Tasks:

- [ ] Choose the first Redis-backed subsystem.
- [ ] Preferred candidates:
  - Package/content import and validation jobs.
  - Dashboard or analytics refresh queue.
  - Scheduled notification/message dispatch.
  - Distributed cron coordination for multi-app support.
- [ ] Define Redis role: queue, cache, pub/sub, lock, or some combination.
- [ ] Decide persistence model: Redis durable queue, Mongo durable record plus Redis coordination, or both.
- [ ] Add Redis service to open-core Compose.
- [ ] Add Redis environment variables and example config.
- [ ] Add startup validation when Redis-backed features are enabled.
- [ ] Add a small queue/cache/lock abstraction instead of direct Redis calls across app code.
- [ ] Add tests for missing Redis, disabled Redis feature, and working Redis feature behavior.
- [ ] Document operational expectations: persistence, memory, backups, and what happens if Redis is unavailable.
- [ ] Ensure no feature silently falls back to in-process behavior when configured to use Redis.

Exit criteria:

- Redis is a real part of Open Core through at least one named feature.
- Redis absence is either explicitly valid because Redis-backed features are disabled, or a clear startup/configuration failure.
- Acceptance check: test the selected feature with Redis enabled and available, Redis enabled and unavailable, and Redis-backed features explicitly disabled.

Blocking questions:

- Which subsystem gives the best first value with the least migration risk?
- Should Redis be treated as optional for single-host installs after the first Redis feature lands, or required for the completed open-core distribution?

## Phase 9: Background Worker Shape

Goal: separate background work from web request handling where useful, while keeping single-host Open Core simple.

Tasks:

- [ ] Identify jobs that should not run inside user-facing requests.
- [ ] Decide whether a separate worker service is required for open-core completion.
- [ ] If yes, define worker entrypoint and role.
- [ ] Ensure web and worker processes share the same application image where possible.
- [ ] Add worker service to Compose only when there is actual queued work.
- [ ] Validate worker dependencies at startup.
- [ ] Document how many worker replicas are supported in self-hosted mode.
- [ ] Add logs/readiness guidance for workers.
- [ ] Add tests for job ownership, retries, and idempotency where the first queued subsystem requires them.

Exit criteria:

- Background work has a clear runtime home.
- Self-Hosted MoFaCTS can run simply on one host and still preserves the later hosted scaling path.
- Acceptance check: if a worker service exists, run one documented job through it and verify ownership, retry/idempotency expectations, logs, and readiness behavior; if no worker exists, document why queued structure is sufficient for open-core completion.

Blocking questions:

- Is worker separation required before enterprise, or is Redis-backed job structure enough for the first open-core completion?

## Phase 10: Upgrade, Migration, and Public Release Discipline

Goal: make self-hosted upgrades predictable and make public open-core artifacts traceable to their source.

Tasks:

- [ ] Document supported upgrade path.
- [ ] Document required backup before upgrade.
- [ ] Document image pull/build behavior.
- [ ] Document database migration expectations.
- [ ] Document settings changes between versions.
- [ ] Add versioned release notes expectations for deployment-impacting changes.
- [ ] Add checks for schema/settings changes where practical.
- [ ] Ensure generated schema changes are documented when relevant.
- [ ] Document rollback limitations, especially after database migrations.
- [ ] Add an operator smoke test checklist after upgrade.
- [ ] Define the public versioning scheme operators see in tags, image names, docs, and release notes.
- [ ] Define the public distribution contract: source archive/tag, Docker image tag if published, settings examples, `.env` example, release notes, and upgrade notes.
- [ ] Ensure AGPL license text, third-party notices, dependency license artifacts, build scripts, and lockfiles are included or linked as required by `docs/license-compliance.md`.
- [ ] Ensure the deployed app's visible "License / Source" link points to the exact public source tag or source archive for the deployed version.
- [ ] Add release-note requirements for deployment-impacting changes, settings changes, storage changes, Redis/worker changes, migrations, and backup/restore implications.
- [ ] Add license audit and stale-license/provenance scans to the public open-core release checklist.

Exit criteria:

- Operators can upgrade without guessing which state or config might change.
- Operators can trace a running deployment and any distributed image back to corresponding source, notices, and release documentation.
- Acceptance check: produce a draft release checklist for one open-core version and verify it names the source tag/archive, image tag if applicable, settings template version, license artifacts, migration notes, backup requirement, and post-upgrade smoke test.

Blocking questions:

- What versioning scheme will self-hosted operators see?
- Are database migrations reversible, forward-only, or mixed?
- Will public operators pull prebuilt images, build locally from source, or both?

## Phase 11: Documentation and Operator Experience

Goal: make Self-Hosted MoFaCTS approachable and maintainable.

Tasks:

- [ ] Create a top-level self-hosted deployment guide.
- [ ] Create settings reference.
- [ ] Create reverse proxy guide.
- [ ] Create backup/restore guide.
- [ ] Create upgrade guide.
- [ ] Create public release and source-availability guide or link the relevant release/license docs from the self-hosted guide.
- [ ] Create first-admin/content-authoring guide.
- [ ] Create troubleshooting guide.
- [ ] Add architecture diagram or text equivalent for Self-Hosted MoFaCTS only.
- [ ] Link all docs from `docs/deployment/README.md`.
- [ ] Ensure `deploy/README.md` points operators to human-facing docs.
- [ ] Keep local developer hotfix docs separate from operator docs.
- [ ] Review docs for "no fallback" language and remove ambiguous optionality.

Exit criteria:

- A self-hosting operator has a coherent path through install, configure, run, validate, operate, and upgrade.
- Acceptance check: run a docs walkthrough from a clean checkout using only tracked examples and private values supplied by the operator guide; record every place where a reader would otherwise need source-code knowledge.

## Phase 12: Self-Hosted MoFaCTS Verification

Goal: prove the Self-Hosted MoFaCTS system works end to end.

Tasks:

- [ ] Validate Compose config.
- [ ] Run app typecheck for TypeScript-bearing changes.
- [ ] Run lint where changed files require it.
- [ ] Build the image through the canonical workflow when explicitly doing release-confidence validation.
- [ ] Start a clean self-hosted stack.
- [ ] Run readiness validation.
- [ ] Bootstrap first admin.
- [ ] Upload or create test content.
- [ ] Complete learner smoke flow.
- [ ] Verify dynamic asset serving.
- [ ] Verify H5P content serving if relevant.
- [ ] Verify backup.
- [ ] Restore to a clean volume or clean host.
- [ ] Verify restored app behavior.
- [ ] Verify upgrade path from previous supported version once versioning is established.
- [ ] Verify "License / Source" link and release docs point to the exact source tag/archive for the running version.
- [ ] Verify AGPL text, third-party notices, dependency license artifacts, build scripts, and lockfiles are present or linked for distributed artifacts.
- [ ] Verify public self-hosted install can be performed from tracked examples plus private operator-provided settings, without source edits or undocumented defaults.
- [ ] Record any environment limitations that prevented a check.

Exit criteria:

- Self-Hosted MoFaCTS is demonstrably usable and recoverable.
- Remaining limitations are documented, not hidden.

## Explicitly Out of Scope Until Self-Hosted MoFaCTS Is Complete

- AWS ECS/Fargate implementation.
- MongoDB Atlas production migration.
- ElastiCache production wiring.
- S3 production bucket/IAM implementation.
- CloudFront or CDN implementation.
- Application Load Balancer implementation.
- Terraform/CDK enterprise infrastructure.
- Multi-tenant billing.
- Enterprise observability stack.
- Hosted support automation.
- Enterprise-only auth/compliance features unless they are also required for baseline self-hosting.

## Enterprise-Preserving Constraints

While implementing Self-Hosted MoFaCTS, preserve these constraints so enterprise work can happen later without a fork:

- Keep app behavior independent of deployment target.
- Keep MongoDB as a clear source-of-truth boundary.
- Keep Redis access behind a small subsystem boundary.
- Keep storage access behind a storage boundary.
- Keep web request handling separable from background work.
- Keep configuration explicit and environment-driven.
- Do not add silent local fallbacks for missing managed services.
- Document every intentional optional feature as disabled/enabled by configuration.
