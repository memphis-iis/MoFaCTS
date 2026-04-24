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
- `mofacts/.deploy/`: canonical Docker Compose build and deploy workflow.
- `docs/`: concise public repository documentation.
- `.github/`: GitHub workflow, issue, and pull request metadata.

## Cross-Repo Coordination

- If user-facing behavior changes in `mofacts/`, check whether wiki documentation needs an update.
- If code changes alter required TDF fields, config names, structures, or expectations, verify compatibility with the configuration/content repository.
- If schemas, payloads, interfaces, or field names change, inspect dependent repositories for compatibility.

## Operational Rules

- Silent fallbacks are not allowed; fail clearly when invariants break.
- Do not add compatibility fallback paths unless explicitly requested.
- Do not generate, edit, or keep side-by-side emitted `.js` files next to `.ts` source files in `mofacts/client/`, `mofacts/server/`, or `mofacts/common/`.
- Treat untracked `.js` twins beside `.ts` files in `mofacts/` as build spill unless proven otherwise.
- Never add raw client `console.*` for routine logging; use `mofacts/client/lib/clientLogger.ts`.
- Preserve admin-controlled client verbosity behavior.
- Use inline UI patterns instead of modal popups unless explicitly requested.
- Never run `meteor run` in automation.
- Do not use local Meteor CLI workflows as release-confidence substitutes for the supported Docker Compose workflow.
- Do not run Docker build, push, or deploy commands unless explicitly requested.

## TypeScript Verification

When TypeScript-bearing app code changes, run the full app check from `mofacts/`:

```bash
npm run typecheck
```

Do not treat per-file checks or targeted `tsc` invocations as a substitute for full-app TypeScript verification.

## Server Method Design

The server should stay minimized; the client should do as much processor work as safely possible.

- Add server methods only for database access, authentication or authorization enforcement, encryption, secrets, or external API calls that cannot safely run on the client.
- Do not add pure-compute methods to `mofacts/server/methods.ts`.
- Minimize database round-trips. Prefer batched queries or aggregation pipelines over N+1 loops.
- Do not return full collection scans to the client.
- Avoid server-side reshaping that the client can do from data it already has.
- Rate-limit public and unauthenticated methods.
- Extract large helpers out of `methods.ts` into `server/lib/` or `common/`.
