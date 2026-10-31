# MoFaCTS Agent Guide

MoFaCTS (Mobile Fact and Concept Training System) is a web-based adaptive learning system. Its executable application lives in `mofacts/`.

Keep critical rules self-contained in this root guide. Link longer procedures in public docs; introduce nested agent files only when explicitly requested. Use [audit.md](audit.md) for focused audits of breakages, unused code, and redundancy within the user's authorized scope.

Consult [CHATGPT_CONTEXT.md](CHATGPT_CONTEXT.md) for project background, requirements, terminology, and historical decisions. It is the maintained context; the preserved ChatGPT export is not authority for current implementation. Verify implementation claims against current code.

## Decision Priority

Resolve competing instructions in this order:

1. The user's explicit scope, intent, and permissions.
2. Data integrity, security, privacy, and repository invariants.
3. Verified runtime behavior and clear architectural ownership.
4. The narrowest coherent change that leaves no broken wiring.
5. Required verification and honest reporting.
6. Documentation, cleanup, and maintainability improvements within scope.

## Critical Invariants

- Runtime, UI, themes, transitions, state machines, and application logic belong here, primarily in `mofacts/`.
- TDF/config content and sync scripts belong in `C:\dev\mofacts_config`; use this repository for compatibility checks. That repo is passive storage: do not require manifests or run content validators/audits for storage, conversion, commits, or pushes unless explicitly requested. MoFaCTS owns upload-time validation.
- Product/developer documentation too long for public repo docs belongs in `C:\dev\MoFaCTS.wiki`.
- If set, `MOFACTS_CONFIG_REPO` and `MOFACTS_WIKI_REPO` must resolve to those exact canonical paths. Stop and report mismatches. If unset, verify and use the canonical directories without treating missing variables as a problem.
- The config and wiki repos are critical project components. Do not clone, create, copy, or substitute replacements without explicit instruction.
- For user-facing app changes, check whether the wiki needs updating. For changes to required TDF fields, configuration names, structures, schemas, payloads, interfaces, or field names, verify dependent-repository compatibility.
- Never silently substitute data, identity, repositories, configuration, runtime paths, or behavior when an invariant fails. Fail at its owning boundary. Recovery must be explicit and observable, have a named owner and contract, and preserve the invariant.
- Do not add compatibility fallback paths unless explicitly requested.
- Docker builds, pushes, deployments, and production-affecting commands require explicit requests. Local Meteor CLI workflows cannot substitute for supported Docker Compose release verification.
- Align Meteor, Node/npm, CI assertions, and Docker runtime pins. Use the release's official DDP/Rspack packages; superseded local copies or dependency replacements must not shadow upstream security fixes.

## User Intent And Permissions

- Answer conceptual questions directly when the prompt already contains the answer; workspace inspection is unnecessary.
- Diagnosis, review, audit, and status requests authorize bounded searches, diffs, status checks, and non-mutating diagnostics in the named workspace, plus canonical localhost startup. They do not authorize edits, tests with side effects, external actions, production/staging startup, commits, or pushes.
- Start/restart localhost and its dependencies as needed for diagnosis, testing, or restoring access through `deploy/hotfix-local.ps1`, without separate permission. This excludes release builds and production/staging changes.
- If diagnosis depends on an unsupplied runtime value (model, reasoning level, credential source, provider route, environment, or persisted setting), ask the user before hypothesizing or patching. Do not replace that information with assumptions or external research.
- Ask before adding user-visible fields, controls, stages, output types, or behavior outside the approved specification. Recommend changes arising from a question separately and wait for explicit approval.
- Implement requested changes end to end when feasible; report the result and verification.
- Stay on the current branch unless explicitly asked to create/switch. Never create `codex/*` or other branches automatically. When on `main`, agent commits normally stay on `main`.
- Never revert user or unrelated working changes without explicit instruction.
- Commit/push only when explicitly requested; include intentional files only and state verification. For direct commit-and-push requests, use plain Git and existing credentials. Open a PR only when explicitly requested; require `gh` only for an explicitly requested PR or another operation that needs it.

## Common Commands

Run app commands from `mofacts/`:

- `npm run typecheck`
- `npm run lint`
- `npm run generate:schemas`

Lint includes the security surface contract. Changes to server methods, publications, HTTP handlers, exports, or management routes require authorization review and a matching update to `mofacts/security-surface-contract.json`; never automatically classify discovered surfaces.

## Repo Map

- `mofacts/`: application source.
- `learning-components/`: unit engines, trials, adaptive models, TDF/stimulus interpretation, response normalization, and external learning adapters.
- `deploy/`: canonical Docker Compose deployment and local hotfix workflows.
- `docs/`: concise public documentation.
- `.github/`: workflows, issues, and PR metadata.
- Root `app/`, `tests/`, and `packages/`: architectural scaffolds unless local README and build/test wiring establish an active implementation or runner.

## Architecture Boundaries

- Keep Meteor routing, collections, publications, methods, app shell, persistence, logging, and migrations in `mofacts/`; unit engines and pedagogical extensions in `learning-components/`.
- New unit types should use the unit-engine registry with explicit lifecycle methods. Keep `mofacts/client/views/experiment/unitEngine.ts` an app dependency facade, without duplicating legacy behavior.
- Learning components use explicit runtime dependency/context interfaces. Avoid deep Meteor imports unless a documented, behavior-preserving temporary facade already exists.
- SPARC must not deliver previously used instructional content to the same user in a new turn, across lessons/sessions. This covers every explanation, written support, question, feedback, other tutor utterance, image, and video, including generated output and components embedded in matched instructions. Restoring a saved turn preserves its accepted output. Prior-content links and fresh library IDs do not satisfy no-repeat. See `docs/sparc-instructional-cycle.md` for the approved requirement and implementation status.
- SPARC retrieval and embedding caches belong to the browser. Search uses the single maximum cosine similarity among eligible unseen content in the requested category; images/videos compete in one local search at 0.95. Independent generation calls must not coordinate through locks, polling, or shared in-flight work.
- Server image/library services own persistence, exact-ID reads, authorization, and secret-bearing provider calls. Administrative deletion preserves learner decisions and model/history records, removes catalog content/media, and leaves content-free receipts that render "Administrative removal" on reload. See `docs/sparc-instructional-cycle.md`.
- Name intentional alternate runtime paths by their domain behavior; do not call them fallbacks. Recovery must obey Critical Invariants.

## Legacy And Alternative Paths

- Prefer coherent, maintainable code over preserving obsolete behavior by default; MoFaCTS does not yet have a large user base requiring every historical path.
- "Legacy" means retained solely for past approaches outside the intended final system. Age, unfamiliarity, or difference alone does not establish it; name current alternatives by their domain behavior.
- Before building on, changing, deleting, or adding compatibility around apparently unnecessary legacy code, ask whether it is needed. Explain dependencies and recommend removal, replacement, or preservation. Incidental legacy code outside the task can wait for handoff.
- Usually delete/collapse confirmed legacy paths. If preservation is explicitly chosen, document the invariant, owner, expected lifetime, and required verification.

## Change Discipline

- Inspect surrounding code and existing patterns before editing; filenames alone do not establish architecture. Analyze the whole affected flow and its invariants so repairs leave coherent wiring.
- Reuse existing helpers and conventions. Stay within the requested behavior and owning module; explain broad refactors before expanding scope.
- Before adding variables, fields, IDs, schema properties, fact slots, config keys, or similar concepts, search relevant/adjacent modules for concepts to reuse, rename, or collapse. For TDF fields, config keys, schemas, and unit identifiers, search both `mofacts/` and `C:\dev\mofacts_config`.
- Avoid parallel names/representations unless their distinction is necessary, explicit, and documented. If existing redundancy appears, stop before building on it; tell the user the concepts, locations, and whether resolution is needed for this task.
- Preserve intentional working paths, especially identified reference implementations, unless redesign is requested. Do not preserve obsolete paths by default.
- Make the smallest coherent change consistent with the plan and invariants, verify its effect, and continue.
- New npm, Meteor, Docker, or system dependencies require explicit approval. First search existing packages/helpers and explain why they are insufficient.
- Edit source rather than generated, bundled, cached, or compiled files; verify uncertain provenance before editing.

## Verification Matrix

Use the path matching the change:

| Change type | Required verification |
| --- | --- |
| TypeScript-bearing app changes | Full `npm run typecheck` from `mofacts/`; never substitute per-file checks or targeted `tsc`. |
| Lintable TypeScript, JavaScript, or Svelte | `npm run lint` from `mofacts/`. |
| TDF field registry or schema | `npm run generate:schemas` from `mofacts/`; inspect generated diffs. |
| Meteor integration or client contracts | CI or another supported Meteor environment; do not routinely run `npm run test:ci` on local Windows. |
| Docker build, push, deploy, or release confidence | Only when explicitly requested. |

Every `npm run test:ci` invocation requires fresh, explicit, single-use user authorization, including repeated invocations in the same task.

The CI runner cleans transient test-generated `meteortesting:*` resolutions from `.meteor/versions`. Lint and pre-commit checks must reject their persistence in the application manifest.

- Report failed required commands, relevant errors, and whether they appear related to the change. If a check cannot run locally, explain why and name the next supported verification path.
- Required verification failures block staging, commit, and push until the user explicitly accepts the identified failure and its relevance/risk.

## Persistence And Migration Safety

- Learner histories, model state, course assignments, TDF content, and resume identity are durable contracts.
- Destructive/irreversible migrations require explicit approval. Migrations must be restartable or idempotent, bounded for production scale, and observable through progress/failure logs.
- Before implementation, define the transformation, validation, recovery/rollback, and affected readers/writers. Before reinterpreting a stored field, trace all writers, readers, indexes, publications, methods, analytics, and dependent repos.
- Verify representative existing records and newly created data; clean-install tests alone are insufficient.

## Security And Privacy

- Never expose credentials, tokens, connection strings, local settings, learner data, or raw database records in logs, screenshots, artifacts, commits, or handoffs. Keep secrets in approved ignored settings/environment mechanisms, never tracked defaults/examples.
- Learner histories and usage exports are sensitive. Minimize diagnostic fields/records and redact identifiers in retained evidence.
- Enforce authentication/authorization at Meteor method, publication, route, and server boundaries; client visibility is not authorization.
- Production-data copies and broader database access require explicit approval. Prefer synthetic or minimized records.

## UI, Logging, And Client Behavior

- The central theme owns appearance, including authored/LLM markup and SPARC. Reuse shared theme properties/presentation rules, including table padding and figure/table rounding. See `docs/theme-presentation.md`.
- For routine client logging, use `mofacts/client/lib/clientLogger.ts` instead of raw `console.*`. Preserve admin-controlled verbosity.
- Use inline UI instead of modal popups unless explicitly requested.
- Preserve keyboard operation, visible focus, semantic labels, screen-reader announcements, contrast, and reduced-motion support where applicable.
- Keep interface locale, authored content language, learner response language, speech-recognition language, and text-to-speech language distinct; never silently infer one from another.

## Local Hotfix Watch Loop

Helper ownership is documented in `deploy/hotfix/README.md`.

- Exactly one localhost app server is permitted: the Linux Docker Meteor/Rspack watcher at `http://localhost:3200`, owned by `deploy/hotfix-local.ps1` and `deploy/docker-compose.local.yml`.
- Compose owns the watcher, MongoDB, and replica-set initialization. Never run Meteor on the Windows host. Linux dependencies/caches stay in Docker volumes, separate from host installations.
- Source edits must rebuild/reload automatically. Do not substitute manual generated-bundle loops or patch compiled output.
- `hotfix-local.ps1` validates Linux Docker/Compose and manages start, restart, stop, status, and logs; the container validates pinned Meteor/Node/npm. Readiness requires app health, browser bundle, HMR, and active Change Streams.
- This loop verifies local behavior; canonical Docker Compose image builds establish release confidence.

## Server Method Design

- Minimize server work. Add methods only for database access, authentication/authorization, encryption, secrets, or external API calls unsafe for the client. Keep pure computation client-side where safe, and avoid server reshaping of data the client already holds.
- SPARC explanation and requested support form one matched instruction under the no-repeat contract. Persist composition before media resolution; accept both display nodes before generating the question.
- Practice history saves must not rebuild dashboard/course summaries. On dashboard entry, apply newly committed history to changed lessons; reconstruct fully only at initialization or explicit repair. Persist last-used unit and resume state during practice. See `docs/architecture.md`.
- Lint enforces that production server modules cannot directly/transitively import learner-executable `learning-components/models/` or `learning-components/units/` code; type-only server-interface imports are excluded.
- Keep pure-compute methods out of server method modules. Prefer batched queries/aggregations over N+1 round-trips. Do not return full collection scans. Rate-limit public/unauthenticated methods.
- Extract large method helpers into `server/lib/` or `common/`; the active method modules are under `mofacts/server/methods/`.

## Scalability-Sensitive Surfaces

- Do not reactively publish broad full TDF documents. Limit listing fields; reserve full content for exact-ID runtime, launch, or edit publications.
- Avoid full scans, unbounded `find({})` publications, and full-document payloads on dashboard, admin, or learner startup paths.
- Cache rebuilds, admin refreshes, and migration-style jobs touching many users/history rows require supporting indexes, bounded concurrency, and progress logs.
- Prefer child-to-root or explicit reference indexes over scanning every TDF/root to reconstruct families.
- If retaining a broad/expensive compatibility path, document its invariant and expected lifetime, limit returned fields, and verify its supporting index or bound in the same change.

## Generated Files And Public Repo Hygiene

- Never commit root `outputs/`, root `tmp/`, one-off inventories, working notes, generated decks, screenshots, local dumps, or ad hoc artifacts. Keep local-only artifacts ignored; update `.gitignore` for repeatable tools producing new local output.
- Put curated examples in intentional public paths (`examples/`, `docs/`, or documented asset folders) with provenance sufficient for license/source review.
- Update concise public docs with changes to setup, local run, admin bootstrap, testing, deployment, TDF schema, or unit extension. Purely internal refactors need docs only when behavior, setup, schema, workflow, or contributor expectations change.
- Explain when user-facing changes need no docs update. Keep working procedures publicly documented rather than only in private/local knowledge.
- Point contributors to active implementation roots, not scaffolds; unit behavior belongs in `learning-components/` unless a scaffold has become the active contract.
- Do not generate, edit, or retain emitted `.js` twins beside `.ts` sources in `mofacts/client/`, `mofacts/server/`, or `mofacts/common/`. Treat untracked twins as build spill unless proven otherwise.

## Maintenance Rule

- Maintain this guide or appropriate public docs alongside changes to build, test, development, deployment, documentation, architecture, or verification workflows.
- Keep essential decision rules visible here. Move long, procedural, or rare details to linked public docs without losing critical root-level guidance.

## Required Handoff

Report concisely:

- Changes/conclusions and supporting evidence.
- Verification results, and required checks omitted with reasons.
- Unrelated working changes preserved.
- Relevant compatibility, migration, security, privacy, accessibility, localization, and documentation impact.
- Remaining risks or user decisions.
