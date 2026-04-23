# MoFaCTS Agent Guide

## Purpose
- Repository: `C:\dev\MoFaCTS`
- Standalone MoFaCTS repository. The application source tree lives under `mofacts/`.

## Repo Selection Rule
- Do not assume the current working directory is the right repo for the task.
- Choose the repo based on task ownership first.
- For runtime behavior, UI rendering, themes, transitions, Svelte components, state machines, or application logic, work in this repository and prefer `mofacts/`.
- Do not remain in `mofacts_config` for MoFaCTS app or theme audit work just because the session started there.
- If the task is primarily about TDF/config content or sync scripts, use `C:\Users\ppavl\OneDrive\Active projects\mofacts_config` and inspect this repo only for compatibility checks.

## Subtree Roles
- `mofacts/` is the application area. Prefer this path for implementation work.
- `mofacts/.deploy/` contains the canonical Docker Compose build/deploy workflow for this repository.

## Sibling Repositories In This Workspace
- `C:\Users\ppavl\OneDrive\Active projects\mofacts_config` (configuration/content definitions)
- `C:\Users\ppavl\OneDrive\Active projects\mofacts.wiki` (product and developer documentation)

## Cross-Repo Coordination Is Expected
- Do not assume this repository is self-contained.
- If user-facing behavior changes in `mofacts`, inspect whether updates are needed in `C:\Users\ppavl\OneDrive\Active projects\mofacts.wiki`.
- If code changes alter required config fields, names, structures, or expectations, inspect `C:\Users\ppavl\OneDrive\Active projects\mofacts_config` and verify compatibility.
- If TDF-related config fields may be affected, confirm names and required structures still match application expectations.
- If schemas, payloads, interfaces, or field names change, inspect dependent repos for compatibility.

## Coordination Triggers
- For functional behavior, workflow, setup, or config-semantics changes, run a wiki accuracy pass in `mofacts.wiki`.
- For runtime parsing, validation, field use, or settings expectations, inspect `mofacts_config`.

## Operational Rules
- Silent fallbacks are not allowed; fail clearly when invariants break.
- Do not add compatibility fallback paths unless the user explicitly requests that goal.
- If a file is necessary to complete the task correctly, work in it even if it was not part of the initially expected file set.
- Do not comment on unrelated local diffs, pre-existing modified files, or surprising worktree state unless they materially conflict with the task or create real risk.
- `mofacts/` is a TypeScript-first app source tree. Do not generate, edit, or keep side-by-side emitted `.js` files next to `.ts` source files in `client/`, `server/`, or `common/`.
- Treat any untracked `.js` twin beside a `.ts` file in `mofacts/` as a regression/build spill, not as canonical source. Before deleting such files, protect current work with a snapshot and verify any unusually recent `.js` twins for manual edits.
- Do not run transpilers, one-off compilers, or other commands that emit compiled `.js` output back into the source tree. Keep build output in dedicated ignored output folders only.
- When module-resolution ambiguity exists between `.ts` and `.js` copies of the same module, preserve or restore `.ts` as the canonical source of truth and remove the emitted `.js` twin.
- TDF content access must be enforced only by the canonical per-area access rules in code and documentation.
- Derived state such as `accessedTDFs`, history, version metadata, UI/session context, or role-based exceptions must not grant or remove TDF access unless the canonical rule for that area explicitly requires it.
- Never add raw client `console.*`; use project logging utilities.
- Treat `mofacts/client/lib/clientLogger.ts` `clientConsole(level, ...)` as the canonical client logging gate.
- Treat the admin-controlled `clientVerbosityLevel` path in `mofacts/client/views/adminControls.ts` plus `loadClientSettings()` as mandatory behavior, not optional guidance.
- Any routine client tracing, lifecycle notes, state-machine transitions, routing diagnostics, fade timing, SR diagnostics, or session cleanup messages must go through `clientConsole(...)` so admins can suppress them from the System Admin screen.
- Raw client `console.log/info/debug/warn/error` is only acceptable for truly exceptional cases where `clientConsole` is unavailable during bootstrap and the message must bypass verbosity gating; otherwise do not use it.
- When editing existing client code that already uses raw `console.*`, convert touched logging to `clientConsole(...)` unless the user explicitly asks to preserve always-on browser console output.
- For `mofacts`, TypeScript verification must use the full app, not a narrowed subset. Run `npm run typecheck` from `C:\dev\MoFaCTS\mofacts` when TypeScript-bearing code changes or when auditing/verifying important changes.
- Do not treat per-file checks, targeted `tsc` invocations, or “the current diff compiles” as a substitute for full-app type verification.
- Do not ignore pre-existing TypeScript failures during verification. Either fix them in the current pass or report them explicitly as unresolved blockers/verification limits.
- Use inline UI patterns instead of modal popups unless the user explicitly requests otherwise.
- Never run `meteor run` in automation.
- Do not use local Meteor CLI workflows as a proxy for the supported build/deploy path. In this repo, `meteor test`, `meteor build`, `meteor npm test`, `npm run test`, and `npm run test:ci` are noncanonical unless the user explicitly asks for that exact local path.
- Do not infer Docker build, deploy, or release risk from failures in unsupported local Meteor CLI flows. If a local Meteor command was run by mistake, describe the failure as limited to the local Meteor path only.
- Treat the Docker Compose workflow under `C:\dev\MoFaCTS\mofacts\.deploy` as the canonical build/deploy path for meaningful release confidence. Use the compose files in that folder rather than substituting a local Meteor command.
- Avoid creating local Meteor artifacts such as `mofacts/.meteor/local` during normal automation. If a local Meteor command is run accidentally and generates local cache/build artifacts, call that out plainly and clean up only with the user's approval.
- Do not run Docker build, push, or deploy commands unless the user explicitly requests that task.

## Server Method Design Rules (mofacts/server/methods.ts)
The architecture design goal is that the server is minimized; the client does as much processor work as possible.
- **Default to client-side computation.** Only add a server method when the task requires DB access, auth enforcement, encryption, or external API calls that cannot safely run on the client.
- **Never add pure-compute methods to the server.** If a method requires no DB or secret access, it belongs in `/common` or the client, not in `methods.ts`.
- **Minimize DB round-trips per method.** Use a single aggregation pipeline with `$lookup` instead of sequential queries or N+1 look-up loops. Batch all IDs upfront before looping.
- **Never return full collection scans to the client.** Always filter, project, and paginate at the DB layer. Methods that fetch all records of a collection (e.g., `getAllTdfs`) are a red flag requiring an explicit justification.
- **Avoid in-method data transformation the client could do.** If the server is mapping, sorting, or reshaping data that the client already has the raw material to construct, move that logic to the client.
- **Don't proxy.** A server method that only delegates to another server method with no auth check or logic of its own (e.g., `combineAndSaveContentFile` → `upsertPackage`) should be inlined or eliminated.
- **Don't block on subprocesses.** Methods that spawn ImageMagick, external scripts, or other blocking subprocesses must use async execution or a background job queue. Never block the method fiber on subprocess completion.
- **Validate at the boundary, not repeatedly inside.** Validation helpers (e.g., `validateExperimentStateMutation`) should run once per method call, not on every read path. Prefer conditional updates with MongoDB operators over fetch-validate-rewrite patterns.
- **Extract large helpers out of methods.ts.** Non-method helper functions longer than ~50 lines should live in `server/lib/` (server-only) or `common/` (shared). `methods.ts` should contain method definitions and minimal glue, not business logic implementations.
- **Rate-limit public and unauthenticated methods.** Any method callable without authentication must go through `approveMethodRateLimit()` or an equivalent guard.
- **Known efficiency debt to watch for:**
  - `getResponseKCMap()` — full collection scan; use `getResponseKCMapForTdf()` for single-TDF needs.
  - `getStudentPerformanceForClassAndTdfId()` — full history scan + N+1 user lookups; should use `$lookup` aggregation.
  - `getTdfById()` — O(n) experiment-state loop; should use `$in` query.
  - `getTdfsAssignedToStudent()` — 4 sequential queries; collapse to one `$lookup` chain.
  - `insertNewUsers()` — per-row signup lock serializes bulk imports; batch or parallelize.
  - `getContentUploadSummariesForIds()` — N+1 condition TDF lookups; batch-fetch first.
