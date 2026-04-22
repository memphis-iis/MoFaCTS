Date: 2026-03-30

## Goal

Remove the pre-fade flash by restoring a clean handoff contract:

- the current trial remains the visible owner until fade-out actually runs
- the next trial can be prepared early without mutating live current-trial state
- commit happens only at the explicit handoff boundary
- no silent fallback or compatibility path is added for handoff behavior

## Findings

1. The machine sequence is mostly correct.
   `feedback.waiting -> transition.logging -> transition.updatingState -> transition.trackingPerformance -> prepareIncoming -> seamlessAdvance/fallbackAdvance -> fadingOut -> TRANSITION_COMPLETE -> commit`

2. The current UI wiring is too coupled.
   `CardScreen.svelte` currently mixes:
   - active-slot ownership
   - outgoing freeze behavior
   - reveal reset timing
   - blocker readiness
   - incoming-slot preparation
   - prepared-handoff preservation

3. The prepare path is not fully pure.
   Prepared-trial building still writes live UI/global store state during prepare, which violates the active-vs-prepared ownership boundary.

## Refactor Plan

### Step 1. Make prepare-only helpers side-effect free

- prepared builders may return payload only
- no `UiSettingsStore`, `Session`, or `CardStore` writes during prepare
- move any required runtime syncing to commit-time actions

### Step 2. Split active and incoming slot ownership in `CardScreen`

- active slot gets its own mounted/visible latch
- incoming slot gets its own prepared/ready state
- do not let one shared visibility expression own both slots

### Step 3. Keep the active slot latched through the whole transition band

- `logging`
- `updatingState`
- `trackingPerformance`
- `seamlessAdvance`
- `fallbackAdvance`
- `fadingOut`

The active slot should not become transparent or unmounted before `fadingOut` starts.

### Step 4. Keep the machine contract

Retain:

- `preparedTrial`
- `INCOMING_READY`
- `TRANSITION_COMPLETE`

Those events are the right coordination points. The cleanup is mainly in UI ownership and prepare purity.

## Acceptance Criteria

- preparing the next trial does not mutate live current-trial stores
- the active slot stays visibly owned until actual fade-out starts
- the incoming slot can become ready without forcing the active slot to rebuild
- no blank frame appears before the outgoing fade
- no two-trial freeze regression
