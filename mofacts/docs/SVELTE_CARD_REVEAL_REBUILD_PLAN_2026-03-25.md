# Svelte Card Reveal Rebuild Plan (2026-03-25)

Status: Planned
Priority: High
Primary repo: `C:\dev\mofacts\svelte-app\mofacts`
Baseline: rollback to `14cdea8a8`
Supersedes in mechanism: `docs/SVELTE_CARD_THEME_TRANSITION_PLAN_2026-03-24.md`
Related audit: `docs/SVELTE_CARD_THEME_TRANSITION_AUDIT_2026-03-24.md`

## Why This Plan Exists

The previous transition plan got the visual goal partly right but used the wrong readiness model to achieve it.

The good part of the old contract was:

- major card changes should transition as one visible subset
- the subset should be ready before the reveal starts
- important child content must not pop in after the parent reveal begins

The bad part was the implementation model:

- too many child components were allowed to participate in the reveal contract
- the parent reveal depended on distributed child readiness voting
- optional path-specific UI concerns became blockers for the common path
- the view layer effectively grew a second UI state machine on top of the XState machine

That is what produced the blank-screen failures, the multiple-choice non-paint path, and the fragile image/SR interactions.

This new plan replaces that model with a narrower readiness contract.

## Correct Contract

The rebuild must follow this contract:

- machine picks the next semantic subset
- parent renders the whole subset hidden
- parent waits only for true blocking assets
- parent fades the full subset in
- children do not vote on readiness unless they own a true blocking asset

In practical terms:

- `StimulusDisplay` may keep image readiness
- `MultipleChoice` must not gate reveal
- `ResponseArea` must not gate reveal
- `TrialContent` must not aggregate child readiness
- `TrialSubset` must not exist in the rebuilt model
- `FeedbackDisplay` should only gate if it owns a real blocking image dependency

## Readiness Rules

### Allowed Reveal Blockers

These may delay the parent reveal if they would otherwise visibly arrive late:

- decoded stimulus image assets
- decoded feedback image assets when feedback actually contains an image
- video/media surfaces only when they visually define the revealed subset

### Forbidden Reveal Blockers

These must not block the parent reveal:

- text stimulus content
- text inputs
- SR status text
- multiple-choice buttons
- button autofit or post-paint size adjustment
- confirm button presence
- skip-study button presence
- ordinary feedback text
- branch-local mount bookkeeping
- extra child paint callbacks that are not tied to a true blocking asset

## Baseline Decision

The rollback to `14cdea8a8` is the new safe base.

Keep:

- theme and motion contract normalization
- theme fallback hardening
- valid token cleanup that is independent of the reveal architecture

Do not reintroduce as-is:

- distributed child readiness aggregation
- hidden layer staging with `TrialSubset`
- machine advancement that depends on child-voted reveal completion for ordinary card content

## Architecture Direction

### Machine Responsibility

The machine owns semantic state only:

- question
- study
- feedback
- force-correct
- video checkpoint
- video ended

The machine should not own child readiness details for normal text and control rendering.

### Parent Responsibility

`CardScreen.svelte` owns the one major reveal boundary:

- determine which semantic subset should be displayed
- render that subset in final layout but hidden
- wait only for true blocking assets
- reveal the whole subset with `transition_smooth`

### Child Responsibility

Children render content in final layout.

Children may report readiness only for true blocking assets they directly own. They must not participate in a general-purpose reveal voting protocol.

## Milestones

### Milestone 1: Freeze The Rollback Baseline

Goal:

- preserve the currently working rollback state as the rebuild base

Work:

- keep the rollbacked card files as the starting point
- confirm no leftover `TrialSubset` references remain
- record the rebuild contract in docs before further implementation

Files:

- `client/views/experiment/svelte/components/CardScreen.svelte`
- `client/views/experiment/svelte/components/TrialContent.svelte`
- `client/views/experiment/svelte/components/StimulusDisplay.svelte`
- `client/views/experiment/svelte/components/ResponseArea.svelte`
- `client/views/experiment/svelte/components/MultipleChoice.svelte`
- `client/views/experiment/svelte/components/FeedbackDisplay.svelte`
- `client/views/experiment/svelte/machine/cardMachine.ts`
- `client/views/experiment/svelte/machine/services.ts`

Exit criteria:

- rollback baseline is stable
- this plan is documented

Suggested commit:

- `docs: add svelte card reveal rebuild plan`

### Milestone 2: Define The Parent-Owned Subset API

Goal:

- make the semantic subset explicit without bringing back distributed readiness

Work:

- define the subset categories the parent can reveal
- make `CardScreen.svelte` compute one semantic subset from machine state
- ensure subset composition is declarative and local to the parent shell

Subset categories should include at least:

- question
- study
- feedback
- force-correct
- video checkpoint
- video ended

Exit criteria:

- there is one parent-owned subset model
- subset choice is not coupled to child readiness callbacks

Suggested commit:

- `refactor(card): define parent-owned reveal subsets`

### Milestone 3: Add Narrow Asset Readiness

Goal:

- support clean fades without rebuilding the distributed barrier model

Work:

- keep image readiness in `StimulusDisplay`
- add feedback-image readiness only if feedback actually contains an image
- keep these blockers local and asset-specific
- remove non-asset readiness from `ResponseArea`, `MultipleChoice`, and `TrialContent`

Files:

- `client/views/experiment/svelte/components/StimulusDisplay.svelte`
- `client/views/experiment/svelte/components/FeedbackDisplay.svelte`
- `client/views/experiment/svelte/components/TrialContent.svelte`
- `client/views/experiment/svelte/components/ResponseArea.svelte`
- `client/views/experiment/svelte/components/MultipleChoice.svelte`

Exit criteria:

- only true blocking assets can delay reveal
- ordinary controls and text no longer participate in readiness

Suggested commit:

- `refactor(card): narrow reveal readiness to blocking assets`

### Milestone 4: Rebuild The Parent Reveal

Goal:

- implement a single parent-owned hidden-to-visible reveal for ordinary card subsets

Work:

- parent renders the chosen subset hidden in final layout
- parent waits on the narrow blocker set from Milestone 3
- parent reveals the full subset with `transition_smooth`
- parent exit uses the smooth tier as well

Files:

- `client/views/experiment/svelte/components/CardScreen.svelte`
- `client/views/experiment/svelte/machine/cardMachine.ts`

Exit criteria:

- question, study, feedback, and force-correct all reveal through one parent boundary
- no ordinary child content can delay or deadlock reveal

Suggested commit:

- `fix(card): rebuild parent-owned reveal flow`

### Milestone 5: Keep Controls Present, Never Blocking

Goal:

- make controls part of the hidden subset rather than reveal participants

Work:

- keep question controls present in final layout before reveal
- enable or disable controls by machine state, not by mount timing
- ensure multiple-choice layout fitting happens after paint and never blocks visibility
- ensure SR status, confirm buttons, and skip-study controls are ordinary rendered content

Files:

- `client/views/experiment/svelte/components/ResponseArea.svelte`
- `client/views/experiment/svelte/components/MultipleChoice.svelte`
- `client/views/experiment/svelte/components/CardScreen.svelte`

Exit criteria:

- controls are present with the subset
- control behavior no longer influences reveal start

Suggested commit:

- `fix(card): decouple controls from reveal readiness`

### Milestone 6: Reintroduce Special Cases Carefully

Goal:

- handle special paths only after the common path is stable

Work:

- verify force-correct under the new subset model
- verify study plus skip-study under the new subset model
- revisit video checkpoint and video end overlays using the same narrow readiness rules
- only add a blocker when a specific late-asset problem is observed

Exit criteria:

- special paths follow the same parent-owned reveal model
- no new general-purpose readiness layer is introduced

Suggested commit:

- `fix(video): adapt overlays to narrow reveal contract`

## Verification Matrix

Run these manually after each milestone that touches reveal behavior:

- text-input drill card
- image drill card
- multiple-choice assessment card
- study card with answer shown
- incorrect feedback card
- force-correct card
- video checkpoint overlay
- video ended overlay

For each run, verify:

- the subset is present in final layout before reveal
- only true blocking assets delay reveal
- no text or controls pop in after reveal begins
- no blank screen occurs while the machine continues running

## Explicit Non-Goals

Do not:

- rebuild `TrialSubset`
- add a new generic readiness key tree
- make button layout sizing a reveal dependency
- make SR or text-input mount logic part of reveal timing
- add speculative blocker hooks for features that are rare or usually absent

## Decision Rule For Future Additions

When someone wants to add a new readiness dependency, the burden of proof should be:

1. Does the asset visibly arrive after the parent reveal without blocking?
2. Is that asset prominent enough that the pop-in is unacceptable?
3. Can the blocker stay local to the component that owns the asset?
4. Can the common path still render without knowing anything about that blocker?

If the answer to any of those is no, it should not become part of the readiness contract.

## Recommendation

Build from the rollback baseline, not from the failed reveal branch.

The rollback state is already working. That makes it a much better foundation than trying to subtract blockers one by one from the distributed readiness model.
