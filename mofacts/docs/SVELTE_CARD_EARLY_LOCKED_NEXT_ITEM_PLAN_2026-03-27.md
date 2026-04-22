# Svelte Card Early-Locked Next-Card Plan

Date: 2026-03-27

## Purpose

Define an implementation-ready plan for moving next-card selection earlier in the current-trial lifecycle so the next card is already locked before transition.

This plan intentionally changes the selection contract:

- trial data, history, and timing remain exact
- model/session updates still run after the answer is recorded
- but the next card choice is locked earlier, during the current trial
- therefore next-card choice does not depend on the just-finished trial
- the early lock is a runtime-only helper, not persisted resume state
- if the runtime reloads, resumes, or the unit ends before apply, the lock is discarded

This is a UX-priority policy, not an exact post-answer model policy.

## Product Decision

### Final intended behavior

For normal forward trial flow:

- the current trial begins
- while the current trial is in progress, the system chooses and locks the next item
- that locked next item becomes the next card the runtime should use
- after the current trial ends, the system still records the finished trial exactly
- but it does not recalculate a replacement next item based on that just-finished trial

What still depends on the just-finished trial:

- history logging
- outcome histories
- practice time
- performance totals
- engine/session counters
- unit completion checks

What intentionally does not depend on the just-finished trial:

- the identity of the next item already locked during the current trial

Authority scope:

- `lockedNextCardRef` is used only inside the current live runtime
- it is not part of the persisted resume contract
- if the page reloads, resume runs, or the unit expires/finishes before apply, the lock is abandoned
- when a live lock exists, it is the next card the runtime should use
- when no live lock exists, the system falls back to the normal direct selection path

## Terminology

Avoid calling the early choice "stale" in implementation discussions.

Preferred terms:

- early-locked next card
- pre-answer locked next-card reference
- UX-priority next selection

These names better match the intended contract.

For runtime state naming, prefer names that say whether they refer to the current card or the next card.

Preferred runtime names:

- `currentCardRef`
- `lockedNextCardRef`
- `nextTrialContent`
- `scheduleCursor` as the concept currently represented by `CardStore.questionIndex`

Naming rule:

- use noun names for stored state
- use verb names for mutating/building functions
- use `has...` / `is...` names for Boolean readiness checks
- use `...Ref` when identity is represented by multiple fields rather than one canonical id

Avoid carrying forward `engineIndices` as a design-level name in new code.
If a temporary compatibility shim is needed during migration, it should map to `currentCardRef` only, never to both current and next meanings.

### Legacy-to-new naming map

The plan should treat these as rename targets during migration:

- `engineIndices` -> `currentCardRef`
- `lockedNextSelection` -> `lockedNextCardRef`
- `preparedNextTrial` -> `nextTrialContent`
- `CardStore.questionIndex` keeps its implementation name for now, but the design concept is `scheduleCursor`

What these names mean:

- `currentCardRef` = the identity of the card currently being shown
- `lockedNextCardRef` = the identity of the next card already chosen
- `nextTrialContent` = the exact prepared payload that will be shown for `lockedNextCardRef`
- `scheduleCursor` = the next schedule entry to consume in schedule units

Why `Ref` instead of `Id`:

- use `Ref` names until/unless a true canonical `cardId` exists
- use `Id` only when there is one canonical identifier value
- use `Ref` when identity is a small object such as `{ clusterIndex, stimIndex, scheduleQuestionIndex? }`

Temporary migration rule:

- do not redefine `engineIndices` in place
- let legacy code keep using `engineIndices` on legacy paths until those consumers are migrated
- new code should use `currentCardRef`, `lockedNextCardRef`, and `nextTrialContent` directly
- if an old consumer still needs current-card data, derive/populate that edge value from `currentCardRef`
- do not reuse `engineIndices` to mean next-card identity

## Current System Audit

### 1. Current prefetch exists, but it is late

The current engine already supports prefetch:

- `prefetchNextCard()` in [unitEngine.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/unitEngine.ts)
- `applyPrefetchedNextCard()` in [unitEngine.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/unitEngine.ts)

Today it runs after review is over:

- machine leaves `feedback` / `study`
- machine enters `transition`
- `updateEngineService` runs
- `engine.cardAnswered(...)` runs first
- only then `engine.prefetchNextCard(...)` runs

Relevant path:

- [cardMachine.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/svelte/machine/cardMachine.ts)
- [unitEngineService.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/svelte/services/unitEngineService.ts)

Conclusion:

- current prefetch is not during visible review
- current prefetch is too late for eliminating the blank gap as effectively as possible

### 2. Current prefetch does respect the just-finished trial

Today `updateEngineService` calls:

1. `engine.cardAnswered(...)`
2. `engine.calculateIndices()` for session bookkeeping
3. `engine.prefetchNextCard(...)`

That means the prefetched next card is based on post-answer engine state, not pre-answer state.

The current prefetch therefore already includes the just-finished trial's effects.

Conclusion:

- current prefetch is exact relative to post-answer model state
- the requested change is an intentional change in selection policy

### 3. Immediate-repeat prevention is not universal today

The current model selector uses:

- `trialsSinceLastSeen > minTrialDistance`
- where `minTrialDistance` is `1` only when `forceSpacing` is enabled
- otherwise `minTrialDistance` is `-1`

Relevant selector path:

- `selectCardClosestToOptimalProbability(...)`
- `selectCardBelowOptimalProbability(...)`

in [unitEngine.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/unitEngine.ts)

Conclusion:

- the current system does not universally guarantee "never select the same item twice in a row"
- if the new UX-priority policy requires that guarantee, it must be enforced explicitly in the early-lock path

### 4. Unit completion still matters after answer recording

Even though next-card choice will no longer depend on the just-finished trial, unit completion still does.

Examples:

- `maxTrials` may be reached on the just-finished trial
- practice-time limits may now be exceeded
- other post-answer completion conditions may now be true

Relevant path:

- `engine.unitFinished()` in [unitEngine.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/unitEngine.ts)
- completion check in `updateEngineService` in [unitEngineService.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/svelte/services/unitEngineService.ts)

Conclusion:

- an early-locked next card must not be applied blindly
- it may be applied only if the post-answer unit-completion check says the unit continues

### 5. `updateEngineService` is really "apply finished trial to runtime state"

The current name hides its real role.

In practice it is the post-answer state-application phase. It currently:

- computes practice time
- calls `engine.cardAnswered(...)`
- updates performance/session state
- recalculates `engineIndices`
- performs late prefetch
- checks `unitFinished`

Conclusion:

- this service should remain the place where the current trial is committed
- but it should stop being the place where the next item is chosen

### 6. Data fidelity can remain exact under the new policy

History logging and timing are already computed from:

- `trialStart`
- `trialEnd`
- `firstKeypress`
- `feedbackStart`
- `feedbackEnd`

Relevant path:

- [historyLogging.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/svelte/services/historyLogging.ts)
- [actions.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/svelte/machine/actions.ts)

Conclusion:

- we can change next-card choice timing without reducing data fidelity
- the main architectural split is:
  - exact data logging
  - UX-priority next-card selection

### 7. Assessment/session has no reliable review window

Assessment uses the schedule engine, not the model engine.

In the schedule path:

- the full schedule is built up front
- `selectNextCard()` reads the next scheduled question from `schedule.q[questionIndex]`
- then increments `CardStore.questionIndex`
- `cardAnswered()` is effectively a no-op for schedule
- `unitFinished()` checks whether the schedule has more questions

Relevant path:

- [unitEngine.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/unitEngine.ts)

Conclusion:

- schedule/assessment often has no meaningful review phase to attach locking to
- in schedule units, the next item is usually already determined before the user answers the current item
- therefore a review-start trigger is too narrow and is not the right universal abstraction

### 8. Assessment next-item mechanics are simpler than model mechanics

For schedule/assessment:

- the next question identity comes from the already-built schedule
- during the current question period, `CardStore.questionIndex` already points at the next scheduled item after current selection
- so "locking the next item" is mostly an explicit snapshot of the next schedule entry

Conclusion:

- assessment/session should be included in the plan
- but its mechanics are different:
  - no probability recomputation
  - no model drift concern
  - mainly a schedule lookup and preservation concern

### 9. The better universal trigger is current-item start, not review start

Because review does not exist uniformly across unit types:

- model units may have feedback or study
- test/assessment items may not have review at all

The more universal trigger is:

- as soon as the current item has been selected and presented enough to know "this is the active current item"
- begin locking the next item in the background

Conclusion:

- the architecture should be framed as early-lock during the current item
- not specifically review-lock during feedback

## New Contract

### 1. Early-locked next-card reference

At current-item start:

- compute or snapshot the next item immediately
- exclude immediate repeat explicitly where applicable
- store that result in `lockedNextCardRef`
- treat `lockedNextCardRef` as the next card to use within the current live runtime unless the unit finishes

### 2. Post-answer update

After the current trial ends:

- record the current trial exactly
- update model/session data exactly
- do not replace `lockedNextCardRef` with a newly calculated one

### 3. Unit-finished gate

After recording the current trial:

- run the normal unit-finished check
- if the unit has ended, clear `lockedNextCardRef` and `nextTrialContent`
- if the unit continues, use `lockedNextCardRef`

### 3B. Runtime-only authority boundary

The early lock is intentionally not a persisted contract.

- do not store `lockedNextCardRef` or `nextTrialContent` in durable resume state
- do not expect reload/resume to restore a previously locked next card or any live runtime current-card object
- on a true reload/resume, there should be no locked-next runtime state to recover
- schedule/assessment resume must reconstruct from completed history plus the fixed schedule
- model/learning resume must recompute from model state
- video/checkpoint resume must continue using checkpoint-driven reconstruction
- if a soft re-entry inside the same live client runtime can still observe leftover locked-next memory, treat that only as a defensive invalidation case and clear/ignore it before normal selection logic continues
- if the unit finishes, expires, or navigates away before apply, the locked next card is abandoned
- "used by the runtime" here means "if the lock is present, the runtime uses it for the next card"; it does not mean the value survives reloads or resumes

### 3A. Current naming is already mixing current-card and next-card meanings

Today the name `engineIndices` obscures two different responsibilities:

- in the card-selection result and machine context, it refers to the current displayed card
- in post-answer model bookkeeping, it is recalculated and then reused as the next candidate card

That means the same name already spans:

- current-card identity
- next-card candidate identity

Conclusion:

- the plan should not preserve `engineIndices` as the long-term design name
- Phase 1 should introduce explicit names for current-card state and next-card state
- new code should use `currentCardRef`, `lockedNextCardRef`, and `nextTrialContent` rather than extending the ambiguous legacy term

### 4. Current-card state must be named separately from next-card state

Because `lockedNextCardRef` is the chosen next card:

- `currentCardRef` should describe the identity of the current displayed card
- `lockedNextCardRef` should describe the identity of the next card only
- those two meanings must remain separate until `applyLockedNextCard()` handoff
- Phase 1 must not silently repurpose current-card state into next-card state
- before handoff, `currentCardRef` should continue to describe the current displayed card
- after handoff, `currentCardRef` should match the card that was actually applied and shown

The principle is:

- next-card identity should live in `lockedNextCardRef`
- current-card identity should live in `currentCardRef`
- after handoff, the shown card and `currentCardRef` must agree
- `engineIndices` should be treated as a legacy migration name only, not as the target architecture name

### 5. Visual handoff contract

Selection alone is not enough.

For the no-gap transition goal, the system must distinguish:

- next-item identity is locked
- `nextTrialContent` is prepared
- next-item blocking assets are ready

The normal-path UX contract is:

- the next item is chosen during the current trial
- `nextTrialContent` is prepared before transition
- true blocking assets for the next trial are ready before the prior trial fully disappears
- the incoming fade-in can begin immediately as the outgoing fade-out completes
- the user should not see a fully blank screen between trials in the normal path

So the actual target is not merely:

- "next card chosen early"

It is:

- "next card chosen early and visually ready in time for a seamless handoff"

### 6. Incoming-card readiness must be first-class

The implementation must treat incoming readiness explicitly.

Recommended readiness levels:

1. `lockedNextCardRef`
- we know what the next item is

2. `nextTrialContent`
- we have the exact next-trial payload object that will later be shown

3. `incomingBlockingAssetsReady`
- true blocking assets for the next view are decoded/ready

Only when all required readiness conditions are satisfied should the system allow the outgoing transition to leave the user with no visible content.

### 7. No-blank-screen invariant

In the normal path:

- the prior card may begin fading out only when the next card can take over without an empty frame

Recommended implementation model:

- maintain a live current-trial render slot for the outgoing card
- maintain a `nextTrialContent` render slot for the incoming card
- pre-mount or otherwise keep the outgoing card visible until `nextTrialContent` is paint-ready
- hand off directly from the live current slot to the prepared next slot

In other words:

- this should be a two-slot handoff model, not a one-slot clear-and-replace model

A delay-only approach is not sufficient by itself.

What "just hold the machine longer before clearing" means:

- extending fade timings
- waiting longer before entering the clear/reset phase
- or trying to reduce the blank by timing adjustments alone while still having only one live display slot

Why that is not enough:

- a one-slot model still clears the only visible card before the next one has definitely taken over
- timing adjustments can hide some gaps, but they do not change the ownership model that produces the blank frame risk
- the safer target is to keep current and prepared-next render state separate until handoff is complete

What must not happen in the normal path:

- outgoing card fully hidden
- incoming card not yet painted
- user sees a fully blank screen

### 8. Degraded fallback path

If the incoming card is not ready in time, the system should not fall back to a silent blank screen.

Recommended degraded-path behavior:

- keep the outgoing shell visible longer
- or show a lightweight in-frame transition state
- but do not expose a fully blank intermediate frame unless there is no alternative

This fallback should be rare and instrumented.

## Recommended Architecture

### A0. Define state ownership explicitly

The implementation should make the runtime ownership model explicit:

- `CardStore.questionIndex` is the live next-to-consume schedule cursor for schedule units
- `currentCardRef` describes the identity of the current displayed card
- `lockedNextCardRef` describes the identity of the next card only
- `nextTrialContent` contains the exact next visible payload
- `applyLockedNextCard(...)` is the only phase that converts next into current

This avoids the main architectural trap:

- a single field should not silently mean both current-card state and next-card state
- naming should say "current" or "next" directly rather than using engine-internal wording

Recommended state ownership table:

| Field / concept | Meaning | Owner | State type | Notes |
| --- | --- | --- | --- | --- |
| `currentCardRef` | identity of the card currently shown | machine/runtime | live current-card state | updated when a card actually becomes current |
| `lockedNextCardRef` | identity of the next card locked during the current trial | engine/runtime | live next-card state | runtime-only; abandoned on reload/resume/unit-end before apply |
| `nextTrialContent` | fully prepared payload for the locked next card | UI/runtime preparation layer | derived prepared state | valid only while it matches `lockedNextCardRef` |
| `CardStore.questionIndex` | next schedule entry to consume | schedule engine / apply phase | live cursor | schedule units only; only apply advances it |
| display order / logging ordinal | ordinal of the trial being shown/logged | machine/runtime trial progression | derived/logging state | do not use as a selection cursor |
| `lockedNextCardRef.scheduleQuestionIndex` | snapshot of the schedule cursor at lock time | locked-next state | validation snapshot | compare against live cursor before apply |
| `engineIndices` | legacy selection-shaped object used by older paths | legacy boundaries only | temporary migration state | do not extend; retire consumer-by-consumer |

Ownership rule:

- live state decides behavior directly
- derived state can be rebuilt from live state plus runtime progress
- temporary migration state exists only to keep old consumers working during rollout

### A. Introduce a first-class `lockedNextCardRef` object

Add explicit runtime state for the next item:

- `lockedNextCardRef`
- `lockedNextCardRefSource`
- `lockedNextCardRefCreatedAt`
- `lockedNextCardRefOwner`

Recommended shape:

```ts
type LockedNextCardRef = {
  unitType: 'model' | 'schedule';
  clusterIndex: number;
  stimIndex: number;
  scheduleQuestionIndex?: number;
  ownerCurrentCardRef: {
    clusterIndex: number;
    stimIndex: number;
    questionIndex?: number;
  };
  ownerTrialEpoch: number;
  createdAt: number;
  source: 'early_locked';
};
```

Do not overload the existing loose prefetch fields without making their contract explicit.

Only one identity shape should be the one the runtime actually uses.

- do not store both `indices.{clusterIndex, stimIndex}` and top-level `clusterIndex`, `stimIndex`
- `LockedNextCardRef` should use one canonical structure only
- if other code needs a different shape temporarily, derive it from `LockedNextCardRef` rather than duplicating state
- `applyLockedNextCard(...)` must verify that the live `currentCardRef` and `trialEpoch` still match the lock owner before applying
- if the owner check fails, discard the lock rather than applying an out-of-date next card

### A1. Rename legacy current-card state explicitly

Phase 1 should define the runtime-facing state names explicitly:

- `currentCardRef` = the identity of the card currently displayed
- `lockedNextCardRef` = the identity of the next card already chosen
- `nextTrialContent` = the resolved visible payload for that locked next card

Migration rule:

- do not introduce new uses of `engineIndices` in new design paths
- do not reinterpret `engineIndices` as a magical shared object
- leave `engineIndices` in legacy paths until each consumer is migrated deliberately
- when a legacy consumer still needs current-card data, derive that old shape from `currentCardRef` at the boundary
- `engineIndices` must not remain a shared name for both current-card state and next-card state

### B. Split prefetch modes

Keep two distinct concepts:

1. `lockNextCardEarly(...)`
- runs during the current trial
- chooses and locks the next item to use

2. `prefetchNextCard(...)`
- optional future helper for background work that does not decide the next card
- should not decide the next item identity when early-lock mode is active

Recommended implementation direction:

- repurpose the current prefetch fields internally if desired
- but the public behavior should clearly distinguish:
  - early lock that decides which card comes next
  - optional background prefetch

### B2. Split selection readiness from render readiness

Add a second layer of readiness beyond selection:

- `lockNextCardEarly(...)` determines identity
- `buildNextTrialContent(...)` resolves/render-prepares the next trial payload
- `hasNextTrialContent()` indicates that `nextTrialContent` exists and matches `lockedNextCardRef`
- `hasIncomingBlockingAssetsReady()` indicates visual handoff readiness

`nextTrialContent` invalidation rule:

- if `lockedNextCardRef` changes, clear any old `nextTrialContent` immediately
- if `lockedNextCardRef` is cleared, clear `nextTrialContent` immediately
- if the unit finishes, clear `nextTrialContent`
- if `nextTrialContent` does not match `lockedNextCardRef`, treat it as invalid and discard it
- if the live `currentCardRef` no longer matches `lockedNextCardRef.ownerCurrentCardRef`, clear `nextTrialContent`
- if the current trial epoch changes before apply, clear both the lock and any prepared next payload

This keeps the architecture honest:

- engine chooses identity
- UI/runtime prepares view
- transition system waits for actual visual readiness

### B3. Split choose, prepare, and handoff into separate phases

The implementation must keep these three phases distinct:

1. `lockNextCardEarly(...)`
- chooses the next item identity
- stores that identity as the next card to use
- does not make the next item the current card

2. `buildNextTrialContent(...)`
- builds the next trial payload in background-safe form
- may resolve display data and preload assets
- must not mutate state for the current on-screen card
- should normally run immediately after a successful lock in the same current-trial window
- must produce the exact payload later shown at handoff, not a provisional approximation

3. `applyLockedNextCard(...)`
- makes the prepared or locked item become the new current card
- is the only phase allowed to switch next-card state into current-card state
- must reuse `nextTrialContent` when available rather than rebuilding a different visible trial

For Phase 1, "prepare" must be side-effect free with respect to the active trial.

In particular, `buildNextTrialContent(...)` must not:

- write live `Session` card-selection fields
- write `CardStore` question-selection fields
- overwrite current-card globals through `setUpCardQuestionAndAnswerGlobals(...)`
- reuse `selectNextCard(...)` as a background-preparation shortcut

This avoids a critical implementation trap:

- "prepare next card" is not the same thing as "make it the current card"

### C. Add an explicit no-immediate-repeat filter for model units

Do not rely on `forceSpacing`.

Instead, when building `lockedNextCardRef`:

- read the current card identity from `findCurrentCardInfo()`
- reject any selection that matches the current `clusterIndex` and `whichStim`

Recommended behavior:

- first try normal model choice with explicit immediate-repeat exclusion
- if no candidate remains, decide policy explicitly:
  - either allow fallback to a repeat
  - or treat the unit as exhausted

This must be a conscious product rule, not an accidental side effect.

Recommended default:

- allow fallback repeat only if no non-repeat candidate exists
- log that fallback clearly for debugging

### D. Treat schedule/assessment locking separately

For schedule/assessment:

- do not recompute probabilities
- snapshot the next entry from the already-built schedule
- store that as `lockedNextCardRef`

Because schedule is already predetermined, this is mainly:

- explicit capture
- preservation across transition
- unified consumption through `applyLockedNextCard(...)`

However, this should not be Phase 1.

Recommended delivery split:

- Phase 1: early lock for model units only
- Phase 1: keep schedule units on the existing direct-selection path while cursor ownership is cleaned up
- Phase 2: add schedule early-lock only after cursor semantics are fully separated from display/logging state

Schedule-specific contract:

- for schedule units, `CardStore.questionIndex` remains the next-to-consume cursor
- `lockNextCardEarly(...)` must snapshot the next scheduled entry without advancing `CardStore.questionIndex`
- early lock must not move `CardStore.questionIndex`
- the locked schedule selection should include `scheduleQuestionIndex`
- `applyLockedNextCard(...)` is the phase that consumes that snapshot and advances `CardStore.questionIndex` exactly once
- only apply may move the live schedule cursor
- `findCurrentCardInfo()` and `unitFinished()` must continue to observe the same cursor semantics they use today until the next card actually becomes current
- schedule resume should continue deriving the live cursor from completed history, not from persisted locked-next state

Recommended cursor rule for schedule units:

- locking means "remember what comes next"
- applying means "consume that next item"
- only apply is allowed to move the live schedule cursor

Phase 2 target behavior after Step 2 cursor cleanup is complete:

```ts
// Schedule Phase 2 contract
lockNextCardEarly():
  snapshot = schedule.q[CardStore.questionIndex]
  lockedNextCardRef = {
    unitType: 'schedule',
    scheduleQuestionIndex: CardStore.questionIndex,
    clusterIndex: snapshot.clusterIndex,
    stimIndex: snapshot.whichStim,
  }
  // no CardStore.questionIndex change here

applyLockedNextCard():
  assert(lockedNextCardRef.scheduleQuestionIndex === CardStore.questionIndex)
  make schedule.q[CardStore.questionIndex] the current card
  CardStore.questionIndex += 1
```

If the locked `scheduleQuestionIndex` no longer matches the live `CardStore.questionIndex`:

- clear `lockedNextCardRef`
- clear `nextTrialContent`
- log the mismatch
- fall back to the normal direct schedule selection path

This preserves the current meaning of the live cursor:

- `CardStore.questionIndex` still means "the next schedule entry to consume"
- `CardStore.questionIndex` therefore has next-question-index semantics for schedule units
- `findCurrentCardInfo()` can keep deriving the current card from `questionIndex - 1`
- `unitFinished()` can keep evaluating completion from the live cursor only
- `syncSessionIndices()` must not overwrite `CardStore.questionIndex` from locked-next metadata before apply
- display order/logging ordinal remains separate from the live schedule cursor
- new code should treat display order as trial-progression/runtime metadata, not as a second engine cursor

Question-index cleanup rule:

- keep exactly one owner per meaning
- `CardStore.questionIndex` = live next-to-consume schedule cursor for schedule units only
- display order = derived/logging ordinal from trial progression, not a second selection cursor
- `lockedNextCardRef.scheduleQuestionIndex` = snapshot validation field only
- locking/building must not advance the live schedule cursor
- schedule apply advances `CardStore.questionIndex` exactly once
- normal trial progression may update runtime/logging display-order state exactly once per shown trial
- do not overload the schedule cursor to also mean display order in new code

### E. Move next-card choice to current-item start

Trigger point:

- when the current trial has been selected and entered presentation

Recommended machine moments:

- immediately after current-card selection is committed
- or at initial presentation start for the current card
- before answer submission
- without waiting for review to exist

Important:

- this should happen after the current item is established
- but early enough that the next selection is ready before transition

For model units:

- this means choosing the next card based on pre-answer model state

For schedule/assessment units:

- this means snapshotting the next scheduled question during the current question period

### F. Prepare the incoming card before outgoing fade completes

After the next item is early-locked:

- begin preparing its runtime payload immediately
- pre-resolve card data needed for rendering
- start preloading true blocking assets
- make the incoming view ready before the current trial fully exits

Recommended transition principle:

- outgoing fade and incoming readiness overlap
- they should not be serialized in a way that creates a blank gap

### G. Gate the no-gap handoff on incoming readiness

The transition layer should use a readiness gate such as:

- `canSeamlesslyAdvance = lockedNextCardRef && nextTrialContent && incomingBlockingAssetsReady`

Normal-path rule:

- do not allow the outgoing card to leave the user with zero visible trial content unless `canSeamlesslyAdvance` is true

This is the visual counterpart to the early-lock engine contract.

### H. Preserve exact post-answer recording

Keep:

- `historyLoggingService`
- `engine.cardAnswered(...)`
- practice-time computation
- outcome-history updates
- `unitFinished` checks

Do not keep:

- post-answer recalculation of the next item to use

### I. Change `updateEngineService` behavior

Under early-lock mode, `updateEngineService` should:

1. apply the finished-trial updates exactly
2. run `unitFinished`
3. preserve `lockedNextCardRef` if the unit continues
4. clear `lockedNextCardRef` and `nextTrialContent` if the unit ends

It should not:

- create a replacement next-card choice after `cardAnswered()`

### J. Change `selectCardService` behavior

When loading the next item in normal forward progression:

- use `lockedNextCardRef` first
- only fall back to direct `selectNextCard(...)` if no `lockedNextCardRef` exists

Recommended priority:

1. `applyLockedNextCard(...)`
2. fallback to `selectNextCard(...)`

Phase 1 guard:

- only use `applyLockedNextCard(...)` on ordinary forward progression
- do not consume locked-next state for video-session checkpoint flows
- if the machine is resuming or replaying an existing current card, stay on the current resume path unless the resume path is explicitly adapted
- Phase 1 must preserve existing resume correctness even if resume continues to ignore locked-next state initially

## Proposed Implementation Steps

### Delivery split

Treat this as two related but separate implementation tracks:

1. Track A: early next-card choice for model units
2. Track B: seamless no-blank visual handoff

Track A should land first.
Track B should build on the stabilized lock/prepare/apply contract rather than shipping as an incidental side effect of the selection change.

Track relationship:

- Track A is about selection correctness, owner-token safety, resume safety, and making sure the chosen next card is the one actually used
- Track B is about removing the visible blank/loading gap with an explicit two-slot handoff
- schedule cursor cleanup is a sibling track needed for future schedule early-lock, not a blocker for model-only Track A

Phase 1 acceptance should therefore be evaluated separately from the final end-state architecture.

Phase 1 / Track A acceptance:

- model-only early lock is the next-card choice used in normal forward flow
- the next shown card matches the live lock when the unit continues
- post-answer commit remains exact
- resume and soft re-entry stay correct because locked-next runtime state is cleared or ignored safely
- no-repeat fallback behavior is explicit and consistent across locked and non-locked model paths

Not required for Phase 1 / Track A completion:

- the final two-slot seamless visual handoff
- schedule/assessment early-lock
- elimination of every blank/loading gap in the UI

### Step 1: Extract a pure trial-preparation path

Before early next-card choice is introduced, add a pure preparation helper that can build the next trial payload without mutating the live current trial.

Required contract:

- do not call handoff paths that mutate live `Session` or `CardStore` selection state
- do not use `selectNextCard(...)` as a background-preparation shortcut
- capture all user-visible randomized state exactly once
- return payload sufficient for later handoff without recomputing a different visible card

This is a prerequisite because the current helpers still mix "prepare the next card" with "make that card current now".

### Step 1A: Write down what happens when a card becomes current

Before refactoring implementation details, capture the current behaviors and assign each one to exactly one phase:

1. `lockNextCardEarly(...)`
- choose identity only
- record owner metadata
- may capture randomness only if that randomness is part of choosing the next card or must be reused exactly later

2. `buildNextTrialContent(...)`
- build the exact future visible payload
- may capture display randomness exactly once
- must not mutate state for the current on-screen card

3. `applyLockedNextCard(...)`
- make the locked/prepared item become the current card
- perform once-per-card bookkeeping exactly once
- may write live `Session` / `CardStore` state because this is the handoff phase

The implementation plan should explicitly classify the current behaviors that exist today.

Recommended ownership table for current code:

| Current behavior today | Current location | Target owner | Why |
| --- | --- | --- | --- |
| choose next cluster/stim identity | `calculateIndices()` / `_buildNextCardSelection(...)` | `lockNextCardEarly(...)` | this is where the next card is chosen |
| alternate-display randomization | `setUpCardQuestionAndAnswerGlobals(...)` | `buildNextTrialContent(...)` | visible payload must be decided once and reused exactly |
| visible prompt formatting / cloze rendering | `setUpCardQuestionAndAnswerGlobals(...)` | `buildNextTrialContent(...)` | part of exact prepared payload |
| resolve answer/button/input metadata | `getCardDataFromEngine(...)` and current handoff helpers | `buildNextTrialContent(...)` | belongs to prepared visible payload |
| write live `Session.clusterIndex` / `Session.testType` | current handoff path | `applyLockedNextCard(...)` | should happen only when the next card becomes the current card |
| write live `CardStore.questionIndex` for schedule | schedule handoff path | `applyLockedNextCard(...)` only | locking/building must not consume schedule cursor |
| set live current-card globals such as original question / current answer | `setUpCardQuestionAndAnswerGlobals(...)` | `applyLockedNextCard(...)` or a dedicated helper called only by apply | they describe the current card, not a background-prepared next card |
| update probability-history arrays / `trialsSinceLastSeen` / once-per-card bookkeeping | `_applyNextCardSelection(...)` | `applyLockedNextCard(...)` | must occur once when the card becomes current, never during prepare |
| update post-answer model state | `cardAnswered(...)` | post-answer commit path | remains exact and separate from next-card identity |

Rule for Step 1A:

- no current behavior should remain implicitly shared between "prepare the next card" and "make it the current card"
- if a behavior cannot be cleanly assigned, the plan must call that out before implementation starts
- `buildNextTrialContent(...)` must never reuse `selectNextCard(...)` or `_applyNextCardSelection(...)` as a shortcut because those helpers currently include "make this card current now" semantics

### Step 2: Separate schedule cursor from display/logging ordinal

Before schedule early-lock is attempted, remove the remaining mixed semantics around `questionIndex`.
This step is required for schedule early-lock, but it is not a prerequisite for model-only early lock.

Required cleanup:

- keep `CardStore.questionIndex` as the live next-to-consume schedule cursor only
- introduce or formalize a separate runtime `trialOrdinal` or display-order field for UI/logging
- ensure generic sync paths do not write schedule-cursor values from display/logging state
- ensure schedule selection/apply remains the only path that advances the live schedule cursor
- update history logging so the displayed schedule row is derived from current-card state or an explicit current schedule reference, never by inferring backward from the live next-to-consume cursor
- audit resume reconstruction and experiment-state sync so they restore the live schedule cursor and display order separately rather than reusing one field for both meanings

This is broader than just updating `syncSessionIndices()`.
It must cover machine state, engine return payloads, history logging, resume reconstruction, and any other place where `questionIndex` currently carries dual meaning.

Current ownership problem to resolve:

- machine/runtime `questionIndex`
- `CardStore.questionIndex`
- display/logging order

must no longer be allowed to drift together by accident.

Step 2 should end with one explicit owner per meaning:

- `CardStore.questionIndex` = schedule next-to-consume cursor only
- `trialOrdinal` or equivalent runtime field = display/logging progression only
- current schedule row = derived from explicit current-card state, not inferred backward from the next-to-consume cursor

Step 2 is not complete until an assessment trial can be:

- selected
- shown
- logged
- resumed

without any code path reconstructing the displayed schedule row from the post-selection live cursor alone.

### Step 3: Introduce `currentCardRef` and model-only `lockedNextCardRef`

In [unitEngine.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/unitEngine.ts) and the machine/runtime boundary:

- add `currentCardRef`
- add `lockNextCardEarly(indices, experimentState, owner)`
- add `applyLockedNextCard(experimentState)`
- add `clearLockedNextCard()`
- add `hasLockedNextCard()`

Phase 1 scope:

- enable early lock for model units only
- keep schedule units on the current direct-selection path until Step 11
- do not change video checkpoint-driven selection

This step may begin before Step 2 is complete, provided:

- the implementation remains model-only
- schedule units continue using the existing direct-selection path
- new model-only state does not further entangle schedule cursor ownership

Lock ownership rule:

- every lock must record the `currentCardRef` and `trialEpoch` that created it
- apply and prepare must verify the lock still belongs to the active current card before use
- if ownership does not match, discard the lock and any prepared payload

### Step 4: Add a shared immediate-repeat selection policy for model flow

Recommended refactor:

- extend `_buildNextCardSelection(...)` with optional exclusion parameters

For example:

```ts
_buildNextCardSelection(indices, options?: {
  excludeCurrentCard?: boolean;
  fallbackToRepeat?: boolean;
})
```

Implementation notes:

- use `findCurrentCardInfo()` to identify the current card
- first attempt a non-repeat candidate whenever any other eligible card exists
- if filtering removes the only candidate, follow the chosen fallback policy explicitly rather than relying on accidental selector behavior

Recommended default policy:

- normal non-resume forward model selection should exclude immediate repeat whenever an alternative eligible card exists
- if no non-repeat candidate exists, allow a fallback repeat explicitly and log it as a forced-repeat case
- `lockNextCardEarly(...)` and any direct fallback selection path must call the same exclusion-aware helper
- resume-specific reconstruction may keep its current semantics unless it is intentionally adapted later

Step 4 is not complete until normal non-resume forward model flow cannot bypass the repeat rule simply because early-lock was unavailable, invalidated, or late.

### Step 5: Trigger model early-lock during current-item presentation

In the machine/component path:

- add an early-lock side effect that calls the new lock function
- keep it non-blocking
- keep it independent from history logging
- gate it to normal forward progression only for Phase 1

Best place conceptually:

- once the current card has entered the live presentation path
- after selection of the current card is complete
- before the answer is submitted

Phase 1 exclusions at this trigger point:

- do not fire early-lock for video checkpoint-driven card loading
- do not fire early-lock while rehydrating an already displayed current card unless the resume flow is explicitly adapted for it
- resume/reload restoration must explicitly preserve current-card correctness and avoid accidental next-card advancement

Race-handling rule:

- if fallback direct selection occurs before the async early lock resolves, the late lock result must be discarded
- owner-token mismatch must be treated as a normal invalidation case, not as a hard error

### Step 6: Add `nextTrialContent` using the pure prepare path

After early lock succeeds:

- build the next trial payload ahead of transition
- separate that work from applying it as the active current trial

Suggested runtime responsibilities:

- resolve display/content data
- prepare button/text/input mode metadata
- precompute any card-level render props that do not require the active transition to complete
- preserve all randomized visible choices so handoff reuses them exactly

Strict contract for this step:

- preparation must be side-effect free with respect to the live current trial
- `nextTrialContent` must match both `lockedNextCardRef` and its owner token
- if preparation succeeds, the normal forward path should consume that prepared payload directly rather than regenerating equivalent card data at handoff time

### Step 7: Make post-answer commit fully ordered

In [unitEngineService.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/svelte/services/unitEngineService.ts):

- `await engine.cardAnswered(...)`
- remove or gate the current `engine.prefetchNextCard(...)` replacement behavior that still decides the next card too late
- preserve all exact trial-recording work

New `updateEngineService` contract:

- await the finished-trial commit
- then run `unitFinished`
- if the unit finished, clear `lockedNextCardRef` and `nextTrialContent` immediately
- if the unit continues, preserve `lockedNextCardRef` unchanged
- do not recalculate a replacement next item after answer commit

### Step 8: Use locked-next only in non-resume forward model flow

In [unitEngineService.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/svelte/services/unitEngineService.ts):

- preserve the existing pre-selection `unitFinished` gate before any locked-next apply attempt
- try `applyLockedNextCard(...)` first only after that gate says the unit continues
- if successful, skip normal selection
- if unavailable, fall back through the same exclusion-aware direct-selection helper from Step 4 rather than a separate older repeat-permitting path

Phase 1 usage rule:

- only consult locked-next state in the non-resume forward model path
- preserve current resume-specific branches unless a resume-specific locked-next path is intentionally implemented
- on a true reload/resume path, do not consult locked-next state at all
- if a soft re-entry path inside the same live client runtime can still observe leftover locked-next state, clear/ignore it before any new select/apply attempt
- treat `engineIndices` as a temporary compatibility alias for `currentCardRef` only at legacy boundaries
- if a late early-lock result arrives after fallback selection has already committed, discard the late result and keep the newer live runtime state

### Step 9: Document and enforce an explicit resume policy

Phase 1 resume policy should be stated directly in the implementation plan:

| Runtime case | Phase 1 behavior |
| --- | --- |
| normal forward model flow | use `lockedNextCardRef` when valid |
| true reload/resume into a schedule unit | reconstruct from completed history plus the fixed schedule; do not restore a live runtime current-card object |
| true reload/resume into a model unit | recompute from model state; do not restore a live runtime current-card object |
| true reload/resume into a video unit | keep checkpoint-driven reconstruction unchanged |
| soft re-entry inside the same live client runtime | do not trust leftover locked-next runtime state; clear/ignore it unless a future design explicitly defines reuse |

Required invalidation points:

- at resume entry in [resumeService.ts](/C:/dev/mofacts/svelte-app/mofacts/client/views/experiment/svelte/services/resumeService.ts), clear any live-runtime `lockedNextCardRef` and `nextTrialContent` before engine reset, resume classification, or resume-driven selection begins
- at machine/component startup for a same-runtime soft re-entry, clear any leftover locked-next runtime state before `START`, `selectCardService`, or checkpoint-driven card selection can observe it
- whenever resume or soft re-entry begins, advance/reset the live owner token or `trialEpoch` so stale locks fail ownership validation automatically even if memory survives longer than expected
- canonical resume state must be rebuilt from persisted state only; locked-next runtime state must never participate in reconstructing the current card or next card on resume

Verification matrix for Step 9 must cover:

- model resume that restores the current displayed card
- model resume that advances to the next card
- schedule resume from completed history plus the fixed schedule
- video resume from checkpoint-driven state
- soft re-entry inside the same browser runtime

For each case, the expected result should explicitly say whether locked-next state is:

- cleared
- ignored
- unavailable by design

The main rule is:

- Phase 1 must preserve canonical resume correctness, and locked-next must remain a live-runtime-only helper rather than part of resume reconstruction

### Step 10: Implement explicit transition paths

Do not describe this as generic gating only.
This is a structural runtime change, not visual polish.
The machine currently loads the next card only after the current trial has been cleared, so Step 10 must explicitly break that sequence.
The machine should have explicit transition phases rather than only a readiness gate:

Implementation requirement:

- the machine/component boundary must own two separate render states:
  - an outgoing current-trial render slot
  - an incoming prepared-next render slot
- next-trial content must be prepared and mounted while the outgoing card is still present
- `applyLockedNextCard(...)` or equivalent incoming-trial handoff must happen before the old slot is torn down, not only after the machine has already returned to a new `presenting.loading` cycle
- `seamlessAdvance` is not complete unless the UI can keep the outgoing slot mounted while the incoming slot is also mounted and paint-ready
- do not treat Step 10 as satisfied by timing/gating changes alone on a single render slot

1. `prepareIncoming`
- commit the finished trial and run `unitFinished`
- if the unit continues and prepared-next content is ready, mount the incoming slot while the outgoing slot remains visible
- if the unit continues but prepared-next content is not ready, branch explicitly to fallback handling rather than implicitly entering a blank clear-and-reload gap

2. `seamlessAdvance`
- outgoing card remains visible until incoming prepared content is paint-ready
- handoff uses the prepared next slot directly
- clear the outgoing slot only after the incoming slot is active and visibly taking over

3. `fallbackAdvance`
- keep the outgoing shell visible and wait briefly for readiness, or show a lightweight in-frame transition state
- do not drop to a blank intermediate frame in the normal path
- use this only when readiness misses the handoff window or when the degraded path is explicitly required

This is the change that actually removes the blank screen.
Without an explicit two-path machine design, the current one-slot clear phase can survive by accident.

Acceptance criteria for Step 10:

- a normal forward model transition does not pass through a single-slot blank/loading gap between trials
- the next visible card can appear without requiring the old card to be fully cleared first
- Step 10 is not complete if the runtime still depends on post-clear re-entry into the next `presenting.loading` cycle before the incoming card can become visible

### Step 11: Add schedule/assessment early-lock in Phase 2

Only after Step 2 is complete and stable:

- snapshot the next schedule entry plus its `scheduleQuestionIndex`
- store that in `lockedNextCardRef`
- do not let schedule early-lock advance `CardStore.questionIndex`
- apply must validate the cursor snapshot and advance the live cursor exactly once

Until then:

- keep schedule units on the existing direct selection path

### Step 12: Remove or downgrade obsolete prefetch behavior and logs

After the new lock/apply path is stable:

- remove or downgrade obsolete prefetch logs
- keep temporary early-lock diagnostics until race, resume, and completion behavior are proven stable

## Invariants

### Phase 1 / Track A must remain true

- history records remain exact
- practice time remains exact
- performance totals remain exact
- the next item shown matches `lockedNextCardRef`
- `lockedNextCardRef` is applied only when its owner token still matches the active current-card runtime
- `currentCardRef` matches the current item actually shown
- schedule resume remains derivable from completed history plus the fixed schedule
- unit completion still prevents showing an extra item
- if a live `lockedNextCardRef` exists, the runtime should use it for the next card

### Final / Track B adds

- in the normal path, transition never exposes a fully blank screen
- the incoming card can become visible without requiring the outgoing card to be fully cleared first
- the runtime no longer depends on post-clear re-entry into a one-slot `presenting.loading` loop before the next visible card can appear

### Must no longer be true

- "next-item identity always reflects post-answer model state"
- "early-locked next-card identity must survive reload/resume boundaries"

That invariant is intentionally being replaced by:

- "next-item identity reflects early-locked UX-priority state"
- "early-locked next-card identity is runtime-only and may be abandoned on resume/reload/unit-end"

## Risks And Mitigations

### Risk 1: Immediate repeat still slips through

Cause:

- current selectors do not universally enforce no-repeat

Mitigation:

- implement explicit current-card exclusion in model early-lock path

### Risk 2: Locked choice conflicts with post-answer `engineIndices`

Cause:

- current `updateEngineService` recalculates indices after `cardAnswered()`

Mitigation:

- keep locked-next identity in `lockedNextCardRef`
- preserve current-card identity semantics until apply

### Risk 3: Extra item appears after unit should end

Cause:

- `lockedNextCardRef` gets applied without post-answer completion gate

Mitigation:

- preserve `unitFinished` check after `cardAnswered()`
- clear `lockedNextCardRef` and `nextTrialContent` if the unit ends

### Risk 4: Next item is selected early but still not visually ready

Cause:

- selection and rendering readiness are treated as the same thing

Mitigation:

- create explicit `nextTrialContent` state
- track incoming blocking-asset readiness separately
- gate outgoing fade on incoming readiness

### Risk 5: Assessment and model diverge mechanically

Cause:

- model units compute the next card
- schedule units read it from a predetermined schedule

Mitigation:

- keep a shared interface (`lockNextCardEarly`, `applyLockedNextCard`)
- but allow different internals per engine type

### Risk 6: Resume behavior diverges or skips forward unexpectedly

Cause:

- resume paths currently assume next-item selection happens later
- locked-next state may survive into a resume path that still expects the older selection contract

Mitigation:

- audit resume entry, current-card restore, and answered-card resume branches explicitly
- clear/ignore locked-next state deliberately on resume entry unless a future persisted contract is explicitly designed
- add resume-specific verification so Phase 1 proves there is no accidental advance, skip, or stale apply
- for schedule units, preserve the existing history-derived resume cursor model

### Risk 7: Debugging gets confusing

Cause:

- "prefetch" can mean both advisory work and work that actually decides the next card

Mitigation:

- use explicit log prefixes such as:
  - `[EARLY LOCK] Locked next card`
  - `[EARLY LOCK] Applying locked next card`
  - `[EARLY LOCK] Cleared locked next card because unit finished`

## Verification Checklist

### Phase 1 / Track A functional

- next item is chosen during the current trial
- next item does not change after current trial is recorded
- current trial data still logs exactly
- no extra item appears when unit completes on the current trial
- existing resume behavior still restores or advances to the correct card without accidental skip
- current-card naming and next-card naming remain unambiguous in runtime state
- late async early-lock results cannot override a newer runtime state

### Resume compatibility

- resume with an already-captured answer still advances to the correct next card
- resume without a captured answer still reconstructs from canonical state rather than restoring a live runtime current-card object
- model resume paths still recompute from model state unless intentionally changed
- schedule resume paths do not double-advance `CardStore.questionIndex`
- schedule resume still derives the next item from completed history plus the fixed schedule
- true reload/resume paths do not consult locked-next runtime state
- if a soft re-entry path inside the same live runtime observes leftover locked-next state, it is cleared/ignored safely
- video checkpoint behavior remains unchanged

### Selection

- current item is not repeated immediately in normal model cases
- explicit fallback behavior is correct when only a repeat remains
- `lockedNextCardRef` and the shown item always match
- current-card state and next-card state never share one ambiguous runtime field
- stale `nextTrialContent` is never reused after `lockedNextCardRef` changes or clears
- `lockedNextCardRef` is never applied when its owner token no longer matches the active current card

### Timing

Track A timing expectations:

- transition gap is reduced or eliminated relative to current flow
- next item is ready before parent fade-out completes in most cases
- units without review still benefit

Track B / final handoff expectations:

- no fully blank screen appears in the normal transition path
- incoming card is painted and ready for fade-in before prior card fully disappears
- fallback path remains correct when seamless handoff readiness misses the window

### Race coverage

- if direct fallback selection happens before background early-lock finishes, the late lock result is discarded
- if `currentCardRef` changes before apply, old lock and old `nextTrialContent` are discarded
- if a new trial epoch starts before apply, old lock and old `nextTrialContent` are discarded

### Observability

Add temporary logs:

- early lock start
- `lockedNextCardRef` created
- `lockedNextCardRef` discarded because owner token mismatched
- `nextTrialContent` ready
- incoming blocking assets ready
- `lockedNextCardRef` applied
- `lockedNextCardRef` cleared
- `nextTrialContent` cleared
- unit finished after answer
- fallback to non-locked selection path
- degraded fallback path entered
- soft re-entry detected with locked-next runtime state present
- locked-next runtime state cleared or ignored by soft re-entry guard

## Recommended Rollout Order

1. Step 1: extract a pure trial-preparation path.
2. Step 1A: write down what happens when a card becomes current.
3. Step 3: introduce `currentCardRef` plus owner-token `lockedNextCardRef` for model units.
4. Step 4: add explicit immediate-repeat exclusion for model units.
5. Step 5: trigger model early-lock during current-item presentation.
6. Step 7: make `updateEngineService` await commit and preserve or clear locked-next deterministically.
7. Step 8: use locked-next only in non-resume forward model flow.
8. Step 9: document and verify the explicit Phase 1 resume policy.
9. Step 6: build `nextTrialContent` from the pure preparation path after lock/apply correctness is stable.
10. Step 10: implement explicit `seamlessAdvance` and `fallbackAdvance` transition paths.
11. Step 2: in parallel with Steps 3-9 or immediately after, separate schedule cursor from display/logging ordinal.
12. Step 11: add schedule/assessment early-lock only after cursor cleanup is proven stable.
13. Step 12: remove or downgrade obsolete prefetch behavior and logs once stable.

## Implementation Summary

The intended final architecture is:

- choose next item during the current trial
- lock that choice
- bind that lock to the current displayed card and trial epoch that created it
- prepare that next view in a side-effect-free background path
- ensure incoming blocking assets are ready
- record current trial exactly after it ends
- keep the locked choice unless the unit ends
- make the locked choice become the current card only at handoff time
- show the locked choice next with no blank intermediate frame in the normal path

In one sentence:

exact data, UX-priority next-item choice, seamless visual handoff.

## Out Of Scope For Phase 1

The first implementation pass should not try to solve every adjacent runtime case.

Out of scope for Phase 1:

- video-session specific timing and checkpoint behaviors
- lesson types that intentionally swap the main stimulus during feedback
- speculative asset preparation beyond true blocking assets
- optimization passes that rewrite logging or history persistence behavior
- schedule/assessment early-lock before cursor cleanup is complete

Phase 1 should stay focused on:

- normal forward progression
- model engine early-lock
- preserving current schedule behavior while cursor ownership is cleaned up
- early-locked next-item identity
- `nextTrialContent` readiness
- no-blank visual handoff in the normal path
- preserving existing resume correctness under the new `lockedNextCardRef` architecture

Phase 1 therefore should explicitly:

- audit resume paths as part of rollout and ensure locked-next state is either consumed intentionally or ignored safely
- keep video-session card loading on its existing checkpoint-driven path
