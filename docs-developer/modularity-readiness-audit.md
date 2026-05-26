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
- H5P trial-display ownership is documented beside the H5P component package.
- A test-only sample echo unit package demonstrates the expected component package shape.
- `docs-developer/modularity-start-plan.md` defines the short next-step plan.

## Not Yet Ready

- Arbitrary dynamic code loading is intentionally not implemented.
- External package discovery is intentionally not implemented.
- The AutoTutor placeholder has not yet been converted into a complete AutoTutor component package.
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
- `learning-components/trial-displays/h5p/README.md`
- `docs-developer/modularity-start-plan.md`

## Next Safe Step

When the current AutoTutor worktree edits are ready to integrate, convert the AutoTutor placeholder into a real component package while preserving app ownership of server methods, history persistence, and UI shell behavior until those dependencies have explicit capability interfaces.
