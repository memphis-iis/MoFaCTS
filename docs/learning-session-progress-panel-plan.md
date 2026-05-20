# Learning Session Progress Panel Plan

## Goal

Add an optional right-side progress panel during learning sessions, inspired by `C:\Users\ppavl\Downloads\My-Progress-Panel.html`.

The panel should help learners or instructors understand item-level progress without changing the adaptive scheduler, adding per-trial server round trips, or creating a second progress model that can drift from the engine.

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
4. Use existing `probabilityEstimate` values for bar widths unless a different mastery metric is chosen.
5. Use the same active cards, stims, and hidden-item behavior as the scheduler.
6. Recompute the panel snapshot after trial selection and after answer updates.

Do not add a pure-compute server method for panel calculations. This fits the repository rule that the server should stay minimized and the client should do safe processor work.

## Initial Invariants

- The panel must not change scheduler selection behavior.
- The panel must read the same item state the scheduler uses.
- If the panel is enabled for a unit that cannot provide item-level model data, show a clear unavailable state or block enablement. Do not silently render fake or stale data.
- The panel must not reveal answer text to learners unless that is explicitly approved.
- The panel must respect hidden items and `resetStudentPerformance` semantics.
- The panel must not add database round trips during the per-trial learning loop.
- The panel should use existing theme CSS variables where possible.
- Client logging must use `clientLogger.ts`, not raw `console.*`.
- The desktop layout should avoid covering the active response controls.
- The mobile layout should not squeeze the card into an unusable narrow column.

## First Implementation Shape

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

The helper should be unit-tested separately from the visual component.

### 2. Create A Svelte Component

Suggested file:

- `mofacts/client/views/experiment/svelte/components/LearningProgressPanel.svelte`

Responsibilities:

- render the toggle tab, drawer, counts, bars, axis, and tooltips
- support keyboard close behavior
- support desktop push layout and mobile full-screen drawer
- accept a precomputed snapshot as props
- support test fixtures without needing a Meteor session

### 3. Integrate In CardScreen

In `CardScreen.svelte`:

- derive whether the panel is available for the current unit
- build and refresh the panel snapshot when engine state changes
- render the panel as a sibling to the existing learning content inside `.card-screen`
- add a layout class only when the panel is open on desktop
- keep video and assessment behavior explicit

### 4. Add A Feature Gate

Likely options:

- reuse `disableProgressReport` as a hard off switch
- add a new delivery setting for this panel
- initially allow only admin/teacher or development use

This needs a product decision before code.

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

1. Should this panel be shown to learners, instructors/admins, or both?
2. Should it be available in all learning sessions, or only when a TDF setting enables it?
3. Should `disableProgressReport` hide this new panel too?
4. Should the panel be open by default on desktop, like the mockup, or closed by default?
5. Should panel open/closed state persist per learner locally?

### Unit Scope

1. Should this be learning-session only, or also available for video learning sessions?
2. Should assessment/schedule units show an unavailable state, no tab, or a different progress view?
3. In multi-unit lessons, should the panel show only the current unit or all learning units in the lesson?

### Mastery Metric

1. Is `probabilityEstimate` the correct item mastery score for the bar width?
2. Should the score be displayed as `0-100%`, a probability like `0.82`, or hidden from learners?
3. Should the mockup's `85%` and `95%` lines be kept?
4. Should one reference line instead use the current `optimalThreshold` setting, which defaults to `0.8`?
5. What exactly makes an item `Graduated`?
6. What exactly makes an item `At Practice Level`?
7. Should the mean line include hidden or unavailable items?

### Item Rows

1. Should each row represent a stimulus, a cluster, or a response concept?
2. Should hidden items be omitted from the panel?
3. Should unavailable items be omitted, grayed out, or shown separately?
4. Should rows be sorted by mastery descending, by current scheduler order, by cluster order, or by weakest-first?
5. Should the current item be highlighted?
6. Should items not yet introduced be visible?

### Labels And Answer Leakage

1. What should the learner see in row tooltips?
2. Is it acceptable to show correct-answer text during a learning trial?
3. If not, should tooltips use item numbers, stimulus text, cluster labels, or anonymized labels?
4. Should instructors/admins get richer labels than learners?

### Visual Behavior

1. Should desktop opening push the card content left, or overlay the right edge?
2. Is `320px` the desired desktop width?
3. Should mobile be full-screen, bottom sheet, or hidden?
4. Should the tab label be text, icon-only, or configurable?
5. Should the panel use existing MoFaCTS theme colors rather than fixed mockup colors?
6. Should the panel keep the mockup's very dense 3px bars, or use taller rows for accessibility?

### Timing And Updates

1. Should scores update after every answer, after every new card selection, or both?
2. Should the panel animate bar-width changes?
3. Should it refresh while the learner is typing, or only at stable state boundaries?
4. Should opening the panel force a fresh probability calculation, or only show the latest scheduler calculation?

### Privacy And Research

1. Could showing mastery estimates change learner behavior in a way that affects study data?
2. Should panel visibility be recorded in history or analytics?
3. Should learners be able to disable it during a session?
4. Should this be excluded for experiments unless explicitly enabled?

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
4. Integrate behind a hardcoded development/admin-only gate.
5. Verify layout.
6. Then decide the product-facing setting and learner visibility.

This lets us validate the data shape and the visual behavior before committing to broader learner-facing product semantics.
