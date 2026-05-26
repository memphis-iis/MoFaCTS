# Modularity Readiness Audit

This audit records the current extension-boundary readiness checkpoint for AutoTutor/H5P-style component packages.

## Ready

- Unit engines are created through `UnitEngineRegistry`.
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
- AutoTutor client runtime now routes state publication, config/session reads, stimulus lookup, resume-history loading, user/session metadata reads, and typed history-turn writes through an app-owned capability adapter.
- H5P trial-display ownership is documented beside the H5P component package.
- A test-only sample echo unit package demonstrates the expected component package shape.
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
- `learning-components/units/autotutor/README.md`
- `mofacts/common/autoTutorEndState.test.ts`
- `mofacts/common/autoTutorGenerationConfig.test.ts`
- `mofacts/client/views/experiment/svelte/services/autoTutorClient.ts`
- `learning-components/trial-displays/h5p/README.md`
- `docs-developer/modularity-start-plan.md`

## Next Safe Step

Next, continue moving AutoTutor runtime construction toward injectable capabilities so tests and future component packages do not need Meteor globals.
