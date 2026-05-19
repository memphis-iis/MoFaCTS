# H5P No-Scroll Container Policy

## Status

Draft policy and implementation plan.

This document defines the layout policy that MoFaCTS should layer around H5P's native iframe resize protocol. It is a product and engineering contract, not just a design note. The goal is to make the eventual implementation predictable enough that an engineer can follow it step by step without guessing which resize system owns which decision.

Normative language:

- **Must** means required for the policy to be considered implemented.
- **Should** means expected unless a later design decision explicitly overrides it.
- **May** means allowed but not required.

## 1. Problem Statement

H5P's standard embed model is designed for ordinary web pages. The H5P iframe reports its natural content height, and the parent page makes the iframe taller. That is a good model when the surrounding page can flow downward.

MoFaCTS cards are different. They are constrained instructional workspaces with controlled timing, progression, and history capture. If an H5P activity becomes taller than the available card area, letting the learner scroll inside the activity creates non-germane interaction work. The learner is spending time and attention managing the interface rather than doing the instructional task.

Therefore MoFaCTS should not treat H5P's native resizer as the final layout policy. MoFaCTS should treat it as a measurement protocol:

```text
H5P reports natural size.
MoFaCTS decides presentation.
```

The policy in this document exists to prevent three failure modes:

1. Competing resize systems that fight each other and cause visible geometry oscillation.
2. H5P feedback pushing required MoFaCTS controls, such as Continue, outside the visible card.
3. Nested scrollbars that add extraneous cognitive load and contaminate learner timing.

## 2. Source Map

These sources were used to ground the policy. Each source has a specific role in the plan.

| Source | Used For |
| --- | --- |
| [H5P iframe resizer source](https://github.com/h5p/h5p-php-library/blob/master/js/h5p-resizer.js) | Defines the official parent/child resize message contract: `ready`, `hello`, `prepareResize`, `resizePrepared`, and `resize`. |
| [H5P responsive design documentation](https://h5p.org/documentation/for-developers/responsive-design) | Confirms that H5P content types are expected to respond to resize events and adapt to changing container widths. |
| [H5P automatic resizing documentation](https://help.h5p.com/hc/en-us/articles/20905749916445-Automatic-resizing-of-H5Ps) | Confirms that H5P expects dynamic iframe resizing and that host integrations can break it. |
| [Snordian analysis of H5P resizing](https://snordian.de/2023/09/30/what-is-it-with-h5p-and-this-resizing/) | Documents common resizing failure modes, especially wrappers, hidden content, nested iframes, and multiple resizers. |
| [MDN ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver) | Defines ResizeObserver behavior and warns about resize loops, deferred notifications, and requestAnimationFrame mitigation. |
| [WCAG Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) | Supports avoiding two-dimensional scrolling and preserving access to content without loss of information or functionality. |
| [Understanding Cognitive Load in Digital and Online Learning](https://link.springer.com/article/10.1007/s10648-021-09624-7) | Supports the claim that software usability demands can contribute to extraneous cognitive load. |
| [Cognitive Architecture and Instructional Design: 20 Years Later](https://link.springer.com/article/10.1007/s10648-019-09465-5) | Supports minimizing extraneous load caused by presentation and task procedure. |
| [Principles for Reducing Extraneous Processing in Multimedia Learning](https://www.cambridge.org/core/books/abs/cambridge-handbook-of-multimedia-learning/principles-for-reducing-extraneous-processing-in-multimedia-learning-coherence-signaling-redundancy-spatial-contiguity-and-temporal-contiguity-principles/CD5B7AE1279A9AB81F8EEBB53DBEC86E) | Supports the instructional design goal of reducing extraneous processing from confusing or unnecessary layout demands. |

## 3. Product Requirements

The policy must satisfy these product requirements:

1. Supported H5P trials must not show learner-visible internal scrollbars.
2. Learners must not need to scroll inside the H5P activity to find answer controls, feedback, or Continue.
3. H5P question layout must be stable before learner interaction starts.
4. H5P feedback layout must be remeasured after response because feedback can be taller than the question.
5. Continue must remain visible and reachable after feedback appears.
6. MoFaCTS timing and history should not be contaminated by scrollbar manipulation.
7. H5P must not own MoFaCTS scheduling, progression, or history semantics.
8. Content larger than the current stage must be reflowed, width-adjusted, scaled, or moved into focus mode without learner-visible scrollbars or learner-facing error copy.

## 4. Non-Goals

The policy does not attempt to:

1. Rewrite H5P content types.
2. Fork H5P core.
3. Guarantee that every arbitrary H5P package can fit inside a fixed MoFaCTS card.
4. Preserve pixel-perfect h5p.org layout when a fixed-card constraint conflicts with H5P's natural flowing-page model.
5. Use internal scrollbars as the normal response to size pressure.
6. Hide usability failures by scaling content below a readable size.

## 5. Key Terms

### Natural Content Size

The unscaled size H5P reports for its current state through the H5P resize protocol. The natural size is phase-specific. The question state and feedback state can have different natural heights.

### Measurement Width

The iframe width used while asking H5P to report its natural height. Natural height is meaningful only for the width at which it was measured.

### Visible Stage

The MoFaCTS region in which the H5P activity is visually presented. The stage has a width and height controlled by the card layout.

### Available Stage Size

The visible stage size after subtracting reserved MoFaCTS controls, margins, and safe areas.

### Reserved Continue Space

Vertical space reserved for the MoFaCTS Continue control before it is visible. Reserving this space prevents Continue from changing the available H5P stage height after feedback has already been fitted.

### Fit Epoch

A single measurement and fit cycle. Every question fit, feedback fit, viewport resize, or focus-mode transition starts a new epoch. Measurements from older epochs must be ignored.

### Fit Result

The chosen presentation decision for one epoch. A fit result includes mode, measurement width, natural height, available size, scale, and reason.

### Focus Mode

A larger H5P presentation stage that gives the activity more viewport height by reducing or hiding nonessential MoFaCTS chrome.

### Author Review Content

An H5P activity whose question or feedback requires unusually small scaling, unusual width adjustment, or focus mode. This is an authoring and QA concern, not a learner-runtime state.

## 6. Roles And Ownership

The implementation should keep measurement, policy, and rendering responsibilities separate.

### `h5pContent.ts`

Owns the same-origin child-side H5P runtime page.

Responsibilities:

1. Load and run H5P content.
2. Participate in the H5P resize message protocol.
3. Report natural content size.
4. Emit H5P result or xAPI events.

Must not:

1. Know MoFaCTS card layout policy.
2. Add arbitrary height offsets.
3. Run a separate MoFaCTS-specific iframe height system that competes with the H5P protocol.

### `H5PFrame.svelte`

Owns the iframe and H5P parent-side message bridge.

Responsibilities:

1. Create the iframe.
2. Send and receive H5P resize messages.
3. Convert H5P resize messages into natural-size observations.
4. Dispatch loaded, failed, resize, and result events to the policy layer.

Must not:

1. Independently decide whether to scale, focus, or reject content.
2. Directly apply every resize message as visible layout.
3. Show Continue based on raw H5P resize state.

### `H5PFitStage.svelte`

Owns the no-scroll presentation policy.

Responsibilities:

1. Track phase and fit epoch.
2. Hold visible geometry stable during measurement.
3. Run the fit algorithm.
4. Apply native, width-adjusted, scaled, or focus presentation.
5. Control when Continue becomes visible.

### `h5pFitPolicy.ts`

Owns pure decision logic.

Responsibilities:

1. Accept measured candidate sizes and constraints.
2. Return a fit result.
3. Stay independent of Svelte, browser APIs, H5P messages, and DOM reads.

### `TrialContent.svelte`

Owns the card-level stage constraints.

Responsibilities:

1. Provide available card dimensions.
2. Reserve space for MoFaCTS controls when required.
3. Give H5P-owned trials the full intended stage.
4. Avoid hard-coded aspect-ratio constraints for self-hosted H5P unless a later content-specific policy requires them.

## 7. Mandatory Invariants

These rules must hold throughout implementation.

### 7.1 One Natural-Height Source

H5P resize messages are the only source of natural H5P content height.

Allowed:

- `context: 'h5p'` resize protocol messages.
- A policy layer that consumes natural-size observations.
- ResizeObserver for MoFaCTS stage dimensions.

Disallowed:

- A second custom `postMessage` path that also sets iframe height.
- Height adjustments like `scrollHeight + 8`.
- Polling loops that visibly apply height while H5P resize messages are active.

### 7.2 No Learner-Visible Internal Scrollbars

Supported H5P trials must not expose internal scrollbars.

Exceptions:

- Developer diagnostics behind an explicit debug flag.
- Authoring preview diagnostics for author-review content.

### 7.3 Feedback Is A Separate Fit Phase

After response, H5P may add feedback text, score UI, icons, expanded answer rows, show-solution controls, or retry controls. Feedback must be measured and fitted separately from the question.

### 7.4 Continue Must Not Change The Fit Afterward

Continue must not appear in a way that reduces the H5P stage after fitting is complete.

Preferred rule:

1. Reserve Continue space from the start of H5P-owned trials that may need manual continuation.
2. Keep the reserved region visually empty until Continue is available.
3. Reveal Continue inside the reserved region after feedback fit settles.

Allowed alternative:

1. Overlay Continue after feedback fit.
2. Ensure the overlay does not cover H5P feedback or answer controls.
3. Include the overlay safe area in fit calculations.

Disallowed:

1. Let the H5P iframe push Continue below a clipped shell.
2. Let Continue shrink the H5P stage after feedback has already been fitted.

### 7.5 No Visible Thrash

The learner should not see the activity shrink, grow, and settle through multiple intermediate sizes. Measurement can happen, but visible presentation should change atomically.

## 8. Runtime Phase Sequence

This is the normative step-by-step flow.

### Phase 0: Stage Setup

1. TrialContent computes the visible card area.
2. TrialContent reserves Continue space if the H5P trial may need Continue.
3. TrialContent passes available stage width and height to the H5P fit stage.
4. The fit stage starts epoch `question:1`.

Exit condition:

- The H5P iframe can be created with known stage constraints.

### Phase 1: Iframe Load And H5P Handshake

1. H5PFrame creates the iframe.
2. Parent sends H5P `ready`.
3. Child sends `hello`.
4. Parent sets iframe width to `100%` for the current measurement width.
5. Parent forces layout by reading `getBoundingClientRect()`, matching the official H5P resizer behavior.
6. Parent replies `hello`.

Exit condition:

- H5P is ready to report natural size.

### Phase 2: Question Measurement

1. H5P child sends `prepareResize` with `scrollHeight` and `clientHeight`.
2. Parent records the natural question height for the current measurement width.
3. Parent performs the official `prepareResize` response sequence without exposing intermediate layout to the learner.
4. Parent waits until size is stable for the current epoch.

A size is stable when either:

- the official H5P resize sequence completes and no newer measurement arrives in the next animation frame, or
- the same natural size is observed across two animation frames, or
- a bounded timeout expires and the measurement attempt fails clearly.

Exit condition:

- The policy layer has one stable question natural size for the current measurement width.

### Phase 3: Question Fit

1. Fit policy checks native fit at the current available stage.
2. If native fit fails, the measurement layer tests bounded candidate widths.
3. Fit policy chooses `native`, `width-adjusted`, `scaled`, or `focus`.
4. Fit stage applies the chosen result atomically.
5. H5P activity becomes visible and interactive.

Exit condition:

- Learner can answer the H5P activity without internal scrolling.

### Phase 4: Learner Interaction

1. Learner interacts with H5P.
2. Small internal resize messages are recorded but not allowed to visibly thrash the stage.
3. If natural size crosses a meaningful threshold, start a new question fit epoch.
4. Otherwise preserve the current visible geometry.

Exit condition:

- H5P emits a result, xAPI event, completion event, or a resize pattern indicating feedback has appeared.

### Phase 5: Response Submitted

1. Fit stage starts epoch `feedback:n`.
2. Continue remains hidden.
3. Visible geometry is held stable while H5P updates internally.
4. H5P feedback is allowed to render and report natural size.

Exit condition:

- Feedback natural size is available or the measurement attempt fails clearly.

### Phase 6: Feedback Measurement

1. Collect feedback natural height for the current measurement width.
2. If candidate width search is required, measure each candidate width in a hidden or non-thrashing measurement state.
3. Ignore stale question-epoch measurements.
4. Wait for stable feedback size.

Exit condition:

- The policy layer has stable feedback measurements.

### Phase 7: Feedback Fit

1. Fit policy chooses the feedback presentation mode.
2. Fit stage applies the result atomically.
3. Feedback becomes visible in its final fitted geometry.
4. Continue is revealed only after the feedback fit is settled.

Exit condition:

- Learner can read feedback and activate Continue without internal scrolling.

### Phase 8: Continue And Completion

1. Learner activates Continue.
2. MoFaCTS records timing and history using its normal trial machinery.
3. The H5P fit state is cleared when the card exits.

Exit condition:

- Trial progression moves to the next MoFaCTS state.

### Phase 9: Viewport Or Card Resize

This phase can interrupt question or feedback fitted states.

1. Stage dimensions change.
2. Fit stage starts a new epoch for the current trial phase.
3. Parent requests H5P resize.
4. Natural size is remeasured.
5. Fit policy reapplies the best presentation mode.
6. Learner state inside H5P is preserved.

Exit condition:

- Current question or feedback state is fitted for the new viewport.

## 9. Fit Algorithm

The algorithm has two layers:

1. Measurement layer: browser/H5P-specific code that measures natural size at one or more widths.
2. Decision layer: pure code that selects the presentation mode from measured candidates.

### 9.1 Fit Inputs

```ts
interface H5PMeasuredCandidate {
  measurementWidth: number;
  naturalWidth: number;
  naturalHeight: number;
}

interface H5PFitInput {
  phase: 'question' | 'feedback';
  availableWidth: number;
  availableHeight: number;
  reservedControlHeight: number;
  scaleFloor: number;
  focusAvailable: boolean;
  candidates: H5PMeasuredCandidate[];
}
```

### 9.2 Fit Output

```ts
type H5PFitMode =
  | 'native'
  | 'width-adjusted'
  | 'scaled'
  | 'focus';

interface H5PFitResult {
  phase: 'question' | 'feedback';
  mode: H5PFitMode;
  measurementWidth: number;
  naturalWidth: number;
  naturalHeight: number;
  availableWidth: number;
  availableHeight: number;
  visualWidth: number;
  visualHeight: number;
  scale: number;
  reservedControlHeight: number;
  reason: string;
}
```

### 9.3 Decision Steps

1. Reject candidates with non-finite or non-positive dimensions.
2. Sort candidates by preferred order, usually widest first.
3. Choose `native` if the preferred candidate fits at scale `1`.
4. Choose `width-adjusted` if another candidate fits at scale `1`.
5. For each candidate, compute required scale:

```text
requiredScale = min(
  1,
  availableWidth / naturalWidth,
  availableHeight / naturalHeight
)
```

6. Choose the candidate with the highest required scale.
7. If the best required scale is at or above the preferred scale floor, choose `scaled`.
8. If scale would fall below the preferred floor and focus mode is available, choose `focus`.
9. If focus mode is unavailable, choose `scaled` anyway and record that the result is below the preferred floor. The learner runtime must not convert size pressure into an error state.

### 9.4 Candidate Widths

Candidate widths must be bounded and deterministic. Initial list:

1. `availableWidth`
2. local breakpoint probes just below the current width, initially `availableWidth - 1`, `-2`, `-4`, `-8`, and `-16`
3. `0.95 * availableWidth`
4. `0.9 * availableWidth`
5. `0.85 * availableWidth`
6. `0.8 * availableWidth`
7. content-type preferred width, if known

Do not continuously search widths. Continuous search risks performance problems and visible instability.

### 9.5 Why Width Search Exists

Height is not guaranteed to be monotonic with width.

- Text-heavy content can become taller when width is reduced because text wraps.
- Media-heavy content can become shorter when width is reduced because proportional media shrinks.
- H5P content types may have custom breakpoints.

The width search is therefore empirical and bounded.

### 9.6 Scaling Implementation Requirement

If `scaled` is chosen, the implementation must avoid creating an invisible overflow box.

Recommended wrapper model:

```text
fit stage
  -> visual viewport wrapper: width = naturalWidth * scale, height = naturalHeight * scale
    -> scaled surface: width = naturalWidth, height = naturalHeight, transform = scale(scale), transform-origin = top left
      -> iframe: width = naturalWidth, height = naturalHeight
```

Rules:

1. The visual viewport wrapper must use the scaled visual dimensions.
2. The iframe must keep the unscaled measured dimensions.
3. The scaled surface must use `transform-origin: top left`.
4. The fit stage must not show scrollbars.
5. The browser must handle transformed pointer coordinates naturally.
6. The policy must verify that scaled hit targets and text remain usable.

Do not use CSS `zoom` as the primary policy because it is not a standards-based layout primitive.

### 9.7 Suggested Initial Scale Floors

These are starting values for testing, not final product guarantees:

| Context | Initial Floor |
| --- | --- |
| Desktop ordinary card | `0.85` |
| Tablet ordinary card | `0.9` |
| Mobile ordinary card | `0.95` |
| Focus mode | `0.8` |

If usability testing shows that text or targets become too small, raise the floor.

## 10. Feedback And Continue Policy

Feedback is the main source of vertical instability. It needs explicit handling.

### 10.1 Required Feedback Sequence

1. Learner submits answer.
2. Start a new feedback fit epoch.
3. Keep Continue hidden.
4. Hold current visible geometry.
5. Let H5P render feedback internally.
6. Measure feedback natural size.
7. Run the fit algorithm for feedback.
8. Apply the final feedback fit atomically.
9. Reveal Continue in reserved or overlay space.

### 10.2 Continue Reservation

Default policy:

1. Reserve Continue space at the beginning of H5P-owned trials that may require manual continuation.
2. Include reserved Continue height in all available-height calculations.
3. Keep the reserved region visually empty until Continue is available.
4. Reveal Continue without changing H5P available height.

Use overlay Continue only if reserved space makes common question states fail unnecessarily.

### 10.3 Feedback Mode Can Differ From Question Mode

The question and feedback states may choose different fit modes.

Allowed examples:

- Question: `native`; feedback: `scaled`.
- Question: `width-adjusted`; feedback: `width-adjusted`.
- Question: `native`; feedback: `focus`.
- Question: `native`; feedback: `scaled` below the preferred floor when focus mode is unavailable.

Telemetry must record both fit results.

## 11. Focus Mode

Focus mode is the preferred no-scroll presentation when ordinary card mode would require more scaling than we want for readability.

Focus mode should:

1. Increase available H5P height.
2. Reduce or hide nonessential MoFaCTS chrome.
3. Keep required MoFaCTS controls visible and reachable.
4. Preserve trial identity, timing, and history semantics.
5. Run the same measurement and fit phases as ordinary card mode.
6. Return to the normal card flow after completion.

Focus mode should not:

1. Feel like an error.
2. Require manual browser zooming.
3. Introduce nested scrollbars.
4. Change H5P scoring or response semantics.
5. Trap keyboard focus.

## 12. Author Review Content

An H5P item should be flagged for author review if:

1. ordinary card mode requires unusually small scaling;
2. focus mode would still require unusually small scaling;
3. required controls or feedback require aggressive width adjustment;
4. feedback is much larger than the initial question state.

Runtime behavior:

1. Do not silently fall back to scrollbars.
2. Do not show a learner-facing size error.
3. Use the best no-scroll fit available.
4. Log measurements needed to diagnose the content.

Authoring behavior:

1. Warn before learners see unusually difficult-to-fit items.
2. Explain whether the fit pressure comes from question height, feedback height, media aspect ratio, option count, or long feedback.

## 13. Authoring And Import Policy

MoFaCTS should catch unsuitable content before runtime.

### 13.1 Measurements To Capture

For self-hosted H5P, import or preview should measure:

1. question natural height at canonical desktop width;
2. feedback natural height at canonical desktop width;
3. question natural height at tablet width;
4. feedback natural height at tablet width;
5. question natural height at mobile width;
6. feedback natural height at mobile width;
7. minimum scale required in ordinary card mode;
8. whether focus mode is required;
9. whether the content needs author review.

### 13.2 Author Warnings

Warn authors when:

1. feedback is much taller than the question;
2. option count exceeds the content-type threshold;
3. feedback text is long;
4. media aspect ratio is tall;
5. natural height exceeds ordinary stage height;
6. scale would fall below the preferred floor;
7. focus mode is required;
8. the content type is known to be risky in fixed cards.

### 13.3 Compatibility Tiers

Use these tiers in import and preview:

| Tier | Meaning |
| --- | --- |
| `approved-fixed-card` | Expected to fit ordinary card mode without internal scrollbars. |
| `approved-focus-required` | Acceptable only with automatic focus mode. |
| `preview-required` | May work, but requires author review. |
| `author-review-required` | Can run with no-scroll fitting, but should be revised or explicitly approved. |

### 13.4 Initial Content-Type Expectations

Likely good candidates:

1. `H5P.MultiChoice`
2. `H5P.TrueFalse`
3. `H5P.Summary`
4. `H5P.MarkTheWords`
5. simple `H5P.Blanks`
6. simple `H5P.DragText`

Risky candidates:

1. `H5P.CoursePresentation`
2. `H5P.InteractiveBook`
3. `H5P.InteractiveVideo`
4. large `H5P.DragQuestion`
5. large image-heavy tasks
6. activities with long per-answer feedback
7. activities with many choices or nested subcontent

These expectations must be replaced by measured MoFaCTS data over time.

## 14. Event And Timing Rules

### 14.1 Resize Messages

H5P resize messages should produce natural-size observations. They should not directly mutate visible layout unless the fit stage has chosen that visible layout.

### 14.2 ResizeObserver

Use ResizeObserver to observe MoFaCTS stage size and, for same-origin diagnostic cases, internal content size.

ResizeObserver must not become a second iframe-height authority.

Implementation rules:

1. Avoid writing layout synchronously inside ResizeObserver callbacks when that write can retrigger the same observer.
2. Use requestAnimationFrame for layout writes that respond to observer notifications.
3. Track expected sizes so the policy can ignore self-caused notifications.

### 14.3 Hidden Or Transitioning Containers

Do not trust measurements taken while the H5P stage is:

1. `display: none`;
2. zero-sized;
3. hidden behind an unpainted transition;
4. not yet attached to the document;
5. mid-fade if the fade affects dimensions.

When a hidden container becomes visible:

1. wait for DOM update;
2. wait for paint;
3. request H5P resize;
4. start a new fit epoch.

### 14.4 Timeouts

Every measurement wait must have a bounded timeout.

If timeout occurs:

1. use the best stable measurement if available;
2. otherwise enter `failed`;
3. log the timeout and phase.

## 15. Accessibility And Usability

The no-scroll policy must not make content unreadable.

Requirements:

1. Prefer reflow and width adjustment before scaling.
2. Treat scale floors as preferred readability thresholds, not learner-runtime error triggers.
3. Use focus mode before excessive scaling when focus mode is available.
4. Keep keyboard focus inside the active H5P stage.
5. Keep Continue reachable by keyboard.
6. Ensure overlays do not cover answer controls or feedback text.
7. Test pointer and touch target size after scaling.
8. Ensure transformed content remains legible.

The WCAG Reflow guidance is relevant because it emphasizes avoiding unnecessary multi-direction scrolling and preserving information and functionality. MoFaCTS is stricter than WCAG for this use case because even one internal scrollbar can add non-germane task work in a timed learning trial.

## 16. Telemetry

Every H5P trial should be able to emit debug-level fit telemetry.

Record:

1. content id;
2. H5P main library;
3. trial/session id when available;
4. phase;
5. fit epoch;
6. natural width;
7. natural height;
8. available width;
9. available height;
10. reserved Continue height;
11. candidate widths tested;
12. chosen mode;
13. scale;
14. reason;
15. question-to-feedback height delta;
16. number of resize messages;
17. number of fit attempts;
18. whether focus mode was required;
19. whether the fit fell below the preferred floor;
20. measurement duration;
21. timeout status.

Telemetry is required because H5P fit failures are otherwise hard to reproduce.

## 17. First Implementation Defaults

These defaults resolve the policy choices needed for the next implementation pass. They can be revised after browser testing, but the first implementation should not stop to ask about them again.

### 17.1 First Target Scope

The first implementation should target same-origin, self-hosted, H5P-owned card trials.

In scope:

1. the current self-hosted H5P card path;
2. `H5P.MultiChoice` as the first proof item;
3. question fit;
4. feedback fit;
5. reserved Continue space;
6. debug telemetry;
7. browser verification after rebuild.

Out of scope for the first pass:

1. authoring/import measurement UI;
2. persisted fit telemetry;
3. full H5P content-type compatibility matrix;
4. external cross-origin embed focus mode;
5. adaptive scheduling or history-schema changes;
6. new H5P result normalizers.

### 17.2 Continue Policy Default

Reserve Continue space from the start of H5P-owned trials that may require manual continuation.

Default reserved height:

```text
var(--h5p-action-bar-height, 3.75rem)
```

First-pass rules:

1. The reserved region may be visually empty before completion.
2. The H5P available height must always subtract this reserved region.
3. Continue reveal must not change the H5P available height.
4. Overlay Continue is not the first-pass default.

### 17.3 Scale Floors

Use these initial floors:

| Context | Floor |
| --- | --- |
| Desktop ordinary card | `0.85` |
| Tablet ordinary card | `0.9` |
| Mobile ordinary card | `0.95` |
| Focus mode | `0.8` |

Viewport classification for the first pass:

1. mobile: `availableWidth < 640`;
2. tablet: `640 <= availableWidth < 1024`;
3. desktop: `availableWidth >= 1024`.

If classification is ambiguous, choose the stricter higher floor.

### 17.4 Candidate Widths

Use this deterministic candidate list:

```text
availableWidth
availableWidth - 1
availableWidth - 2
availableWidth - 4
availableWidth - 8
availableWidth - 16
0.95 * availableWidth
0.9 * availableWidth
0.85 * availableWidth
0.8 * availableWidth
```

Rules:

1. Round candidate widths to whole CSS pixels.
2. Remove duplicates.
3. Remove widths less than `320px`, unless `availableWidth` itself is less than `320px`.
4. Preserve the listed order.
5. Do not add continuous binary search in the first pass.
6. Keep local breakpoint probes before percentage reductions so a one-pixel H5P breakpoint does not force an unnecessarily narrow presentation.

### 17.5 Stable Measurement Default

A measurement is stable when:

1. the same epoch observes no natural-height change greater than `2px` across two animation frames, or
2. an H5P `prepareResize` / `resizePrepared` / `resize` sequence completes and the next animation frame does not change by more than `2px`.

Timeouts:

1. question measurement timeout: `1500ms`;
2. feedback measurement timeout: `1500ms`;
3. candidate-width measurement timeout: `750ms` per candidate.

On timeout:

1. use the best stable measurement if one exists;
2. otherwise mark the fit attempt as `failed`;
3. log the timeout in debug telemetry.

### 17.6 Meaningful Resize Threshold

During learner interaction, ignore natural-height changes of `4px` or less unless they change the selected fit mode.

If natural height changes by more than `4px`:

1. start a new epoch for the current phase;
2. hold visible geometry;
3. remeasure;
4. apply the final fit atomically.

### 17.7 Focus Mode Default

Focus mode should be automatic for same-origin self-hosted H5P-owned trials when ordinary card mode would require scaling below the preferred floor.

First-pass focus mode may be minimal:

1. increase the H5P stage to the largest safe card/viewport area available;
2. reduce nonessential surrounding chrome where the existing layout allows it;
3. preserve the same H5P iframe and learner state;
4. keep Continue visible and reachable;
5. if focus mode is not yet implemented, use the best scaled no-scroll fit rather than adding scrollbars or showing a learner-facing size error.

### 17.8 External Embed Default

External cross-origin embeds are not the first target for the no-scroll fit policy.

First-pass behavior:

1. keep existing passive external embed behavior unless it already participates in the H5P resize protocol;
2. do not attempt same-origin DOM measurements inside external embeds;
3. do not apply focus mode to external embeds until the self-hosted path is stable.

### 17.9 Telemetry Default

Use debug-level client logging for the first pass. Do not persist fit telemetry until the runtime behavior is stable.

The debug log should include enough data to reconstruct:

1. phase;
2. epoch;
3. candidate measurements;
4. selected fit mode;
5. scale;
6. timeout status;
7. whether Continue was reserved;
8. whether focus mode was requested.

### 17.10 First-Pass File Set

The first implementation should stay close to this file set unless the existing code structure proves a small supporting edit is necessary:

1. `mofacts/client/views/experiment/svelte/utils/h5pFitPolicy.ts`
2. `mofacts/client/views/experiment/svelte/utils/h5pFitPolicy.test.ts`
3. `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte`
4. `mofacts/client/views/experiment/svelte/components/H5PFitStage.svelte`, if a separate stage component is clearer than expanding `H5PFrame.svelte`
5. `mofacts/client/views/experiment/svelte/components/TrialContent.svelte`
6. `mofacts/client/views/experiment/svelte/components/StimulusDisplay.svelte`, only if needed to insert the fit stage boundary
7. `mofacts/server/http/h5pContent.ts`, only if the child-side H5P resize message bridge still needs adjustment

Avoid mixing this work with H5P history normalization, package import, authoring UI, or schema expansion.

### 17.11 First-Pass Readiness Gate

The first implementation is ready for user testing when:

1. the current H5P Multiple Choice card shows the question without internal scrollbars;
2. answering the item triggers feedback measurement;
3. feedback settles without visible height thrash;
4. Continue remains visible without scrolling;
5. no legacy custom height path competes with H5P resize messages;
6. `npm run typecheck` passes.

## 18. Step-By-Step Implementation Plan

### Step 1: Extract Pure Fit Policy

Create a pure `h5pFitPolicy.ts` module.

Acceptance:

1. It accepts measured candidates and constraints.
2. It returns `native`, `width-adjusted`, `scaled`, or `focus` for valid measurements.
3. It has unit tests for each decision branch.

### Step 2: Add Fit Epoch State

Add explicit epoch and phase state to the H5P container layer.

Acceptance:

1. Question and feedback are separate epochs.
2. Stale measurements are ignored.
3. Viewport resize starts a new epoch.

### Step 3: Convert H5P Resize Messages To Measurements

Update the bridge so H5P resize messages produce observations rather than direct final layout decisions.

Acceptance:

1. H5P protocol remains compliant.
2. No second height message path exists.
3. Raw resize messages do not visibly thrash the stage.

### Step 4: Reserve Or Overlay Continue Deliberately

Implement the chosen Continue policy.

Default acceptance:

1. Continue space is reserved from the start of H5P-owned manual-continue trials.
2. Continue reveal does not change available H5P height.
3. Continue is always visible after feedback fit.

### Step 5: Implement Question Fit

Fit initial H5P question state.

Acceptance:

1. Multiple Choice question state fits without scrollbars.
2. The activity is not revealed until the first stable fit is applied.
3. Debug telemetry records the chosen question fit.

### Step 6: Implement Feedback Fit

Fit post-response feedback state.

Acceptance:

1. Answer submission starts feedback measurement.
2. Continue remains hidden until feedback fit settles.
3. Feedback is visible without internal scrollbars.
4. Debug telemetry records the chosen feedback fit.

### Step 7: Implement Scaling Wrapper

Add the visual wrapper required for uniform scale.

Acceptance:

1. Scaled visual dimensions match available stage constraints.
2. Unscaled iframe dimensions preserve H5P natural layout.
3. No internal scrollbars appear.
4. Pointer interactions still work.

### Step 8: Implement Focus Mode

Add focus mode as the preferred presentation when card mode would scale below the preferred floor.

Acceptance:

1. Focus mode increases available height.
2. It preserves H5P state.
3. It preserves MoFaCTS trial progression.
4. It avoids internal scrollbars.

### Step 9: Add Authoring/Import Measurement

Measure H5P items before learner runtime where possible.

Acceptance:

1. Import or preview records question and feedback fit estimates.
2. Risky content receives warnings.
3. Incompatible content is blocked or clearly marked.

### Step 10: Add Browser Regression Tests

Use real browser tests for representative H5P items.

Acceptance:

1. Question state has no internal scrollbar.
2. Feedback state has no internal scrollbar.
3. Continue remains visible.
4. No repeated visible resize oscillation occurs.

## 19. Testing Matrix

### Unit Tests

1. Native fit.
2. Width-adjusted fit.
3. Scaled fit.
4. Focus mode selection.
5. Below-preferred-floor scaling.
6. Scale floor enforcement.
7. Candidate ordering.
8. Stale epoch rejection.
9. Question and feedback phase separation.

### Component Tests

1. H5PFrame emits natural-size observations.
2. H5PFitStage applies fit results.
3. Continue is hidden during feedback measurement.
4. Continue appears after feedback fit.
5. Stage does not show scrollbars.

### Browser Tests

Run at desktop, tablet, and mobile widths:

1. Multiple Choice question state.
2. Multiple Choice feedback state.
3. True/False feedback state.
4. Fill in the Blanks with multiple blanks.
5. Drag the Words or Drag and Drop with tall feedback.
6. Viewport resize before response.
7. Viewport resize after feedback.

### Visual Acceptance

The browser test should fail if:

1. an internal scrollbar is visible;
2. Continue is clipped or unreachable;
3. H5P feedback is clipped by an overlay;
4. answer controls fall below the visible stage;
5. text overlaps;
6. scale falls below the preferred floor without telemetry;
7. visible geometry oscillates more than once per epoch.

## 20. Initial Acceptance Criteria

The first implementation is acceptable when:

1. H5P native resize protocol is the only natural-height source.
2. Supported H5P question states render without internal scrollbars.
3. Supported H5P feedback states render without internal scrollbars.
4. Answer submission starts a feedback fit epoch.
5. Feedback natural height is measured after H5P renders feedback.
6. Continue appears only after feedback fit settles or in already reserved space.
7. Continue is visible and keyboard reachable.
8. Focus mode is used when available and fixed-card fit would require scaling below the preferred floor.
9. Below-preferred-floor scaling is logged for author review, not shown as a learner error.
10. Fit decisions are visible in debug telemetry.
11. Browser tests cover at least one question state and one feedback state.

## 21. Long-Term Acceptance Criteria

The mature policy is acceptable when:

1. Every approved H5P content type has measured fixed-card and focus-mode behavior.
2. Authoring/import warns about content that creates unusually high fit pressure before learners see it.
3. No supported H5P tester item requires learner-visible internal scrollbars.
4. Response latency is not contaminated by scrollbar manipulation.
5. Feedback reveal does not produce visible geometry thrashing.
6. Accessibility review confirms text and targets remain usable at the minimum scale.
7. Unsupported content cannot silently degrade into nested scrolling.

## 22. Deferred Decisions

These decisions remain real, but the first implementation defaults in section 17 should be used until evidence from browser testing says otherwise.

1. Whether preferred scale floors should be raised after usability testing.
2. Whether Continue space should be reserved for every H5P trial or only H5P-owned trials.
3. Whether focus mode should later become author-configurable.
4. Whether external embeds should eventually support focus mode.
5. Whether authoring preview should expose diagnostic scrollbars.
6. Which H5P content types are approved for fixed-card delivery in the first release.
7. How much fit telemetry should eventually be persisted.

## 23. Related Documents

- [H5P stimuli architecture plan](./h5p-stimuli-architecture-plan.md)
- [Architecture overview](./architecture.md)
