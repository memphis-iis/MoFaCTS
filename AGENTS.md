# MoFaCTS Agent Guide

## Purpose

This repository contains the MoFaCTS application. MoFaCTS is the Mobile Fact and Concept Training System, a web-based adaptive learning system.

The application source tree lives under `mofacts/`.

## Repo Selection

- For runtime behavior, UI rendering, themes, transitions, Svelte components, state machines, or application logic, work in this repository and prefer `mofacts/`.
- For TDF/config content or sync scripts, use the project configuration/content repository and inspect this repository only for compatibility checks.
- For product and developer documentation that is too long for the public repo docs, use the project wiki.

## Subtree Roles

- `mofacts/`: application source.
- `deploy/`: canonical Docker Compose build and deploy workflow.
- `docs/`: concise public repository documentation.
- `.github/`: GitHub workflow, issue, and pull request metadata.

## Cross-Repo Coordination

- If user-facing behavior changes in `mofacts/`, check whether wiki documentation needs an update.
- If code changes alter required TDF fields, config names, structures, or expectations, verify compatibility with the configuration/content repository.
- If schemas, payloads, interfaces, or field names change, inspect dependent repositories for compatibility.

## Operational Rules

- Silent fallbacks are not allowed; fail clearly when invariants break.
- Do not make "patch" fixes that leave broken or rickety wiring in place and merely make the immediate symptom appear to work. When a subsystem boundary or flow is wrong, analyze the whole flow, name the invariants, and rebuild the subsystem or integration point so it is coherent and durable.
- When a plan and its invariants make sense, work toward it incrementally using hill climbing: make the smallest coherent move, verify whether it improved the system, and continue. Stop and re-analyze only when the plan or invariants no longer make sense.
- Do not fix a new behavior by changing unrelated working behavior. Existing working paths, especially explicitly identified reference paths, must be treated as regression-sensitive and preserved unless the user explicitly asks to redesign them.
- Stay on the current branch for local commits and pushes unless the user explicitly asks to create or switch branches.
- Do not create `codex/*` or other work branches automatically.
- This repository normally expects agent commits to be made on `main` when the checkout is on `main`.
- Do not add compatibility fallback paths unless explicitly requested.
- Do not generate, edit, or keep side-by-side emitted `.js` files next to `.ts` source files in `mofacts/client/`, `mofacts/server/`, or `mofacts/common/`.
- Treat untracked `.js` twins beside `.ts` files in `mofacts/` as build spill unless proven otherwise.
- Never add raw client `console.*` for routine logging; use `mofacts/client/lib/clientLogger.ts`.
- Preserve admin-controlled client verbosity behavior.
- Use inline UI patterns instead of modal popups unless explicitly requested.
- Never run `meteor run` in automation except through the native hotfix dev loop documented below.
- Do not use local Meteor CLI workflows as release-confidence substitutes for the supported Docker Compose workflow.
- Do not run Docker build, push, or deploy commands unless explicitly requested.

## Architecture Boundaries

- Executable application code currently lives under `mofacts/`. Root `app/`, `tests/`, and `packages/` are architectural scaffolds unless the local README and build/test wiring say the relevant runner is active.
- Put pedagogical extension logic in `learning-components/`: unit engines, trial behavior, adaptive model logic, TDF/stimulus interpretation, response normalization, and external learning adapters.
- Put Meteor routing, collections, publications, server methods, app shell UI, persistence, logging, and migrations in `mofacts/`.
- New unit types should go through the unit-engine registry and expose explicit lifecycle methods. Do not duplicate legacy behavior in the old `mofacts/client/views/experiment/unitEngine.ts` path; keep that path as an app dependency facade.
- Learning components should depend on explicit runtime context/dependency interfaces. Avoid reaching from `learning-components/` into deep Meteor client/server paths unless a temporary facade is already documented and behavior-preserving.
- If an alternate runtime path is intentional, name it by the domain behavior it provides. Do not call a deliberate path a fallback, and do not add recovery behavior that masks a broken invariant.

## Real Hotfix Dev Loop

For fast UI/application hot fixes on Windows, use the native local hotfix dev server. This is the intended 10-20 second observe/edit/reload loop after the first startup has warmed caches.

- Start the dev service from `deploy/` with `.\hotfix-dev.ps1 start`.
- The dev app runs at `http://localhost:3200` and uses the same local MongoDB database, `MoFACT-meteor3`.
- The dev server runs Meteor natively from the Windows checkout and uses Docker only for MongoDB.
- The script publishes MongoDB on `127.0.0.1:27017` with `docker-compose.hotfix-native.yml`.
- Local dev logs and PID files belong under ignored local state in `deploy/local-dev/`.
- The dev launcher maintains an ignored `.meteor/local/build/package.json` CommonJS marker required by native Meteor dev on this `"type": "module"` app.
- Rspack dev-server host checking explicitly allows `host.docker.internal` so Playwright MCP can inspect the native dev app from its container.
- Agents may run this hotfix dev server even though it starts Meteor in watch mode; this is the only automation exception to "Never run `meteor run`", and it is limited to local interactive UI observation.
- Do not use the hotfix dev service as release confidence, deploy confidence, or a substitute for `npm run typecheck`.
- For UI work, point Playwright/MCP at the hotfix dev app, make the smallest coherent source change, let Meteor/Rspack rebuild, refresh the page, and observe again.
- If a dependency or Meteor package changes, run the required install/update step deliberately and restart the hotfix dev service.

## Local Hotfix Loop

The repository also supports a local-only bundle loop under `deploy/` for production-shaped app-code verification without creating a deployable Docker image. This is slower than the real hotfix dev loop.

- Code hot fixes still require a Meteor bundle rebuild. Do not monkey-patch compiled files inside a running container.
- The local hotfix loop may rebuild the bundle and restart the local app container without running a Docker image build.
- Use `docker-compose.hotfix-local.yml` together with `docker-compose.yml` and `docker-compose.local.yml`.
- On Windows, `deploy/hotfix-local.ps1` runs the standard local loop: typecheck, compose config validation, hotfix bundle build, bundle dependency install, and app restart.
- Generated hotfix output belongs in the Docker volume `deploy_hotfix_bundle`; do not run the generated bundle from a Windows bind mount.
- For TypeScript-bearing app changes, run `npm run typecheck` from `mofacts/` before rebuilding the hotfix bundle.
- After rebuilding, either tell the user the local app is ready for manual testing or continue with local browser/MCP testing when the task calls for production-shaped verification.
- For UI work, prefer the native hotfix dev loop first. Use the bundle loop afterward when a production-shaped verification pass is needed.
- This local hotfix loop is not release confidence and must not replace the canonical Docker Compose image build for release or deployment validation.

## TypeScript Verification

When TypeScript-bearing app code changes, run the full app check from `mofacts/`:

```bash
npm run typecheck
```

Do not treat per-file checks or targeted `tsc` invocations as a substitute for full-app TypeScript verification.

## Verification Strategy

Use the verification path that matches the change, and say clearly when a check could not be run in the local environment.

- TypeScript-bearing app changes: run `npm run typecheck` from `mofacts/`.
- Lintable TypeScript, JavaScript, or Svelte changes: run `npm run lint` from `mofacts/`.
- TDF field registry or schema changes: run `npm run generate:schemas` from `mofacts/` and inspect generated schema diffs.
- UI/runtime behavior changes: use the native hotfix dev server plus browser smoke testing at `http://localhost:3200`.
- Meteor integration or client contract coverage: use CI or another supported Meteor test environment. Do not run `npm run test:ci` as routine local Windows verification; the script refuses local Windows execution unless `MOFACTS_ALLOW_WINDOWS_METEOR_TESTS=1` is set for deliberate harness debugging. If Meteor coverage is needed but unavailable locally, document that explicitly instead of substituting a narrower check.
- Docker build, push, or deploy verification: run only when explicitly requested.

## Server Method Design

The server should stay minimized; the client should do as much processor work as safely possible.

- Add server methods only for database access, authentication or authorization enforcement, encryption, secrets, or external API calls that cannot safely run on the client.
- Do not add pure-compute methods to `mofacts/server/methods.ts`.
- Minimize database round-trips. Prefer batched queries or aggregation pipelines over N+1 loops.
- Do not return full collection scans to the client.
- Avoid server-side reshaping that the client can do from data it already has.
- Rate-limit public and unauthenticated methods.
- Extract large helpers out of `methods.ts` into `server/lib/` or `common/`.
