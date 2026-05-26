# Card Runtime Decomposition Plan

## Purpose

The Svelte card runtime is functional but too much behavior is concentrated in a few large files:

- `mofacts/client/views/experiment/svelte/components/CardScreen.svelte`
- `mofacts/client/views/experiment/svelte/machine/cardMachine.ts`
- `mofacts/client/views/experiment/svelte/services/unitEngineService.ts`
- `mofacts/client/views/experiment/svelte/services/svelteInit.ts`

The goal is not to redesign the card runtime. The goal is to expose the existing concepts through small, named, testable boundaries so future AI agents and maintainers can change one behavior without accidentally changing lifecycle ordering.

## Non-Goals

- Do not change learner-visible behavior.
- Do not rename public TDF fields.
- Do not replace the state machine.
- Do not move executable code into root `app/` or root `tests/` as part of this plan.
- Do not introduce fallback/recovery paths. Missing runtime invariants should fail clearly.

## Invariants To Preserve

- `initializeSvelteCard()` completes before the card machine starts.
- Standard card entry requires a full runnable TDF, current unit, delivery settings, and a current or fetchable stimuli set.
- Video card entry requires checkpoint arrays, question arrays, and a resolved video URL before rendering video mode.
- AutoTutor and video units may finish launch loading without starting the ordinary card machine trial loop.
- Prepared incoming trials are either `seamless`, `direct`, or `none`.
- History logging must not receive invalid timing, missing cluster mapping, or missing feedback text for feedback trials.
- Speech recognition and TTS side effects remain gated by the state machine and existing service contracts.

## Target Boundaries

### 1. Card Readiness And Launch Diagnostics

Extract readiness checks and diagnostic payload construction out of `CardScreen.svelte`.

Target file:

```text
mofacts/client/views/experiment/svelte/services/cardReadiness.ts
```

Responsibilities:

- Determine whether delivery settings are ready.
- Determine whether video-session readiness is satisfied.
- Determine whether a card can start rendering.
- Poll readiness with a timeout.
- Build a structured readiness diagnostic payload.

Verification:

- Focused unit tests for standard readiness, video readiness, timeout polling, and diagnostic shape.
- `npm run typecheck`.

### 2. Launch Failure Routing

Extract `routeInitializationFailure()` and experiment-vs-dashboard failure routing into a small service.

Target file:

```text
mofacts/client/views/experiment/svelte/services/cardLaunchFailure.ts
```

Responsibilities:

- Decide whether the current user/session is an experiment participant.
- Set the existing user-facing error state.
- Route to `/experimentError` or `/learningDashboard`.

Verification:

- Contract tests with injected `Session`, `Meteor.user`, and router callbacks.
- No change to user-facing message text.

### 3. First-Trial Launch Reveal

Extract first-trial reveal timing and finish logic.

Target file:

```text
mofacts/client/views/experiment/svelte/services/firstTrialReveal.ts
```

Responsibilities:

- Track the pending launch reveal key.
- Mark reveal timing milestones.
- Finish launch loading after transition or paint confirmation.
- Keep the existing paint-based no-transition path explicit.

Verification:

- Tests around active/inactive launch loading, transition duration path, no-transition path, and idempotency.

### 4. Video Machine Bridge

Extract machine-window listeners and video answer/resume bridge out of `CardScreen.svelte`.

Target file:

```text
mofacts/client/views/experiment/svelte/services/videoMachineBridge.ts
```

Responsibilities:

- Register/remove `cardMachine:resumeVideo` and `cardMachine:videoAnswer`.
- Flush pending video resume only when the machine is in `videoWaiting` and player is ready.
- Handle video rewind/repeat behavior by calling injected video-player methods.

Verification:

- Tests for rejected checkpoint state, missing player, rewind target calculation, repeat question marking.
- Browser smoke for a video unit after extraction.

### 5. Trial Display Readiness/Freeze State

Extract trial-subset state derivation from `CardScreen.svelte`.

Target file:

```text
mofacts/client/views/experiment/svelte/services/trialDisplayState.ts
```

Responsibilities:

- Compute question/feedback/study/force-correct subset kind.
- Determine response/display/feedback visibility.
- Hold frozen outgoing display state during prepared transitions.
- Build trial-subset inputs for `TrialContent`.

Verification:

- Pure tests for machine state snapshots and expected visibility fields.
- Existing Svelte tests and typecheck.

### 6. Unit Engine Card Payload Builder

Split card payload construction out of `unitEngineService.ts`.

Target file:

```text
mofacts/client/views/experiment/svelte/services/cardPayloadBuilder.ts
```

Responsibilities:

- Resolve media source URLs.
- Normalize H5P display config and attribution.
- Build button choices.
- Apply display field subsets.
- Build the payload consumed by the card machine.

Verification:

- Existing H5P tests plus new button/media payload tests.
- Do not change selection, commit, or engine lifecycle code in the same patch.

### 7. Svelte Init Standard/Video Split

Split `svelteInit.ts` by launch mode only after the smaller boundaries above are stable.

Target files:

```text
mofacts/client/views/experiment/svelte/services/standardCardInit.ts
mofacts/client/views/experiment/svelte/services/videoCardInit.ts
mofacts/client/views/experiment/svelte/services/cardEntryBootstrap.ts
```

Responsibilities:

- Keep `initializeSvelteCard()` as the public facade.
- Move standard TDF/stimuli readiness into standard init.
- Move video checkpoint/video URL setup into video init.
- Keep resume bootstrap explicit.

Verification:

- Existing resume integration tests.
- Browser smoke through dashboard launch, direct `/card`, video unit, and AutoTutor unit when available.

## Recommended Patch Order

1. Add this plan.
2. Extract card readiness and diagnostics.
3. Extract launch failure routing.
4. Extract first-trial launch reveal timing.
5. Extract video machine bridge.
6. Extract pure trial display state.
7. Extract card payload builder.
8. Split `svelteInit.ts` by launch mode.

Each patch should preserve behavior, run `npm run typecheck`, and update or add focused tests before moving to the next patch.

## Changes Not To Attempt In The Same Patch

- Do not combine state-machine state renames with service extraction.
- Do not change TDF schema or delivery-setting names while decomposing runtime files.
- Do not alter video checkpoint semantics while moving the bridge.
- Do not alter history field names while moving card payload or display code.
- Do not change launch routing messages while extracting failure routing.
