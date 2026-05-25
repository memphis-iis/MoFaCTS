# Self-Hosted MoFaCTS Implementation Plan

This plan defines the work required to finish the Self-Hosted MoFaCTS deployment system and public open-core distribution before starting hosted or enterprise-layer implementation.

The enterprise goal is preserved as an architectural constraint, but enterprise infrastructure work is out of scope until the public open-core distribution is complete.

Related docs:

- `open-core-baseline-inventory.md`: current deployment inventory.
- `open-core-architecture-vetting.md`: target architecture, Redis assessment, and gap analysis.
- `open-core-decision-answers.md`: worksheet for recording pre-implementation decisions.
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
10. Understand required services, including Redis, and any intentionally optional integrations.
11. Verify that the deployed app and distributed artifacts satisfy AGPL/source-availability expectations.
12. Trace a running self-hosted deployment back to the exact source tag, image tag, release notes, settings template, and operator documentation used to create it.
13. Build the app from a clean public source checkout or run a corresponding prebuilt image, with both paths documented and traceable to the same release.

The system must fail clearly when required configuration or dependencies are missing. Silent fallbacks are not allowed.

This plan should be executed start to finish as one continuous open-core readiness effort. Phases are ordered workstreams, not stopping points. Continue into the next workstream whenever the current work and invariants still make sense; stop only for a true blocking question, a broken invariant, or a verification result that changes the plan.

Each workstream must leave behind a concrete completion check. Documentation-only completion is acceptable only for documentation-only work; behavior-changing workstreams need an executable check, test, smoke run, or explicitly recorded local limitation.

## Repository Implementation Rules

Open-core work must follow the repository rules in `../../AGENTS.md`:

- Work in `mofacts/` for application behavior, UI, state machines, server methods, publications, persistence, logging, migrations, and runtime validation.
- Keep executable deployment examples and scripts in `deploy/`; keep concise public operator docs in `docs/deployment/`.
- Coordinate with the public config/content repository for sample TDF/config content and for any change that alters required TDF fields, config names, structures, or expectations.
- Do not add compatibility fallbacks or silent in-process substitutes for required services. If a dependency or invariant is missing, fail clearly.
- Preserve existing working paths unless a task explicitly changes them; do not solve open-core readiness by changing unrelated user-facing behavior.
- Keep server methods narrow: database access, auth/authorization, encryption, secrets, and external API calls belong server-side; pure compute should stay client-side, in `common/`, or in focused helpers.
- Extract large server helpers out of `methods.ts` into `server/lib/` or `common/`.
- For TypeScript-bearing app changes, run `npm run typecheck` from `mofacts/`. For lintable TypeScript, JavaScript, or Svelte changes, run `npm run lint` from `mofacts/`.
- For UI/runtime behavior changes, use the native hotfix dev loop at `http://localhost:3200`; do not treat it as release confidence.
- Do not run Docker build, push, or deploy commands unless explicitly requested. Docker Compose config validation and local runtime checks are useful, but release-confidence image builds require explicit direction.

## Pre-Implementation Decision Register

These decisions guide the workstreams that depend on them. Use the current default for planning unless implementation discovers a contradiction. Do not build around temporary compatibility behavior to avoid deciding; ask only when the next coherent implementation step truly depends on an unresolved choice.

| Decision | Needed by | Current default for planning |
| --- | --- | --- |
| Public name | Phase 0 | Use "Self-Hosted MoFaCTS" in operator docs. |
| Canonical operator docs location | Phase 0 | Human docs in `docs/deployment/`; executable scripts and examples in `deploy/`. |
| Production self-hosted email behavior | Phase 1 | Preserve the current `enableEmail`/`prod` behavior: localhost/local examples do not send mail; deployments that enable email require valid mail settings. |
| First-admin bootstrap model | Phase 1 | Preserve the current settings-file model: `owner` and `initRoles.admins` identify admin emails, and matching users receive roles through the existing startup/login role assignment flow. |
| Baseline auth modes | Phase 1 | Password auth baseline; OAuth/SAML optional integrations with explicit enablement. |
| Canonical runtime settings path | Phase 1 | A mounted private settings file path under `/run/mofacts/`; no production self-hosted default to baked settings. |
| Self-hosted Compose file naming | Phase 2 | Keep `deploy/docker-compose.yml` only if it can become safe public operator defaults; otherwise add a clearly named self-hosted file. |
| Public signup default | Phase 1 | Self-hosted installs normally allow public signup through `auth.allowPublicSignup`; keep it configurable for operators who need closed registration. |
| First-admin owner requirement | Phase 1 | Require an `owner` setting and at least one configured admin email. Fresh installs may allow the matching account to be created through public signup, but readiness should clearly report when the configured owner/admin account is not usable yet. |
| OAuth/SAML baseline | Phase 1 | Password auth is the required local account path. OAuth/SAML providers are optional integrations, but baseline tests should cover disabled-provider behavior and enabled-provider validation where credentials/fixtures are available. |
| Asset state default | Phase 2 | Preserve the current production-shaped asset model: MongoDB in a named volume, dynamic assets/H5P content/H5P libraries in explicit host directories so backup scope is visible. Consider named asset volumes only as a separate quickstart if backup scripts can still make the state obvious. |
| Direct port exposure | Phase 2 | Current Compose exposes `3000:3000`. For public HTTPS deployments, document binding the app port to localhost behind a reverse proxy; direct public HTTP is only for local/LAN evaluation. |
| Readiness access model | Phase 4 | Extend the existing admin-only `/admin/tests` route into readiness/deployment diagnostics; keep `/health` public liveness only. |
| Backup/restore script policy | Phase 5 | Ship guarded backup/restore scripts; restore that overwrites state must require an explicit destructive confirmation flag. |
| Storage backend scope | Phase 7 | Local filesystem remains the default baseline. S3-compatible storage is included in the first public milestone as an explicit optional backend, and configured storage must fail clearly when invalid. |
| First Redis-backed subsystem | Phase 8 | Start with the existing user dashboard cache/dashboard analytics refresh path. |
| Redis requirement model | Phase 8 | Redis is part of the completed open-core distribution; Redis-backed behavior must fail clearly when Redis is configured but unavailable. |
| Worker requirement model | Phase 9 | Do not require a separate worker for the first pass unless the dashboard-cache design proves it needs one; preserve a clean path to add one later. |
| Versioning and migration policy | Phase 10 | Public release-to-release upgrades only for now; any database structure or persistence-contract change requires a written migration note and explicit approval. |
| Public image distribution | Phase 10 | Support both prebuilt images and local builds from source, with both paths tied to the same public release tag. |
| Runtime source link | Phase 10 | The running app should expose a visible License / Source link to the exact public source tag or archive for that build. |
| Sample content | Phase 6 | Use the world countries system as the public smoke-test content path. Do not require H5P for the beginner smoke test. |
| MongoDB authentication | Phase 2 | Canonical self-hosted production Compose uses authenticated MongoDB. Preserve unauthenticated Mongo only for clearly labeled local developer loops. |
| Redis persistence model | Phase 8 | MongoDB remains the durable record; Redis provides coordination/cache behavior that can be rebuilt from MongoDB. |
| S3-compatible storage | Phase 7 | Include S3-compatible storage in the first public milestone as an explicit optional backend. Local filesystem remains the default baseline; configured S3 must fail clearly when invalid. |

## Phase 0: Baseline and Scope Lock

Goal: preserve the current deployment truth before changing behavior.

Tasks:

- [x] Create baseline inventory for current Compose services, volumes, settings, health checks, and persistent state.
- [x] Create architecture vetting note for open-core target shape and Redis direction.
- [x] Use "Self-Hosted MoFaCTS" as the public operator-facing deployment name.
- [x] Use `docs/deployment/` for human-facing operator docs and `deploy/` for executable scripts/examples.
- [ ] Keep the pre-implementation decision register aligned as decisions are discovered or confirmed.
- [x] Add an index link from `docs/deployment/README.md` to the open-core docs.

Completion checks:

- Current runtime state and target open-core scope are documented.
- The plan excludes enterprise implementation until the public open-core distribution is complete.
- Settings, auth, email, and first-admin role-assignment invariants have an accepted direction before code changes rely on them.

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
- [ ] Ensure the image does not bake private runtime settings; tracked examples may exist only as examples.
- [ ] Define the canonical runtime settings mount path for self-hosted deployments.
- [ ] Update Compose to mount/use the private runtime settings path deliberately.
- [ ] Remove the self-hosted production runtime fallback that defaults `METEOR_SETTINGS_WORKAROUND` to `/app/settings.json`.
- [ ] Ensure missing runtime settings path, inline settings JSON, unreadable settings files, and example placeholder values fail with actionable errors.
- [ ] Add fail-fast startup validation for required settings.
- [ ] Validate `ROOT_URL` shape and consistency with public deployment docs.
- [ ] Require `owner` and at least one configured admin email for self-hosted production settings.
- [ ] Validate `owner` and `initRoles.admins` expectations for first-admin role assignment.
- [ ] Validate `encryptionKey` presence and minimum strength/format.
- [ ] Validate auth-related settings and email verification constraints.
- [ ] Validate email settings when email is enabled.
- [ ] Validate SAML/OAuth settings only when those providers are enabled.
- [ ] Add MongoDB authentication settings to the self-hosted `.env` and settings reference, including root/admin credentials, app credentials, and authenticated `MONGO_URL` expectations.
- [ ] Keep unauthenticated MongoDB examples limited to clearly labeled local developer loops.
- [ ] Document every required and optional setting in an operator-facing settings reference.
- [ ] Add tests for settings validation helpers.

Completion checks:

- Tracked settings are safe examples.
- A fresh self-hosted install either starts with complete settings or fails with actionable configuration errors.
- Operators do not need to inspect source code to know which settings are required.
- The current baked-settings image behavior is either removed from self-hosted production or documented as example-only and never used as a silent runtime default.
- Acceptance check: start once with a missing settings mount and verify startup fails with the documented error; start once with complete example-derived private settings and verify startup proceeds to Mongo readiness.

Resolved direction:

- Self-hosted installs normally allow public signup through `auth.allowPublicSignup`, but operators can turn it off deliberately.
- The `owner` setting and at least one admin email are required. If the configured account does not exist yet, first-run docs should explain that the matching user signs up and receives roles through the existing startup/login assignment path; readiness should surface that the configured admin is not usable yet.
- Password auth is the baseline local account path. OAuth/SAML providers are optional integrations, and baseline testing should still cover disabled-provider behavior plus enabled-provider validation where credentials or fixtures are available.

## Phase 2: Canonical Open-Core Compose Runtime

Goal: make Docker Compose a credible self-hosted runtime, not only a maintainer deploy scaffold.

Tasks:

- [ ] Make `deploy/docker-compose.yml` safe as the canonical production-shaped self-hosted file, or add a clearly named self-hosted file if preserving maintainer deploy behavior requires separation.
- [ ] Normalize service names, network names, volume names, and environment variable names for self-hosted use.
- [ ] Preserve explicit host-directory asset mounts for production-shaped self-hosting unless a separate beginner quickstart is added.
- [ ] Keep MongoDB as a required service.
- [ ] Make authenticated MongoDB the canonical self-hosted production baseline.
- [ ] Configure MongoDB root/admin credentials and MoFaCTS app-user credentials through `.env` values, not tracked secrets.
- [ ] Ensure canonical `MONGO_URL` uses the app MongoDB user and targets the expected database.
- [ ] Preserve current unauthenticated MongoDB only in clearly labeled local hotfix/developer workflows.
- [ ] Add MongoDB health check if practical with the selected Mongo image.
- [ ] Add app container health check against `/health` or a future readiness command.
- [ ] Define app restart policy for self-hosted deployments.
- [ ] Document current direct port exposure, when to bind only to localhost behind a reverse proxy, and why public HTTP is local/LAN-only guidance.
- [ ] Add or refine `.env` example for self-hosted Compose.
- [ ] Separate local hotfix/dev Compose docs from self-hosted operator docs.
- [ ] Add Redis to the self-hosted Compose shape in coordination with Phase 8.
- [ ] Ensure the app has no silent in-process substitute for required Redis-backed behavior.
- [ ] Validate Compose config in docs and scripts.

Completion checks:

- A new operator can run the self-hosted Compose stack from documented files.
- Required services and optional services are unambiguous.
- Local developer loops remain intact but are not confused with the open-core operator path.
- Acceptance check: run `docker compose config` against the documented self-hosted files and verify the app, MongoDB, volumes, settings mount, network, and port bindings match the operator guide.

Resolved direction:

- MongoDB currently uses a named volume; dynamic assets and H5P state currently use host directories. Keep that production-shaped model because backup-visible state matters.
- Current Compose exposes `3000:3000`. Public deployments should use HTTPS through a reverse proxy and bind the app port to localhost when the proxy is on the same host.

## Phase 3: Reverse Proxy and HTTPS

Goal: provide production-ready guidance for exposing a self-hosted instance.

Tasks:

- [x] Use Caddy as the first supported reverse proxy example.
- [ ] Add a self-hosted Caddyfile example for a real domain.
- [ ] Document WebSocket behavior required by Meteor.
- [ ] Document `ROOT_URL` and HTTPS consistency requirements.
- [ ] Document local-only HTTP, LAN HTTPS, and public HTTPS as separate cases.
- [ ] Document certificate ownership and renewal expectations.
- [ ] Add troubleshooting notes for mixed content, wrong host, websocket failures, and login redirect mismatch.
- [ ] Provide config examples first; add a maintained reverse-proxy Compose override only if implementation shows it improves operator clarity enough to justify maintaining it.

Completion checks:

- Operators can put MoFaCTS behind HTTPS without guessing at headers or app URL settings.
- The direct app port exposure story is explicit.
- Acceptance check: validate the reverse-proxy example renders a complete config with a real-domain placeholder, WebSocket-compatible proxying, and matching `ROOT_URL` documentation.

Resolved direction:

- Document the current state and provide a Caddy-first production example. There is no maintained production reverse-proxy service in Compose today.

## Phase 4: Readiness and Operational Validation

Goal: make deployment correctness inspectable.

Tasks:

- [ ] Keep `/health` as lightweight liveness.
- [ ] Extend the existing admin-only `/admin/tests` route and `testRunner` template with deployment readiness diagnostics.
- [ ] Add a distinct readiness helper or validation command behind the admin tests route.
- [ ] Validate MongoDB connectivity.
- [ ] Validate MongoDB authentication is enabled for the canonical self-hosted production path.
- [ ] Validate expected Mongo database name.
- [ ] Validate settings file was loaded from the intended path.
- [ ] Validate required settings after parsing.
- [ ] Validate dynamic asset storage root existence and read/write access.
- [ ] Validate H5P content and library directory existence and access.
- [ ] Validate `ROOT_URL` and app-visible public settings.
- [ ] Validate Redis connectivity for the canonical completed open-core runtime; during implementation, validate Redis only once Redis-backed features are enabled.
- [ ] Add a deployment validation script or extend `server-deploy-validate.sh` to call readiness.
- [ ] Document expected pass/fail output.
- [ ] Add automated tests for readiness helper logic where feasible.
- [ ] Add route/access tests proving deployment diagnostics remain admin-only.

Completion checks:

- Operators can distinguish "process is alive" from "deployment is ready."
- Missing dependencies or misconfiguration fail loudly.
- Acceptance check: run readiness against one valid deployment and at least one intentionally broken dependency or configuration, then document both outputs.

Resolved direction:

- Readiness diagnostics belong behind the existing admin-only `/admin/tests` route. Public `/health` remains a lightweight liveness endpoint.

## Phase 5: Backup and Restore

Goal: make self-hosted data durable and recoverable.

Tasks:

- [ ] Define complete backup scope.
- [ ] Include MongoDB data.
- [ ] Include MongoDB authentication credentials and explain their relationship to restore.
- [ ] Include dynamic assets.
- [ ] Include H5P content.
- [ ] Include H5P libraries.
- [ ] Include deployment settings and `.env`.
- [ ] Include SAML/OAuth certificates or key material where configured.
- [ ] Include theme/customization assets if used.
- [ ] Include all production state that exists in the deployed instance; exclude ignored local dev state unless the operator deliberately points production settings there.
- [ ] Document backup procedure using Compose.
- [ ] Document restore procedure to a clean host.
- [ ] Ensure backup and restore scripts authenticate to MongoDB deliberately instead of assuming unauthenticated local access.
- [ ] Document restore verification steps.
- [ ] Document upgrade-safe backup timing.
- [ ] Add scripts only if they can be clear, portable, and non-destructive.
- [ ] Add warnings for destructive restore operations.

Completion checks:

- A self-hosted operator can back up and restore a complete MoFaCTS instance.
- The backup docs identify every stateful component.
- Acceptance check: perform at least one restore rehearsal to a clean volume or clean host equivalent, then verify login, content listing, dynamic asset serving, and H5P content serving where applicable.

Resolved direction:

- Ship guarded backup/restore scripts.
- Support same-host restore and clean-host or clean-volume restore.
- Require an explicit destructive confirmation flag for restore operations that overwrite existing state.

## Phase 6: First-Run Admin and Content Authoring

Goal: make a fresh self-hosted instance usable without institutional tribal knowledge.

Tasks:

- [ ] Document the current first-admin settings-file flow.
- [ ] Ensure the documented flow is compatible with Phase 1 settings validation.
- [ ] Document how `owner` and `initRoles.admins` work at startup and on login.
- [ ] Ensure missing configured admin accounts are surfaced clearly without implying a separate bootstrap mechanism.
- [ ] Verify teachers cannot grant roles; role changes must remain admin-only.
- [ ] Document public signup as normally enabled for self-hosted installs, with `auth.allowPublicSignup` as the operator flag for closed registration.
- [ ] Document teacher/admin role assignment path.
- [ ] Document first content upload path.
- [ ] Use the world countries system as the public beginner smoke-test content path.
- [ ] Document where the world countries package lives, how to import or enable it, and how to launch one learner flow from it.
- [ ] Verify the world countries package is redistributable and carries any required attribution or provenance metadata before shipping it as public sample content.
- [ ] Keep H5P out of the beginner smoke-test requirement; verify H5P only where the deployment uses H5P content.
- [ ] Document dynamic asset and H5P storage implications for content upload.
- [ ] Add a minimal smoke checklist: create admin, sign in, load the world countries system, launch learner flow.
- [ ] Add tests for any new bootstrap helper logic.

Completion checks:

- A new operator can create or sign in as the first configured admin and verify content authoring.
- Acceptance check: from a clean database, configure `owner`/`initRoles.admins`, create or sign in as the matching user through the existing account path, verify the user receives admin role through the documented startup/login flow, assign any required instructor/teacher role as admin, load the world countries system, and launch one learner flow.

Resolved direction:

- Self-hosted installs normally allow public signup. Closed registration remains available through `auth.allowPublicSignup: false`.
- First-admin setup uses the settings-file owner/admin email list plus the existing account path. In the normal self-hosted path, the configured owner/admin signs up and receives roles through startup/login role assignment.

## Phase 7: Storage Boundary

Goal: make local filesystem storage coherent now and prepare for S3-compatible storage later.

Tasks:

- [ ] Inventory all app code paths that read/write dynamic assets, H5P content, H5P libraries, and generated files.
- [ ] Define storage responsibilities: upload storage, public asset serving, H5P package storage, H5P library storage, generated media/previews.
- [ ] Introduce a storage configuration model.
- [ ] Keep local filesystem as the default open-core storage backend.
- [ ] Move hard-coded path assumptions behind a small storage boundary.
- [ ] Add storage validation for configured local paths.
- [ ] Add tests around path resolution and safety invariants.
- [ ] Add S3-compatible storage only as an explicit optional backend with clear configuration and validation.
- [ ] Include one S3-compatible adapter path in the first public milestone.
- [ ] Keep local filesystem as the default backend for self-hosted installs.
- [ ] Ensure configured S3-compatible storage fails clearly when bucket, endpoint, credentials, permissions, or path settings are invalid; do not fall back to local storage.
- [ ] Document migration implications from local storage to object storage.

Completion checks:

- Local storage remains fully supported.
- Storage behavior is explicit enough that S3-compatible support can be added without scattering conditional code.
- Acceptance check: run storage validation against configured local paths and configured S3-compatible storage. Verify path traversal, missing local directory, local read/write failure, invalid S3 endpoint, invalid credentials, missing bucket, and insufficient S3 permissions fail clearly.

Resolved direction:

- Local filesystem remains the default storage backend. S3-compatible storage is included in the first public milestone as an explicit optional backend, not a hidden replacement for local storage.
- Keep app-served dynamic assets and H5P routes as the default because the app enforces path safety, visibility, H5P runtime behavior, and metadata coupling. A proxy or object store can serve immutable blobs later only behind the same storage boundary and authorization/provenance rules.

## Phase 8: Redis Boundary

Goal: introduce Redis as a required open-core subsystem boundary with at least one real Redis-backed feature.

Tasks:

- [ ] Implement Redis-backed behavior for the existing user dashboard cache/dashboard analytics refresh path.
- [ ] Define Redis role: queue, cache, pub/sub, lock, or some combination.
- [ ] Implement the selected persistence model: MongoDB is the durable record; Redis provides coordination/cache behavior that can be rebuilt from MongoDB.
- [ ] Add Redis service to open-core Compose.
- [ ] Add Redis environment variables and example config.
- [ ] Add startup validation for required Redis configuration and connectivity.
- [ ] Add a small queue/cache/lock abstraction instead of direct Redis calls across app code.
- [ ] Add tests for missing Redis configuration, unavailable Redis, and working Redis-backed behavior.
- [ ] Document operational expectations: persistence, memory, backups, and what happens if Redis is unavailable.
- [ ] Document that Redis state is reconstructable from MongoDB for the first public milestone unless a later feature explicitly introduces durable Redis queue state.
- [ ] Ensure no feature silently substitutes in-process behavior for required Redis-backed behavior.

Completion checks:

- Redis is a real part of Open Core through at least one named feature.
- Required Redis-backed behavior fails clearly when Redis is unavailable.
- Acceptance check: test the selected feature with Redis available, Redis configured but unavailable, and Redis configuration missing.

Resolved direction:

- Start with `UserDashboardCache`/dashboard analytics refresh. Use MongoDB as the durable record and Redis as coordination/cache state. Do not require a separate worker for the first pass unless implementation proves the dashboard-cache design needs one.

## Phase 9: Background Worker Shape

Goal: decide whether the selected Redis-backed subsystem requires a separate background worker service, while keeping single-host Open Core understandable.

Tasks:

- [ ] Identify whether the selected Redis-backed subsystem performs long-running, retryable, or separately scalable work.
- [ ] Confirm the dashboard-cache Redis design can run coherently in the app process for the first pass.
- [ ] If it cannot run coherently in the app process, define worker entrypoint and role.
- [ ] Ensure web and worker processes share the same application image where possible.
- [ ] Add worker service to Compose only when there is actual queued work.
- [ ] Validate worker dependencies at startup.
- [ ] Document how many worker replicas are supported in self-hosted mode.
- [ ] Add logs/readiness guidance for workers.
- [ ] Add tests for job ownership, retries, and idempotency where the first Redis-backed subsystem requires them.

Completion checks:

- The first Redis-backed subsystem has a clear runtime home.
- Self-Hosted MoFaCTS can run simply on one host and still preserves the later hosted scaling path.
- Acceptance check: if a worker service exists, run one documented job through it and verify ownership, retry/idempotency expectations, logs, and readiness behavior; if no worker exists, document why queued structure is sufficient for open-core completion.

Resolved direction:

- No separate worker service is required for the first pass unless implementation proves the dashboard-cache design needs one.

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
- [ ] Document both public image paths: pulling a prebuilt image and building locally from source.
- [ ] Ensure AGPL license text, third-party notices, dependency license artifacts, build scripts, and lockfiles are included or linked as required by `docs/license-compliance.md`.
- [ ] Ensure the deployed app's visible "License / Source" link points to the exact public source tag or source archive for the deployed version.
- [ ] Add release-note requirements for deployment-impacting changes, settings changes, storage changes, Redis/worker changes, migrations, and backup/restore implications.
- [ ] Add public-repository readiness checks: secret scan, institution-specific data scan, redistributable sample content audit, dependency license audit, clean-clone build check, and stale-license/provenance scans.

Completion checks:

- Operators can upgrade without guessing which state or config might change.
- Operators can trace a running deployment and any distributed image back to corresponding source, notices, and release documentation.
- Acceptance check: produce a draft release checklist for one open-core version and verify it names the source tag/archive, image tag if applicable, settings template version, license artifacts, migration notes, backup requirement, and post-upgrade smoke test.

Resolved direction:

- Operators should see semantic public release tags starting from the current `v0.1.0-alpha.1` baseline, with matching source tags, image tags when images are published, release notes, and settings template versions.
- Database changes are forward-only unless explicitly designed otherwise. Any Mongo collection shape, migration, index, or persistence contract change requires a written migration note and explicit approval before implementation.
- Support both prebuilt images and local source builds so public operators and approved consortium contributors can run, inspect, and improve the code. Contributor governance details should be documented in release/contribution docs without changing the self-hosted runtime contract.

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

Completion checks:

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
- [ ] Verify canonical self-hosted MongoDB uses authentication and the app connects with the app MongoDB user.
- [ ] Bootstrap first admin.
- [ ] Load the world countries system as test content.
- [ ] Complete learner smoke flow.
- [ ] Verify dynamic asset serving.
- [ ] Verify the default local filesystem storage backend.
- [ ] Verify configured S3-compatible storage works, and intentionally broken S3-compatible storage fails clearly without falling back to local storage.
- [ ] Verify H5P content serving if relevant.
- [ ] Verify backup.
- [ ] Restore to a clean volume or clean host.
- [ ] Verify restored app behavior.
- [ ] Verify upgrade path from previous supported version once versioning is established.
- [ ] Verify "License / Source" link and release docs point to the exact source tag/archive for the running version.
- [ ] Verify AGPL text, third-party notices, dependency license artifacts, build scripts, and lockfiles are present or linked for distributed artifacts.
- [ ] Verify public self-hosted install can be performed from tracked examples plus private operator-provided settings, without source edits or undocumented defaults.
- [ ] Record any environment limitations that prevented a check.

Completion checks:

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
