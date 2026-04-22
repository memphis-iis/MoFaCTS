# Svelte Card Theme Transition Milestone 3 Design (2026-03-24)

Status: Planned
Priority: High
Primary repo: `C:\dev\mofacts\svelte-app\mofacts`
Parent plan: `docs/SVELTE_CARD_THEME_TRANSITION_PLAN_2026-03-24.md`
Prerequisite commits:

- `14cdea8a8` `fix(theme): normalize card motion tokens and theme contract`
- `edcaf728a` `refactor(card): add explicit visual readiness signals`

## Purpose

Milestone 3 is the first transition-correctness milestone. The goal is to make the parent card subset own the reveal and exit behavior so the whole next visible subset is fully paint-ready before the transition starts.

This design note exists because Milestone 3 has several tightly coupled changes. A partial implementation could make the UI look smoother while still violating the paint-first rule.

## Target Behavior

The correct model is:

- render the full next visible subset in its final layout
- keep that subset present but transparent
- wait until the subset is fully readiness-complete
- start one parent `transition_smooth`
- keep child elements from fading or popping in later on their own

For this milestone, "full next visible subset" means:

- Question flow: stimulus plus response controls in their final positions
- Study flow: stimulus plus study answer/feedback area plus skip-study control
- Feedback flow: stimulus plus feedback area
- Force-correct flow: stimulus plus incorrect feedback plus correction prompt/input

## Non-Goals

- Do not remove all child entrance animations yet if they are not on the Milestone 3 critical path. Milestone 4 is the cleanup pass for child catch-up animations.
- Do not widen the scope into video overlays yet. That remains Milestone 5.
- Do not redesign button or layout styling here. Milestone 3 is about visible-subset composition and transition ownership.

## Current Problem Summary

The current card shell fades the parent wrapper, but important child content still mounts later:

- response controls appear only once `presenting.awaiting` is reached
- study content and skip-study are not part of one parent-controlled subset
- feedback swaps branches after the parent is already visible
- force-correct rendering is structurally blocked by the feedback branch
- parent fade-out still uses the fast tier instead of the smooth tier

Because of that, the card is still non-compliant even after readiness signaling exists.

## Implementation Slices

### Slice 1: Define Parent-Owned Visible Subsets

Goal:

- explicitly define what the parent fade owns in question, study, feedback, and force-correct flows

Required changes:

- make `CardScreen.svelte` treat the parent subset as the thing that becomes visible, not just the stimulus shell
- define visibility flags so controls can be mounted before they are enabled
- include study skip action in the same visible subset as the study answer content

Primary files:

- `client/views/experiment/svelte/components/CardScreen.svelte`
- `client/views/experiment/svelte/components/TrialContent.svelte`

Exit condition:

- the parent subset definition is explicit and matches what the learner should see as one screen

### Slice 2: Convert Mount Rules Into Enable/Disable Rules

Goal:

- stop using machine progress to decide whether controls exist at all

Required changes:

- keep response controls mounted during `presenting.fadingIn`, `presenting.displaying`, and `presenting.audioGate`
- use `inputEnabled` only to control interactivity, not whether the controls render
- keep question controls visually present but disabled until `presenting.awaiting`
- ensure study content renders before any waiting/speaking progression changes its interactivity

Primary files:

- `client/views/experiment/svelte/components/CardScreen.svelte`
- `client/views/experiment/svelte/components/TrialContent.svelte`
- `client/views/experiment/svelte/components/ResponseArea.svelte`

Exit condition:

- the question subset can be fully rendered before the parent fade starts

### Slice 3: Restructure Feedback And Force-Correct Composition

Goal:

- make feedback and force-correct render as valid visible subsets rather than mutually masking branches

Required changes:

- restructure `TrialContent.svelte` so `feedbackVisible` does not automatically suppress force-correct input
- decide the exact composed subset for force-correct:
  incorrect feedback plus correction prompt/input in one visible handoff
- ensure readiness for that subset is aggregated as one unit

Primary files:

- `client/views/experiment/svelte/components/TrialContent.svelte`
- `client/views/experiment/svelte/components/FeedbackDisplay.svelte`
- `client/views/experiment/svelte/components/ResponseArea.svelte`

Exit condition:

- `feedback.forceCorrecting` is visibly functional and part of one parent-owned subset

### Slice 4: Rebind Machine Timing To The New Subset Model

Goal:

- make machine timing agree with the new visible-subset contract

Required changes:

- make `presenting.fadingIn` represent a parent transition of the full question subset, not just the display shell
- keep the subset paint-ready before fade-in starts by relying on the readiness keys already introduced in Milestone 2
- ensure `study.preparing` and `feedback.preparing` hand off to visible subsets without late child swaps
- change fade-out to use `transition_smooth`

Primary files:

- `client/views/experiment/svelte/machine/cardMachine.ts`
- `client/views/experiment/svelte/components/CardScreen.svelte`

Exit condition:

- the machine no longer causes important child content to appear after the parent transition begins

## Coupled Changes That Must Land Together

The following should not be split across separate partial merges:

- Question subset composition plus response-control mounting rules
- Study subset composition plus skip-study placement
- Feedback subset composition plus force-correct rendering
- Parent fade-out tier change plus the corresponding parent-owned subset model

If any of these land alone, the card can still remain transition-wrong even if it looks improved.

## Concrete File-Level Intent

### `client/views/experiment/svelte/components/CardScreen.svelte`

- keep the parent fade wrapper as the only major content transition owner
- stop rendering skip-study outside the fading subset
- align parent visibility flags with the full subset model
- switch fade-out to `transition_smooth`

### `client/views/experiment/svelte/components/TrialContent.svelte`

- support simultaneous composition of stimulus, feedback, and force-correct input where needed
- stop using a simple `feedbackVisible` branch that masks everything else
- support disabled-but-mounted response states for question reveal

### `client/views/experiment/svelte/components/ResponseArea.svelte`

- render response controls as present-but-disabled before awaiting
- preserve correct enabled/disabled behavior once awaiting starts
- remain compatible with readiness signaling added in Milestone 2

### `client/views/experiment/svelte/components/FeedbackDisplay.svelte`

- remain a child surface only, not the owner of the major reveal
- work as one composed part of the feedback subset

### `client/views/experiment/svelte/machine/cardMachine.ts`

- keep semantic state flow but stop relying on state boundaries to control late mounting
- use smooth for major exit
- avoid any timing path that makes the parent visible before the whole subset is ready

## Verification Checklist

- Question flow:
  stimulus and controls are present together during fade-in
- Question flow:
  controls are disabled before awaiting, then enabled without a late mount
- Study flow:
  answer content and skip-study are in the same visible subset
- Feedback flow:
  feedback does not appear after the parent fade has already started
- Force-correct flow:
  incorrect feedback and correction input render together as one visible handoff
- Exit flow:
  parent fade-out uses `transition_smooth`
- Regression check:
  no new late pop-in is introduced while moving content into the parent subset

## Suggested Commit Boundary

Use one milestone commit when the following are all true:

- question reveal is parent-owned and paint-first
- study reveal includes skip-study in the same subset
- feedback and force-correct composition is structurally correct
- fade-out uses smooth

Suggested commit message:

- `fix(card): unify reveal and exit sequencing for question study and feedback`

## Immediate Next Coding Order

1. Move skip-study into the parent fading subset in `CardScreen.svelte`.
2. Change `TrialContent.svelte` so response controls can stay mounted while disabled.
3. Restructure feedback plus force-correct composition in `TrialContent.svelte`.
4. Update `CardScreen.svelte` visibility logic to match the new subset rules.
5. Change `cardMachine.ts` exit timing to use the smooth tier.
6. Verify question, study, feedback, and force-correct flows before starting Milestone 4.
