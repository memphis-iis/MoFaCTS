# Svelte Card Transition Contract Plan

Date: 2026-03-27

## Purpose

Define the visual transition contract for the Svelte card in a way that matches the intended user experience and is simple enough to implement reliably.

This plan supersedes any implicit assumption that every `question -> feedback` handoff should be treated as a full parent-subset reveal.

## Contract

### 1. Initial trial reveal

When a new trial begins:

- the full trial shell starts hidden
- the parent card container owns the main fade-in
- the parent waits only for true blocking assets
- the whole newly visible trial subset fades in with `transition_smooth`

In ordinary question presentation, this includes:

- stimulus area
- interaction area
- any other content that belongs to that initial trial view

### 2. Question to feedback handoff when stimulus is unchanged

This is the common case and should be optimized around it.

If the stimulus does not change between the question phase and the feedback phase:

- the stimulus must remain mounted
- the stimulus must remain visible
- the stimulus must not fade out
- the stimulus must not fade back in
- only the interaction pane changes

The intended handoff is:

- response/interaction content fades out
- feedback content fades in
- the stimulus remains stable throughout

This is not a parent trial-shell reveal.

### 3. Stimulus continuity across question and feedback

Based on the current runtime/code path, the main stimulus surface should be treated as stable across ordinary `question -> feedback` handoff.

What actually changes today:

- `context.currentDisplay` remains the main stimulus source
- incorrect feedback may introduce `correctAnswerImageSrc`
- that feedback image belongs to the feedback pane, not the main stimulus pane

Therefore the intended default contract is:

- the main stimulus does not change during ordinary feedback
- the main stimulus stays mounted and visible
- any new incorrect-answer image is treated as feedback content in the interaction pane

If a future lesson type truly requires swapping the main stimulus during feedback, that should be introduced as an explicit exceptional path, not as the assumed default model.

### 4. End of trial

At the end of the feedback/study window:

- the whole visible card content fades out together
- stimulus and interaction content leave as one visual unit
- the next trial does not begin revealing until the old one has fully exited

### 5. Timer contract

For study/feedback timing:

- the review timer starts when feedback/study fade-in begins
- if TTS is enabled, the timer still starts immediately
- if TTS runs longer than the timer, exit waits for TTS completion
- otherwise the review window ends when the timer ends

### 6. Readiness contract

Only true blocking assets may delay a reveal.

Allowed blockers:

- stimulus image decode for initial trial reveal
- feedback image decode only when feedback introduces a real new image
- other media surfaces only when they materially define the newly revealed view

Forbidden blockers:

- text content
- response controls
- SR status
- MC sizing
- confirm/submit controls
- skip-study controls
- generic child readiness voting

## What We Learned From Runtime Logs

### Question reveal

Question reveal is working correctly with the configured duration.

Observed behavior:

- `configuredDurationMs: 500`
- `transitionrun/start` occurs almost immediately after reveal trigger
- `transitionend` lands at roughly `500ms`

### Feedback reveal

Feedback reveal is not currently following the contract.

Observed behavior:

- feedback logs `reveal-trigger` with `configuredDurationMs: 500`
- but no opacity transition starts at feedback reveal time
- the transition events appear only after `feedbackTimeout:done`
- therefore the visible feedback window is not using the intended fade-in
- the fade currently seen is effectively the exit/teardown transition

This proves the current code is still treating feedback handoff incorrectly.

More specifically:

- the feedback timer begins at the correct moment
- but the visible interaction-pane fade-in is not committed at that same moment
- the transition currently observed is the teardown/fade-out side, not the intended feedback fade-in

## Current Code Mismatch

### `CardScreen.svelte`

Current behavior:

- parent `.trial-content-fade` owns initial trial reveal
- parent also gets reused for ordinary `question -> feedback` handoff
- feedback subset changes reset parent reveal bookkeeping

Why that is wrong:

- the common `question -> feedback` case should not be a full parent-shell reveal when the stimulus is unchanged

### `TrialContent.svelte`

Current behavior:

- the interaction area switches between `ResponseArea` and `FeedbackDisplay`
- but there is no dedicated interaction-pane transition boundary

Why that is wrong:

- the contract requires an interaction-only handoff for ordinary feedback

## Implementation Plan

### Milestone 1: Formalize transition ownership

Goal:

- keep the parent fade responsible only for full-trial reveal and full-trial exit
- stop treating ordinary feedback handoff as a parent reveal event

Changes:

- keep parent fade for initial trial reveal
- keep parent fade for end-of-trial fade-out
- remove parent-feedback-reveal assumptions for unchanged-stimulus paths

Success criteria:

- question reveal still fades in at `transition_smooth`
- full-trial exit still fades out at `transition_smooth`

### Milestone 2: Introduce an interaction-pane transition boundary

Goal:

- make `ResponseArea -> FeedbackDisplay` a dedicated local transition

Changes:

- add an interaction-pane wrapper in `TrialContent.svelte`
- make that wrapper own the `question -> feedback` handoff when stimulus is unchanged
- preserve the stimulus subtree and keep it visually stable throughout the handoff

Success criteria:

- unchanged-stimulus feedback no longer resets the parent reveal
- only the interaction pane fades during `question -> feedback`

### Milestone 3: Treat feedback images as interaction-pane content

Goal:

- formalize that ordinary feedback preserves the main stimulus
- keep any incorrect-answer image within the interaction-pane transition model

Changes:

- keep `context.currentDisplay` stable through ordinary feedback
- treat `correctAnswerImageSrc` as feedback-pane content only
- avoid reclassifying feedback-pane image changes as main stimulus changes

Success criteria:

- unchanged-stimulus feedback preserves stimulus continuity
- incorrect feedback images appear as part of the feedback-pane handoff

### Milestone 4: Keep readiness local and minimal

Goal:

- ensure the interaction handoff does not inherit broad blocker logic

Changes:

- interaction-pane transitions must not wait on generic child readiness
- only use feedback-image blocking when feedback truly introduces a new image asset

Success criteria:

- no deadlocks
- no blank feedback window
- no unnecessary re-blocking of already visible stimulus assets

### Milestone 5: Verify exit behavior

Goal:

- ensure end-of-trial still exits as one visual unit

Changes:

- confirm the parent fade-out starts after the full feedback/study window
- confirm stimulus and interaction leave together

Success criteria:

- whole-card exit remains visually unified
- next trial does not visibly overlap the previous exit

## Verification Checklist

### Case A: Question reveal

- new trial fades in over `transition_smooth`
- browser logs show transition start immediately after reveal-trigger
- transition end lands close to configured duration

### Case B: Correct feedback, unchanged stimulus

- stimulus stays visible the entire time
- response area leaves
- feedback area fades in
- no parent-shell feedback fade is required
- full card exits together at end of feedback

### Case C: Incorrect feedback, unchanged stimulus

- same as Case B
- visible feedback persists for full `reviewstudy`

### Case D: Feedback with changed stimulus

- transition is intentional and explicit
- no mixed stale/new surfaces
- no late image pop-in

### Case E: End-of-trial exit

- stimulus and interaction fade out together
- next trial reveal begins only after exit completes

## Implementation Notes

- Prefer simple ownership boundaries over generalized reveal coordination.
- The common case should be cheap and structurally obvious.
- The unchanged-stimulus feedback path should become the default mental model for the code.
- Instrumentation added on 2026-03-27 should be kept until the new behavior is verified, then reduced.
