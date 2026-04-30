# Video Session State Machine Audit And Fix Plan

## Context

This audit covers the Svelte video-session path used by MoFaCTS video units, including the AdaptiveKeyword pp configuration. The user-observed failures are:

- The video briefly renders before the instructions screen.
- The video starts, plays briefly, then pauses before the first checkpoint.
- Checkpoint 1 can show a question, but after a correct answer the video does not continue.
- Later checkpoint markers can pause the video without showing a question.

The goal is not to patch each symptom independently. The goal is to repair the state-machine contract for video sessions so playback, checkpoint detection, question display, answer handling, history, and resume have one reliable control flow.

This plan follows the repository rules in `AGENTS.md`:

- Silent fallbacks are not allowed; fail clearly when invariants break.
- Do not add compatibility fallback paths unless explicitly requested.
- Do not add raw client `console.*`; use `mofacts/client/lib/clientLogger.ts`.
- Preserve admin-controlled client verbosity behavior.
- Use inline UI patterns instead of modal popups unless explicitly requested.
- Keep this work client/state-machine focused unless history or resume requires database access.
- If schemas, payloads, interfaces, or field names change, inspect dependent repositories for compatibility.

## Intended State Flow

For a video unit, the machine should enter video waiting without selecting a card:

```text
idle.ready
  -> videoWaiting
```

At each checkpoint:

```text
videoWaiting
  -> VIDEO_CHECKPOINT accepted
  -> presenting.loading
  -> presenting.awaiting
  -> validating
  -> feedback or transition
  -> transition.logging
  -> transition.updatingState
  -> transition.trackingPerformance
  -> transition.clearing
  -> videoWaiting
```

The video player should only pause for a checkpoint when the state machine can accept that checkpoint. After the checkpoint answer completes, the machine must return to `videoWaiting` and resume playback exactly once.

## Current Control Points

Important files:

- `mofacts/client/views/experiment/svelte/machine/cardMachine.ts`
- `mofacts/client/views/experiment/svelte/components/CardScreen.svelte`
- `mofacts/client/views/experiment/svelte/components/VideoSessionMode.svelte`
- `mofacts/client/views/experiment/svelte/services/unitEngineService.ts`
- `mofacts/client/views/experiment/svelte/services/svelteInit.ts`
- `mofacts/client/views/experiment/svelte/services/historyLogging.ts`
- `mofacts/server/methods/analyticsMethods.ts`

Important current boundaries:

- `VideoSessionMode` detects checkpoint time and dispatches a Svelte `checkpoint` event.
- `CardScreen.handleVideoCheckpoint` sends `VIDEO_CHECKPOINT` to the XState actor.
- `cardMachine.videoWaiting` is the only state that handles `VIDEO_CHECKPOINT`.
- `cardMachine` resumes video by dispatching a browser event, `cardMachine:resumeVideo`.
- `CardScreen` listens for that browser event and calls `videoPlayer.resumeAfterQuestion()`.

## Required Invariants

These invariants should be enforced in code and covered by focused tests or state-machine harness checks.

### Video Entry

- A video unit must enter `videoWaiting` before any checkpoint question can be selected.
- Initial video entry must not call playback resume/autoplay.
- The video player must not mount before card initialization confirms that the route will remain `/card`.
- If the unit has instructions, instructions must render before any video element is mounted.

### Checkpoint Detection

- A checkpoint may only pause the video if the machine is in `videoWaiting`.
- A detected checkpoint outside `videoWaiting` is an invariant breach and must fail or log clearly; it must not silently pause with no question.
- Every accepted checkpoint must produce exactly one question selection.
- Every accepted checkpoint must map to one configured `questionTimes[index]` and one configured `questions[index]`.
- Invalid checkpoint time/question data must throw or hard-stop clearly. Do not infer a fallback checkpoint or fallback question.

### Answer Completion

- Every completed checkpoint answer must return the machine to `videoWaiting`, unless the video unit ends or a hard error occurs.
- A correct answer must resume playback exactly once after the machine returns to `videoWaiting`.
- An incorrect answer with `rewindOnIncorrect=true` must rewind to the configured previous section boundary, reset the checkpoint index consistently, and replay that section according to the designed flow.
- Video checkpoint answers must not create or wait on prepared incoming trials.

### Playback Control

- User pause, checkpoint pause, system resume, seek clamp, and rewind should be distinct actions in history/logging.
- Machine-owned video actions must be acknowledged by the UI/player boundary. A lost browser event is not acceptable as normal behavior.
- Browser autoplay policy should not be treated as a release-confidence mechanism. Initial playback should be user/player controlled.

### History And Resume

- History rows should clearly distinguish video player actions from checkpoint answer attempts.
- Resume anchors should be derived from completed checkpoint answers and must fail clearly if history exceeds configured checkpoint bounds.
- Resume must never silently skip configured checkpoint questions because of ambiguous state.

## Audit Findings

### 1. Video Playback Uses An Unacknowledged Side Channel

`cardMachine` does not directly control the player. It emits a browser event:

```text
cardMachine action -> window.dispatchEvent('cardMachine:resumeVideo')
```

Then `CardScreen` receives that event and calls a method on `VideoSessionMode`.

This is lossy. If the event fires before the listener exists, before `videoPlayer` is bound, or while the player is not ready, the state machine believes it resumed playback but the player does not resume.

This can explain the video playing briefly and pausing unexpectedly, and it can also explain correct answers that do not resume playback.

### 2. Initial START Can Fire Resume Before Listener Registration

In `CardScreen.svelte`, actor start and `START` dispatch happen before the `cardMachine:resumeVideo` listener is registered. The initial video state has `resumeVideoPlayback` in its entry action path.

That creates an ordering risk:

```text
actor.start()
  -> START
  -> cardMachine.videoWaiting
  -> resumeVideoPlayback browser event
  -> listener may not exist yet
```

Initial playback should not depend on this path.

### 3. Checkpoint Dispatch Is Not Acknowledged

`VideoSessionMode` currently pauses the player and dispatches a checkpoint event. If the machine is not in `videoWaiting`, that event is ignored because `VIDEO_CHECKPOINT` is only handled in `videoWaiting`.

The player remains paused with no question shown. This matches the observed “checkpoint 2 pauses but no question appears.”

The player needs either:

- an acknowledgement that the checkpoint was accepted before staying paused, or
- a way to recover if the parent rejects or ignores the checkpoint.

### 4. Answer Completion Depends On DOM Transition Events

After answering a video checkpoint question, the machine must pass through `transition.fadingOut`. It only exits that state after `TRANSITION_COMPLETE`, which is sent by a Svelte `transitionend` handler.

If the transition event is missed, not wired in a branch, not fired because opacity did not actually change, or attached to the wrong element, the machine never reaches `transition.clearing`. That prevents the video-session branch from returning to `videoWaiting`.

This can explain “question 1 correct, then video remains paused.”

### 5. Video Uses Shared Prepared-Advance Machinery

Video checkpoints are not normal “next card” progression. The video determines when the next question happens. However, the machine still invokes `prepareIncomingTrialService` during feedback/transition paths.

For video engines, prepared advance should be disabled. Any placeholder prepared-trial object without real display data can make the machine wait on incoming-card readiness that should not exist in video mode.

### 6. Initial Instruction Flash Is A Render-Gating Problem

The black flash before instructions comes from rendering the card/video surface before card initialization decides whether to redirect to `/instructions`.

The card screen should not render the video player until initialization has confirmed that the route will remain `/card`.

## Fix Plan

### P0: Stabilize State Ownership

1. Register all `CardScreen` window listeners before starting the XState actor.

   This includes:

   - `cardMachine:resumeVideo`
   - `cardMachine:videoAnswer`
   - SR and TTS listeners

   This removes the “machine emitted event before UI listener exists” race.

2. Remove `resumeVideoPlayback` from initial `START -> videoWaiting`.

   Initial video playback should be learner/player controlled, not machine-forced. The machine should only resume video after an accepted checkpoint answer has completed.

3. Add a direct video-answer completion route.

   For video sessions, after answer logging/tracking completes, the machine should return to `videoWaiting` without prepared-advance handoff. This route should not depend on incoming-card readiness.

4. Disable prepared advance for video units completely.

   `prepareIncomingTrialService` should return an explicit no-op for `engine.unitType === 'video'`, and the machine should treat that as no prepared trial.

5. Add explicit invariant checks around video-mode machine states.

   Examples:

   - Reject `VIDEO_CHECKPOINT` outside `videoWaiting` with a clear logged invariant breach.
   - Reject video answer completion if the machine cannot determine the active checkpoint index.
   - Reject configured checkpoint arrays with mismatched or invalid times/questions.

### P1: Make Checkpoint Handoff Reliable

6. Add checkpoint acceptance acknowledgement.

   Replace the one-way handoff:

   ```text
   player pauses -> dispatch checkpoint -> hope machine accepts
   ```

   with an acknowledged handoff:

   ```text
   player detects checkpoint
     -> asks parent/machine to accept checkpoint
     -> pause and show question only if accepted
     -> otherwise keep or resume playback and log a clear error
   ```

   If Svelte event acknowledgement is awkward, implement a `canAcceptVideoCheckpoint` state flag in `CardScreen` based on `state.matches('videoWaiting')`.

7. Fail clearly when a checkpoint is detected outside `videoWaiting`.

   Silent ignored checkpoint events should become visible diagnostics. This should not be a routine client `console.*`; use the existing client logger.

### P1: Remove Fragile DOM-Transition Dependency For Video

8. For video checkpoint answers, do not require CSS `transitionend` to reach `videoWaiting`.

   Options:

   - Add a video-specific transition state with an XState delay equal to the fade duration.
   - Or dispatch `TRANSITION_COMPLETE` directly after video answer UI is hidden.
   - Or make the machine own the fade timing instead of relying on DOM events.

   The important invariant: a missing browser transition event must not strand a video session.

### P1: Separate Video Flow From Generic Card Flow

9. Create a video-specific answer-completion branch.

   This branch should still log history and update performance as needed, but it should not:

   - prepare an incoming trial,
   - wait on incoming asset readiness,
   - commit prepared trial runtime,
   - depend on normal seamless/fallback card advance.

   It should end at `videoWaiting` or a hard error.

### P2: Playback And Audio Behavior

10. Do not autoplay initial YouTube playback from the machine.

   Browser policy commonly mutes delayed autoplay. The first play should come from the user’s click on the Plyr control.

11. Resume after answers only from a reliable video-resume state.

   Resume after a correct answer should happen after:

   - answer is validated,
   - history is written,
   - state has returned to `videoWaiting`,
   - `VideoSessionMode` is mounted and ready.

12. Keep checkpoint pause separate from user pause.

   History should distinguish:

   - user pause,
   - checkpoint pause,
   - seek-block pause or clamp,
   - system resume after answer.

## State Trace Tables

### Initial Video Entry

Expected sequence:

| Step | State/Event | Owner | Expected Result |
| --- | --- | --- | --- |
| 1 | `/card` init starts | `CardScreen` | No video surface rendered yet |
| 2 | instructions check passes | `svelteInit` | Video checkpoints and URL are initialized |
| 3 | render gate opens | `CardScreen` | `VideoSessionMode` may mount |
| 4 | actor starts | `cardMachine` | Machine receives `START` |
| 5 | `START` accepted | `cardMachine` | Machine enters `videoWaiting` |
| 6 | player ready | `VideoSessionMode` | Player is ready, but no machine autoplay/resume occurs |
| 7 | learner starts video | learner/Plyr | Video plays with normal audio |

Invalid outcomes:

- Video mounts before the instructions decision.
- `START` selects a checkpoint question before a checkpoint time is reached.
- Machine emits resume/autoplay during initial entry.

### Correct Checkpoint Answer

Expected sequence:

| Step | State/Event | Owner | Expected Result |
| --- | --- | --- | --- |
| 1 | checkpoint time reached | `VideoSessionMode` | Checkpoint candidate detected |
| 2 | checkpoint accepted | `cardMachine` in `videoWaiting` | Machine stores checkpoint index/question index |
| 3 | video pauses | `VideoSessionMode` | Pause is caused by accepted checkpoint |
| 4 | question selected | `selectCardService` | Configured checkpoint cluster is displayed |
| 5 | learner answers correctly | learner/machine | Validation sets `isCorrect=true` |
| 6 | history/performance update | machine services | Attempt row is written |
| 7 | video-specific completion | `cardMachine` | Machine returns to `videoWaiting` |
| 8 | resume command acknowledged | `CardScreen`/player | Video resumes exactly once |

Invalid outcomes:

- Correct answer leaves machine outside `videoWaiting`.
- Resume command fires before player/listener exists.
- Video remains paused without an error.

### Incorrect Checkpoint Answer With Rewind

Expected sequence:

| Step | State/Event | Owner | Expected Result |
| --- | --- | --- | --- |
| 1 | learner answers incorrectly | learner/machine | Validation sets `isCorrect=false` |
| 2 | video answer notification | machine/UI boundary | Active checkpoint index is available |
| 3 | rewind boundary computed | `CardScreen` | Previous checkpoint boundary is selected |
| 4 | checkpoint index reset | `VideoSessionMode` | Next checkpoint index matches rewind target |
| 5 | video rewinds | `VideoSessionMode` | Playback position moves to section start |
| 6 | section replays | player | Current checkpoint is encountered again |

For `AdaptiveKeyword pp`, with checkpoint times `69, 115, 192, 242`, expected rewind starts are approximately:

| Wrong At | Rewind To |
| --- | --- |
| 69s | 0.1s |
| 115s | 69.1s |
| 192s | 115.1s |
| 242s | 192.1s |

Invalid outcomes:

- Rewind uses a guessed fallback time.
- Checkpoint index and video time disagree after rewind.
- Previous already-correct questions are repeated when `repeatQuestionsSinceCheckpoint=false`.

### Checkpoint Detected Outside `videoWaiting`

Expected sequence:

| Step | State/Event | Owner | Expected Result |
| --- | --- | --- | --- |
| 1 | checkpoint time reached | `VideoSessionMode` | Candidate detected |
| 2 | machine state checked | `CardScreen`/machine | State is not `videoWaiting` |
| 3 | invariant breach emitted | client logger | Clear diagnostic includes state, checkpoint index, time |
| 4 | player recovers | `VideoSessionMode` | Video does not silently remain paused without a question |

Invalid outcomes:

- Video pauses and no question appears.
- `VIDEO_CHECKPOINT` is silently ignored.
- Checkpoint index advances without an accepted question.

### Video End

Expected sequence:

| Step | State/Event | Owner | Expected Result |
| --- | --- | --- | --- |
| 1 | media ends | `VideoSessionMode` | `VIDEO_ENDED` is sent |
| 2 | `videoWaiting` handles end | `cardMachine` | Machine enters `videoEnded` |
| 3 | continue UI appears | `CardScreen` | Learner can continue |
| 4 | learner continues | learner/machine | Unit completion runs |

Invalid outcomes:

- Video end is handled while a checkpoint question is active.
- Unit advances without explicit learner continue if current UX requires the continue affordance.

## Verification Plan

### Code-Level Checks

- Confirm `START` no longer emits resume before listeners are installed.
- Confirm `VIDEO_CHECKPOINT` is only accepted in `videoWaiting`.
- Confirm checkpoint detection outside `videoWaiting` logs a clear invariant breach.
- Confirm video answer completion always reaches `videoWaiting`.
- Confirm video units cannot create or store prepared incoming trials.
- Confirm `/instructions` redirect happens before `VideoSessionMode` can mount.
- Confirm no branch silently falls back to normal card flow for video checkpoints.
- Confirm no raw client `console.*` is introduced.

### Targeted Tests

Add focused tests or harness coverage for:

- Video unit startup does not select a question before checkpoint.
- Checkpoint 0 accepted from `videoWaiting` selects configured cluster.
- Correct answer returns to `videoWaiting`.
- Correct answer triggers exactly one resume command after returning to `videoWaiting`.
- Checkpoint event while not in `videoWaiting` is rejected and logged.
- Prepared advance service returns no prepared trial for video units.
- Instruction redirect prevents video player mount.

### Manual Smoke Script

Use `AdaptiveKeyword pp` as the smoke content:

- First route to the video unit instructions.
- Continue to video.
- Confirm no black video flash before instructions.
- Start video manually.
- Confirm no early auto-pause before 69 seconds.
- At 69 seconds, question 1 appears.
- Correct answer resumes video.
- At 115 seconds, question 2 appears.
- Continue through 192 and 242 seconds.

## Priority Checklist

- P0: Listener registration before actor start.
- P0: Remove initial machine autoplay/resume.
- P0: Disable prepared advance for video.
- P0: Add direct reliable return to `videoWaiting` after video answer.
- P0: Add fail-clear invariant checks for invalid video checkpoint states.
- P1: Add checkpoint acceptance/rejection handshake.
- P1: Remove DOM-transition dependency for video answer return path.
- P2: Clarify video history action types.
- P2: Add tests and smoke script coverage.

## Non-Goals

- Do not change video checkpoint content or TDF schema unless the code audit finds a schema mismatch.
- Do not add compatibility fallback paths.
- Do not silently skip checkpoints.
- Do not treat resume/history count as the primary cause of the observed first-run checkpoint failures.
