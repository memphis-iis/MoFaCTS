# Modularity Start Plan

This is the short handoff plan for moving from the current extension-boundary groundwork to practical AutoTutor/H5P-style component drop-ins.

## Current Readiness

- Unit engines register through `LearningComponentManifest` and `UnitEngineRegistry`.
- Trial-display adapters register through `LearningComponentManifest` and `TrialDisplayAdapterRegistry`.
- The default component catalog packages approved in-repo unit and trial-display manifests together.
- Catalog assembly validates duplicate component IDs, unit types, and display types before runtime registration.
- Manifest validation rejects ambiguous unit/display declarations and unknown required capabilities.
- Runtime capability helpers map typed dependency bags to manifest capability names.
- A test-only sample unit package exists at `learning-components/samples/echo-unit/`.

## Near-Term Goal

Make a new in-repo component feel like a small package:

1. Add the component implementation in its own folder under `learning-components/`.
2. Export a `LearningComponentManifest` from that folder.
3. Declare all required capabilities in the manifest.
4. Add fixtures/tests beside or near the component.
5. Add the manifest to the approved default catalog only when it is intended to ship.

## First Three Work Items

1. Convert the AutoTutor placeholder into a real AutoTutor unit package boundary.
   Keep app-owned server calls, history persistence, and UI shell behavior outside the component until explicit capability interfaces are ready.

2. Split the H5P trial-display package into component-owned and app-owned files.
   Keep package upload, storage, asset serving, and persistence app-owned; keep display ownership, normalization, and result shaping component-owned.

3. Add a small approved-catalog extension test.
   Compose the default catalog with the sample echo package using `combineLearningComponentCatalogs`, prove duplicate detection still fires, and prove the default runtime catalog is unchanged unless explicitly extended.
   Initial slice: `mofacts/common/learningComponentCatalog.test.ts` now covers default-catalog plus sample-package composition, verifies the sample is absent from defaults, and verifies duplicate default catalog composition fails clearly.

## Invariants

- No dynamic arbitrary code loading yet.
- No silent fallback when a required capability is missing.
- Components may not import deep Meteor client/server paths directly.
- App-owned persistence, routing, authorization enforcement, and server methods stay in `mofacts/`.
- Learning components own pedagogical runtime behavior, display adapters, model logic, and normalization boundaries.
