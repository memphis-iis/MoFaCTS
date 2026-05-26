# Card Runtime Services

This directory contains side-effectful runtime services and pure helpers used by the Svelte card runtime.

## Ownership

- `svelteInit.ts`: launch bootstrap orchestration, including entry intent resolution, TDF/unit preconditions, stimuli loading, shared unit-engine type resolution, engine initialization, resume dispatch, instruction redirects, audio startup, and launch-time diagnostics.
- `cardEntryBootstrap.ts`: card-entry intent classification before initialization dispatch.
- `cardReadiness.ts`: card display readiness predicates and diagnostics.
- `cardLaunchFailure.ts`: launch failure reporting and diagnostic state.
- `unitEngineService.ts`: unit-engine construction and integration with standard card, assessment, video, H5P, and AutoTutor unit behavior.
- `resumeService.ts`, `assessmentResume.ts`, `videoResume.ts`, `resumeIntegrity.ts`, and `historyReconstruction.ts`: resume and reconstruction behavior.
- `historyLogging.ts`, `historyH5P.ts`, and `mappingRecordService.ts`: history, H5P history shaping, and mapping persistence.
- `speechRecognitionService.ts` and `ttsService.ts`: speech recognition and text-to-speech runtime integration.
- `videoCardInit.ts`, `videoMachineBridge.ts`, and `videoPlayerService.ts`: video-session initialization, machine bridge behavior, and player integration.
- `sessionSurfaceMode.ts`: shared AutoTutor/video/card surface selection, shell classes, learning-progress-panel visibility, video instruction overlay eligibility, and specialized launch-completion decisions.
- `mediaResolver.ts`, `cardPayloadBuilder.ts`, and `trialDisplayState.ts`: media, card payload, and display-state helpers.

## Boundary Rules

- Keep Meteor database calls, subscriptions, Session access, browser APIs, media APIs, and engine integration in services rather than machine files.
- Keep pure predicates and payload builders small enough to test directly.
- Keep `svelteInit.ts` as the launch bootstrap coordinator, but extract new domain-specific logic into a named service before it becomes another launch concern.
- Keep shared AutoTutor/video/card surface decisions in `sessionSurfaceMode.ts`; `CardScreen.svelte` should compose the selected surface and keep DOM/event wiring local.
- Keep video-session bridge behavior in the video service/component files until the unit-runtime adapter design is implemented.
- Keep AutoTutor integration in `autoTutorClient.ts` and `components/AutoTutorSession.svelte`; shared launch or machine changes should only cover behavior common to all unit kinds.
- Keep H5P integration in H5P components, utilities, `historyH5P.ts`, and unit-engine service integration points.

## Fail-Clear Expectations

Services must not silently manufacture missing runtime state. Missing TDF/unit data, invalid launch context, unavailable required media, incompatible resume/mapping state, and malformed video checkpoints should either throw a clear error, return an explicit failure result, or route through an intentional user-facing stop path.

## Verification

For service changes, run the checks that match the behavior touched:

```bash
cd mofacts
npm run typecheck
npm run lint
```

Add or update focused service tests when changing launch bootstrap, readiness, resume, history logging, media resolution, speech, video, H5P, or AutoTutor behavior.
