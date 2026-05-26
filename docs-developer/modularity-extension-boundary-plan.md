# Modularity Extension Boundary Starter Plan

Goal: make new learning components such as AutoTutor, H5P, video, assessment, or future domain-specific components installable through explicit registration and capability contracts, without editing central app switchboards for every new component.

This is a starter plan, not a request to rewrite the runtime. The first pass should harden the boundaries already emerging in `learning-components/` and keep legacy Meteor paths as behavior-preserving facades.

Documentation note: this is a developer-facing planning document and now lives under `docs-developer/` as part of the docs tree organization pass.

## Target Invariants

- A component declares one unit type or trial/display type and registers itself through a stable registry.
- A component receives an explicit runtime context instead of importing deep Meteor client/server paths.
- Required capabilities are named up front: session state, delivery settings, media resolution, storage, history writing, server calls, logging, and role checks.
- Missing required capabilities fail clearly during registration or component creation.
- Existing learning-session, assessment-session, video, H5P, and AutoTutor behavior remains regression-sensitive.
- There is no silent fallback implementation for an unavailable component dependency.

## Current Starting Point

- Unit engines already route through `learning-components/units/UnitEngineRegistry.ts`.
- `mofacts/client/views/experiment/unitEngine.ts` is intended to stay an app dependency facade.
- `learning-components/runtime/LearningComponentContext.ts` exists but is still much smaller than the current `CreateUnitEngineDeps` surface.
- AutoTutor is currently registered as a minimal unit-engine placeholder in `createUnitEngine.ts`.
- H5P behavior is mostly routed through app/server storage, package, display, and history paths rather than a single component manifest.

## First Implementation Slice

1. Define a component manifest type in `learning-components/runtime/`. Initial slice: `LearningComponentManifest` now exists with unit and trial-display capability validation.
   Include `id`, `kind`, `unitTypes` or `displayTypes`, `requiredCapabilities`, and a `register(context)` hook.
   Bootstrap slice: `registerLearningComponents` now registers manifest lists through one reusable runtime helper, with an explicit already-registered hook for idempotent default bootstraps and summary helpers for pre-registration diagnostics. The manifest-list bootstrap now preflights pending components for duplicate component IDs, duplicate unit/display declarations, and missing capabilities before mutating registries, so a bad dropped-in component cannot leave the app half-registered.

2. Expand the runtime context deliberately.
   Initial slice: named capability interfaces now exist for session state, delivery settings, media resolution, history, server methods, authorization, logging, and user alerts.

3. Move default unit registration out of `createUnitEngine.ts`.
   Initial slice: default unit component manifests now register instruction, learning-session, assessment-session, video, and the current AutoTutor placeholder through the manifest path.

4. Add registry contract tests.
   Cover duplicate registration, missing capabilities, unknown unit type, and successful creation for each default unit type.
   Initial slice: manifest tests now include a sample `sample-echo` unit that registers through `LearningComponentManifest`, appears in `UnitEngineRegistry`, and is created without changing the core unit factory.

5. Convert AutoTutor from placeholder to component boundary first.
   Current slice: the AutoTutor placeholder now lives in `learning-components/units/autotutor/AutoTutorUnitEngine.ts` with its own unit component manifest and explicit `logging` capability requirement. Keep current behavior if the deeper AutoTutor implementation is not ready, but keep the placeholder as a registered component with an explicit lifecycle boundary.

6. Map H5P as the second component.
   Identify which H5P responsibilities are component-owned versus app-owned: package import, content storage, display rendering, xAPI/result normalization, history writing, and asset serving.

7. Define the trial/display adapter boundary.
   Initial slice: `TrialDisplayAdapterRegistry` now provides a framework-neutral registry for display-owned interaction types such as H5P. A display adapter declares `displayType`, required capabilities, ownership detection, display normalization, and optional result normalization.

8. Register H5P as a trial-display component.
   Initial slice: `learning-components/trial-displays/h5p/H5PTrialDisplayAdapter.ts` now maps the existing H5P display/result contracts into the trial-display registry through a `trial-display` component manifest. `mofacts/common/h5pTrialDisplayAdapter.ts` remains a compatibility facade for app imports, `mofacts/common/defaultTrialDisplayComponents.ts` bootstraps the default H5P adapter, and H5P history normalization resolves the adapter through the registry. Package import, content storage, asset serving, and history persistence remain app-owned boundaries.

## Non-Goals For The First Slice

- Do not introduce dynamic arbitrary code loading.
- Do not create a plugin marketplace or remote package installer.
- Do not move server methods into learning components.
- Do not redesign TDF schemas as part of the first modularity slice.
- Do not make H5P or AutoTutor bypass the storage, history, authorization, or logging boundaries.

## Completion Check

The first modularity slice is complete when a new in-repo sample unit component can be added by:

1. Creating a component module under `learning-components/`.
2. Registering its manifest from the default component bootstrap.
3. Adding its unit type to a test fixture.
4. Passing registry and unit creation tests without editing the core unit factory logic beyond the bootstrap import.

Current evidence: `mofacts/common/learningComponentManifest.test.ts` proves the registry/manifest side with a sample unit and no core factory edits, and proves the AutoTutor placeholder is now provided by its own unit component manifest. `mofacts/common/registerLearningComponents.test.ts` proves shared manifest-list bootstrapping, duplicate declaration checks, and all-or-nothing preflight before registry mutation. A production sample module under `learning-components/` can now follow that pattern; the remaining future hardening is to expose package discovery/loading for external component bundles instead of importing each in-repo manifest from a central default list.

## Next Modularity Pass

1. Define a small component catalog API that combines unit and trial-display manifests without each app bootstrap owning its own default list shape.
   Initial slice: `learning-components/runtime/LearningComponentCatalog.ts` and `learning-components/defaultLearningComponentCatalog.ts` now package default unit and trial-display manifests together, while app bootstraps consume the catalog-projected manifest lists.
2. Add one production-quality sample component package under `learning-components/` that includes its manifest, unit or display implementation, fixtures, and tests.
   Initial slice: `learning-components/samples/echo-unit/` now provides a test-only sample package with implementation, manifest, fixture dependencies, README, and registry creation coverage. It is intentionally not included in the default runtime catalog.
3. Replace central imports one at a time with catalog entries, preserving the compatibility facades until app imports are retired.
4. Expand capability interfaces only when a real component needs them, and fail manifest registration when those capabilities are absent.
5. After in-repo component packaging is stable, evaluate controlled package discovery for approved local component bundles. Do not introduce arbitrary dynamic code loading before manifest validation, capability validation, and test fixtures are crisp.
