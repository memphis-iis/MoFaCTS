# Svelte Card Runtime

This directory contains the Svelte-based learner card runtime used by MoFaCTS practice sessions.

## Purpose

The card runtime presents trials, manages learner response UI, coordinates speech recognition and text-to-speech display state, and connects the client UI to the adaptive practice engine.

## Structure

- `components/`: Svelte components for the content runtime surface, flashcard and video session surfaces, stimulus display, response controls, feedback, video session mode, and supporting UI.
- `machine/`: state-machine logic for trial lifecycle, response handling, feedback, timing, and transitions.
- `services/`: runtime services for initialization, resume behavior, history logging, media, speech recognition, and unit-engine integration.
- `utils/`: local helpers and validators.

## Runtime Boundaries

- `meteorIntegration.ts` owns the Blaze-to-Svelte mount bridge.
- `services/contentSurfaceInit.ts` owns content launch bootstrap: entry intent resolution, TDF/unit preconditions, stimuli loading, engine initialization, resume dispatch, and instruction redirects.
- `services/contentEntryBootstrap.ts` owns content-entry intent classification before initialization dispatch.
- `services/contentReadiness.ts` owns card display readiness predicates and diagnostics.
- `services/sessionSurfaceMode.ts` owns shared AutoTutor/video/card surface selection, shell classes, learning-progress-panel visibility, video instruction overlay eligibility, video-readiness requirements, and specialized launch-completion decisions.
- `machine/` owns trial lifecycle state, transition guards, actions, invoked service contracts, and fail-clear machine errors.
- `components/ContentSurface.svelte` coordinates UI composition and wires Svelte state to services and the machine; new domain behavior should move into a service or machine file before the component grows new business logic.
- `services/videoMachineBridge.ts`, `services/videoSessionInit.ts`, and `components/VideoSessionMode.svelte` own video-session bridge behavior until a stable unit-runtime adapter boundary exists.
- `components/AutoTutorSession.svelte` and `services/autoTutorClient.ts` own current AutoTutor client integration. H5P display behavior belongs in the H5P components, H5P utilities, and `services/unitEngineService.ts` integration points.

## Supported Interaction Patterns

- Study, drill, and test trials.
- Text and cloze-style prompts.
- Multiple-choice responses.
- Typed responses.
- Speech-recognition-based responses.
- Image, audio, and video media paths when configured by the TDF and delivery settings.

## Development Notes

- Keep routine browser diagnostics behind the project client logging gate.
- Keep state-machine changes paired with type and behavior checks.
- Keep launch, readiness, machine, and rendering bridge concerns in their named homes above.
- Prefer explicit error states over silent fallback behavior when card runtime invariants break.
- Missing TDF/unit data, stale launch context, invalid card-entry intent, video readiness mismatch, and unknown unit type must fail clearly or route through an intentional user-facing stop path.
- Run the full app TypeScript check after TypeScript-bearing changes:

```bash
cd mofacts
npm run typecheck
```
