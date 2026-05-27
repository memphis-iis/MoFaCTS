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
   Learning-session runtime config selection now lives in `learning-components/units/learning-session/learningSessionRuntimeConfig.ts`, giving the model unit package one tested owner for learning/video session config, unit mode, probability-source selection, cluster-list source selection, and empty-model diagnostics.

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
   Adaptive video question insertion, question-time mutation, and adaptive checkpoint mutation now live in `learning-components/units/video-session/adaptiveVideoQuestions.ts`, leaving `AdaptiveQuestionLogic` to evaluate rules and hand video-session mutations to a tested video-owned boundary.
   Svelte card initialization-failure diagnostics now ask `sessionSurfaceMode.ts` for the session diagnostic cluster list instead of reading learning/video/assessment unit shapes inline.
   Video playback policy flags for scrubbing, rewind, and checkpoint-repeat behavior now resolve through `videoCardInit.ts`, keeping `CardScreen.svelte` from reading or normalizing authored `videosession` fields directly.
   Prepared incoming-trial orchestration now resolves named behavior routes before preparing the next card, so the service no longer spreads raw video/model/schedule unit-type branches across the flow.
   Prepared-advance machine question-index handling now resolves named transition routes before enforcing schedule live-index requirements, keeping schedule-specific transition policy tested in one helper.
   Prepared-trial commit now resolves named commit routes before applying model locked-card or schedule prepared-card state, keeping commit behavior policy explicit and tested.
   Learning-progress panel availability now resolves through a named panel-owned engine predicate before shaping item progress, keeping adaptive-model-only display policy local to the progress service.
   History logging now resolves schedule-vs-model trial index state through a tested helper before filling the history row, keeping live schedule display order policy local and explicit.
   Selected-card export now resolves schedule live-display question index through a named helper before card payload construction, so resume/start logic cannot silently reuse stale machine counters for fixed schedule positions.
   Resume history reconstruction now resolves learning-vs-assessment routes through `assessmentResume.ts`, so resume orchestration consumes explicit history, schedule-artifact, and instruction-skip policy instead of branching directly on authored `learningsession`/`assessmentsession` shapes.
   Card payload button-trial construction now asks a named schedule policy before reading assessment schedule state, keeping assessment-session gating out of the payload assembly branch.
   Svelte launch engine reuse/reinitialization now resolves through a tested app launch policy helper, keeping unit-type/context comparison out of the bootstrap orchestration.
   Legacy instruction continue now resolves instruction-only advance/dashboard behavior through a tested policy helper, leaving the template flow to apply the route/session/state decision.
   Adaptive assessment template cluster-list mutation now lives behind `learning-components/units/assessment-session/adaptiveAssessmentSchedule.ts`, mirroring the video-owned adaptive schedule helper and keeping authored `assessmentsession` writes out of `AdaptiveQuestionLogic`.
   Learning-session model preparation now resolves assessment-vs-learning cluster-list source through the learning-session runtime-config owner instead of branching directly on authored session shapes.
   The Svelte card tester now uses the shared `resolveUnitEngineTypeForUnit` compatibility boundary instead of maintaining a local authored-shape unit-type resolver.
   Svelte machine prepared-advance eligibility now names the model/schedule engine policy before composing it with video-surface and resume guards.
   Multi-TDF launch lock behavior now resolves through a shared launch policy helper, so dashboard and direct launch paths no longer duplicate authored-shape unit-type detection.
   Unit-engine service now names seamless model prepared-advance eligibility and model card-ref export before composing them into prepared-advance and post-answer state publication.
   Current testing helpers now ask the learning-session runtime-config owner for the active learning cluster-list source instead of reading `learningsession.clusterlist` directly.
   Assessment, video, and instruction unit packages now each have package READMEs naming component-owned behavior, app-owned boundaries, and manifest capability expectations.

## Pause/Resume Checkpoint

Current pause point:

- `open-core` is expected to be pushed and clean except local untracked notes that are not part of the repository checkpoint.
- The open-core readiness scan, full TypeScript check, lint, staged secret scan, and `http://localhost:3200` smoke should pass before resuming code changes.
- The next modularity move should avoid broad rewrites. Continue reducing central branches only where there is already a tested service, registry, manifest, or adapter boundary to receive the behavior.

Current direct-branch audit:

- `mofacts/client/views/experiment/engineConstructors.ts` is the app-owned compatibility resolver from authored unit shape to registered unit-engine type. It should keep the explicit shape checks until all callers enter through manifest/catalog metadata.
- `learning-components/units/autotutor/AutoTutorRuntimeConfig.ts` is the AutoTutor package owner for authored `autotutorsession` validation.
- `learning-components/units/learning-session/learningSessionRuntimeConfig.ts` is the learning-session package owner for learning/video session runtime config and cluster-list source selection.
- `mofacts/client/views/experiment/videoAdaptiveQuestions.ts`, `mofacts/client/views/experiment/svelte/services/videoCardInit.ts`, and `videoResume.ts` are video-owned app services; their direct `videosession` reads are intentional integration boundaries.
- `mofacts/client/views/experiment/svelte/services/sessionSurfaceMode.ts` is the shared session-surface owner for AutoTutor/video/card mode detection and diagnostics.
- Remaining `engine.unitType` reads in `unitEngineService.ts`, `preparedAdvanceMachine.ts`, `historyLogging.ts`, `learningProgressPanel.ts`, and machine guards are now behind named helpers or local service predicates. Resume learning/assessment history routing is similarly centralized in `assessmentResume.ts`. Prefer reusing those helpers before adding new raw unit-type or authored-shape branches.
- Current targeted audit has no remaining local `getUnitType` helpers, no direct `newUnit.assessmentsession` writes, no direct `currentUnit.learningsession` reads in app helpers, and no duplicated model-only prepared-advance guard outside the named service helpers.

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
