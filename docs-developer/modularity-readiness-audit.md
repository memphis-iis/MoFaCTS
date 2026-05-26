# Modularity Readiness Audit

This audit records the current extension-boundary readiness checkpoint for AutoTutor/H5P-style component packages.

## Ready

- Unit engines are created through `UnitEngineRegistry`.
- The legacy client unit-engine constructor now delegates explicit unit-type creation through the registered unit-engine path instead of a central switchboard.
- Trial displays are created through `TrialDisplayAdapterRegistry`.
- Components declare `LearningComponentManifest` records with explicit kind, unit/display types, required capabilities, and registration hooks.
- Manifest validation rejects ambiguous unit/display declarations and unknown capability names.
- Manifest-list registration preflights missing capabilities and duplicate component/unit/display declarations before mutating registries.
- Catalog assembly validates duplicate component IDs, unit types, and display types.
- Explicitly imported catalogs can be composed through `combineLearningComponentCatalogs`.
- The default runtime catalog remains unchanged unless an approved extension catalog is deliberately composed in.
- Default unit manifests live with their owning unit folders; the central default unit file is an aggregator only.
- AutoTutor has a dedicated unit component manifest and package README.
- AutoTutor declares typed session, stimuli, server-method, history, and logging capability needs before deeper runtime extraction.
- AutoTutor completion semantics are now package-owned in `AutoTutorEndState.ts`, including the explicit `mastery`, `max_turns`, and `cost_cap` end reasons used by history logging.
- AutoTutor generation configuration now has a package-owned boundary in `AutoTutorGenerationConfig.ts`, including fixed scoring temperature, default tutor-utterance temperature, and fail-clear authored temperature validation.
- AutoTutor authored runtime configuration now has a package-owned boundary in `AutoTutorRuntimeConfig.ts`, so the Meteor client supplies capabilities while the component owns session config interpretation and script/graduation checks.
- AutoTutor saved-history row/note parsing now has a package-owned boundary in `AutoTutorSavedHistory.ts`, keeping CFNote shape and saved end-state validation out of Meteor client glue.
- AutoTutor saved-state validation now has a package-owned boundary in `AutoTutorSavedState.ts`, keeping score-id, learner-contribution, planner-state, and end-reason validation with the AutoTutor component package.
- AutoTutor client runtime now routes state publication, config/session reads, stimulus lookup, resume-history loading, user/session metadata reads, and typed history-turn writes through an app-owned capability adapter.
- H5P trial-display ownership is documented beside the H5P component package.
- H5P result normalization for card submission and history now routes through the registered trial-display adapter via one client service helper.
- H5P owned-interaction decisions for Svelte trial content, card response visibility, feedback suppression, and history now route through the H5P trial-display service instead of page-level direct display-shape checks.
- The Svelte card shell now resolves AutoTutor/video/card rendering mode, shell CSS/panel behavior, and specialized launch-completion behavior through a tested session-surface service instead of inline session/unit-shape checks.
- A test-only sample echo unit package demonstrates the expected component package shape.
- `learning-components/README.md` now includes the component package checklist for adding the next unit or trial-display package through manifest, catalog, and explicit capability boundaries.
- `docs-developer/modularity-start-plan.md` defines the short next-step plan.

## Not Yet Ready

- Arbitrary dynamic code loading is intentionally not implemented.
- External package discovery is intentionally not implemented.
- AutoTutor is not yet a complete standalone component package; app-owned client/server dependencies still need explicit capability interfaces before they can move under the package.
- Component runtime dependencies still need to become richer before real AutoTutor server calls, history persistence, and UI shell behavior can be removed from app-owned paths.
- H5P package upload, storage, asset serving, server methods, persistence, and authorization remain app-owned by design.
- Full self-hosted clean-stack proof remains outside this checkpoint because it requires explicit Docker/runtime/operator work.

## Current Evidence

- `mofacts/common/learningComponentManifest.test.ts`
- `mofacts/common/registerLearningComponents.test.ts`
- `mofacts/common/learningComponentCatalog.test.ts`
- `mofacts/common/learningComponentContext.test.ts`
- `mofacts/common/h5pTrialDisplayAdapter.test.ts`
- `learning-components/samples/echo-unit/`
- `learning-components/units/autotutor/manifest.ts`
- `learning-components/units/autotutor/AutoTutorRuntimeCapabilities.ts`
- `learning-components/units/autotutor/AutoTutorEndState.ts`
- `learning-components/units/autotutor/AutoTutorGenerationConfig.ts`
- `learning-components/units/autotutor/AutoTutorRuntimeConfig.ts`
- `learning-components/units/autotutor/AutoTutorSavedHistory.ts`
- `learning-components/units/autotutor/AutoTutorSavedState.ts`
- `learning-components/units/autotutor/README.md`
- `mofacts/common/autoTutorEndState.test.ts`
- `mofacts/common/autoTutorGenerationConfig.test.ts`
- `mofacts/common/autoTutorRuntimeConfig.test.ts`
- `mofacts/common/autoTutorSavedHistory.test.ts`
- `mofacts/common/autoTutorSavedState.test.ts`
- `mofacts/client/views/experiment/engineConstructors.contracts.test.ts`
- `mofacts/client/views/experiment/svelte/services/h5pTrialDisplay.test.ts`
- `mofacts/client/views/experiment/svelte/services/h5pTrialDisplay.ts`
- `mofacts/client/views/experiment/svelte/services/sessionSurfaceMode.test.ts`
- `mofacts/client/views/experiment/svelte/services/sessionSurfaceMode.ts`
- `mofacts/client/views/experiment/svelte/services/autoTutorClient.ts`
- `learning-components/trial-displays/h5p/README.md`
- `learning-components/README.md`
- `docs-developer/modularity-start-plan.md`

## Stable Pause Point

The current modularity checkpoint is a stable pause point when the branch is clean and the following checks pass:

- `npm run typecheck` from `mofacts/`
- `npm run lint` from `mofacts/`
- `node scripts/release/open-core-readiness-scan.cjs` from the repository root
- `npm run secret:scan:staged` from `mofacts/`
- MCP/browser smoke of `http://localhost:3200`

This checkpoint does not claim full dynamic plugin readiness. It preserves the intended next direction: explicit manifests, registries, typed lifecycle boundaries, and capability interfaces before arbitrary package discovery or dynamic code loading.

## Next Safe Step

Next, continue reducing direct component branches at larger session boundaries by routing remaining AutoTutor and video render branches through explicit session-surface adapters without changing runtime behavior.
