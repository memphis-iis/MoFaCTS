# Modularity Start Plan

This is the short handoff plan for moving from the current extension-boundary groundwork to practical AutoTutor/H5P-style component drop-ins.

## Current Readiness

- Unit engines register through `LearningComponentManifest` and `UnitEngineRegistry`.
- The legacy client unit-engine constructor now calls the registered unit-engine path for explicit unit types, so a shipped unit component no longer needs a new central constructor branch.
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

## Starter Path For The Next Component

1. Start from `learning-components/samples/echo-unit/` for package shape and `learning-components/units/autotutor/` for a production unit boundary with typed capabilities.
2. Decide whether the component is a unit engine or trial-display adapter before writing runtime code. A component should not declare both unless a later design explicitly introduces a combined package type.
3. Write the package manifest and failing capability test before wiring the component into the default catalog.
4. Add package-owned fixtures for authored content, display data, or runtime dependencies. Keep app-owned persistence and authorization fixtures in `mofacts/`.
5. Compose the manifest through `combineLearningComponentCatalogs` for tests or through the default catalog only when the component should ship.
6. Preserve a compatibility facade for existing app imports until all callers can use the registry/catalog path directly.
7. Update `learning-components/README.md` and the relevant package README with ownership boundaries and required capabilities.

## First Three Work Items

1. Convert the AutoTutor unit into a fuller component package boundary.
   Keep app-owned server calls, history persistence, and UI shell behavior outside the component until explicit capability interfaces are ready.
   Initial slice: `learning-components/units/autotutor/manifest.ts` and `README.md` now give AutoTutor the same package-owned manifest shape as other component packages. `AutoTutorRuntimeCapabilities.ts` declares the session, stimuli, server-method, history, and logging seams. `AutoTutorEndState.ts` owns explicit completion semantics for mastery, max-turn, and cost-cap endings. `AutoTutorGenerationConfig.ts` owns scoring/utterance temperature policy and validation. `AutoTutorRuntimeConfig.ts` owns authored session config interpretation and script/graduation checks. `AutoTutorSavedHistory.ts` owns saved-history row/note parsing and saved end-state validation. `AutoTutorSavedState.ts` owns saved score/planner/learner-contribution validation. The client runtime now uses an app-owned capability adapter for state publication, config/session reads, stimulus lookup, resume-history loading, user/session metadata reads, and typed history-turn writes.
   Learning-session runtime config selection now lives in `learning-components/units/learning-session/learningSessionRuntimeConfig.ts`, giving the model unit package one tested owner for learning/video session config, unit mode, and probability-source selection.

2. Split the H5P trial-display package into component-owned and app-owned files.
   Keep package upload, storage, asset serving, and persistence app-owned; keep display ownership, normalization, and result shaping component-owned.
   Initial slice: `learning-components/trial-displays/h5p/README.md` now records the component-owned/app-owned split, and the H5P manifest test proves the package registers only a trial-display adapter with explicit `media` and `history` capabilities.

3. Add a small approved-catalog extension test.
   Compose the default catalog with the sample echo package using `combineLearningComponentCatalogs`, prove duplicate detection still fires, and prove the default runtime catalog is unchanged unless explicitly extended.
   Initial slice: `mofacts/common/learningComponentCatalog.test.ts` now covers default-catalog plus sample-package composition, verifies the sample is absent from defaults, and verifies duplicate default catalog composition fails clearly.

4. Remove remaining central component branches where a registry already exists.
   Initial slice: `mofacts/client/views/experiment/engineConstructors.ts` now delegates explicit unit-type engine creation through `createUnitEngineByType`, preserving contextual unknown-type errors while letting registered unit manifests own construction.
   H5P result handling now uses `mofacts/client/views/experiment/svelte/services/h5pTrialDisplay.ts` so card submission and history both normalize through the registered H5P trial-display adapter.
   Session shell handling now uses `mofacts/client/views/experiment/svelte/services/sessionSurfaceMode.ts` for AutoTutor/video/card mode detection, shell CSS and learning-progress-panel behavior, and specialized launch-completion behavior.
   The session surface service now also exposes an explicit content-surface adapter for AutoTutor/video/card render ownership, video instruction overlay eligibility, and learning-progress viewport state so `CardScreen.svelte` can keep DOM/event wiring local while the shared surface rules stay tested.
   Svelte launch bootstrap now asks `sessionSurfaceMode.ts` whether text-only video instructions can render inline instead of branching directly on the video unit type.
   Legacy and Svelte unit progression now ask `sessionSurfaceMode.ts` whether the next unit enters through `/card` or `/instructions` instead of branching directly on video/AutoTutor unit shape.
   Svelte launch bootstrap now uses the shared `resolveUnitEngineTypeForUnit` boundary from `engineConstructors.ts` instead of maintaining its own unit-shape branch.
   Card readiness now asks `sessionSurfaceMode.ts` whether the active surface requires video readiness instead of branching directly on `videosession`.
   Svelte machine video-session guards now resolve through `sessionSurfaceMode.ts`, and prepared-advance eligibility reuses that guard instead of reading `isVideoSession` separately.
   Card payload delivery settings now preserve active video-session fields through a tested helper that resolves video mode via `sessionSurfaceMode.ts`.
   Unit-engine prepared-advance eligibility, video checkpoint index selection, and post-answer engine-index mirroring now resolve active video surface state through `sessionSurfaceMode.ts`.
   Resume video-session detection, preload source resolution, and the video resume return path now live in `videoResume.ts` helpers, with resume orchestration calling that tested boundary instead of branching directly on video session state.
   Legacy instructions continue now uses the shared `resolveUnitEngineTypeForUnit` unit-shape resolver instead of branching directly on session fields to identify instruction-only units.

## Pause/Resume Checkpoint

Current pause point:

- `open-core` is expected to be pushed and clean except local untracked notes that are not part of the repository checkpoint.
- The open-core readiness scan, full TypeScript check, lint, staged secret scan, and `http://localhost:3200` smoke should pass before resuming code changes.
- The next modularity move should avoid broad rewrites. Continue reducing central branches only where there is already a tested service, registry, manifest, or adapter boundary to receive the behavior.

Resume with:

1. Keep `CardScreen.svelte` stable and move only one remaining session-surface decision at a time behind `sessionSurfaceMode.ts`.
2. Prefer a tested pure service boundary before touching Svelte markup.
3. When the remaining AutoTutor/video render branches are ready to move, introduce an explicit session-surface adapter shape rather than adding another condition-specific helper.
4. Leave dynamic plugin discovery and arbitrary code loading out of scope until manifests, capabilities, and in-repo package boundaries are crisp.

## Invariants

- No dynamic arbitrary code loading yet.
- No silent fallback when a required capability is missing.
- Components may not import deep Meteor client/server paths directly.
- App-owned persistence, routing, authorization enforcement, and server methods stay in `mofacts/`.
- Learning components own pedagogical runtime behavior, display adapters, model logic, and normalization boundaries.
