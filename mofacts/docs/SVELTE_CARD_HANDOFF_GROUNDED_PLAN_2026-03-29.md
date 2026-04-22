# Svelte Card Handoff Grounded Plan

Date: 2026-03-29

## Purpose

Document the smallest correct architecture change for the cross-trial handoff bug, grounded in the code as it exists now.

This is not a fresh redesign from scratch.

It is a current-state correction plan based on:

- what already exists in engine/runtime
- what already exists in the machine
- what already exists in the Svelte UI
- what is still missing from the handoff contract

Product constraints for this plan:

- no crossfade between trials
- do not support lesson types that intentionally swap the main stimulus during feedback for this pass
- scope this phase to the learning/model and assessment/schedule card handoff paths
- do not require full engine parity in how learning vs assessment obtain prepared data for this phase
- preserve existing video overlay fade-in/fade-out behavior; video remains out of scope for these changes

## Current-State Findings

### 1. Engine-side prepared-next payload already exists

The engine/runtime already has explicit prepared-next state:

- `nextTrialContent`
- `getPreparedNextTrialContent()`
- `setPreparedNextTrialContent(...)`

Relevant code:

- [unitEngineService.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/svelte/services/unitEngineService.ts)
- [unitEngine.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/unitEngine.ts)
- [svelteServices.ts](/C:/dev/mofacts/svelte-app/mofacts/common/types/svelteServices.ts)

Conclusion:

- engine-side "prepared next trial" does already exist
- we do not need a second engine redesign for this phase

### 2. The machine already has a `prepareIncoming` phase

The transition path already includes:

- `trackingPerformance`
- `prepareIncoming`
- `seamlessAdvance`
- `fallbackAdvance`

Relevant code:

- [cardMachine.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/svelte/machine/cardMachine.ts)

Conclusion:

- the machine already acknowledges a two-phase handoff concept
- the problem is not absence of those states

### 3. The UI already has a two-slot shell

For the assessment/schedule card path, the Svelte screen already renders:

- an outgoing slot
- a live slot

Relevant code:

- [CardScreen.svelte](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/svelte/components/CardScreen.svelte)

Conclusion:

- the assessment/schedule DOM already has two-slot structure
- the problem is not absence of two visual containers

Clarification:

- video mode is a separate rendering path
- prepared advance is already disabled for video sessions in current guards
- this plan does not need to change the video path
- this plan does apply to the assessment/schedule card path

### 4. The machine still has only one authoritative active trial payload

The machine context still treats these fields as the single live trial:

- `currentDisplay`
- `questionDisplay`
- `currentAnswer`
- `originalAnswer`
- `buttonTrial`
- `buttonList`
- `feedbackMessage`
- `isCorrect`
- `feedbackTimeoutMs`

Relevant code:

- [cardMachine.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/svelte/machine/cardMachine.ts)

Conclusion:

- the machine still models one active trial payload
- it does not yet model a separate machine-owned prepared trial payload

Clarification:

- engine/runtime may already pre-apply next-card runtime state during prepared advance in model flows
- for this phase, the important missing ownership is machine/UI ownership
- learning/model still needs a prepare-only read path that does not commit the locked next trial during prepare
- assessment still needs a minimal prepare-only path that selects the next scheduled card and builds its payload before commit

### 5. `prepareIncoming` currently mutates the active trial too early

In both prepared branches, `prepareIncoming` writes the next trial directly into the live context fields before visual handoff is complete.

Relevant code:

- fallback branch assignments in [cardMachine.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/svelte/machine/cardMachine.ts)
- seamless branch assignments in [cardMachine.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/svelte/machine/cardMachine.ts)

Conclusion:

- trial N+1 becomes the machine's current trial too early
- the UI then has to preserve trial N with snapshot/freeze logic

Clarification:

- in the current code, model seamless advance may already commit via locked-next apply before visual handoff completes
- in the current code, assessment/schedule fallback prepare may already mutate live runtime/session state by calling the normal schedule selection path
- for this phase, neither learning/model nor assessment/schedule should apply live runtime/session mutation before commit

### 6. The current UI overlap logic is compensating for early machine mutation

`CardScreen.svelte` currently uses:

- frozen subset derivation during transition
- `outgoingTrialSnapshot`
- visibility gating between outgoing and live slots

Conclusion:

- the current UI is compensating for a machine ownership problem
- the snapshot/freeze layer is not the core contract
- it is a recovery mechanism around the current contract

### 7. A full replacement of `currentDisplay/currentAnswer/...` would be high-risk

Those current-trial fields are used broadly across:

- prestimulus handling
- answer validation
- question audio gate
- feedback TTS
- screen-reader announcements
- response/feedback rendering

Relevant code:

- [actions.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/svelte/machine/actions.ts)
- [services.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/svelte/machine/services.ts)
- [cardMachine.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/svelte/machine/cardMachine.ts)

Conclusion:

- replacing the active-trial model wholesale would be a larger refactor
- that is not the smallest grounded change for this phase

## Actual Contract Failure

The current code has a partial two-slot architecture:

- engine/runtime has next-trial preparation capability
- UI has two visible containers

But the machine contract is still one-slot:

- there is only one authoritative machine-owned trial payload
- `prepareIncoming` promotes the next trial into that live payload before handoff commit

So the real mismatch is:

- next-trial preparation in engine/runtime
- two-slot card UI
- one-slot machine ownership

That is why the overlap bug keeps surfacing even when visibility logic is adjusted.

Session-type clarification:

- learning/model sessions already have explicit early-lock prepared-next support
- learning/model still does not have the right handoff boundary because the current seamless path can commit too early
- assessment/schedule does not need the full model early-lock mechanism, but it does need the same handoff contract
- assessment/schedule only needs a minimal equivalent: identify the next scheduled card, build the same next-trial payload we normally use for that card, and store it in machine-owned `preparedTrial` before visual commit

## Grounded Correction Strategy

### Principle

Keep the existing active-trial fields as the authoritative current trial.

Add only one machine-side prepared-trial payload beside them.

This respects the current codebase better than replacing the active-trial model.

For this phase, define the handoff commit point as the machine/UI-visible swap point.

That means:

- learning/model may resolve locked-next data earlier
- assessment/schedule may prepare the next scheduled card earlier
- but the machine must keep trial N in the active visible fields until commit
- the UI must render outgoing from active fields and incoming from prepared fields

### The minimal contract change

The machine should own:

- active current trial via existing fields like `currentDisplay/currentAnswer/...`
- prepared next trial via one additional payload field, for example `preparedTrial`

Implementation note:

- this should be done with a few narrow helpers, not a large new abstraction layer
- the current closest reusable helper is not pure enough for prepare-only use because existing question/answer preparation still touches live `Session`/`CardStore` globals
- the current prepared-advance guard is model-only, but both learning/model and assessment/schedule need to honor the same active-vs-prepared machine ownership once they enter handoff

Rules:

- `prepareIncoming` may fill `preparedTrial`
- `prepareIncoming` must not overwrite the active current trial
- the post-prepare advance state must not be an immediate pass-through
- the next trial becomes machine-visible only at an explicit handoff commit point

Important timing rule:

- incoming readiness must be achieved before outgoing fade-out begins
- outgoing fade-out completion is the commit boundary, not the readiness boundary

## Proposed Implementation Plan

### Step 1. Add a machine-side prepared trial payload

Add one field to machine context, shaped from the same payload returned by:

- `selectCardService`
- `prepareIncomingTrialService`

Keep the shape as close as possible to current card payloads so existing preparation code can be reused.

Why this fits current state:

- the machine already consumes this general card payload shape today
- no wholesale engine contract rewrite is needed

### Step 2. Add explicit prepare-only engine paths for both learning and assessment

Both session families need a prepare-only engine boundary.

For assessment/schedule sessions, add a small helper that:

- reads the next scheduled entry without advancing the live question index
- builds the same visible card payload we normally use for that scheduled card
- returns that payload without applying it to live runtime/session globals

For learning/model sessions, add a small helper that:

- reads the already locked next selection
- builds the same visible card payload we normally use for that locked next trial
- returns that payload without applying it to live runtime/session globals

Implementation principle:

- do not call the normal schedule `selectNextCard()` as the prepare path because it advances live runtime state
- do not call the current locked-next apply path as the learning prepare path because it commits live runtime state
- reuse existing card-building logic as much as possible
- keep this as a prepare-only helper boundary, not a second engine redesign

Why this fits current state:

- learning/model already knows how to identify the next locked card
- assessment already knows exactly which card is next in the schedule
- the missing piece is a pure preparation path for that already-determined next card

Recommended helper split:

- `buildPreparedCardStatePure(...)`
- engine-layer helper that returns prepared display/answer/runtime payload for a specific card without mutating live `Session`, `CardStore`, or experiment globals
- this should contain the reusable preparation logic that learning/model, assessment/schedule, and any future prepared path can share safely
- `prepareLockedNextTrial(...)`
- learning/model helper that materializes the already locked next trial into prepared payload form without calling the current commit/apply path
- `prepareNextScheduledTrial(...)`
- schedule-specific helper that peeks the next scheduled entry and calls the pure builder without incrementing `questionIndex`
- this should be the assessment/schedule replacement for reusing normal `selectNextCard()` during prepare

Grounding note:

- the existing preparation code closest to this need is not pure enough to use directly as a prepare-only path
- therefore this phase should explicitly add the helper boundary rather than rely on ad hoc call-site discipline

### Step 3. Change `prepareIncoming` to populate only `preparedTrial`

In both the prepared and fallback branches:

- store returned payload into `preparedTrial`
- do not overwrite `currentDisplay/currentAnswer/buttonList/...`
- do not publish prepared-trial values into live runtime/session mirrors yet
- specifically, do not run commit-time sync for prepared data into `Session`/`CardStore` before handoff commit
- specifically, do not use the current learning/model locked-next apply helper during prepare because it is commit-time behavior

Why this fits current state:

- it changes ownership timing without disturbing active-trial services
- current actions/services can keep reading the existing active fields
- for assessment, it lets the machine own the prepared next scheduled card without promoting it too early

Recommended helper split:

- `commitPreparedTrial(...)`
- machine/action-layer helper that promotes `preparedTrial` into the live machine fields and runs the existing live sync side effects together
- this should own the currently scattered commit-time work such as current answer sync, session indices, button state, delivery params, and timing resets
- for learning/model, this commit step is where the locked next selection should actually be applied to live runtime state
- for assessment/schedule, this commit step is where the schedule question index should advance and the next scheduled card should become the live card

Assessment/schedule commit invariant:

- prepare must not increment `questionIndex`
- prepare must not change what `findCurrentCardInfo()` or history logging treat as the active card
- commit must advance `questionIndex` and make the next scheduled card visible atomically
- after commit, the existing schedule/history code should observe the new card using the same invariants it relies on today

### Step 4. Make the post-prepare advance state a real handoff state

The post-prepare advance state should no longer immediately jump back to `presenting.readyPrompt`.

For learning/model and assessment/schedule, this means the post-prepare state becomes an actual wait state.

Instead it should:

- keep active trial fields intact
- expose `preparedTrial` to the UI
- allow the UI to mount and prepare the incoming slot before the outgoing trial finishes
- keep the incoming slot hidden while the outgoing trial is still the visible owner
- wait for explicit incoming-ready confirmation before outgoing fade-out begins
- wait for explicit outgoing-transition completion before machine-visible commit
- then commit the swap

Why this fits current state:

- the state shape already exists
- the current learning/model and assessment/schedule paths are underpowered rather than absent

### Step 5. Add explicit readiness and commit events from UI to machine

Add a small explicit parent-layer handoff event pair.

Preferred events for this phase:

- `INCOMING_READY`
- `TRANSITION_COMPLETE`

The contract is:

- the machine must not begin outgoing fade-out until `INCOMING_READY` has been received for the prepared incoming slot
- the machine must not promote `preparedTrial` into the active trial until `TRANSITION_COMPLETE`
- the machine must not publish prepared-trial side effects into live runtime/session mirrors until `TRANSITION_COMPLETE`
- `INCOMING_READY` is fired by `CardScreen.svelte` after the hidden incoming slot has mounted and any blocking incoming assets are ready
- `TRANSITION_COMPLETE` is fired by `CardScreen.svelte` after the outgoing transition completes
- `TRANSITION_COMPLETE` is not the signal to begin preparing the incoming slot

Commit clarification:

- `INCOMING_READY` authorizes fade-out start
- `TRANSITION_COMPLETE` commits the prepared trial
- active-trial promotion and the live sync side effects must happen together at commit
- this includes values currently mirrored through actions such as current answer, session indices, question index, button state, and delivery params

Why this fits current state:

- `CardScreen.svelte` already sends machine events for other UI-driven moments
- `TRANSITION_COMPLETE` already exists in machine constants even though it is not currently wired for this purpose
- adding one explicit readiness event is the smallest clear way to make readiness-at-fade-start enforceable instead of implicit

### Step 6. Feed the incoming slot from `preparedTrial`, not from early-mutated active fields

The two visual slots should be sourced as:

- outgoing slot = active current trial
- incoming slot = prepared trial

This should become the primary cross-trial contract.

Implementation note:

- derive incoming display props, blocker-asset keys, and reveal timing from `preparedTrial` in parallel with the existing active-trial derivation
- do not reuse active-trial-derived keys for the incoming slot during handoff
- mount and prepare the incoming slot during the handoff state, before outgoing finishes
- keep the incoming slot visually hidden until the machine has authorized fade-out and the outgoing transition completes
- after commit, let the incoming slot fade in as the next visible trial

Concrete `CardScreen.svelte` implication:

- the current active-trial derivation remains the source for the outgoing slot
- add a second incoming-trial derivation sourced from `preparedTrial`
- that second derivation should cover the same categories the current screen derives from active context, including trial subset, render props, blocker asset sources, and reveal keys
- outgoing and incoming slots must not share the same blocker-readiness flags or reveal key/timing pipeline during handoff
- `INCOMING_READY` should be sent when both conditions are true:
  - the incoming slot has mounted from `preparedTrial`
  - any blocking incoming assets are ready
- outgoing fade-out should not begin until the machine has received `INCOMING_READY`
- `TRANSITION_COMPLETE` should be sent only after the outgoing transition has completed

Timing note:

- this preserves "no crossfade between trials"
- it avoids a blank wait after outgoing finishes because incoming preparation already happened before fade-out started
- the only post-commit delay should be the intended incoming fade-in, not asset/loading/setup work

Why this fits current state:

- the two-slot DOM already exists
- the missing piece is stable ownership, not visual structure

Recommended helper split:

- `buildTrialSlotProps(trialLike, slotState)`
- UI helper in `CardScreen.svelte` that derives display props, blocker asset sources, reveal keys, and related render state from either the active trial or the prepared trial without forcing both slots through one shared derivation pipeline
- this keeps outgoing-vs-incoming ownership explicit and reduces the chance that blocker-readiness or reveal timing accidentally leaks across slots

### Step 7. Keep current snapshot/freeze logic only as temporary support

Do not try to delete all of `CardScreen` transition logic in the same step.

Instead:

- first move ownership to active-vs-prepared machine payloads
- then reduce snapshot/freeze logic once behavior is stable

Why this fits current state:

- lower risk
- easier to verify incrementally

## What This Plan Explicitly Does Not Require

This phase does not require:

- replacing all current-trial fields with a new `activeTrial` object
- redesigning the model engine's early-lock/runtime payload model beyond adding a non-committing prepare read path and a later commit apply path
- making assessment/schedule fully match the model early-lock implementation internally
- supporting same-trial display mutation flows where feedback/review intentionally replaces the active trial's main stimulus instead of handing off to a separate prepared next-trial payload
- allowing any crossfade between trials
- changing video-session rendering

This phase does require:

- the final machine/UI-visible handoff behavior to work for both learning/model and assessment/schedule sessions on the card path covered here

## Acceptance Criteria

- the learning/model prepare path can materialize locked next-trial payload without committing live runtime/session state during prepare
- the assessment prepare path builds the next scheduled card without advancing the live schedule question index before commit
- incoming-slot readiness is achieved before outgoing fade-out begins
- `INCOMING_READY` is the explicit machine-visible authorization point for starting fade-out
- `prepareIncoming` no longer changes the machine's active visible trial
- `prepareIncoming` no longer publishes prepared-trial values into live `Session`/`CardStore` mirrors before commit
- the machine owns both active-trial and prepared-trial payloads at handoff time
- outgoing and incoming slots have clear ownership sources
- `TRANSITION_COMPLETE` is the machine/UI handoff commit event
- active-trial promotion and live runtime/store sync happen together only at the chosen commit event
- the incoming slot begins preparation before outgoing fade-out starts
- the incoming slot stays hidden until outgoing completion, then fades in
- trial N+1 never becomes visible while trial N feedback is still visible
- no crossfade occurs between trials
- the learning/model handoff works
- the assessment/schedule handoff works
- the local Docker deploy path still succeeds
- the implementation uses narrow helper boundaries for prepare-only engine work, commit-time machine promotion, and active-vs-prepared UI slot derivation

## Short Version

What is already done:

- prepared-next payload in engine
- `prepareIncoming` state in machine
- two-slot DOM in UI

What is still wrong:

- machine ownership is still one-slot
- next trial is promoted too early

What needs to change:

- add a non-committing learning prepare path for locked next-trial data
- add a minimal prepare-only assessment path for the next scheduled card
- add a few narrow helpers to make that path pure and commit-safe
- add machine-side prepared-trial payload
- stop early overwrite of active-trial fields
- add explicit machine/UI readiness and commit points
- prepare incoming before outgoing fade-out starts, but reveal it only after outgoing completion
