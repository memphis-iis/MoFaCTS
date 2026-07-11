# SPARC Modularity And Efficiency Plan

## Executive Summary

This audit found no evidence that SPARC currently pushes avoidable rule evaluation or replay computation onto the server. The server-facing SPARC path is mostly a scoped history read/write boundary, while document conversion, replay, rule evaluation, model-history exchange, progress reporting, and UI updates stay in `learning-components/` and the Meteor/Svelte client.

The top risks are client-side scalability and maintainability: full exact-unit SPARC history is fetched and retained for replay, the production-rule cache is unbounded, each rule event rebuilds an authored document from the trial display and replays prior history, and the rule evaluator repeatedly scans the same facts/rules. The authoring editor is also a single very large Svelte module that mixes TDF mutation, drag/drop, rich text, validation, rule editing, runtime preview, and styling.

The highest-value implementation sequence is: bound the client replay/history cache, carry live replay state incrementally during the active session, cache compiled document/runtime structures, index facts and rules for production-rule evaluation, then complete the modularization of the SPARC authoring editor while preserving current TDF shape and wiki-documented authoring vocabulary.

## Current SPARC Architecture Map

- **Config/content boundary:** `C:\dev\mofacts_config` contains 93 SPARC display payloads in the scanned JSON corpus. The largest observed converted modules include `SPARC Intro Stats - Module 10 - Two-way Tables_stims.json` with 289 production rules and `Module 21 - Z-test One Sample_stims.json` with 256 production rules. These are compatibility baselines for any rule, replay, or schema change.
- **Learning component boundary:** `learning-components/units/sparcsession/` owns SPARC document contracts, validation, replay, production-rule evaluation/commit, working memory facts, model-history exchange, and the SPARC session engine wrapper. `learning-components/trial-displays/sparc/` owns trial-display normalization, display readiness, semantic/progressive node transforms, and layout helpers.
- **Client runtime boundary:** `mofacts/client/views/experiment/svelte/components/SparcTrialSurface.svelte` renders SPARC trial displays and emits `sparcaction` / `sparcsubmit`. `CardScreen.svelte` bridges those events into `commitSparcProductionRuleAction`, and `sparcRuntimeActions.ts` merges returned runtime node values into machine context.
- **Server/persistence boundary:** `getSparcHistoryForUnit` in `mofacts/server/methods/analyticsMethods.ts` returns exact-user, exact-TDF, exact-unit SPARC history with a projection and chronological sort. `insertCompressedHistory` / `insertHistoryRecord` write canonical history from client runtime paths. No SPARC rule evaluation was found in server methods. During practice, the server should be contacted when a student action produces a canonical history payload to persist, plus ordinary asset/media loading paths; SPARC replay, rule evaluation, response classification, model target extraction, and progress calculation should remain client/learning-component work.
- **Authoring boundary:** `mofacts/client/views/experimentSetup/sparcEdit.ts` mounts `SparcAuthoringEditor.svelte` and saves edited `rawStimuliFile` through `saveTdfStimuli`. `SparcAuthoringEditor.svelte` edits the SPARC display payload directly and validates before save.
- **Documentation boundary:** `C:\dev\MoFaCTS.wiki\Introduction-to-TutorScript.md` and `TutorScript-SPARC-Authoring-Catalog.md` document top-level `productionRules`, `stimulusRegistry`, model-practice effects, and the visual editor's node-centered rule authoring.

## Ranked Recommendations

### 1. Bound SPARC History Hydration And Carry Live Replay State

Priority: High  
Primary theme: Client memory

Problem: SPARC resume fetches and hydrates full exact-unit SPARC history, and the client cache stores full canonical history records per TDF/session/document without an explicit bound or lifecycle contract.

Evidence: `resumeService.ts` calls `getSparcHistoryForUnit`, then calls `replaySparcHistory(sparcHistoryRows)` and `hydrateSparcProductionRuleHistoryCache(sparcHistoryRows)`. `sparcProductionRuleHistoryCache.ts:35` stores full records in a module-level `Map`, `readSparcProductionRuleHistoryRecords()` returns copies, and `hydrateSparcProductionRuleHistoryCache()` replaces grouped arrays. The server method is exact-scoped and projected at `analyticsMethods.ts:1011` and `analyticsMethods.ts:1023`, but the active client runtime still has no explicit retention bound or invalidation lifecycle.

Why it matters: Large SPARC lessons can generate long histories. Full replay and full retention increase resume latency, memory, and per-action copying even though most rule evaluation needs the current replay state plus a limited amount of provenance.

Smallest coherent fix: Add a client-owned `SparcReplaySession` structure keyed by TDF/session/document/unit that stores current live replay state, compact transition summaries, and only the canonical records still needed for model-history exchange or audit. Resume still fetches canonical raw history from the server and replays it as the correctness source; after that, each accepted student action updates the live replay session as its history payload is persisted. Keep the server method as a persistence/auth read boundary. Canonical raw history remains the only durable replay source.

Affected files: `mofacts/client/views/experiment/svelte/services/sparcProductionRuleHistoryCache.ts`, `mofacts/client/views/experiment/svelte/services/resumeService.ts`, `learning-components/units/sparcsession/sparcStateReplay.ts`, `learning-components/units/sparcsession/sparcDocumentReplay.ts`, `mofacts/client/views/experiment/svelte/services/historyLogging.ts`.

Compatibility checks: Verify all 93 SPARC displays in `C:\dev\mofacts_config` still replay from raw history and that no config assumes hidden cache behavior. No wiki update is needed unless the visible runtime or authoring workflow changes.

Verification: Add tests proving document-scoped cache clearing/replacement, bounded retained records, replay-state equality versus full raw-history replay, and resume hydration against multiple documents in one unit. Preserve `historyLogging.sparc.test.ts:117` and server exact-unit coverage in `serverComposition.test.ts:785`.

Risks and guardrails: Do not drop canonical history writes. Do not ask the server to compute replay state unless persistence or authorization requires it. Do not introduce server round trips for ordinary SPARC practice transitions beyond history writes and asset/media loading. Full raw-history replay must remain the correctness oracle.

### 2. Cache Compiled Trial-Display Documents And Incremental Replay State

Priority: High  
Primary theme: Client efficiency

Problem: Every SPARC production-rule action/submit converts the trial display into an authored document and replays prior history before evaluating events.

Evidence: `commitSparcTrialDisplayProductionRuleEvents()` calls `createSparcAuthoredDocumentFromTrialDisplay()` and then `replaySparcDocumentHistory()` at `sparcTrialDisplayRuntimeBridge.ts:446` and `sparcTrialDisplayRuntimeBridge.ts:450`. The pure evaluation path does the same at `sparcTrialDisplayRuntimeBridge.ts:490` and `sparcTrialDisplayRuntimeBridge.ts:494`. `CardScreen.svelte` can call `commitSparcProductionRuleAction()` for focus/action events and submit events.

Why it matters: Rebuilding the same document and replaying growing history for each learner action costs CPU and allocations on large converted SPARC content. This is especially visible for modules with hundreds of production rules in `C:\dev\mofacts_config`.

Smallest coherent fix: Introduce a `SparcRuntimeDocumentContext` object created once when the display/document key changes. It should hold the normalized display, authored document, node/stimulus indexes, compiled production-rule plan, current live replay state reference, and last applied transition id. `commitSparcProductionRuleAction()` can pass that context to the engine instead of raw display plus full prior records when available.

Affected files: `learning-components/units/sparcsession/sparcTrialDisplayRuntimeBridge.ts`, `mofacts/client/views/experiment/svelte/services/sparcProductionRuleActionCommit.ts`, `mofacts/client/views/experiment/svelte/services/historyLogging.ts`, `mofacts/client/views/experiment/svelte/components/CardScreen.svelte`.

Compatibility checks: No TDF schema change is required if this remains a runtime-only context. Validate with SPARC Fractions Addition and the large Intro Stats modules in `C:\dev\mofacts_config`.

Verification: Add parity tests comparing full conversion/replay versus cached-context evaluation across state transitions, model-practice effects, progressive-node operations, and submit gating. Include a display-change test proving stale contexts are discarded.

Risks and guardrails: Cache keys must include TDF id, session id, unit, document id, and a display/document revision signature. If the signature changes, fail clearly or rebuild explicitly; do not silently reuse old state. This is a local client/runtime context, not a server contract and not a durable state concept.

### 3. Precompile And Index Production-Rule Evaluation

Priority: High  
Primary theme: Module boundary

Problem: The production-rule evaluator sorts rules and scans all facts through recursive pattern matching each cycle.

Evidence: `findPatternMatches()` recursively scans facts at `sparcProductionRuleEvaluator.ts:240`. `evaluateSparcProductionRules()` sorts rules each call at `sparcProductionRuleEvaluator.ts:477` and calls `findPatternMatches()` for every rule at `sparcProductionRuleEvaluator.ts:494`. `runSparcProductionRules()` calls `evaluateSparcProductionRules()` each cycle at `sparcProductionRuleEvaluator.ts:520`. Working-memory facts are rebuilt from the document, replay cells, event, and extra facts in `buildSparcWorkingMemoryFacts()` at `sparcWorkingMemoryFacts.ts:169`.

Why it matters: With hundreds of rules, repeated sorting and full fact scans can dominate each SPARC interaction. This is avoidable client computation, not a reason to move work server-side.

Smallest coherent fix: Add a compiled production-rule plan per authored document: sorted rule order, normalized pattern metadata, indexes by `factType`, and reusable expression validation. During evaluation, build a fact index once per cycle or incrementally from replay/event facts, then match candidate facts by `factType` before checking slot constraints.

Affected files: `learning-components/units/sparcsession/sparcProductionRuleEvaluator.ts`, `learning-components/units/sparcsession/sparcWorkingMemoryFacts.ts`, `learning-components/units/sparcsession/sparcProductionRuleCommit.ts`, `sparcProductionRuleEvaluator.test.ts`.

Compatibility checks: Run against SPARC config modules with large rule counts, especially Module 10 and Module 21. No wiki update needed unless compiled-rule vocabulary becomes developer-facing documentation.

Verification: Add tests proving identical firing order, salience behavior, activation-key suppression, negated condition behavior, max-cycle failure, and model-practice side effects before and after indexing. Add a micro-benchmark or performance smoke test on a large local config fixture if acceptable.

Risks and guardrails: Preserve exact firing order and current error behavior. Indexing must not change variable binding semantics, negation semantics, or the quiescence guard.

### 4. Completely Modularize The SPARC Authoring Editor

Priority: High  
Primary theme: Module boundary

Problem: `SparcAuthoringEditor.svelte` is about 173 KB and mixes raw TDF mutation, target selection, drag/drop placement, ProseMirror/rich-text commands, rule editing, validation, runtime preview, save messaging, and CSS.

Evidence: The file owns `rawStimuliFile` initialization at `SparcAuthoringEditor.svelte:78`, drag/drop target computation at `:533`, rich-text commands at `:1106`, save at `:2093`, general validation at `:2102`, and rule validation at `:2331`. The route wrapper `sparcEdit.ts` mounts it at `:63` and persists through `saveTdfStimuli` at `:69`.

Why it matters: The current file makes targeted fixes risky and slows outside inspection. The code already has reusable authoring model helpers in `learning-components/units/sparcsession/sparcAuthoringEditorModel.ts` and an implementation-backed catalog in `sparcAuthoringCatalog.ts`, so this can be modularized without changing user-facing behavior. The endpoint should be a genuinely modular editor, not just a few helper extractions.

Smallest coherent fix: Use a staged complete modularization plan. Phase 1 extracts pure services first: `sparcAuthoringTargets`, `sparcAuthoringValidation`, `sparcAuthoringRuleModel`, `sparcAuthoringDragDrop`, and `sparcRichTextEditorBridge`. Phase 2 extracts shared editor state/actions into an explicit authoring controller/store so Svelte components do not directly own raw TDF mutation rules. Phase 3 splits Svelte components around existing panels: editor shell, target selector/header, palette, visual surface, selected-node inspector, scoped node rules, global production rules, reactive rules, stimulus registry panel, rich-text toolbar/editor, JSON/advanced panels, save/error banner, and responsive layout/styling. Phase 4 moves large style blocks into scoped editor CSS modules or component-local styles while preserving the current design. Phase 5 deletes the monolithic file once the shell only composes modules and wires save/cancel.

Affected files: `mofacts/client/views/experimentSetup/sparc/SparcAuthoringEditor.svelte`, new local modules under `mofacts/client/views/experimentSetup/sparc/`, `learning-components/units/sparcsession/sparcAuthoringEditorModel.ts`, `sparcAuthoringCatalog.ts`.

Compatibility checks: Confirm the saved `rawStimuliFile` is byte-shape compatible for existing SPARC config packages. Wiki pages already describe the visual editor and top-level `productionRules`; update them only if panel names or authoring workflow materially changes.

Verification: Add unit tests for extracted pure validation and rule-model helpers in phase 1, then add component/controller tests as state moves out of the shell. Keep existing `mofacts/package.json` checks `check:sparc-authoring` and `check:sparc-rich-html` in the verification path. For UI behavior changes, use the native hotfix dev loop and MoFaCTS Playwright sidecar. At each phase, save a representative SPARC lesson and compare the resulting `rawStimuliFile` shape against the pre-refactor output.

Risks and guardrails: Split behavior-preserving slices only. Do not redesign the editor interaction model in the same change. Keep `saveTdfStimuli` as the persistence boundary. The first extraction phase is only the starting point; stop only when `SparcAuthoringEditor.svelte` has become a small composition shell or has been replaced by a modular editor entrypoint.

### 5. Make Runtime Event And State Names More Domain-Specific At Boundaries

Primary theme: Explainability

Problem: Several boundary payloads use generic names like `sparcNodeValues`, `submittedNodes`, `triggeredBy`, and `SPARC_ACTION`, while deeper SPARC contracts distinguish replay cells, state writes, production-rule firings, observations, and progressive-node operations.

Evidence: `SparcTrialSurface.svelte` emits generic submitted node maps. `CardScreen.svelte` sends `EVENTS.SPARC_ACTION` with `sparcNodeValues`. `sparcRuntimeActions.ts` only merges `event.sparcNodeValues` into context. Deeper contracts in `sparcSessionContracts.ts`, `sparcStateReplay.ts`, and `sparcProductionRuleCommit.ts` are more precise.

Why it matters: Generic runtime names make it harder for maintainers and AI inspectors to tell whether a payload is authored default values, learner input, replayed state, production-rule writes, or rendered node values.

Smallest coherent fix: Introduce explicit boundary types and names such as `SparcRenderedNodeStatePatch`, `SparcLearnerSubmission`, `SparcProductionRuleActionResult`, and `SparcProgressiveNodePatch`. Keep old internal event names only where changing them would ripple through the card machine.

Affected files: `mofacts/client/views/experiment/svelte/components/SparcTrialSurface.svelte`, `CardScreen.svelte`, `sparcProductionRuleActionCommit.ts`, `sparcRuntimeActions.ts`, `trialContentProps.ts`.

Compatibility checks: No TDF/config change. Wiki update is not required unless exposed developer docs mention the renamed client contracts.

Verification: Add TypeScript-bearing tests around action result shapes and display-change reset behavior. Run `npm run typecheck` from `mofacts/` when implementation happens.

Risks and guardrails: Avoid cosmetic renames in stable history payload fields. Rename only client/module boundaries where the semantic improvement pays for churn.

### 6. Add SPARC Observability At High-Value Transitions

Priority: Medium  
Primary theme: Observability

Problem: Important SPARC runtime transitions are mostly visible through history rows and thrown errors, not admin-controlled diagnostic traces. Adding raw `console.*` is prohibited, and routine logging would be too noisy.

Evidence: `CardScreen.svelte` increments progress refresh after SPARC action/submit commits, but there is no focused client logger trace for rule count, firing count, transition writes, model-practice writes, replay-record count, or document id. Existing SPARC errors often include field names and document ids in learning-component code, but client boundary errors such as `[CardScreen] SPARC action received for non-SPARC display` are generic.

Why it matters: When a large authored SPARC document behaves unexpectedly, maintainers need to know which document, node, rule, and history scope were involved without dumping raw payloads or adding routine console noise.

Smallest coherent fix: Add admin-verbosity-controlled SPARC diagnostics through the existing client logging system (`clientLogger.ts` / `clientConsole` pattern): document id, unit, action kind, submitted node count, retained prior-record count or live replay revision, firing count, write count, model-history count, and elapsed evaluation time. Improve boundary error messages to include document id, node id, TDF id, unit, and event type when available.

Affected files: `mofacts/client/views/experiment/svelte/components/CardScreen.svelte`, `sparcProductionRuleActionCommit.ts`, `historyLogging.ts`, `learning-components/units/sparcsession/sparcTrialDisplayRuntimeBridge.ts`, `sparcProductionRuleCommit.ts`.

Compatibility checks: No config/wiki change unless diagnostics become documented operator tooling.

Verification: Add tests for error-message context where practical. Manually verify no raw `console.*` is introduced and verbosity controls gate new logs.

Risks and guardrails: Never log full learner answers, full history records, or large HTML payloads. Keep logs admin-verbosity-gated through the existing logging system; do not add raw `console.*`.

### 7. Add Boundary-Invariant Tests For Scalability Contracts

Priority: Medium  
Primary theme: Tests

Problem: Existing SPARC tests cover many behavior contracts, but fewer tests assert scalability boundaries such as bounded cache retention, live replay-state parity with raw-history replay, and "server does persistence/auth/read only."

Evidence: There are many SPARC tests under `learning-components/units/sparcsession/` and `learning-components/trial-displays/sparc/`. `historyLogging.sparc.test.ts:117` covers document-keyed hydration, and `serverComposition.test.ts:785` covers exact-unit durable SPARC history fields. The current tests do not establish a maximum retained cache size, live replay-state parity with raw-history replay, or a hard boundary that ordinary SPARC practice contacts the server only for history persistence and asset/media loading.

Why it matters: The next fixes should make SPARC faster without changing learning behavior. Boundary-invariant tests will catch regressions that accidentally move compute server-side, add server round trips during ordinary practice transitions, broaden reads, or drop history needed for model-progress correctness.

Smallest coherent fix: Add tests in three groups: server method scope/order and write boundary; client replay/cache lifecycle and bounds; rule-evaluator parity/performance fixtures. Treat the full raw-history replay implementation as the oracle for optimized live replay state and cached contexts.

Affected files: `mofacts/server/serverComposition.test.ts`, `mofacts/client/views/experiment/svelte/services/historyLogging.sparc.test.ts`, `learning-components/units/sparcsession/sparcStateReplay.test.ts`, `sparcTrialDisplayRuntimeBridge.test.ts`, `sparcProductionRuleEvaluator.test.ts`.

Compatibility checks: Use representative fixtures from `C:\dev\mofacts_config` but avoid checking large copied config blobs into the public repo unless curated and documented.

Verification: Run relevant unit tests and `npm run typecheck` from `mofacts/` for TypeScript-bearing changes.

Risks and guardrails: Do not make performance assertions brittle. Prefer semantic parity plus coarse operation-count or retained-record checks.

## Non-Goals And Rejected Ideas

- Do not move SPARC production-rule evaluation, replay, response classification, model target extraction, or progress calculation to a server method. The current architecture correctly keeps this client/learning-component side.
- Do not add compatibility fallbacks for missing `pageKey`, missing `stimulusRegistry`, ambiguous node attachments, or non-executable `behavior.authoredProductionRules`. Current hard failures are useful invariants.
- Do not rewrite the authoring editor and runtime in one change. Modularize the editor completely through staged, behavior-preserving extractions and component splits.
- Do not replace canonical history with cache-only state. Runtime caches can accelerate active-session replay, but canonical history remains the durable source.
- Do not design special SPARC history projections or named read shapes as part of the near-term work. Keep the current exact-unit server history read shape unless later measurements prove payload size is the remaining bottleneck.
- Do not introduce server calls during ordinary SPARC practice transitions except for canonical history persistence and asset/media loading.
- Do not run Docker build, push, or deploy as part of these audit recommendations.

## Suggested Implementation Order

1. Add boundary-invariant tests for current behavior and server scope.
2. Refactor the SPARC production-rule history cache into a document/session replay context with explicit lifecycle and tests.
3. Cache authored-document conversion and incremental replay state at the client runtime boundary.
4. Add production-rule precompilation and fact indexing behind parity tests.
5. Complete the SPARC authoring editor modularization: pure services first, then controller/store, focused Svelte components, style split, and final removal of the monolithic editor shell.
6. Add high-value admin-verbosity diagnostics and richer boundary errors through the existing logging system.
7. Measure server history payload size only after client replay/context/evaluator fixes; consider narrower reads later only if measurement shows that payload size remains the bottleneck.
8. Update wiki/docs only for user-visible authoring workflow or developer-facing contract changes.

## Verification Plan

- For TypeScript-bearing app or learning-component changes, run `npm run typecheck` from `mofacts/`.
- For lintable TypeScript/Svelte changes, run `npm run lint` from `mofacts/`.
- For SPARC runtime changes, run focused tests covering `sparcStateReplay`, `sparcTrialDisplayRuntimeBridge`, `sparcProductionRuleEvaluator`, `historyLogging.sparc`, and `serverComposition`.
- For authoring UI changes, use the native hotfix dev server plus the MoFaCTS Playwright sidecar against `http://host.docker.internal:3200`.
- For TDF/schema changes, run `npm run generate:schemas` from `mofacts/` and inspect generated diffs.
- For compatibility, scan representative SPARC config packages in `C:\dev\mofacts_config`, including SPARC Fractions Addition and the large Intro Stats modules.

## Documentation And Config Compatibility Notes

- `C:\dev\mofacts_config` already contains large real SPARC payloads. Any runtime optimization must be validated against those files before changing assumptions about rule counts, node counts, `stimulusRegistry`, or history payloads.
- `C:\dev\MoFaCTS.wiki\Introduction-to-TutorScript.md` documents `productionRules`, `stimulusRegistry`, `model-practice`, and SPARC progress placement. Update it only if those author-facing fields or workflows change.
- `C:\dev\MoFaCTS.wiki\TutorScript-SPARC-Authoring-Catalog.md` documents the implementation-backed authoring vocabulary and visual editor rule authoring. Update it if extracted editor components change user-facing authoring concepts.
- The current plan does not require config migration. If a later implementation adds new TDF fields, compatibility checks must include schema generation and config scans before landing.
