# Learning Session Progress Panel Plan

## Goal

Add an optional right-side progress panel during learning sessions, inspired by `C:\Users\ppavl\Downloads\My-Progress-Panel.html`.

The panel should help learners or instructors understand item-level progress without changing the adaptive scheduler, adding per-trial server round trips, or creating a second progress model that can drift from the engine.

Confirmed product direction:

- Learners should see the panel.
- The panel should be enabled by default.
- The default visible footprint should be only a small side tab.
- Opening the panel should make room for itself in the learning layout rather than covering the card.
- Bars should represent the model's current per-item probability estimate: the same probability computed by the adaptive model for item selection.
- Learners should not see answers, item text, or item labels in the panel.
- The threshold reference should come from the resolved unit delivery settings, including any learner-dashboard override, not a hardcoded mockup value.

## Mockup Observations

The standalone HTML demonstrates these behaviors:

- A vertical `Progress` tab fixed to the right edge.
- A desktop panel that slides in from the right and pushes the main learning view left by about `320px`.
- A mobile panel that becomes a full-width drawer instead of shrinking the card content.
- A compact header named `Item Mastery`.
- Three aggregate counts:
  - `Graduated`
  - `At Practice Level`
  - `Below Threshold`
- A dense vertical list of horizontal item bars.
- Each bar maps an item score directly to a `0%` to `100%` width.
- Reference lines appear at `95%`, `85%`, and the current mean.
- Bars are color-coded by threshold band.
- Hover tooltips expose item name and score.
- `Escape` closes the panel.
- The panel opens by default on desktop in the mockup.

Differences from the mockup for MoFaCTS:

- The panel should not open by default; only the side tab should be visible until clicked.
- Item-name tooltips from the mockup should not be copied for learners.
- Fixed `85%` and `95%` thresholds should not be copied as hardcoded product values.
- The open desktop panel should push/reflow the learning content.
- The standalone HTML/JS should be treated as a prototype reference only. The app implementation should be Svelte, integrated with the existing Svelte card runtime.

## Current Runtime Findings

The active learner card surface is `mofacts/client/views/experiment/svelte/components/CardScreen.svelte`.

That component already:

- renders the existing `PerformanceArea` for time, correctness, and timeout display
- tracks the XState card state and delivery settings
- receives the active unit engine in machine context
- reacts to `Session.get('curStudentPerformance')` for aggregate performance
- supports `testMode` props for focused component testing

The current model learning engine lives behind `mofacts/client/views/experiment/engineConstructors.ts` and is implemented in `mofacts/client/views/experiment/unitEngine.ts`.

The model engine already maintains the most relevant live item data:

- `getCardProbabilitiesNoCalc()`
- `calculateCardProbabilities()`
- `cardProbabilities.cards[].stims[].probabilityEstimate`
- per-cluster and per-stim counts such as `priorCorrect`, `priorIncorrect`, `priorStudy`, `timesSeen`, and `totalPracticeDuration`
- `canUse` and hidden-item filtering for the active learning unit
- current selection metadata such as `currentCardRef`

Resume reconstructs learning state from history in `mofacts/client/views/experiment/svelte/services/historyReconstruction.ts`, then loads it back into the engine through `loadResumeState()`.

Existing relevant settings include:

- `displayPerformance`
- `displayTimeoutBar`
- `displayTimeoutCountdown`
- `optimalThreshold`
- `resetStudentPerformance`
- `disableProgressReport`
- `progressReporterParams`

## Proposed Data Source

Use the live model engine as the source of truth for item-level panel data.

For model learning units:

1. Read the active engine from CardScreen context or `getEngine()`.
2. Require `engine.unitType === 'model'`.
3. Require `engine.getCardProbabilitiesNoCalc()` or another explicit panel snapshot API.
4. Use existing `probabilityEstimate` values for bar widths.
5. Use the same active cards, stims, and hidden-item behavior as the scheduler.
6. Recompute the panel snapshot after trial selection and after answer updates.
7. Use the resolved `deliverySettings.optimalThreshold` as the primary threshold line and band boundary.

Do not add a pure-compute server method for panel calculations. This fits the repository rule that the server should stay minimized and the client should do safe processor work.

## Initial Invariants

- The panel must not change scheduler selection behavior.
- The panel must read the same item state the scheduler uses.
- If the panel is enabled for a unit that cannot provide item-level model data, show a clear unavailable state or block enablement. Do not silently render fake or stale data.
- The panel must not reveal answer text, item text, or item labels to learners.
- The panel must respect hidden items and `resetStudentPerformance` semantics.
- The panel must not add database round trips during the per-trial learning loop.
- The panel should use existing theme CSS variables where possible.
- Client logging must use `clientLogger.ts`, not raw `console.*`.
- The desktop layout should avoid covering the active response controls.
- The mobile layout should not squeeze the card into an unusable narrow column.
- The default learner-facing state is closed, with only a side tab visible.
- Opening the desktop panel should reserve layout space for the panel.

## First Implementation Shape

The production UI should be implemented as Svelte, not by embedding the standalone HTML file or copying its imperative DOM script into the app.

### 1. Create A Panel Snapshot Helper

Suggested file:

- `mofacts/client/views/experiment/svelte/services/learningProgressPanel.ts`

Responsibilities:

- accept an engine plus delivery settings
- validate that item-level progress is available
- flatten cluster/stim state into display rows
- classify rows into threshold bands
- compute counts and mean
- return a serializable panel snapshot for Svelte rendering
- avoid learner-facing labels that expose item or answer content

The helper should be unit-tested separately from the visual component.

### 2. Create A Svelte Component

Suggested file:

- `mofacts/client/views/experiment/svelte/components/LearningProgressPanel.svelte`

Responsibilities:

- render the toggle tab, drawer, counts, bars, axis, and optional non-identifying tooltips if approved
- support keyboard close behavior
- support desktop push layout and mobile full-screen drawer
- accept a precomputed snapshot as props
- support test fixtures without needing a Meteor session
- render bars without answer or item text
- use generic accessibility text only, such as row position and probability, if accessible labels are needed

### 3. Integrate In CardScreen

In `CardScreen.svelte`:

- derive whether the panel is available for the current unit
- build and refresh the panel snapshot when engine state changes
- render the panel as a sibling to the existing learning content inside `.card-screen`
- add a layout class only when the panel is open on desktop
- keep video and assessment behavior explicit
- expose the side tab by default for model learning sessions

### 4. Add A Feature Gate

Confirmed direction:

- The panel should be available to learners by default.
- A small side tab is visible by default; the full panel appears only after the learner opens it.

Open implementation choice:

- Reuse `disableProgressReport` as a hard off switch, add a separate delivery setting, or both.

### 5. Verify

For TypeScript-bearing app changes:

```bash
cd C:\dev\MoFaCTS\mofacts
npm run typecheck
```

Recommended focused tests:

- panel snapshot helper tests
- CardScreen test-mode render coverage
- model-engine snapshot availability
- hidden-item filtering
- threshold classification
- no answer leakage in learner-visible labels

After visual implementation, verify with Browser against the local app or a component test surface.

## Design Questions

### Availability

Resolved:

- Learners should see it.
- It should be enabled by default.
- It should be closed by default, leaving only the side tab visible.
- Opening it should resize/reflow the learning session layout so the panel takes its own space.

Still open:

1. Should `disableProgressReport` hide this new panel too?
2. Should panel open/closed state persist per learner locally?

### Unit Scope

1. Should this be learning-session only, or also available for video learning sessions?
2. Should assessment/schedule units show an unavailable state, no tab, or a different progress view?
3. In multi-unit lessons, should the panel show only the current unit or all learning units in the lesson?

### Mastery Metric

Resolved:

- Use the adaptive model's current per-item `probabilityEstimate`.
- Use the actual threshold from the resolved unit settings: the unit TDF value, or the learner-dashboard override when present.
- Do not use hardcoded `85%` or `95%` threshold lines from the mockup.

Still open:

1. Should the score be visible numerically anywhere, or should bars be the only learner-visible score display?
2. What labels should replace `Graduated`, `At Practice Level`, and `Below Threshold` now that there is one actual threshold?
3. Should the mean line include hidden or unavailable items?

### Item Rows

Resolved:

- Learners should see bars only, with no answer text, item text, or item labels.

Still open:

1. Should each row represent a stimulus, a cluster, or a response concept?
2. Should hidden items be omitted from the panel?
3. Should unavailable items be omitted, grayed out, or shown separately?
4. Should rows be sorted by mastery descending, by current scheduler order, by cluster order, or by weakest-first?
5. Should the current item be highlighted?
6. Should items not yet introduced be visible?

### Labels And Answer Leakage

Resolved:

- Do not show answers.
- Do not show item text.
- Do not show item labels in the compact learner panel.
- Each item should be represented by a very thin bar.

Still open:

1. Should bars have no hover tooltip at all, or a generic tooltip such as `Item 12: 82%`?
2. Should instructors/admins get a richer variant with labels, or should the first version be learner-only and label-free for everyone?

### Visual Behavior

Resolved:

- Desktop opening should push/reflow the card content rather than overlaying it.
- The closed default should be a small side tab.
- Bars should be very thin because the panel is dense and label-free.

Still open:

1. Is `320px` the desired desktop width?
2. Should mobile be full-screen, bottom sheet, or hidden?
3. Should the tab label be text, icon-only, or configurable?
4. Should the panel use existing MoFaCTS theme colors rather than fixed mockup colors?
5. How thin can bars be while still meeting accessibility and touch-target expectations?

### Timing And Updates

1. Should scores update after every answer, after every new card selection, or both?
2. Should the panel animate bar-width changes?
3. Should it refresh while the learner is typing, or only at stable state boundaries?
4. Should opening the panel force a fresh probability calculation, or only show the latest scheduler calculation?

### Privacy And Research

1. Could showing mastery estimates change learner behavior in a way that affects study data?
2. Should panel visibility be recorded in history or analytics?
3. Should learners be able to disable it during a session?
4. Is a study/experiment-specific opt-out needed even though the default product behavior is enabled?

## Open Technical Questions

1. Should the engine expose a new explicit `getLearningProgressSnapshot()` method instead of letting the UI read `getCardProbabilitiesNoCalc()` directly?
2. Should threshold classification live in a common helper so tests can cover it without Svelte?
3. Should the new panel reuse the current `PerformanceArea` aggregate stats or keep separate item-level counts?
4. How should the panel behave during prepared-advance and early-lock paths, where the next item may already be selected internally?
5. Should the panel include study trials in row counts, or only drill/test attempts?
6. Should the panel support authored labels from TDF/config content, and if so which field is canonical?

## Suggested First Slice

Start read-only and low risk:

1. Add the snapshot helper.
2. Add tests using fabricated engine snapshots.
3. Add a static/test-mode Svelte panel component.
4. Integrate for learner-facing model learning sessions with the side tab closed by default.
5. Verify layout.
6. Then decide whether `disableProgressReport` or a separate setting controls opt-out behavior.

This lets us validate the data shape and the visual behavior before committing to broader learner-facing product semantics.
