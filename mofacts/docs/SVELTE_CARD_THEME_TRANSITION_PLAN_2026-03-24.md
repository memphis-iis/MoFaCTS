# Svelte Card Theme And Transition Implementation Plan (2026-03-24)

Status: Planned
Priority: High
Primary repo: `C:\dev\mofacts\svelte-app\mofacts`
Source audit: `docs/SVELTE_CARD_THEME_TRANSITION_AUDIT_2026-03-24.md`

## Scope

- Bring the Svelte card flow under the declared theme contract rather than fixed CSS and mismatched fallback tokens.
- Make major card-state transitions correct end to end: the whole next visible subset must be fully paint-ready before its transition begins.
- Fix visible state bugs that currently block correct theming or transition sequencing, especially force-correct mode and late-loading child content.

## Working Rules

- Audit record remains the source of truth for why each milestone exists.
- Major changes must stay incremental and reviewable, with a commit at each milestone boundary.
- Transition-critical fixes must not stop at partial sequencing improvements. If a milestone leaves major content still appearing after the parent fade starts, that milestone is not complete.
- The plan targets theme tiers semantically: `transition_smooth` for major card-content changes, `transition_fast` for quick feedback, and `transition_instant` only for accessibility or reduced-motion handling.

## Plan Overview

Milestone order is driven by dependency:

1. Normalize the theme and motion contract so the runtime and editor agree on the same tokens and value formats.
2. Add explicit visual-readiness signals for content that currently appears late.
3. Rework the main card reveal and exit sequencing for question, study, and feedback states around those readiness signals.
4. Remove child catch-up animations and fix force-correct rendering so the visible subset transitions together.
5. Extend the same readiness and motion rules to video waiting and video ended overlays.
6. Finish residual card-theme gaps and expose the remaining visual controls that materially affect card identity.

Milestones 3 and 4 are correctness-coupled. They should be reviewed separately if helpful, but they should not be considered complete unless both land and the card no longer reveals important child content late.

## Milestone 1: Normalize The Theme And Motion Contract

Goal: make the theme contract safe and coherent before touching the transition pipeline.

Work:

- Normalize transition-tier value handling across `client/views/theme.html`, `client/views/theme.ts`, `server/methods.ts`, and `client/views/experiment/svelte/machine/cardMachine.ts` so admin-edited motion values always round-trip as valid CSS times with units.
- Decide whether the card's primary CTA semantics should be governed by exposed `button_color` and `primary_button_text_color`, or whether `main_button_color` and `main_button_text_color` should become explicit admin-editable options. The implementation should not leave the current hidden-token state in place.
- Align theme defaults and fallbacks across `public/themes/mofacts-default.json`, `server/lib/themeRegistry.ts`, and root CSS variable setup in `public/styles/classic.css` so card-visible properties do not silently fall back to fixed CSS.
- Replace broken or mismatched tokens in the Svelte card codebase, especially `--primary-color` and `--border-radius-md`, with valid theme-driven variables.

Files most likely involved:

- `client/views/theme.html`
- `client/views/theme.ts`
- `server/methods.ts`
- `server/lib/themeRegistry.ts`
- `public/themes/mofacts-default.json`
- `public/styles/classic.css`
- `client/views/experiment/svelte/components/StimulusDisplay.svelte`

Exit criteria:

- Theme transition values saved from the admin UI are valid runtime CSS durations.
- Broken token references are removed from the Svelte card.
- The chosen primary CTA theme path is explicit and admin-visible.

Suggested commit:

- `fix(theme): normalize card motion tokens and theme contract`

## Milestone 2: Add Explicit Visual Readiness Signals

Goal: create a real readiness model that the machine can use before beginning any major reveal.

Work:

- Identify every child dependency that can make visible content appear late: stimulus image decode, response-area mount, multiple-choice layout readiness, feedback image/media readiness, and video overlay readiness.
- Introduce explicit readiness signals or callbacks from the affected components to the card shell.
- Replace the current `cardVisualReady` heuristic in `CardScreen.svelte` with readiness derived from the actual visible subset for the current state.
- Wire the machine and/or `CardScreen` logic so `appLoading` only clears after the first visible subset is actually ready.
- Decide whether `prefetchImage` belongs in the machine path, the component path, or both, but the final model must have a single readiness contract rather than two unrelated preload systems.

Files most likely involved:

- `client/views/experiment/svelte/components/CardScreen.svelte`
- `client/views/experiment/svelte/components/StimulusDisplay.svelte`
- `client/views/experiment/svelte/components/TrialContent.svelte`
- `client/views/experiment/svelte/components/ResponseArea.svelte`
- `client/views/experiment/svelte/components/FeedbackDisplay.svelte`
- `client/views/experiment/svelte/components/VideoSessionMode.svelte`
- `client/views/experiment/svelte/machine/services.ts`
- `client/views/experiment/svelte/machine/cardMachine.ts`

Exit criteria:

- The card can determine when the full next visible subset is ready.
- `appLoading` does not clear before that readiness condition is met.
- Image decode no longer races independently of the main reveal.

Suggested commit:

- `refactor(card): add explicit visual readiness signals`

## Milestone 3: Unify Reveal And Exit Sequencing For Question, Study, And Feedback

Goal: put the main card flow on a single transition model that uses the correct semantic tier.

Work:

- Rework question reveal so `presenting.readyPrompt`, `presenting.prestimulus`, `presenting.fadingIn`, `presenting.displaying`, `presenting.audioGate`, and `presenting.awaiting` do not reveal the question shell first and the controls later.
- Rework study handoff so `study.preparing`, `study.speaking`, and `study.waiting` reveal as one paint-ready subset rather than adding answer content and skip controls after the parent fade.
- Rework feedback handoff so `feedback.preparing`, `feedback.speaking`, and `feedback.waiting` transition as one prepared subset.
- Change major exit sequencing to use `transition_smooth` instead of `transition_fast`.
- Keep reduced-motion handling compatible with the same sequencing model.

Files most likely involved:

- `client/views/experiment/svelte/machine/cardMachine.ts`
- `client/views/experiment/svelte/components/CardScreen.svelte`
- `client/views/experiment/svelte/components/TrialContent.svelte`
- `client/views/experiment/svelte/machine/services.ts`

Exit criteria:

- Major question, study, feedback, and exit transitions all use the smooth semantic tier.
- The parent reveal does not start until the next visible subset is ready.
- Inputs and feedback do not appear after the parent transition has already started.

Suggested commit:

- `fix(card): unify reveal and exit sequencing for question study and feedback`

## Milestone 4: Remove Child Catch-Up Animations And Restore Force-Correct UI

Goal: eliminate remaining late child motion and repair the broken force-correct visible state.

Work:

- Remove or fold the per-choice entrance animation in `MultipleChoice.svelte` into the parent reveal model.
- Remove independent late-appearance behavior for the skip-study control and any other child surfaces that currently mount outside the main fade.
- Fix `feedback.forceCorrecting` so the correct feedback-plus-input subset renders in `TrialContent` and `ResponseArea`.
- Verify that force-correct mode uses the same readiness and reveal rules as other major feedback transitions.
- Audit quick interactions that should remain animated and retarget them to the semantic fast tier where appropriate.

Files most likely involved:

- `client/views/experiment/svelte/components/MultipleChoice.svelte`
- `client/views/experiment/svelte/components/CardScreen.svelte`
- `client/views/experiment/svelte/components/TrialContent.svelte`
- `client/views/experiment/svelte/components/ResponseArea.svelte`

Exit criteria:

- No important child content still fades or pops in after the parent reveal begins.
- `feedback.forceCorrecting` is visibly functional.
- Quick control feedback that remains animated is driven by `transition_fast`, not hardcoded literals.

Suggested commit:

- `fix(card): remove child catch-up animations and restore force-correct ui`

## Milestone 5: Align Video Overlay States With The Same Readiness Model

Goal: make `videoWaiting` and `videoEnded` transitions follow the same paint-first contract as the main card flow.

Work:

- Add readiness handling for overlay content in `VideoSessionMode.svelte` and the overlay content rendered from `CardScreen.svelte`.
- Ensure checkpoint question overlays do not mount the surface first and then fade the inner content later.
- Ensure end-of-video overlays and continue controls transition as a complete prepared subset.
- Bring video overlay surface, backdrop, and motion styling under the chosen theme contract from Milestone 1.

Files most likely involved:

- `client/views/experiment/svelte/components/VideoSessionMode.svelte`
- `client/views/experiment/svelte/components/CardScreen.svelte`
- `client/views/experiment/svelte/machine/cardMachine.ts`

Exit criteria:

- `videoWaiting` overlay questions and `videoEnded` overlays do not reveal child content late.
- Video overlay transitions use the same semantic tier rules as other major card-state changes.

Suggested commit:

- `fix(video): align overlay transitions with card readiness model`

## Milestone 6: Finish Residual Theme Compliance And Theme-Option Expansion

Goal: complete the remaining card-visible theme gaps after sequencing is correct.

Work:

- Apply the correct theme token to the stimulus box and replay/audio controls.
- Replace hardcoded surface shadows, overlay formulas, divider colors, and loading-overlay color where those values should be theme-configurable.
- Expose agreed theme options for remaining high-value card controls such as audio control color, video overlay colors, and any retained CTA or surface tokens from Milestone 1.
- Audit the final card styles for any remaining fixed literals that materially affect visual identity, readability, feedback tone, or motion feel.

Files most likely involved:

- `client/views/experiment/svelte/components/StimulusDisplay.svelte`
- `client/views/experiment/svelte/components/PerformanceArea.svelte`
- `client/views/experiment/svelte/components/VideoSessionMode.svelte`
- `client/index.html`
- `client/views/theme.html`
- `client/views/theme.ts`
- `server/lib/themeRegistry.ts`
- `public/themes/mofacts-default.json`

Exit criteria:

- Prominent card surfaces and controls are theme-governed rather than fixed CSS.
- Remaining theme-option gaps from the audit are either exposed or intentionally documented as internal implementation details.

Suggested commit:

- `feat(theme): complete card theming and expose remaining card controls`

## Verification Checklist Per Milestone

- Verify at least one text-input card, one multiple-choice card, one study card, one incorrect-feedback card, one force-correct card, and one video-checkpoint card after each milestone that touches the shared card shell.
- Check both normal-motion and reduced-motion behavior whenever reveal sequencing changes.
- Confirm that no important content appears after the parent transition begins.
- Confirm that primary card buttons, stimulus surfaces, feedback colors, and overlay surfaces respond to the intended theme properties.
- Re-run the audit's cited problem spots directly rather than relying only on broad smoke tests.

## Suggested Commit Sequence

1. `fix(theme): normalize card motion tokens and theme contract`
2. `refactor(card): add explicit visual readiness signals`
3. `fix(card): unify reveal and exit sequencing for question study and feedback`
4. `fix(card): remove child catch-up animations and restore force-correct ui`
5. `fix(video): align overlay transitions with card readiness model`
6. `feat(theme): complete card theming and expose remaining card controls`

## Exit Criteria

- Major card-content and card-state changes transition with the theme-controlled smooth tier.
- Quick UI feedback uses the theme-controlled fast tier where motion is still appropriate.
- Reduced-motion behavior can disable motion or use the instant tier without leaving sequencing bugs behind.
- The whole newly visible subset is fully paint-ready before a major reveal begins.
- No important child content pops in after the parent transition starts.
- The Svelte card's visible styling is governed by the declared, editable theme contract rather than hidden tokens or fixed CSS.
